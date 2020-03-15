type Verbose = (...args : any[]) => void;
type Log = (...args : any[]) => void;
type Warn = (...args : any[]) => void;
type LogError = (...args : any[]) => void;
type Fatal = (...args : any[]) => void;
type FormatNum = (x : number, n? : number, a? : string, side? : boolean) => string;
declare module NodeJS {
    interface Global {
        verbose: Verbose
        log: Log
        warn : Warn
        error : LogError
        fatal : Fatal

        formatNum : FormatNum
    }
}
declare const verbose: Verbose;
declare const log: Log;
declare const warn: Warn;
declare const error: LogError;
declare const fatal: Fatal;
declare const formatNum : FormatNum;