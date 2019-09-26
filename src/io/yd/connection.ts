import { Encoding } from '../../utils/encoding';
import { YDMessage, YDMessageCmd, YDSession, YDMessageError, YDMessageV1, YDMessageV2 } from './message';
import { Transport, TransportEvents } from '../transport';
import { WebSocketTransport } from '../websocket';
import { EventEmitter } from 'events';
import { ArgumentNullError } from '../../utils/error';
import { CycleBuffer } from '../../utils/cyclebuffer';
import { Connection, ConnectionEvents } from '../base-connection';
import { YDUrl } from './url';
import { Log } from '../../utils/log';

export interface AuthEvent {
    auth: boolean;
    message?: string;
    error?: any;
}

let connectionId = 1;

export class YDConnection extends EventEmitter implements Connection {
    private LOG_TAG: string = '[YDConnection] > ';
    private _id: number;
    private _url: YDUrl;
    private _sn: string;
    private _channel: number;
    private _authToken: string;
    private _authTs: string;
    /** 是否连续读（指一个消息未读取完成） */
    private _continuous: boolean = false;

    private _pending: boolean = false;
    private _pendingCmd: YDMessageCmd = YDMessageCmd.UNKOWN;

    private _transport: Transport;
    private _session: YDSession;
    private _isAuth: boolean = false;
    private _isConnected: boolean = false;
    private _buffer: CycleBuffer;
    private _recvAuthMsg: YDMessageV1;
    private _recvBufMsg: YDMessage;

    public get connected(): boolean { return this._isConnected; }
    public get pending(): boolean { return this._pending; }

    public get url(): YDUrl { return this._url; }
    public get sn(): string { return this._sn; }
    public get channel(): number { return this._channel; }
    public get isAuth(): boolean { return this._isAuth; }
    public get session(): YDSession { return this._session; }

    public onauth: ((this: YDConnection, event: AuthEvent) => void) | null = null;
    public onerror: ((this: YDConnection, event: { error: any, message: string }) => any) | null = null;

    constructor(url: YDUrl) {
        super();
        this._id = connectionId++;
        this._url = url;
        this._sn = url.sn;
        this._channel = url.channel;
        this._authToken = url.auth.token;
        this._authTs = url.auth.timestamp;
        if (url.protocol != 'ws:' && url.protocol != 'wss:' && url.protocol != 'ws-yd:' && url.protocol != 'wss-yd:') {
            throw new Error('protocol is not supported.');
        }
        if (this._sn == null || this._sn.length < 1)
            throw new ArgumentNullError("sn is null or empty.");
        if (this._authToken == null || this._authToken.length < 1)
            throw new ArgumentNullError("authToken is null or empty.");
        if (this._authTs == null || this._authTs.length < 1)
            throw new ArgumentNullError("authTs is null or empty.");
        //生成session
        this._session = new YDSession(Math.random() * 10000);
        this._recvAuthMsg = new YDMessageV1();
        //初始化缓冲消息对象
        this._recvBufMsg = new YDMessageV2(this._session);
        //初始化缓冲队列
        this._buffer = new CycleBuffer(4 * 1024 * 1024);
        let wsurl = url.toString();
        if (wsurl.indexOf('ws-yd:') === 0) {
            wsurl = wsurl.replace('ws-yd:', 'ws:');
        }
        if (wsurl.indexOf('wss-yd:') === 0) {
            wsurl = wsurl.replace('wss-yd:', 'wss:');
        }
        const transport = new WebSocketTransport(wsurl);
        this._transport = transport;
        transport.onmessage = this._onConnectionData;
        transport.on(TransportEvents.OPEN, this._onConnectionOpen);
        //transport.on(TransportEvents.DATA, this._onConnectionData);
        transport.on(TransportEvents.ERROR, this._onConnectionError);
        transport.on(TransportEvents.CLOSE, this._onConnectionClose);
    }

    private _open() {
        this._transport.open();
    }

    /**
     * 关闭连接
     */
    private _close() {
        if (this._isConnected && this._isAuth) {
            let message = new YDMessageV2(this._session);
            message.setHead(YDMessageCmd.CLOSE_CONNECTION);
            try {
                this._transport.send(message.buffer);
            }
            catch (e) {
                Log.warn(this.LOG_TAG, 'close connection error: ' + e);
            }
        }
        this._transport.close();
        this._isAuth = false;
        this._isConnected = false;
    }

    private _sendMsg(message: YDMessage) {
        if (!this._isConnected) {
            throw new Error('channel is not connected or auth.');
        }
        if (!this._isAuth && (message.cmd != YDMessageCmd.AUTHENTICATE)) {
            throw new Error('pu is not auth.');
        }
        this._enterPending(message.cmd);
        switch (message.cmd) {
            case YDMessageCmd.KEEP_ALIVE:
                break;
            default:
                Log.debug(this.LOG_TAG, `[${this._id}] send message, cmd=${YDMessageCmd[message.cmd]},\t error=${YDMessageError[message.error]},\t payloadLength=${message.payloadLength}, payload=${message.payloadString}`);
                break;
        }
        this._transport.send(message.buffer);
    }

    private _readHead(message: YDMessage): boolean {
        let _buffer = this._buffer;
        if (_buffer.length >= message.headSize) {
            let headBuf = _buffer.pop(message.headSize);
            return message.parseHead(headBuf);
        }
        return false;
    }

