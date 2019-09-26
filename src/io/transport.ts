
/** 通道事件 */
export const TransportEvents = {
    OPEN : 'open',
    CLOSE : 'close',
    DATA : 'data',
    ERROR : 'error'
};

/**
 * 数据通道
 */
export interface Transport {
    open(): void;
    close(): void;
    send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void;
    on(type: string | symbol, listener: Listener): this;
    off(type: string | symbol, listener: Listener): this;
}
