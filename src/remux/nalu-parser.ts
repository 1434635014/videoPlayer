import { NALU } from './nalu';

export class NALUParser {

    /**
     * extract nalu
     * @param buffer 
     */
    public static extractNALU(buffer: Uint8Array): NALU[] {
        let i: number = 0,
            length: number = buffer.byteLength,
            value: number,
            state: number = 0,
            result: NALU[] = [],
            lastIndex: number = 0;

        while (i < length) {
            value = buffer[i++];
            // finding 3 or 4-byte start codes (00 00 01 OR 00 00 00 01)
            switch (state) {
                case 0:
                    if (value === 0) {
                        state = 1;
                    }
                    break;
                case 1:
                    if (value === 0) {
                        state = 2;
                    } else {
                        state = 0;
                    }
                    break;
                case 2:
                case 3:
                    if (value === 0) {
                        state = 3;
                    } else if (value === 1 && i < length) {
                        if (lastIndex) {
                            let nalu = new NALU(buffer.subarray(lastIndex - 4/* include 0 0 0 1 */, i - state - 1));
                            result.push(nalu);
                        }
                        lastIndex = i;
                        state = 0;
                    } else {
                        state = 0;
                    }
                    break;
                default:
                    break;
            }
        }

        if (lastIndex) {
            let nalu = new NALU(buffer.subarray(lastIndex - 4, length));
            result.push(nalu);
        }
        return result;
    }
}