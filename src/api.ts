
import TelegramBot from 'node-telegram-bot-api';
import express, {Express, Response} from 'express';
import * as fs from 'fs';
import crypto from 'crypto';
import https from 'https';
import { Database } from './db';
import { Chat, Message } from './chat';
import {homedir} from 'os';
import {join as joinPathes} from 'path';
import TEXTS from './texts';
import './blockchain';
const {TONAddress} = require('ton.js');

const sha256 = (str : string) : Buffer => {
    return crypto.createHash('sha256').update(new Buffer(str, 'utf-8')).digest();
};
const hmac_sha256 = (key : Buffer, str : string) : Buffer => {
    return crypto.createHmac("sha256", key).update(new Buffer(str, 'utf-8')).digest();
};
const unix = () => Math.floor(new Date().getTime() / 1000);
const name = (data : any) => {
    let a = ([data.first_name, data.last_name]).filter(x => !!x);
    if (a.length == 0)
        return data.username || "";
    return a.join(' ');
}
const filter = (obj : any, keys : string[]) => {
    let o : any = {};
    for (let key of keys)
        if (typeof obj[key] !== 'undefined')
            o[key] = obj[key];
    return o;
}
const randomString = (n : number = 16, q : string = "1234567890QWERTYUIOPASDFGHJKLZXCVBNMqwertyuiopasdfghjklzxcvbnm") => 
    Array.from({length:n}, () => q[Math.round(Math.random() * (q.length-1))]).join('');

const fee = 0.02;
const usd2grm = (usd : number) => usd / 4;

