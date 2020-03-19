import * as fs from 'fs';
import * as crypto from 'crypto';
import * as bigintBuffer from 'bigint-buffer';
import { Database } from './db';

const nacl = require('tweetnacl-ts');
const TON = require('ton.js');

const sha256 = (str : Buffer) : Buffer => {
    return crypto.createHash('sha256').update(str).digest();
};
const makeOrderKey = (str : string) : number => {
    let buff = Buffer.concat([
        Buffer.alloc(4),
        Buffer.from(str)
    ]);
    let hash = sha256(buff);
    return Number(bigintBuffer.toBigIntBE(hash) & BigInt(4294967295));
}

type PaymentDoneCallback = (order_id : number, whenEscrow: number) => void;
type RefundCallback = (order_id : number) => void;
interface OrderInfo {
    key : number;
    token: string
}

const randomToken = (n : number = 5, q : string = "qwertyuiopasdfghjklzxcvbnm") : string => 
    Array.from({length: n}, () => q[Math.round(Math.random() * (q.length - 1))]).join('');


// const newContract = function () {
    // let keypair = ed25519.MakeKeypair(crypto.randomBytes(32));
    // let code = TON.BagOfCells.deserialize(contractCode);
    // // let storage = new TON.BagOfCells(0, Buffer.concat([
    // //     // Buffer.from(new Uint16Array([0])),
    // //     // keypair.publicKey,
    // //     // Buffer.from(new Uint16Array([0]))
    // // ]));
    // console.log(contractCode.toString('hex'));
    // console.log(code.toString());
    // console.log(code.serialize().toString('hex'));
    // console.log(code.cellData().toString('hex'));
    // console.log(sha256(code.cellData()));

    // let StateInit = new TON.BagOfCells(4, Buffer.from('48', 'hex'));
    // StateInit.putRef(code);
    // StateInit.putRef(storage);
    // console.log(StateInit.cellData())
    // console.log(sha256(StateInit.cellData()))
    // console.log(StateInit.serialize().toString('hex'));
// }
interface Order {
    index: number;
    status: boolean;
    escrowTime: number;

    from : any;

    amount : number;
}
const getBlockchainOrders = async function(client : any, address : any) : Promise<Order[]> {
    let rawOrders = <any> (await client.runMethod(address, 'data')).stack[0];
    let result : Order[] = [];
    for (let _rawOrder of rawOrders) {
        let rawOrder = <any> _rawOrder;

        result.push(<Order> {
            index: (<any> rawOrder[0]).number,
            status: (<any> rawOrder[1]).number == 1,
            escrowTime: (<any> rawOrder[2]).number,
            from: TON.TONAddress.from(
                (<any> rawOrder[3]).number + ":" +
                TON.BagOfCells.deserialize((<any> rawOrder[4]).bytes).data.slice(0, 32).toString('hex')
            ),
            amount: (<any> rawOrder[5]).number / TON.TONClient.Gram
        });
    }
    return result;
}
interface WaitingPayment {
    id : number;

