export class Log {
    // static DEFAULT_TAG = 'ydplayer.js';
    // static USE_DEFAULT_TAG = false;

    // static enabledLogFunctions = {
    //     'debug': console.debug,
    //     'info': console.info,
    //     'warn': console.warn,
    //     'error': console.error
    // };

    // private static write(type: 'debug' | 'info' | 'warn' | 'error', tag: string, msg?: any) {
    //     const func = Log.enabledLogFunctions[type];
    //     if (!func) {
    //         return;
    //     }

    //     if (!msg && tag) {
    //         msg = tag;
    //         tag = Log.DEFAULT_TAG;
    //     }

    //     if (!tag || Log.USE_DEFAULT_TAG)
    //         tag = Log.DEFAULT_TAG;

    //     const str = `[${tag}] > ${msg}`;

    //     console[type](str);
    // }

    // public static error(tag: string, msg?: any) {
    //     Log.write('error', tag, msg);
    // }

    // public static info(tag: string, msg?: any) {
    //     Log.write('info', tag, msg);
    // }

    // public static warn(tag: string, msg?: any) {
    //     Log.write('warn', tag, msg);
    // }

    // public static debug(tag: string, msg?: any) {
    //     Log.write('debug', tag, msg);
    // }

    public static error = console.error;
    public static warn = console.warn;
    public static info = console.info;
    public static debug = console.debug;
    public static log = console.log;

    // public static error = console.error;
    // public static warn = (...args: any[]) => { };
    // public static info = (...args: any[]) => { };
    // public static debug = (...args: any[]) => { };
    // public static log = (...args: any[]) => { };
}