export class Network {
    
    /**
     * Convert a 32-bit quantity (long integer) from host byte order to network byte order (Little-Endian to Big-Endian).
     * @param buffer 
     * @param index 
     * @param value 
     */
    public static htonl(buffer: Uint8Array, index: number, value: number) {
        buffer[index] = (0xff & (value >> 24));
        buffer[index + 1] = (0xff & (value >> 16));
        buffer[index + 2] = (0xff & (value >> 8));
        buffer[index + 3] = (0xff & (value));
    };

    /**
     * 
     * @param buffer Convert a 32-bit quantity (long integer) from network byte order to host byte order (Big-Endian to Little-Endian).
     * @param index 
     */
    public static ntohl(buffer: Uint8Array, index: number): number {
        return ((0xff & buffer[index]) << 24) |
            ((0xff & buffer[index + 1]) << 16) |
            ((0xff & buffer[index + 2]) << 8) |
            ((0xff & buffer[index + 3]));
    };
}