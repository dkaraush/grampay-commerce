/// <reference path="db.d.ts" />
import mysql from 'mysql';
const esc = global.esc = mysql.escape;

interface Database {
    end: Function;
    query: (query : string) => Promise<any>;
    insertQuery: (table: string, element: any) => string;
    takeFirst: (res : Array<any>) => any | null;

    findProductById: (id : number, field? : string) => Promise<any | null>;
    findBuyerById:   (id : number, field? : string) => Promise<any | null>;
    findSellerById:  (id : number, field? : string) => Promise<any | null>;
    findOrderById:   (id : number, field? : string) => Promise<any | null>;

    findBuyerByToken:  (token : string, field? : string) => Promise<any | null>;
    findSellerByToken: (token : string, field? : string) => Promise<any | null>;
    findOrderByIdAndToken: (productID: number, token: string, field?: string) => Promise<any | null>;
}

function toBuffer(ab : ArrayBuffer) {
    var buf = Buffer.alloc(ab.byteLength);
    var view = new Uint8Array(ab);
    for (var i = 0; i < buf.length; ++i) {
        buf[i] = view[i];
    }
    return buf;
}

export default function (credentials : any) : Database {
	let connection = mysql.createConnection(credentials);
	connection.connect();
	connection.on('error', onError);
	connection.on('connect', onSuccess);

	function onError(e : any) {
		warn('[db] table connection error', e);
		warn('[db] will try to connect after 5 sec');
		setTimeout(function reconnect() {
			connection = mysql.createConnection(credentials);
			connection.connect();
			connection.on('error', onError);
			connection.on('connect', onSuccess);
		}, 5000);
	}
	function onSuccess() {
		log('successfully'.green.bold, 'connected');
	}

    let db : Database;
	return (db = <Database> {
		end: connection.end.bind(connection),
		query: async function (query : string) : Promise<any> {
			query = query.replace(/[\r\n\t]{1,}[ ]{0,}[\r\n\t]{0,}/g, '\n');
			return new Promise((resolve, reject) => {
                let logquery = query.replace(/\x\'[a-fA-F0-9]+\'/g, 'x\'Buffer\'');
				verbose('SQL command query:', (logquery.includes('\n') ? '\n' + logquery.magenta.bold : '"' + logquery.magenta.bold + '"'));
				connection.query(query, function (error, results, fields) {
					if (error) {
						warn('SQL command query error:', error);
						reject(error);
						return;
					}

					verbose('SQL command result: ' + (results.length+'').white.bold + ' element' + (results.length==1?'':'s'))
					resolve(results);
				});
			});
		},
		insertQuery: function (table : string, element : any) : string {
			return `INSERT INTO \`${table}\` (${Object.keys(element).map(x => `\`${x}\``).join(', ')})
					VALUES (${Object.keys(element).map(k => {
                        if (typeof element[k] === 'number')
                            return element[k]+'';
                        if (element[k] instanceof ArrayBuffer)
                            element[k] = toBuffer(element[k]);
                        if (element[k] instanceof Buffer)
                            return 'x\''+element[k].toString('hex')+'\'';
                        return esc(element[k])
                    }).join(', ')});`;
        },
        
        takeFirst: function (res : Array<any>) {
            if (res.length == 0)
                return null;
            return res[0];
        },

        findProductById: async function (id : number, field : string = 'id') {
            return db.takeFirst(await db.query(`SELECT * FROM product WHERE ${field}=${id} LIMIT 1`));
        },
        findBuyerById: async function (id : number, field : string = 'id') {
            return db.takeFirst(await db.query(`SELECT * FROM buyer WHERE ${field}=${id} LIMIT 1`));
        },
        findSellerById: async function (id : number, field : string = 'id') {
            return db.takeFirst(await db.query(`SELECT * FROM seller WHERE ${field}=${id} LIMIT 1`));
        },
        findOrderById: async function (id : number, field : string = 'id') {
            return db.takeFirst(await db.query(`SELECT * FROM \`order\` WHERE ${field}=${id} LIMIT 1`));
        },

        findBuyerByToken: async function (token : string, field : string = 'token') {
            return db.takeFirst(await db.query(`SELECT * FROM buyer WHERE ${field}=${esc(token)} LIMIT 1`));
        },
        findSellerByToken: async function (token : string, field : string = 'token') {
            return db.takeFirst(await db.query(`SELECT * FROM seller WHERE ${field}=${esc(token)} LIMIT 1`));
        },
        findOrderByIdAndToken: async function (productID : number, token : string, field : string = 'buyer_token') {
            return db.takeFirst(await db.query(`SELECT * FROM \`order\` WHERE product_id=${productID} AND ${field}=${esc(token)} LIMIT 1`));
        }
	});
};
export {Database};