    private _readPayload(message: YDMessage) {
        let msgLen = message.payloadLength;
        if (msgLen <= 0)
            throw 'msgLen must >0.'
        let _buffer = this._buffer;
        if (_buffer.length >= msgLen) {
            let payloadBuf = _buffer.pop(msgLen);
            // if (_logMsgBody)
            //     Log(`recv message body, length: ${msgLen}, buffer length: ${_buffer.length}`);
            message.setPayload(payloadBuf);
            return true;
        }
        return false;
    }

    /** 
     * 从buffer读取消息，如果读取到掉消息，通过时间进行通知 
     */
    private _readMessage(): void {
        let message = this._isAuth ? this._recvBufMsg : this._recvAuthMsg;
        let _buffer = this._buffer;
        while (this._continuous || _buffer.length >= message.headSize) {
            if (!this._continuous) {
                //接收header
                if (this._readHead(message)) {
                    //设置是否需要接收BODY
                    if (message.payloadLength > 0)
                        this._continuous = true;
                    else
                        this._processMessage(message);
                }
                else {
                    break;
                }
            }
            if (this._continuous) {
                if (this._readPayload(message)) {
                    //完成payload读取以后，就开始新的消息头读取
                    this._continuous = false;
                    this._processMessage(message);
                }
                else {
                    break;
                }
            }
            message = this._isAuth ? this._recvBufMsg : this._recvAuthMsg;
        }
    }

    private _auth(): void {
        let body = `<?xml version="1.0" encoding="utf-8" ?>
<Message>
    <Authentication>${this._authToken}</Authentication>
    <Time>${this._authTs}</Time>
    <Type>2</Type>
    <Sn>${this._sn}</Sn>
    <Ver>2.0</Ver>
</Message>`;
        const message = new YDMessageV1();
        message.setHead(YDMessageCmd.AUTHENTICATE, YDMessageError.NONE);
        message.setPayload(Encoding.getUTF8Bytes(body));
        this._transport.send(message.buffer);
    }

    private _processAuth(message: YDMessage): void {
        if (message.cmd == YDMessageCmd.AUTHENTICATE && message.error == YDMessageError.NONE) {
            this._isAuth = true;
        }
        else {
            this._isAuth = false;
        }
        if (this.onauth != null) {
            let str: string;
            if (message.error == YDMessageError.DEVICE_OFFLINE)
                str = '设备不在线';
            else
                str = '认证失败';
            this.onauth({ auth: this._isAuth, message: str, error: message.error });
        }
    }

    private _processMessage(message: YDMessage): void {
        if (message.cmd == YDMessageCmd.AUTHENTICATE) {
            this._processAuth(message);
            this.emit(ConnectionEvents.AUTH, this._isAuth);
        }
        else {
            this._exitPending(message.cmd);
            switch (message.cmd) {
                case YDMessageCmd.VIDEO_DATA:
                case YDMessageCmd.PLAYBACK_DATA:
                case YDMessageCmd.AUDIO_DATA:
                case YDMessageCmd.TALK_DATA:
                case YDMessageCmd.KEEP_ALIVE:
                    //Log.debug(this.LOG_TAG, `recv message, cmd=${YDMessageCmd[message.cmd]},\t error=${YDMessageError[message.error]},\t payloadLength=${message.payloadLength}`);
                    break;
                default:
                    Log.debug(this.LOG_TAG, `[${this._id}] recv message, cmd=${YDMessageCmd[message.cmd]},\t error=${YDMessageError[message.error]},\t payloadLength=${message.payloadLength}, payload=${message.payloadString}`);
                    break;
            }
        }
        this.emit(ConnectionEvents.MESSAGE, message);
    }

    private _onConnectionOpen = (event: { target: WebSocket }) => {
        this._isConnected = true;
        this.emit(ConnectionEvents.OPEN);
        //认证
        this._auth();
    }

    private _onConnectionError = (event: { error: any, message: string, type: string, target: WebSocket }) => {
        //报错
        let errorHandled = false;

        if (this.onerror != null) {
            this.onerror(event);
            errorHandled = true;
        }
        if (this.emit(ConnectionEvents.ERROR, event)) {
            errorHandled = true;
        }
        if (!errorHandled) {
            throw event.error;
        }
    }

    private _onConnectionClose = (event: { wasClean: boolean; code: number; reason: string; target: WebSocket }) => {
        //释放资源
        this._isConnected = false;
        this._isAuth = false;
        this._pending = false;
        Log.debug(this.LOG_TAG, `[${this._id}] connection is closed.`);
        this.emit(ConnectionEvents.CLOSE, event);
    }

    private _onConnectionData = (data: ArrayBuffer) => {
        //解析数据
        this._buffer.push(new Uint8Array(data));
        this._readMessage();
    }

    private _enterPending(cmd: YDMessageCmd) {
        if (cmd = YDMessageCmd.KEEP_ALIVE)
            return;
        if (this._pending)
            throw new Error(`[${this._id}] connection action is pending.`);
        this._pendingCmd = cmd;
        this._pending = true;
    }

    private _exitPending(cmd: YDMessageCmd) {
        if (this._pending && this._pendingCmd == cmd) {
            this._pending = false;
            this._pendingCmd = YDMessageCmd.UNKOWN;
        }
    }

    public send(message: YDMessage): YDConnection {
        this._sendMsg(message);
        return this;
    }

    public sendMessage(cmd: YDMessageCmd, payload?: string): YDConnection {
        let message = new YDMessageV2(this.session);
        message.setHead(cmd);
        if (payload != undefined)
            message.setPayload(payload);
        this._sendMsg(message);
        return this;
    }

    public open(): void {
        if (this._isConnected)
            throw new Error('connection is opened.');
        this._open();
    }

    public close(): void {
        this._close();
    }
}