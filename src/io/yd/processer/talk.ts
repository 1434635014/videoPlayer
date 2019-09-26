import { EventEmitter } from "events";
import { Processer } from "./processer";
import { YDConnection } from "../connection";
import { YDMessage, YDMessageError, YDMessageCmd } from "../message";
import { YDMessageEvents } from "../events";
import { ConnectionEvents } from "../../base-connection";

export class YDTalkProcesser extends EventEmitter implements Processer {
    private _talkOpened: boolean = false;
    private _connection: YDConnection | null = null;

    constructor(connection: YDConnection) {
        super();

        this._connection = connection;
        this._connection.on(ConnectionEvents.CLOSE, this._onConnectionClose);
        this._connection.on(ConnectionEvents.MESSAGE, this._onConnectionMessage);
    }

    private _onTalkOpenMessage = (message: YDMessage): void => {
        if (message.error == YDMessageError.NONE) {
            this._talkOpened = true;
        }
        else {
            this._talkOpened = false;
        }
        this.emit(YDMessageEvents.TALK_OPEN, message.error);
    }

    private _onTalkCloseMessage = (message: YDMessage): void => {
        if (message.error == YDMessageError.NONE) {
            this._talkOpened = false;
        }
        this.emit(YDMessageEvents.TALK_CLOSE, message.error);
    }

    private _onConnectionMessage = (message: YDMessage): void => {
        switch (message.cmd) {
            case YDMessageCmd.TALK_REQ:
                this._onTalkOpenMessage(message);
                break;
            case YDMessageCmd.TALK_CLOSE:
                this._onTalkCloseMessage(message);
                break;
        }
    }

    private _onConnectionClose = () => {
        this._talkOpened = false;
    }
}