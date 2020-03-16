import './logger';
import makeDB from './db';
import makeAPI from './api';
import express from "express";
import socketio from 'socket.io';
import bodyParser from 'body-parser';
import makeChat from './chat';
import TelegramBot from 'node-telegram-bot-api';
import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';

const config = JSON.parse(fs.readFileSync('config.json').toString());
let db = makeDB(config.db);

const token = config.telegramToken;
const bot = new TelegramBot(token, {polling: true});


const app = express();
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());

const PORT = config.port || 8744;
var server;
if (!config.ssl) {
	server = http.createServer(app);
	server.listen(PORT);
} else {
	server = https.createServer({
		cert: fs.readFileSync(config.ssl.cert),
		key: fs.readFileSync(config.ssl.key)
	}, app);
	server.listen(PORT);
}


const io = socketio(server, <socketio.ServerOptions> { transport : ['websocket'] });
let chat = makeChat(db, io);
makeAPI(token, bot, app, chat, db);
