//import { TextEncoder, TextDecoder } from 'text-encoding'

export class Encoding {
    public static getUTF8Bytes(str: string): Uint8Array {
        var enc = new TextEncoder();
        return enc.encode(str);
    }

    public static getUTF8String(uint8Array: Uint8Array): string {
        var enc = new TextDecoder("utf-8");
        return enc.decode(uint8Array);
    }
}