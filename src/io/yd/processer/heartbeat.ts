import { Processer } from "./processer";
import { YDConnection } from "../connection";
import { YDMessage, YDMessageCmd, YDMessageV2 } from "../message";
import { ConnectionEvents } from "../../base-connection";
import { ArgumentNullError } from "../../../utils/error";

export class YDHeartbeatProcesser implements Processer {
    private readonly _interval: number = 10 * 1000 /* 10 sec */;
    private _timer: any;
    private _connection: YDConnection;
    private _heartbeatMessage: YDMessage | null = null;

    private _pending: boolean = false;

    constructor(connection: YDConnection, interval?: number) {
        if (interval != undefined) {
            this._interval = interval;
        }

        this._connection = connection;
        this._connection.on(ConnectionEvents.AUTH, this._onauth)
        this._connection.on(ConnectionEvents.CLOSE, this._onclose);
        this._connection.on(ConnectionEvents.MESSAGE, this._onmessage);
    }

    private _onauth = (authed: boolean) => {
        if (authed) {
            this._heartbeatMessage = new YDMessageV2(this._connection.session);
            this._heartbeatMessage.setHead(YDMessageCmd.KEEP_ALIVE);
            this._timer = setInterval(this._heartbeat, this._interval);
        }
    }

    private _onclose = () => {
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = 0;
        }
    }

    private _heartbeat = () => {
        if (this._connection && this._connection.connected && this._heartbeatMessage) {
            if(this._pending){
                throw new Error(`heatbeat is pending...`);
            }
            this._connection.send(this._heartbeatMessage);
            this._pending = true;
        }
    }

    private _onmessage = (message: YDMessage): any => {
        //TODO: 需要进行超时处理
        if (message.cmd == YDMessageCmd.KEEP_ALIVE) {
            this._pending = false;
        }
    }

    public close() {
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = 0;
        }
    }

    public destory() {

    }
}