import './logger';
import makeDB from './db';
import makeAPI from './api';
import express from "express";
import socketio from 'socket.io';
import bodyParser from 'body-parser';
import makeChat from './chat';
import TelegramBot from 'node-telegram-bot-api';

const token = '1140675303:AAE8HhLgnxBlYA34d-VTF2rJzsP03L2Zh_U';
const bot = new TelegramBot(token, {polling: true});

let db = makeDB({
    host: "localhost",
    user: "root",
    password: "root",
    database: "grampay-commerce"
});

const app = express();
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());

const server = app.listen(8744);
const io = socketio(server, <socketio.ServerOptions> { transport : ['websocket'] });
let chat = makeChat(db, io);
makeAPI(token, bot, app, chat, db);