type Escape = (str : string) => string;
declare module NodeJS {
    interface Global {
        esc: Escape
    }
}
declare const esc: Escape;