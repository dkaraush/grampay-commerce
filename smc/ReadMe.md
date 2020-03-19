# Grampay Commerce: Smart-contract

Here I describe how I implemented on-chain GramPay part and why.

## Our Needs

Smart-contracts in blockchains are good at guaranteeing clarity of the algorithm. After being deployed, their code is open to everybody and a lot of validators could check the correctness of its execution.

In case of GramPay Commerce, we have the third side, which decides whether Grams should be released to the seller, or we should refund money back to the buyer. So, there is probably not much room for guaranteeing something, GramPay can come and freeze all orders. It will not do that, but it can.

So, what's the point? Well, my goal was to maximize clarity and security, of the smart-contract and a service itself. My goals were to:
 - Save paid and not finished orders in blockchain.
 - Make a clarity of automatic refund: if order was expired, give an ability to make a refund without GramPay interventions.

So, having a history of the whole blockchain and knowing the code of the smart-contract, we can reproduce what happened with exact orders and what GramPay did with them. Bad things with orders would obviously worsen its reputation.

I could go further and try to make all service on-chain, by putting chat and all dispute logic in blockchain itself, but who will pay such fees for that? Obviously to say, that paying fees depending on message length is a bad idea. I have learned a lesson, with "Because I can!" logic in Stage 2.


## Smart-contract Idea

So, I should have done two things: save not finished orders and make a clear auto refund.

I came up with such "order flow" scheme:
1. Buyer sends a payment with a message, that these funds should belong to exact order. Smart-contract saves this payment in its storage.
2. Then this saved order is proccessed depending on situations:
    - **Release the order**: buyer asks server to release this order.
    - **Refund the order**: seller asks server to refund money back to the buyer.
    - **Auto-refund**: order wasn't sent (and not frozen) until some amount of time and anybody can send a message (without a signature) to refund this order.
    - **Freeze**: in case of dispute, auto-refund is cancelled and only GramPay can decide what to do.

Pros and cons:

**+** Orders are saved clearly in blockchain.

**+** Auto-refund guarantees, that anyone can ask smart-contract to take back funds and GramPay server is not needed (but is used now).

**-** We don't see whether release/refund was buyer's/seller's decision, or this was decided by GramPay itself while dispute. The only thing we can know, is that this decision was done while dispute or not. But these actions are done by GramPay.

I had an idea to make full on-chain market, where each buyer and seller has its own private key to sign messages, but I thought, that storage fees of saving all public keys and checking them probably doesn't worth it. However, after this contest maybe I will reconsider my opinion.


## Technical Details

I wanted to make it easy for all people, so to make a payment with a special message there is no need to actually make another client for sending special internal messages: I decided to use text messages in standard TON Wallet for identifying the order with the payment. Order ID (in server api it's actually called as order key) here would be just a hash of a sent message. So, giving an exact text message to a buyer, we can predict this order ID and wait a payment with it.

To be more precise, order ID = SHA256(inner_internal_message.cellData) & 0xffffffff.

For example, "test" => x{0000000074657374} => 274DA87ADB56666DDD79E8E2EE116DBF992C73B45636C41B681914CDB442B6A2 => 3024271010

Other more boring and technical stuff is described here:

External message:
```
[uint8] opt
    - 0 = Contract creation message
    - 1 = Refund (send back where payment has been received)
    - 2 = Release (send to specific address)
    - 3 = Freeze (set status of saved order to 0)
    - 4 = Auto-refund
    - 10 = Send raw message
[uint256] signature of message (if opt != 4)
{
    [uint16] seqno
    [uint32] order ID (if opt != 0 && opt != 10)
    [int8 + uint256] address where to release (if opt == 2)
} : message
```

Get-methods:
```
seqno() => number
status(number) => number
    Returns status of the order.
    = -1  - not found in list
    =  0  - frozen (can't auto-refund)
    =  1  - can auto-refund (time is calculated)
    =  2  - can't auto-refund yet
data() => tuple[tuple[number, ]]:
    Returns all saved orders. Variables:
    [number] status (0 = frozen, 1 = waiting auto-refund)
    [number] escrow time (when auto-refund can happen), in unix seconds
    [number] workchain (source of payment)
    [slice]  address (source of payment)
    [number] amount in nanograms (98% aren't calcuted, in case of refund)
```