/// <reference path="logger.d.ts" />

import * as colors from 'colors';
import * as os from 'os';
import * as fs from 'fs';
import { bold } from 'colors';

const mkdirp = require('mkdirp');

// const logsPath = os.homedir() + '/.supersender/';
// if (!fs.existsSync(logsPath))
//     mkdirp(logsPath);
// const logFilename = "log";
// if (!fs.existsSync(logsPath + logFilename))
//     fs.writeFileSync(logsPath + logFilename, '');

const getCallee = function () : string | undefined {
    let stack = Error().stack;
    if (stack === undefined)
        return stack;
    let m = (stack.split(/\n/g)[4] || "").match(/\/([^\/]+\:\d+)\:\d+/);
    if (m === null || m.length < 1)
        return undefined;
    return m[1];
};
const callee = function () : string {
    let c = getCallee();
    if (c === undefined)
        return "";
    return "[" + c + "] ";
}
const pushLog = function (text : string) {
    console.log(text);
    // fs.appendFileSync(logsPath + logFilename, text + '\n');
};
global.formatNum = function (x : number, n : number = 2, a : string = "0", side : boolean = true) : string {
    let X = x.toString();
    if (X.length >= n)
        return X;
    return side ? a.repeat(n - X.length) + X : X + a.repeat(n - X.length);
}
const timedate = function () : string {
    let d = new Date();
    return `${formatNum(d.getDate())}/${formatNum(d.getMonth()+1)}/${formatNum(d.getFullYear()-2000)} ${formatNum(d.getHours())}:${formatNum(d.getMinutes())}:${formatNum(d.getSeconds())}.${formatNum(d.getMilliseconds(),3)}`;
};
const toString = function (x : any) {
    if (x === null)
        return 'null';
    if (x instanceof Error)
        return x.stack ? '\n'+x.stack : x.toString();
    if (x instanceof Buffer)
        return 'b{'+x.toString('hex')+'}';
    if (x === undefined || x === null || (typeof x === 'number' && isNaN(x)))
        return (x+'').grey;
    if (typeof x === 'object')
        return JSON.stringify(x, null, '\t').grey;
    return x.toString();
}

global.verbose = function (...args : any[]) {
    pushLog(bold('[v]'.grey) + (' ['+timedate()+'] '+callee()).grey + args.map(toString).join(' ').grey);
}
global.log = function (...args : any[]) {
    pushLog(bold('[i]'.cyan) + (' ['+timedate()+'] '+callee()).cyan + args.map(toString).join(' '));
}
global.warn = function (...args : any[]) {
    pushLog(bold('[!]'.yellow) + (' ['+timedate()+'] '+callee()).yellow + args.map(toString).join(' '));
}
global.error = function (...args : any[]) {
    pushLog(bold('[!]'.red) + (' ['+timedate()+'] '+callee()).red + args.map(toString).join(' '));
}
global.fatal = function (...args : any[]) {
    pushLog(bold('[x]'.red + (' ['+timedate()+'] '+callee()).red) + args.map(toString).join(' '));
    global.process.exit(3);
}