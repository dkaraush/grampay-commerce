import * as fs from 'fs';
import * as ed25519 from 'ed25519';
import * as crypto from 'crypto';

const TON = require('ton.js');
const contractCode : Buffer = fs.readFileSync('./smc/contract-code.dat');
const sha256 = (str : Buffer) : Buffer => {
    return crypto.createHash('sha256').update(str).digest();
};
// interface ContractData {
//     address: string;
//     priv: Buffer;
// }

// const newContract = function () {
    // let keypair = ed25519.MakeKeypair(crypto.randomBytes(32));
    // let code = TON.BagOfCells.deserialize(contractCode);
    // let storage = new TON.BagOfCells(0, Buffer.concat([
    //     // Buffer.from(new Uint16Array([0])),
    //     // keypair.publicKey,
    //     // Buffer.from(new Uint16Array([0]))
    // ]));
    // console.log(contractCode.toString('hex'));
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

export {
    // newContract
};