export default (
    token: string, 
    bot : TelegramBot, 
    app : Express, 
    chat : Chat,
    db : Database) => {
    const secret = sha256(token);

    app.post('/login-buyer', async (req : any, res : Response<any>) => {
        let productID : number = NaN;
        if (req.query.product)
            productID = parseInt(req.query.product);
        if (isNaN(productID))
            return res.status(400).end();

        let product = await db.findProductById(productID);

        let dataCheckString = Object.keys(req.body)
                                    .filter(key => key !== 'hash')
                                    .sort()
                                    .map(key => key+'='+req.body[key])
                                    .join('\n');

        if (hmac_sha256(secret, dataCheckString).toString('hex') !== req.body.hash) {
            error('failed to validate')
            res.status(400).end();
            return;
        }

        let telegramID = parseInt(req.body.id);
        if (isNaN(telegramID))
            return res.status(400).end();
        
        let token, id;
        let buyer = await db.findBuyerById(telegramID, 'telegram_id');
        if (buyer == null) {
            token = randomString(32);
            await db.query(db.insertQuery("buyer", {
                telegram_id: telegramID,
                name: name(req.body),
                link: req.body.username || null,
                purchases: 0,
                token,
                rate_count: 0,
                rate_sum: 0
            }));
            id = (await db.query("SELECT id FROM buyer WHERE telegram_id="+telegramID+" LIMIT 1"))[0].id;
        } else {
            token = buyer.token;
            id = buyer.id;
            await db.query("UPDATE buyer SET name="+esc(name(req.body))+", link="+esc(req.body.username || null)+" WHERE telegram_id="+telegramID);
        }

        let orders;
        if ((orders = await db.query("SELECT id, buyer_token FROM `order` WHERE product_id="+productID+" AND buyer_id="+id+" AND complete=0 LIMIT 1")).length > 0) {
            let order = orders[0];
            return res.json({orderToken: order.buyer_token});
        }
        
        bot.sendMessage(telegramID, TEXTS.buyerLogin({
            product: product.title,
            product_id: product.id,
            price_usd: product.price.toFixed(2),
            price_grm: usd2grm(product.price).toFixed(2)
        }), {disable_notification: true, parse_mode: 'HTML'});
        res.json({token});
    });

    interface OrderDetails {
        fname? : string;
        lname? : string;
        address1? : string;
        address2? : string;
        country? : string;
        city? : string;
        zip? : string;
        phone? : string;
        email? : string;
    }
    interface PushOrderRequest {
        product : number;
        token: string;
        details: OrderDetails;   
    }
    app.post('/push-order', async (req : any, res: Response<any>) => {
        let body = req.body;
        if (typeof body.product !== 'number' ||
            typeof body.token !== 'string' ||
            typeof body.details !== 'object')
            return res.status(400).end();

        let order = await db.findOrderByIdAndToken(body.product, body.token, 'buyer_token');
        if (order !== null)
            return res.json({orderToken: order.buyer_token});

        let buyer =   await db.findBuyerByToken(body.token);
        let product = await db.findProductById(body.product);
        if (buyer == null || product == null || product.deleted)
            return res.status(400).end();

        let seller =  await db.findSellerById(product.seller);
        if (seller == null)
            return res.status(400).end();

        let buyerOrderToken = randomString(32);
        let sellerOrderToken = randomString(32);

        let usd = product.price,
            grm = usd2grm(usd),
            usdWithFee = product.price * (1 + fee),
            grmWithFee = usd2grm(usdWithFee);

        if (product.deleted)
            return res.status(403).end();
            
        await db.query(
            db.insertQuery('order', {
                seller_id:    seller.id,
                buyer_id:     buyer.id,
                seller_token: sellerOrderToken,
                buyer_token:  buyerOrderToken,
                product_id:   product.id,
                amount_usd:   usdWithFee,
                amount_grm:   grmWithFee,
                price_usd:    usd,
                price_grm:    grm,
                address:      "address",
                privkey:      "private-key",
                opened_time:  unix()
            })
        );
        order = await db.findOrderByIdAndToken(product.id, sellerOrderToken, 'seller_token');

        log('seller: ' + sellerOrderToken);
        log('buyer: ' + buyerOrderToken);

        bot.sendMessage(seller.telegram_id, TEXTS.openedOrderSeller({
            buyer: buyer.name,
            product_id: product.id,
            product: product.title,
            token: sellerOrderToken,
            price_usd: usd.toFixed(2),
            price_grm: grm.toFixed(2),
            order_id:  order.id
        }), {parse_mode: "HTML"});
        bot.sendMessage(buyer.telegram_id, TEXTS.openedOrderBuyer({
            seller: seller.title,
            product_id: product.id,
            product: product.title,
            token: buyerOrderToken,
            amount_usd: usdWithFee.toFixed(2),
            amount_grm: grmWithFee.toFixed(2),
            order_id:  order.id
        }), {parse_mode: "HTML"});

        chat.send(order.id, 0, JSON.stringify({
            id: "init"
        }));

        let detailKeys = Object.keys(body.details)
                        .filter(key => Object.keys(TEXTS.details).includes(key) && 
                                        body.details[key] !== undefined &&
                                        typeof body.details[key] === 'string' && body.details[key].length > 0);

        if (detailKeys.length > 0) {
            chat.send(order.id, 2, 
                `Order details\n\n` + detailKeys
                                        .map(detailKey => TEXTS.details[detailKey] + ': ' + body.details[detailKey])
                                        .join('\n')
            );
        }

        res.json({orderToken: buyerOrderToken});
    });

    app.get('/product', async (req: any, res: Response<any>) => {
        if (typeof req.query.id !== 'string')
            return res.status(400).end();
        
        let id = parseInt(req.query.id);
        if (isNaN(id))
            return res.status(400).end();

        let productRes = await db.query(`
            SELECT product.id as 'product.id', 
                   product.title as 'product.title', 
                   product.image as 'product.image',
                   product.image_prefix as 'product.image_prefix',
                   product.price as 'product.price',
                   product.count as 'product.count',
                   product.deleted as 'product.deleted',
                    seller.id as 'seller.id',
                    seller.title as 'seller.title',
                    seller.description as 'seller.description',
                    seller.link as 'seller.link',
                    seller.telegram_id as 'seller.telegram_id',
                    seller.trades_count as 'seller.trades_count',
                    seller.is_digital as 'seller.is_digital',
                    seller.rate_sum as 'seller.rate_sum',
                    seller.rate_count as 'seller.rate_count'
            FROM product 
            INNER JOIN seller ON product.seller=seller.id
            WHERE product.id=${id}
            LIMIT 1`);
        if (productRes.length == 0)
            return res.status(404).end();
        productRes = productRes[0];
        
        let product : any = {}, seller : any = {};
        Object.keys(productRes).map((k:string) => {
            if (k.startsWith('product.'))
                product[k.substring(8)] = productRes[k];
            if (k.startsWith('seller.'))
                seller[k.substring(7)] = productRes[k];
        });
        if (product.image instanceof Buffer)
            product.image = product.image.toString('base64');
        res.json({product, seller, rate: usd2grm(1), fee});
    });
    app.get('/shop', async (req : any, res : Response<any>) => {
        let link = req.query.id;
        if (typeof link !== 'string')
            return res.status(400).end();

        let seller = null;
        if (/^\d+$/.test(link)) {
            seller = await db.findSellerById(parseInt(link));
        } else
            seller = await db.findSellerByToken(link, 'link');
        
        if (seller == null)
            return res.status(404).end();
        
        let products = await db.query(`SELECT * FROM product WHERE seller=${seller.id} AND deleted=0`);
        res.json({
            seller: filter(seller, ['id', 'telegram_id', 'title', 'link', 'description', 'rate_sum', 'rate_count', 'trades_count']),
            products: products.map((product : any) => {
                let o = filter(product, ['id', 'title', 'image', 'image_prefix', 'price']);
                if (o.image)
                    o.image = o.image.toString('base64');
                return o;
            }),
            rate: usd2grm(1)
        });
    });

    app.get('/order', async (req : any, res: Response<any>) => {
        if (typeof req.query.token !== 'string')
            return res.status(400).end();
        
        let orders = await db.query(`
            SELECT * FROM \`order\` WHERE
            seller_token=${esc(req.query.token)} OR buyer_token=${esc(req.query.token)}
            LIMIT 1
        `);
        if (orders.length == 0)
            return res.status(404).end();
        let order = orders[0];

        let product = await db.findProductById(order.product_id),
            buyer =   await db.findBuyerById(order.buyer_id),
            seller =  await db.findSellerById(order.seller_id);
        if (product === null || buyer === null || seller === null)
            return res.status(404).end();
        if (product.image instanceof Buffer)
            product.image = product.image.toString('base64');

        let isBuyer = order.buyer_token == req.query.token;

        let filterKeys = ['id', 'paid', 'released', 'refunded', 'dispute', 'opened_time', 'paid_time', 'price_usd', 'price_grm', 'amount_usd', 'amount_grm', 'confirmed', 'complete', 'success'];
        if (isBuyer)
            filterKeys.push('address');

        res.json(Object.assign(
            filter(order, filterKeys),
            {
                product: filter(product, ['id', 'title', 'image', 'image_prefix', 'price']),
                buyer: filter(buyer, ['id', 'telegram_id', 'name', 'link', 'purchases', 'rate_sum', 'rate_count']),
                seller: filter(seller, ['id', 'telegram_id', 'title', 'link', 'trades_count', 'rate_sum', 'rate_count']),
                rate: usd2grm(1),
                rated: isBuyer ? order.buyer_rated : order.seller_rated,
                who: isBuyer ? 'buyer' : 'seller'
            }
        ));
    });

    app.get('/userpic', async (req: any, res: Response<any>) => {
        if (typeof req.query.id !== 'string')
            return res.status(400).end();

        let photos = (await bot.getUserProfilePhotos(req.query.id, {limit: 1})).photos;
        if (photos.length == 0) {
            res.status(404).end();
        } else {
            let file = await bot.getFile(photos[0][0].file_id);
            let url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
            https.get(url, (_req) => {
                if (!_req)
                    return res.status(404).end();
                res.status(_req.statusCode || 200);
                _req.on('data', chunk => res.write(chunk));
                _req.on('end', () => res.end());
            }).on('error', () => {
                res.status(404).end();
            });
        }
    });

    chat.whenOffline(async (order_id: number, toBuyer: boolean, message: Message) => {
        let order = await db.findOrderById(order_id);
        if (order === null)
            return;
        let product = await db.findProductById(order.product_id);
        if (product === null)
            return;
            
        let telegram_id : number;
        let buyer = await db.findBuyerById(order.buyer_id),
            seller = await db.findSellerById(order.seller_id);
        
        if (buyer === null || seller === null)
            return;
        telegram_id = (toBuyer ? buyer : seller).telegram_id;
        
        function fileSize(buff : Buffer) {
            let bytes = buff.length;
            let measures = ['B', 'KB', 'MB', 'GB', 'TB'];
            
            let i = 0;
            for (; i < measures.length; ++i) {
                if (bytes > 1024) {
                    bytes /= 1024
                } else break;
            }
            return bytes.toFixed(1) + measures[i];
        }

        let textFunc = message.file ? TEXTS.chatNotificationFile : TEXTS.chatNotification;
        bot.sendMessage(telegram_id, textFunc({
            from_name: toBuyer ? seller.title : buyer.name,
            from_type: (['system', 'support', 'buyer', 'seller'])[message.from],
            text: message.text,
            filesize: message.file ? fileSize(message.file) : '',
            filename: message.filename,
            token: toBuyer ? order.buyer_token : order.seller_token,
            order_id: order.id,
            product_name: product.title
        }), {parse_mode: "HTML"});
    });
    chat.onProcessOrder(async (order_id: number, fromBuyer: boolean, action : string) => {
        let order = await db.findOrderById(order_id);
        
        let seller = await db.findSellerById(order.seller_id),
            buyer = await db.findBuyerById(order.buyer_id);

        if (action === 'cancel') {
            if (order.paid)
                return; // you can't cancel paid order
            verbose(await db.query(`UPDATE \`order\` SET complete=1, success=0 WHERE id=${order.id}`));

            chat.send(order.id, 0, JSON.stringify({
                id: "cancel",
                who: fromBuyer ? 'buyer' : 'seller'
            }));

            chat.updateOrderData(order.id);
            if (!chat.isOnline(order.id, !fromBuyer)) {
                bot.sendMessage((fromBuyer ? seller : buyer).telegram_id, TEXTS.cancelNotification({
                    from_name: fromBuyer ? buyer.name : seller.title,
                    from_type: fromBuyer ? 'buyer' : 'seller',
                    order_token: fromBuyer ? order.seller_token : order.buyer_token,
                    order_id: order.id 
                }), {parse_mode: "HTML"});
            }
        }

        if (action === 'confirm' && !fromBuyer) {
            if (order.confirmed)
                return;
            await db.query(`UPDATE \`order\` SET confirmed=1 WHERE id=${order.id};`)
            chat.updateOrderData(order.id);
            if (!chat.isOnline(order.id, true)) {
                bot.sendMessage(buyer.telegram_id, TEXTS.confirmNotification({
                    from_name: seller.title,
                    order_token: buyer.token,
                    order_id: order.id
                }), {parse_mode: "HTML"});
            }
        }
    });


    // bot
    let state = new State();
    bot.onText(/\/help/, (message) => {
        if (!message.from)
            return;
        bot.sendMessage(message.from.id, TEXTS.help());
    });
    bot.onText(/\/info|\/shop/, async (message) => {
        if (!message.from)
            return;
        let seller = await db.findSellerById(message.from.id, 'telegram_id');
        if (seller === null)
            return bot.sendMessage(message.from.id, TEXTS.doesntHaveShop());
        
        let products = await db.query(`SELECT * FROM product WHERE seller=${seller.id} AND deleted=0`);
        bot.sendMessage(message.from.id, TEXTS.info({
            shop_link: seller.link || seller.id,
            products_count: products.length,
        }) + products.map((product : any, i : number) => TEXTS.productInfo({
            i: i+1,
            title: product.title,
            price: product.price.toFixed(2),
            id: product.id
        })).join('\n'), {parse_mode: "HTML"});
    });
    bot.onText(/\/remove_\d+/, async (message) => {
        if (!message.from)
            return;
        if (!message.text)
            return;

        let seller = await db.findSellerById(message.from.id, 'telegram_id');
        if (seller === null)
            return bot.sendMessage(message.from.id, TEXTS.doesntHaveShop());

        let match = message.text.match(/\/remove_(\d+)/);
        if (match === null || match.length < 2)
            return;
        let id = parseInt(match[1]);

        let product = await db.findProductById(id);
        if (product === null)
            return bot.sendMessage(message.from.id, TEXTS.productWasNotFound({id: id}));
        if (product.seller !== seller.id)
            return bot.sendMessage(message.from.id, TEXTS.productIsNotYours({id: id}));

        await db.query(`UPDATE product SET deleted=1 WHERE id=${id}`);
        bot.sendMessage(message.from.id, TEXTS.productWasRemoved());
    });
    bot.onText(/\/add_product/, async (message) => {
        if (!message.from)
            return;

        let seller = await db.findSellerById(message.from.id, 'telegram_id');
        if (seller === null)
            return bot.sendMessage(message.from.id, TEXTS.doesntHaveShop());
        
        state.set(message.from.id, {id: "product_title"});
        bot.sendMessage(message.from.id, TEXTS.askProductTitle());
    });
    bot.onText(/\/cancel/, async (message) => {
        if (!message.from)
            return;
        let userState = state.get(message.from.id);
        if (userState) {
            state.set(message.from.id, undefined)
            bot.sendMessage(message.from.id, TEXTS.cancelled());
        }
    });
    bot.onText(/\/remove/, async (message) => {
        if (!message.from)
            return;

        let seller = await db.findSellerById(message.from.id, 'telegram_id');
        if (seller === null)
            return bot.sendMessage(message.from.id, TEXTS.doesntHaveShop());
        
        let openOrders = await db.query(`SELECT id FROM \`order\` WHERE seller_id=${seller.id} AND complete=0 LIMIT 1`);
        if (openOrders.length > 0)
            return bot.sendMessage(message.from.id, TEXTS.hasOpenOrders());
            
        await db.query(`DELETE FROM \`product\` WHERE seller=${seller.id}`);
        await db.query(`DELETE FROM \`seller\` WHERE id=${seller.id}`);
        return bot.sendMessage(message.from.id, TEXTS.shopRemoved());
    });
    bot.onText(/\/orders/, async (message) => {
        if (!message.from)
            return;
        let showActive = (message.text || "").toLowerCase().includes('active');

        let seller = await db.findSellerById(message.from.id, 'telegram_id');
        let buyer = await db.findBuyerById(message.from.id, 'telegram_id');

        if (seller === null && buyer === null)
            return bot.sendMessage(message.from.id, TEXTS.noOrders());
        
        let conditions : string[] = [];
        if (showActive)
            conditions.push('complete=0');
        if (seller !== null)
            conditions.push('seller_id=' + seller.id);
        if (buyer !== null)
            conditions.push('buyer_id=' + buyer.id);
        let orders = await db.query(`
            SELECT order.id as 'id', 
                   order.seller_id as 'seller_id', 
                   order.buyer_id as 'buyer_id',
                   order.seller_token as 'seller_token',
                   order.buyer_token as 'buyer_token',
                   order.complete as 'complete',
                   order.success as 'success',
                   order.paid as 'paid',
                   order.dispute as 'dispute',
                   order.confirmed as 'confirmed',
                   order.refunded as 'refunded',
                    product.id as 'product_id',
                    product.title as 'product_title'
            FROM \`order\` 
            INNER JOIN product ON order.product_id=product.id
            WHERE ${conditions.join(' AND ')}
            ORDER BY order.opened_time DESC
            LIMIT 50`);
        // let orders = await db.query(`SELECT * FROM \`order\` WHERE 
        //                             ${conditions.join(' AND ')} LIMIT 100`);
        if (orders.length == 0)
            return bot.sendMessage(message.from.id, TEXTS.noOrders());

        const symbols = {
            done: ['✅ ', 'Successfully done.'],
            refunded: ['↩️ ', 'Refunded.'],
            cancelled: ['🛑 ', 'Cancelled.'],
            waitingPayment: ['💸 ', 'Waiting payment...'],
            waitingDispute: ['❓ ', 'Processing dispute...'],
            waitingConfirmation: ['⌛ ', 'Waiting seller confirmation...']
        }
        
        let ordersText = `Orders: (${
            seller !== null ? 
                '<b>' + TEXTS.escapeHTML(seller.title) + '</b> seller' :
                '<b>' + TEXTS.escapeHTML(buyer.name) + '</b> buyers' 
            })\n`;
        if (!showActive)
            ordersText += '/orders_active — show only active orders\n';
        ordersText += '\n';
        for (let order of orders) {
            let status = ['', ''];
            if (order.success)
                status = symbols.done;
            else if (order.complete && !order.paid)
                status = symbols.cancelled;
            else if (!order.complete && !order.paid && order.confirmed)
                status = symbols.waitingPayment;
            else if (!order.complete && order.dispute)
                status = symbols.waitingDispute;
            else if (order.complete && order.refunded)
                status = symbols.refunded;
            else if (!order.complete && !order.confirmed)
                status = symbols.waitingConfirmation;

            let link = TEXTS.domain + '/order/?' + (seller !== null ? order.seller_token : order.buyer_token);
            let productLink = TEXTS.domain + '/product/' + order.product_id;
            ordersText += `${status[0]}<a href="${link}"><b>Order #${order.id}</b></a> <i><a href="${productLink}">${TEXTS.escapeHTML(order.product_title)}</a></i>${status[0].length>0?' — ':''}${status[1]}` + '\n';
        }

        bot.sendMessage(message.from.id, ordersText, {parse_mode: "HTML"});
    })

    bot.on('message', async (message, metadata) => {
        if (!message.from)
            return;
        let user : TelegramBot.User = message.from, seller : any;

        if ((seller = await db.findSellerById(user.id, 'telegram_id')) !== null) {
            let userState = state.get(user.id);
            if (!userState)
                return;// bot.sendMessage(user.id, TEXTS.help());

            if (userState.id === 'product_title') {
                let title = message.text;
                if (typeof title !== 'string' || title.length < 2 || title.length > 256)
                    return bot.sendMessage(user.id, TEXTS.badProductTitle());

                userState.title = title;
                userState.id = 'product_price';

                return bot.sendMessage(user.id, TEXTS.askProductPrice());
            } else if (userState.id === 'product_price') {
                let priceText = message.text;
                if (typeof priceText !== 'string')
                    return bot.sendMessage(user.id, TEXTS.badProductPrice());
                let price = parseFloat(priceText);

                if (isNaN(price) || price < 2)
                    return bot.sendMessage(user.id, TEXTS.badProductPrice());
                
                userState.price = price;
                userState.id = 'product_image';

                return bot.sendMessage(user.id, TEXTS.askProductImage());
            } else if (userState.id === 'product_image') {
                if (!message.document)
                    return bot.sendMessage(user.id, TEXTS.badProductImagePhoto());

                let document : any = message.document;
                if (document.file_size > 1024 * 1024 * 10)
                    return bot.sendMessage(user.id, TEXTS.badProductImageSize());
                if (!(['image/jpeg', 'image/png']).includes(document.mime_type))
                    return bot.sendMessage(user.id, TEXTS.badProductImageType());

                let file = await bot.getFile(document.file_id);
                let url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
                https.get(url, (_req) => {
                    if (!_req)
                        return bot.sendMessage(user.id, TEXTS.badProductImageError());
                    let image : Buffer[] = [];
                    _req.on('data', chunk => image.push(chunk));
                    _req.on('end', async () => {
                        
                        let imageBuffer = Buffer.concat(image);

                        await db.query(db.insertQuery('product', {
                            image: imageBuffer,
                            title: userState.title,
                            price: userState.price,
                            count: 0,
                            seller: seller.id,
                                    // data:image/png;base64,
                            image_prefix: 'data:' + document.mime_type + ';base64,'
                        }));

                        state.set(user.id, undefined);
                        bot.sendMessage(user.id, TEXTS.productAdded({
                            title: userState.title,
                            price_usd: userState.price.toFixed(2),
                            price_grm: usd2grm(userState.price).toFixed(2)
                        }), {parse_mode: "HTML"});
                    });
                }).on('error', (e) => {
                    error(e);
                    bot.sendMessage(user.id, TEXTS.badProductImageError());
                });

            } else {
                //bot.sendMessage(message.from.id, TEXTS.help());
            }
        } else if (!state.has(user.id)) {
            bot.sendMessage(user.id, TEXTS.welcome(), {
                reply_markup: <TelegramBot.InlineKeyboardMarkup> {
                    inline_keyboard: [[{text: TEXTS.createShopButton(), callback_data: "create_shop"}]]
                }
            });
        } else {
            let userState = state.get(user.id);
            if (!userState)
                return;

            if (userState.id === 'shop_desc') {
                let description = message.text;

                if (!description || description.length < 2 || description.length > 256)
                    return bot.sendMessage(user.id, TEXTS.badDescription());

                userState.id = 'shop_address';
                userState.description = description;
                state.set(user.id, userState);

                bot.sendMessage(user.id, TEXTS.askAddress(), {parse_mode: "HTML"});
            } else if (userState.id === 'shop_address') {
                let address = message.text;
                const bad = () => bot.sendMessage(user.id, TEXTS.badAddress());

                if (!address)
                    return bad();
                
                let addr;
                try {
                    addr = TONAddress.from(address);
                } catch (e) {
                    return bad();
                }

                await db.query(db.insertQuery('seller', {
                    'telegram_id': user.id,
                    title: name(user),
                    link: user.username,
                    description: userState.description,
                    is_digital: userState.is_digital,
                    address: addr.toString(),
                    token: randomString(32),
                    trades_count: 0
                }));

                state.set(user.id, undefined);
                bot.sendMessage(user.id, TEXTS.shopDone());
            }
        }
    });
    // welcome -{create shop}-> is digital, description, address -> shop created

    bot.on('callback_query', async (query) => {
        let user = query.from;
        if (!user)
            return;

        bot.answerCallbackQuery({callback_query_id: query.id});
        if (query.data === 'create_shop') {
            if (await db.findSellerById(user.id, 'telegram_id') !== null)
                return bot.sendMessage(user.id, TEXTS.alreadyHaveShop());
            
            bot.sendMessage(user.id, TEXTS.askShopType(), {
                reply_markup: {
                    inline_keyboard: [[
                        {text: TEXTS.shopTypeDigitalButton(), callback_data: "digital"},
                        {text: TEXTS.shopTypePhysicalButton(), callback_data: "physical"}
                    ]]
                }
            });
        } else if (query.data === 'digital' || query.data === 'physical') {
            if (await db.findSellerById(user.id, 'telegram_id') !== null)
                return bot.sendMessage(user.id, TEXTS.alreadyHaveShop());
            
            state.set(user.id, {id: 'shop_desc', is_digital: query.data === 'digital'});
            bot.sendMessage(user.id, TEXTS.askDescription());
        }
    });
};

class State {
    data : any;
    path : string = joinPathes(homedir(), '.grampay');
    filename = "state.json";
    constructor() {
        if (!fs.existsSync(this.path))
            fs.mkdirSync(this.path, {recursive: true});
        
        let path = joinPathes(this.path, this.filename);
        if (fs.existsSync(path)) {
            this.data = JSON.parse(fs.readFileSync(path).toString());
        } else {
            this.data = {};
            this.save();
        }
    }

    save() {
        let path = joinPathes(this.path, this.filename);
        fs.writeFileSync(path, JSON.stringify(this.data));
    }

    has(id: number) {
        return typeof this.data[id] !== 'undefined';
    }
    get(id: number) {
        return this.data[id];
    }
    set(id: number, obj : any) {
        this.data[id] = obj;
        this.save();
    }
}