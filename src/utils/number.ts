export class NumberUtils {
    /**
     * read 16-bit int number
     * @param buffer 
     * @param index 
     */
    public static readInt16(buffer: Uint8Array, index: number): number {
        return ((0xff & buffer[index])) | ((0xff & buffer[index + 1]) << 8);
    }

    /**
     * read 32-bit int number
     * @param buffer 
     * @param index 
     */
    public static readInt32(buffer: Uint8Array, index: number): number {
        return ((0xff & buffer[index])) | ((0xff & buffer[index + 1]) << 8) | ((0xff & buffer[index + 2]) << 16) | ((0xff & buffer[index + 3]) * 16777216);
    }

    /**
     * read 64-bit int number
     * @param buffer 
     * @param index 
     */
    public static readInt64(buffer: Uint8Array, index: number): number {
        var i1 = ((0xff & buffer[index])) | ((0xff & buffer[index + 1]) << 8) | ((0xff & buffer[index + 2]) << 16) | ((0xff & buffer[index + 3]) * 16777216);
        var i2 = ((0xff & buffer[index + 4])) | ((0xff & buffer[index + 5]) << 8) | ((0xff & buffer[index + 6]) << 16) | ((0xff & buffer[index + 7]) * 16777216);
        return i1 + (i2 * 4294967296);
    }

    /**
     * 
     * @param s 
     * @param defaultValue 
     */
    public static parseInt(s: string | null, defaultValue?: number) {
        if (s == null) {
            if (defaultValue == undefined)
                return 0;
            else
                return defaultValue;
        }

        return parseInt(s);
    }
}