    token: string;
    key: number;
    amount: number;
}
const normalDiff = 0.15;
export default async (config : any, db: Database) : Promise<Blockchain> => {
    if (!config.contract) {
        error('specify contract address in config.json!');
        process.exit(0);
    }
    
    let privateKey = Buffer.from(config.contract.key, 'base64');
    let keypair = nacl.sign_keyPair_fromSeed(privateKey);
    let address = TON.TONAddress.from(config.contract.address);

    let client = await TON.TONClient.connect(config.tonlib || undefined);

    let waitingPayments : any = {};
    async function updateOrdersList() {
        let orders = await db.query(`SELECT * FROM \`order\` WHERE paid=0 AND complete=0 LIMIT 100`);
        for (let order of orders) {
            waitingPayments[order.id] = <WaitingPayment> {
                id: order.id,
                token: order.token,
                key: order.key,
                amount: order.price_grm
            };
        }
        verbose(waitingPayments);
    }
    
    let paymentDoneCallback : PaymentDoneCallback;
    let refundCallback : RefundCallback;
    let ignoring : any[] = [];
    async function loop() {
        log('loop()');
        try {
            let blockchainOrdersData = await getBlockchainOrders(client, address);
            for (let orderData of blockchainOrdersData) {
                let ignores = ignoring.includes(orderData.index);
                if (orderData.status && orderData.escrowTime < (Date.now()/1000)) {
                    let order = await db.findOrderById(orderData.index, 'key');
                    if (order !== null)
                        refundCallback(order.id);
                    refundExternal(orderData.index);
                } else {

                    let amount = orderData.amount;
                    let sameOrdersAmount = [];
                    let exactToken = null;
                    for (let waitingPaymentID in waitingPayments) {
                        let waitingPayment = waitingPayments[waitingPaymentID];
                        if (Math.abs(amount - waitingPayment) < normalDiff)
                            sameOrdersAmount.push(waitingPayment);
                        if (waitingPayment.key == orderData.index) {
                            exactToken = waitingPayment;
                            break;
                        }
                    }

                    if (!ignores) {
                        log('order index: #' + orderData.index);
                    }

                    if (exactToken) {
                        if (!ignores)
                            log("received payment with exact token (" + orderData.index + ") for " + orderData.amount);
                        if (Math.abs(amount - exactToken.amount) > normalDiff) {
                            if (!ignores)
                                warn('but, we received ' + orderData.amount + ', when ' + exactToken.amount + ' was needed');
                            if (orderData.amount < exactToken.amount) {
                                if (!ignores)
                                    warn('and that is less than we expected => ignoring');
                                ignoring.push(orderData.index);
                                continue;
                            }
                        }
                        ignoring.push(orderData.index);
                        paymentDoneCallback(exactToken.id, orderData.escrowTime);
                        delete waitingPayments[exactToken.id];
                    } else {
                        if (!ignores)
                            log('token was not found in orders list');
                        ignoring.push(orderData.index);
                        // if (sameOrdersAmount.length > 0) {
                        //     if (!ignores)
                        //         warn('and there are ' + sameOrdersAmount.length + " orders with probably same amount");
                        //     if (sameOrdersAmount.length == 1) {
                        //         let order = sameOrdersAmount[0];
                        //         warn('ok, let\'s think that ' + order.id + ' (' + order.amount + ' GRM) is probably related to ' + orderData.index + ' (' + orderData.amount + ' GRM)');
                        //         paymentDoneCallback(order.id, orderData.escrowTime);
                        //         delete waitingPayments[order.id];
                        //     } else {
                        //         if (!ignores)
                        //             warn('too many orders with same amount, gash... should ignore that');
                        //         ignoring.push(orderData.index);
                        //         continue;
                        //     }
                        // } else {
                        //     if (!ignores)
                        //         warn('and it doesnt seem to be any orders with the same amount (' + amount + ')');
                        //     ignoring.push(orderData.index);
                        // }
                    }
                }
            }
        } catch(e) {error(e)}

        log('scheduled next loop()...')
        setTimeout(loop, 3000);
    }
    loop();
    updateOrdersList();

    async function send(opt: number, _msg : Buffer, withSignature : boolean = true) {
        let seqno;
        try {
            seqno = (await client.runMethod(address, 'seqno')).stack[0].number;
        } catch (e) { return error(e); }
        log('seqno: ' + seqno);

        let msg = Buffer.concat([
            new Uint8Array(new Uint16Array([seqno]).buffer).reverse(),
            _msg
        ]);
        log('msg:', msg);
        let msghash = sha256((new TON.BagOfCells(msg.length*8, msg)).cellData());
        log('msghash:', msghash);
        log('privateKey:', privateKey);
        let signature = nacl.sign_detached(msghash, keypair.secretKey);
        log('signature:', Buffer.from(new Uint8Array(Array.prototype.slice.apply(signature))));
        let parts = [
            new Uint8Array([opt])
        ];
        if (withSignature)
            parts.push(signature);
        parts.push(msg);
        let message = Buffer.concat(parts);
        log('message: ' + message.toString('hex'));

        let external = new BitString();
        external.storeBits(1, 0, 0, 0, 1, 0, 0);
        log (address.workchain, address.address);
        external.storeUint8(address.workchain); // TODO: fix that to Int8
        external.storeBuffer(address.address);
        external.storeUint(0, 4 + 2);

        let externalBuff = external.toBuffer();
        let cell = new TON.BagOfCells(externalBuff.length * 8, externalBuff);
        cell.putRef(
            new TON.BagOfCells(message.length * 8, message)
        );
        log('external: [' + external.length() + '] ' + externalBuff.toString('hex'))
        log('external message: \n', cell.toString());
        let serializedCell = cell.serialize();
        log('boc: ' + serializedCell.toString('hex'));
        client.setVerbosityLevel(10);
        await client.sendMessage(serializedCell);
        client.setVerbosityLevel(0);
    }
    async function refundExternal (key: number) {
        log('refundExternal(' + key + ')');
        let status;
        try {
            status = (await client.runMethod(address, 'status', [
                new TON.Stack.NumberType(key)
            ])).stack[0].number;
        } catch (e) {error(e)};

        log('status of order: ' + status);
        if (status == -1) {
            warn('order is not found');
            return;
        }

        try {
            await send(4, Uint32(key), false);
            log('sent refund-query (without signature)', 'succesfully'.green);
        } catch (e) {
            error(e);
        }
    }

    return <Blockchain> {
        address: address.pack(),
        makeOrder: () : OrderInfo => {
            let token = randomToken();
            return <OrderInfo> {
                token,
                key: makeOrderKey(token)
            };
        },
        updateOrdersList,
        whenPaymentDone: (func : PaymentDoneCallback) => {
            paymentDoneCallback = func;
        },
        whenRefund: (func: RefundCallback) => {
            refundCallback = func;
        },
        freeze: async (key : number) => {
            log('freeze(' + key + ')');
            let status;
            try {
                status = (await client.runMethod(address, 'status', [
                    new TON.Stack.NumberType(key)
                ])).stack[0].number;
            } catch (e) {error(e)};

            log('status of order: ' + status);
            if (status == -1) {
                warn('order is not found');
                return;
            }

            try {
                await send(3, Buffer.concat([
                    Uint32(key)
                ]));
                log('sent freeze-query', 'succesfully'.green);
            } catch (e) {
                error(e);
            }
        },
        release: async (key: number, addr : string) => {
            log('release(' + key + ', ' + addr + ')');
            let status;
            try {
                status = (await client.runMethod(address, 'status', [
                    new TON.Stack.NumberType(key)
                ])).stack[0].number;
            } catch (e) {error(e)};

            log('status of order: ' + status);
            if (status == -1) {
                warn('order is not found');
                return;
            }

            let addrObj = TON.TONAddress.from(addr);
            try {
                await send(2, Buffer.concat([
                    Uint32(key),
                    Int8(addrObj.workchain),
                    addrObj.address
                ]));
                log('sent release-query', 'succesfully'.green);
            } catch (e) {
                error(e);
            }
        },
        refund: async (key : number) => {
            log('refund(' + key + ')');
            let status;
            try {
                status = (await client.runMethod(address, 'status', [
                    new TON.Stack.NumberType(key)
                ])).stack[0].number;
            } catch (e) {error(e)};

            log('status of order: ' + status);
            if (status == -1) {
                warn('order is not found');
                return;
            }

            try {
                await send(1, Uint32(key));
                log('sent refund-query', 'succesfully'.green);
            } catch (e) {
                error(e);
            }
        },
        refundExternal
    };
};
export {Blockchain, OrderInfo};

