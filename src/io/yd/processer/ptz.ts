import { EventEmitter } from "events";
import { Processer } from "./processer";
import { YDMessage, YDMessageCmd } from "../message";
import { YDConnection } from "../connection";
import { ConnectionEvents } from "../../base-connection";
import { ArgumentNullError } from "../../../utils/error";
import { YDMessageEvents } from "../events";
import { PTZAction } from '../ptz_action';

export class YDPTZProcesser extends EventEmitter implements Processer {
    private readonly _messageParser: { [index: number]: (message: YDMessage) => any } = {};
    private _channel: number = 0;
    private _connection: YDConnection | null = null;

    constructor(connection: YDConnection) {
        super();
        this._messageParser[YDMessageCmd.MOVE_PTZ] = this._onPtzControl;

        this._channel = connection.channel;
        this._connection = connection;
        this._connection.on(ConnectionEvents.CLOSE, this._onConnectionClose);
        this._connection.on(ConnectionEvents.MESSAGE, this._onConnectionMessage);
    }

    private _controlPtz(action: PTZAction, value: number = 5, name: string = "") {
        if (this._connection == null)
            throw new ArgumentNullError();

        let payload = `<?xml version="1.0" encoding="utf-8" ?>
<Message>
    <Channel>${this._channel}</Channel>
    <Dir>${action}</Dir>
    <Speed>${value}</Speed>
    <Name>${name}}</Name>
</Message>`;
        this._connection.sendMessage(YDMessageCmd.MOVE_PTZ, payload);
    }

    private _onPtzControl = (message: YDMessage) => {
        this.emit(YDMessageEvents.PTZ_ACTION, message.error);
    }

    private _onConnectionClose = () => {
    }

    private _onConnectionMessage = (message: YDMessage): void => {
        let func = this._messageParser[message.cmd];
        if (func) {
            func(message);
        }
    }

    public control(action: PTZAction, value: number = 5, name: string = "") {
        this._controlPtz(action, value, name);
    }
}