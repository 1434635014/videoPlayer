import { EventEmitter } from 'events';
import { Transport, TransportEvents } from './transport';
import { Log } from '../utils/log';

export class WebSocketTransport extends EventEmitter implements Transport {
    private LOG_TAG: string = '[WebSocketTransport] > ';
    private _url: string;
    private _opened: boolean = false;
    private _websocket: WebSocket | null = null;

    public onmessage: ((this: WebSocketTransport, data: ArrayBuffer) => any) | null = null;

    constructor(url: string) {
        super();
        this._url = url;
    }

    public open(): void {
        if (this._opened)
            return;
        this._websocket = new WebSocket(this._url);
        this._websocket.binaryType = "arraybuffer";
        this._websocket.onopen = this._ws_onopen;
        this._websocket.onclose = this._ws_onclose;
        this._websocket.onerror = this._ws_onerror;
        this._websocket.onmessage = this._ws_onmessage;
    }

    public close(): void {
        if (this._websocket == null)
            throw new Error('WebSocketTransport is not opened.');
        if (this._websocket.OPEN || this._websocket.CONNECTING) {
            this._websocket.close();
        }
    }

    public send(data: string | ArrayBuffer | Blob | ArrayBufferView): void {
        if (this._websocket == null)
            throw new Error('WebSocketTransport is not opened.');
        this._websocket.send(data);
    }

    private _ws_onopen = (evt: Event): void => {
        this.emit(TransportEvents.OPEN, evt);
    }

    private _ws_onclose = (evt: CloseEvent): void => {
        Log.debug(this.LOG_TAG, evt);
        this.emit(TransportEvents.CLOSE, evt);
    }

    private _ws_onerror = (evt: Event): void => {
        this.emit(TransportEvents.ERROR, evt);
    }

    private _ws_onmessage = (evt: MessageEvent): void => {
        let data = evt.data;
        if (this.onmessage != null && data instanceof ArrayBuffer) {
            this.onmessage(data);
        }
        this.emit(TransportEvents.DATA, data);
    }
}