interface Blockchain {
    address: string;
    makeOrder: () => OrderInfo;
    updateOrdersList: () => {};
    whenPaymentDone: (func: PaymentDoneCallback) => void;
    whenRefund: (func : RefundCallback) => void;
    refund: (key: number) => void;
    release: (key: number, addr : string) => void;
    freeze: (key: number) => void;
}

const Uint32 = (x :number) : Buffer => {
    let b = Buffer.alloc(4);
    b.writeUInt32BE(x, 0);
    return b;
}
const Int8 = (x : number) : Buffer => {
    let b = Buffer.alloc(1);
    b.writeInt8(x, 0);
    return b;
}

class BitString {
    string : Array<boolean>;
    constructor () {
        this.string = new Array<boolean>();
    }

    storeBit(x : boolean | number) {
        if (typeof x === 'number')
            x = x == 1;
        this.string.push(x);
    }
    storeBits(...x : boolean[] | number[]) {
        for (let i = 0; i < x.length; ++i)
            this.storeBit(x[i]);
    }

    storeUint(x : number, n : number) {
        for (let i = n - 1; i >= 0; --i) {
            this.storeBit((x & Math.pow(2, i)) > 0);
        }
    }

    storeUint8(x : number) {
        this.storeUint(x, 8);
    }

    storeBuffer(buff : Buffer | Uint8Array) {
        if (buff instanceof Buffer)
            buff = new Uint8Array(buff);

        for (let i = 0; i < buff.length; ++i)
            this.storeUint8(buff[i]);
    }

    loadBit(i : number) : boolean {
        if (this.length() <= i)
            return false;
        return this.string[i];
    }
    loadUint(i : number, n : number) : number {
        let x = 0;
        for (let j = 0; j < n; ++j)
            x += (this.loadBit(i + j) ? Math.pow(2, n - j - 1) : 0);
        return x;
    }
    loadUint8(i : number) : number {
        return this.loadUint(i, 8);
    }

    length() : number {
        return this.string.length;
    }
    toBuffer() : Buffer {
        let length = Math.ceil(this.length() / 8);
        let buff = Buffer.alloc(length);
        for (let i = 0; i < length; ++i)
            buff[i] = this.loadUint8(i * 8);
        if (this.length() % 8 == 4)
            buff[buff.length - 1] = buff[buff.length - 1] & 0x08;
        return buff;
    }
}