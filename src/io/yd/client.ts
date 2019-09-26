import { EventEmitter } from "events";
import { Client } from "../base-client";
import { YDConnection, AuthEvent } from "./connection";
import { YDUrl } from "./url";
import { YDStreamingProcesser } from "./processer/streaming";
import { YDPlaybackProcesser } from "./processer/palyback";
import { YDPTZProcesser } from "./processer/ptz";
import { YDHeartbeatProcesser } from "./processer/heartbeat";
import { ConnectionEvents } from '../base-connection';

export class YDClient extends EventEmitter implements Client {
    private _url: YDUrl;
    private _connection: YDConnection;

    private _heartbeat: YDHeartbeatProcesser;
    private _streaming: YDStreamingProcesser;
    private _playback: YDPlaybackProcesser;
    private _ptz: YDPTZProcesser;

    public get url(): YDUrl { return this._url; }
    public get connection(): YDConnection { return this._connection; }
    public get streaming(): YDStreamingProcesser { return this._streaming; }
    public get playback(): YDPlaybackProcesser { return this._playback; }
    public get ptz(): YDPTZProcesser { return this._ptz; }
    public get connected(): boolean { return this._connection.connected; }
    public get isAuth(): boolean { return this._connection.isAuth; }

    public onauth: ((this: YDClient, event: AuthEvent) => void) | null = null;
    public onclose: ((this: YDClient, event: any) => any) | null = null;

    /**
     * 初始化客户端对象实例。
     * @param url 连接url，类似：ws://<host>:<port>/?sn=<sn>&chn=<chn>&auth_token=<auth_token>&auth_ts=<auth_ts>
     */
    constructor(url: string | YDUrl) {
        super();
        if (typeof (url) === 'string')
            this._url = new YDUrl(url);
        else
            this._url = url;
        this._connection = new YDConnection(this._url);

        this._connection.onauth = this._onauth;
        this._connection.on(ConnectionEvents.OPEN, this._onopen);
        this._connection.on(ConnectionEvents.CLOSE, this._onclose);

        this._heartbeat = new YDHeartbeatProcesser(this._connection);
        this._streaming = new YDStreamingProcesser(this._connection);
        this._playback = new YDPlaybackProcesser(this._connection);
        this._ptz = new YDPTZProcesser(this._connection);
    }

    private _onauth = (evt: AuthEvent): any => {
        if (typeof this.onauth === 'function') {
            this.onauth(evt);
        }
    }

    private _onopen = () => {
        this.emit(ConnectionEvents.OPEN);
    }

    private _onclose = (evt: any) => {
        if (this.onclose != null) {
            this.onclose(evt);
        }
        this.emit(ConnectionEvents.CLOSE, evt);
    }

    public open() {
        this._connection.open();
    }

    public close() {
        this._heartbeat.close();
        this._connection.close();
    }

    public destroy() {
        this.removeAllListeners();
    }
}