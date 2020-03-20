# Grampay Commerce

## [Link to the smart-contract description](https://github.com/dkaraush/grampay-commerce/tree/master/smc)

Grampay Commerce is a marketplace service for sellers and buyers with escrow payments and dispute system. Service acts like the third side, guaranteeing clarity and justice between seller and buyer.

Made in 10 days, specially for TON Blockchain Contest (Stage 2+).

Service itself consists of three parts:
- Telegram Bot
- Web (shops, products, orders)
- Smart-Contract

This repository contains Telegram Bot, Backend and Smart-Contract. Frontend, made with React, will be published soon.

How to use:
- Seller creates own shop in Telegram Bot and puts product advertisments in it. Seller is welcome to share the link to the store to attract buyers.
- Buyer chooses a product to buy, logins with Telegram and starts the order with seller. Chat between buyer and seller is open.
- Seller confirms, that service can be provided to the buyer and buyer can send Grams to the Grampay.
- The funds of an order are kept in Grampay Wallet. Buyer has a "Release Grams" button, seller has a "Refund Grams back" and both of them have "Open Dispute" button.
- In case no buttons were pressed by each side, refund back to the buyer will be automatically sent. 
- If "Open Dispute" is pressed, the funds become frozen and auto-refund is turned off. Then support of Grampay will contact each side and try to solve the problem.

To test out, there are already some demonstrational shops:
- https://grampay.org/shop/dkaraush
- https://grampay.org/shop/ceosvex
- https://grampay.org/shop/jekapena