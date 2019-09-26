export class AACParser {
    static aacHeader: Uint8Array;

    static get samplingRateMap() {
        return [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
    }

    static get getAACHeaderData(): Uint8Array {
        return AACParser.aacHeader;
    }

    static getHeaderLength(data: Uint8Array): number {
        return (data[1] & 0x01 ? 7 : 9);  // without CRC 7 and with CRC 9 Refs: https://wiki.multimedia.cx/index.php?title=ADTS
    }

    static getFrameLength(data: Uint8Array): number {
        return ((data[3] & 0x03) << 11) | (data[4] << 3) | ((data[5] & 0xE0) >>> 5); // 13 bits length ref: https://wiki.multimedia.cx/index.php?title=ADTS
    }

    static isAACPattern(data: Uint8Array): boolean {
        return data[0] === 0xff && (data[1] & 0xf0) === 0xf0 && (data[1] & 0x06) === 0x00;
    }

    static extractAAC(buffer: Uint8Array): Uint8Array[] {
        let i = 0,
            length = buffer.byteLength,
            result: Uint8Array[] = [],
            headerLength: number,
            frameLength: number;

        if (!AACParser.isAACPattern(buffer)) {
            console.error('Invalid ADTS audio format');
        }

        headerLength = AACParser.getHeaderLength(buffer);
        if (!AACParser.aacHeader) {
            AACParser.aacHeader = buffer.slice(0, headerLength);
        }

        while (i < length) {
            frameLength = AACParser.getFrameLength(buffer);
            result.push(buffer.subarray(headerLength, frameLength));
            buffer = buffer.slice(frameLength);
            i += frameLength;
        }
        return result;
    }
}
