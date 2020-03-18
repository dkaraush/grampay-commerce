import { Database } from "./db";
import { Server, Socket } from 'socket.io';

const unix = () => Math.floor(new Date().getTime() / 1000);

type WhenOfflineCallback = (order: number, toBuyer : boolean, message : Message) => void;
type ProcessOrderCallback = (order: number, fromBuyer: boolean, action : string, ...args : any[]) => Promise<any>;
interface Chat {
    send: (order : number, from : number, content : string | Buffer, filename? : string) => Promise<void>;
    whenOffline: (func: WhenOfflineCallback) => void;
    onProcessOrder: (func: ProcessOrderCallback) => void;
    isOnline: (order_id : number, buyer: boolean) => boolean;
    updateOrderData: (order: any | number) => void;
}
interface Message {
    id?: number;
    text: string;
    from: number;
    file?: Buffer;
    filename?: string;
    order_id: number;
    date: number;
}

interface Client {
    uniid: number;
    socket : Socket;
    order: number;
    id: number;
}

const filter = (obj : any, keys : string[]) => {
    let o : any = {};
    for (let key of keys)
        if (typeof obj[key] !== 'undefined')
            o[key] = obj[key];
    return o;
}

const actions = ['cancel', 'confirm', 'release', 'refund', 'dispute', 'feedback'];
export default (db : Database, io : Server) : Chat => {
    let clients : any = {};
    let whenOfflineCallback : any = null;
    let processOrderCallback : any = null;

    const send = async (order: number, from: number, content: string | Buffer, filename? : string) => {
        let message : Message;
        if (content instanceof Buffer) {
            if (typeof filename !== 'string')
                return;
            if (content.length > 1024 * 1024 * 10)
                return;

            message = <Message> {
                text: '',
                from,
                file: content,
                filename,
                order_id: order,
                date: unix()
            };
        } else if (typeof content === 'string') {
            message = <Message> {
                text: content,
                from,
                order_id: order,
                date: unix()
            }
        } else {
            return;
        }

        let insertOptions = await db.query(db.insertQuery('message', message));
        let message_id = insertOptions.insertId;
        message.id = message_id;

        let sent = [];
        if (clients[order]) {
            for (let client of clients[order]) {
                if (!client.socket.disconnected) {
                    client.socket.emit('messages', [message]);
                    sent.push(client.id);
                }
            }
        }

        //verbose(message);
        if (from > 0) {
            if (from !== 2 && !sent.includes(2) && whenOfflineCallback !== null) {
                whenOfflineCallback(order, true, message);
            }
            if (from !== 3 && !sent.includes(3) && whenOfflineCallback !== null) {
                whenOfflineCallback(order, false, message);
            }
        }
    };

    io.on('connection', async (socket: Socket) => {
        let token = socket.handshake.query.token;
        if (typeof token !== 'string')
            return socket.disconnect(true);

        let order = await db.query(`SELECT * FROM \`order\` WHERE
                                    seller_token=${esc(token)} OR buyer_token=${esc(token)}
                                    LIMIT 1`);
        if (order.length == 0)
            return socket.disconnect(true);
        order = order[0];

        /*
            message ids:
                0 - system messages
                1 - support
                2 - buyer
                3 - seller
        */
        let uniid = ~~(Math.random() * 999999);
        let id = order.seller_token == token ? 3 : 2;

        if (typeof clients[order.id] === 'undefined')
            clients[order.id] = new Array();
        
        let client = <Client> {uniid, socket, order: order.id, id};
        clients[order.id].push(client);

        let lastMessages = await db.query(`SELECT * FROM \`message\` WHERE
                                           order_id=${order.id} ORDER BY id DESC LIMIT 10`);
        socket.emit('messages', lastMessages);
        socket.on('more', async (from : number) => {
            if (typeof from !== 'number')
                return;
            let msgs = await db.query(`SELECT * FROM \`message\` WHERE
                                       order_id=${order.id} AND id<${from}
                                       ORDER BY id DESC LIMIT 10`);
            
            socket.emit('messages', msgs);
        });

        socket.on('send', async (content : any, filename? : string) => {
            send(order.id, id, content, filename);
        });

        if (processOrderCallback !== null) {
            for (let actionName of actions) {
                socket.on('order-' + actionName, async (...args: any[]) => {
                    await processOrderCallback.apply(null, [order.id, id === 2, actionName].concat(args));
                    // await db.findOrderById(order.id);
                });
            }
        }

        socket.on('disconnect', () => {
            for (let i = 0; i < clients[order.id].length; ++i)
                if (clients[order.id][i].uniid === uniid)
                    clients[order.id].splice(i, 1);
        })
    });

    return <Chat> {
        send,
        whenOffline: (func: WhenOfflineCallback) => {
            whenOfflineCallback = func;
        },
        onProcessOrder: (func: ProcessOrderCallback) => {
            processOrderCallback = func;
        },
        isOnline: (order_id: number, buyer : boolean) : boolean => {
            let orderClients = clients[order_id];
            if (!orderClients)
                return false;
            for (let client of orderClients) {
                if (client.from === (buyer ? 2 : 3) && !client.socket.disconnected)
                    return true;
            }
            return false;
        },
        updateOrderData: async (_order: number) => {
            let order = await db.findOrderById(_order);
            verbose(_order);
            if (!order)
                return;
            verbose(order);
            let orderClients = clients[order.id];
            if (!orderClients)
                return;
            console.log(orderClients);
            for (let client of orderClients) {
                let filterKeys = ['id', 'paid', 'released', 'refunded', 'dispute', 'opened_time', 'paid_time', 'price_usd', 'price_grm', 'amount_usd', 'amount_grm', 'confirmed', 'complete', 'success'];
                if (client.id === 2)
                    filterKeys.push('address', 'token', 'key');
                
                if (!client.socket.disconnected)
                    client.socket.emit('order', filter(order, filterKeys));
            }
        }
    };
};
export {Chat, Message};
