import { YDConnection } from "../connection";
import { YDMessage, YDMessageCmd, YDMessageError } from "../message";
import { Processer } from "./processer";
import { YDAVPacket, VideoDescription, AudioDescription, VideoEncoding } from "../avformat";
import { ConnectionEvents } from "../../base-connection";
import { ArgumentNullError } from "../../../utils/error";
import { EventEmitter } from "events";
import { YDMessageEvents } from "../events";

/** 实时音视频流处理 */
export class YDStreamingProcesser extends EventEmitter implements Processer {
    private readonly _messageParser: { [index: number]: (message: YDMessage) => any } = {};
    private _videoOpened: boolean = false;
    private _audioOpened: boolean = false;
    private _channel: number = 0;
    private _streamType: number = 0;
    private _videoType: number = 0;
    private _encoding: number = 0;
    private _videoDescription: VideoDescription;
    private _audioDescription: AudioDescription;
    private _connection: YDConnection;

    public onvideoopen: ((this: YDStreamingProcesser, desc: VideoDescription) => any) | null = null;
    public onaudioopen: ((this: YDStreamingProcesser, desc: AudioDescription) => any) | null = null;
    public ondata: ((this: YDStreamingProcesser, packet: YDAVPacket) => any) | null = null;

    constructor(connection: YDConnection) {
        super();
        this._videoDescription = new VideoDescription();
        this._audioDescription = new AudioDescription();

        this._messageParser[YDMessageCmd.VIDEO_REQ] = this._onVideoOpen;
        this._messageParser[YDMessageCmd.VIDEO_CLOSE] = this._onVideoClose;
        this._messageParser[YDMessageCmd.AUDIO_REQ] = this._onAudioOpen;
        this._messageParser[YDMessageCmd.AUDIO_CLOSE] = this._onAudioClose;
        // this._messageParser[YDMessageCmd.TALK_REQ] = this._onTalkOpenMessage;
        // this._messageParser[YDMessageCmd.TALK_CLOSE] = this._onTalkCloseMessage;
        this._messageParser[YDMessageCmd.VIDEO_DATA] = this._onDataMessage;
        this._messageParser[YDMessageCmd.AUDIO_DATA] = this._onDataMessage;

        this._channel = connection.channel;
        this._connection = connection;
        this._connection.on(ConnectionEvents.CLOSE, this._onConnectionClose);
        this._connection.on(ConnectionEvents.MESSAGE, this._onConnectionMessage);
    }

    private parseInt(str: string | null) {
        if (str == null) return 0;
        return parseInt(str);
    }

    private sendMessage(cmd: YDMessageCmd, payload?: string) {
        if (this._connection == null)
            throw new ArgumentNullError();
        this._connection.sendMessage(cmd, payload);
    }

    private _openVideo(streamIndex: 0 | 1 | 2 | 3, videoType: 1 | 2 = 1, encoding: VideoEncoding = VideoEncoding.ALL) {
        if (this._connection == null)
            throw new ArgumentNullError();

        this._streamType = streamIndex;
        this._videoType = videoType;
        this._encoding = encoding;

        let payload = `<?xml version="1.0" encoding="utf-8" ?>
<Message>
    <Channel>${this._channel}</Channel>
    <StreamType>${streamIndex}</StreamType>
    <VideoType>${videoType}</VideoType>
    <Encoding>${encoding}</Encoding>
</Message>`;
        this.sendMessage(YDMessageCmd.VIDEO_REQ, payload);
    }

    private _closeVideo() {
        this.sendMessage(YDMessageCmd.VIDEO_CLOSE);
    }

    private _openAudio() {
        let payload = `<?xml version="1.0" encoding="utf-8" ?>
<Message>
    <Channel>${this._channel}</Channel>
</Message>`;
        this.sendMessage(YDMessageCmd.AUDIO_REQ, payload);
    }

    private _closeAudio() {
        this.sendMessage(YDMessageCmd.AUDIO_CLOSE);
    }

    private _onVideoOpen = (message: YDMessage): void => {
        if (message.error == YDMessageError.NONE) {
            let payload = message.payloadString;
            let parser = new DOMParser();
            let xmlDoc = parser.parseFromString(payload, 'text/xml');
            let channelEl = xmlDoc.getElementsByTagName('Channel');
            if (channelEl != null && channelEl.length > 0) {
                let channel = this.parseInt(channelEl[0].textContent);
                if (channel != this._channel)
                    throw new Error('response channel is not equals request channl.');
                this._videoDescription.channel = channel;
            }
            let videoEl = xmlDoc.getElementsByTagName('Video');
            if (videoEl && videoEl.length > 0) {
                let el = videoEl[0];
                this._videoDescription.fps = this.parseInt(el.getAttribute('Fps'));
                this._videoDescription.encoding = this.parseInt(el.getAttribute('Encoding'));
                this._videoDescription.imageWidth = this.parseInt(el.getAttribute('ImageWidth'));
                this._videoDescription.imageHeight = this.parseInt(el.getAttribute('ImageHeight'));
                this._videoDescription.gopSize = this.parseInt(el.getAttribute('GopSize'));
            }
            this._videoOpened = true;
            if (this.onvideoopen != null) {
                this.onvideoopen(this._videoDescription);
            }
            this.emit(YDMessageEvents.VIDEO_OPEN, message.error, this._videoDescription);
        }
        else {
            this._videoOpened = false;
            this.emit(YDMessageEvents.VIDEO_OPEN, message.error, undefined);
        }
    }

    private _onVideoClose = (message: YDMessage): void => {
        if (message.error == YDMessageError.NONE) {
            this._videoOpened = false;
        }
        this.emit(YDMessageEvents.VIDEO_CLOSE, message.error);
    }

    private _onAudioOpen = (message: YDMessage): void => {
        if (message.error == YDMessageError.NONE) {
            let payload = message.payloadString;
            let parser = new DOMParser();
            let xmlDoc = parser.parseFromString(payload, 'text/xml');
            let channelEl = xmlDoc.getElementsByTagName('Channel');
            if (channelEl != null && channelEl.length > 0) {
                let channel = this.parseInt(channelEl[0].textContent);
                if (channel != this._channel)
                    throw new Error('response channel is not equals request channl.');
                this._audioDescription.channel = channel;
            }
            let audioEl = xmlDoc.getElementsByTagName('Audio');
            if (audioEl && audioEl.length > 0) {
                let el = audioEl[0];
                this._audioDescription.type = this.parseInt(el.getAttribute('Type'));
                this._audioDescription.sample = this.parseInt(el.getAttribute('Sample'));
                this._audioDescription.audioChannel = this.parseInt(el.getAttribute('AudioChannel'));
            }
            this._audioOpened = true;
            if (this.onaudioopen != null) {
                this.onaudioopen(this._audioDescription);
            }
        }
        else {
            this._audioOpened = false;
        }
        this.emit(YDMessageEvents.AUDIO_OPEN, message.error);
    }

    private _onAudioClose = (message: YDMessage): void => {
        if (message.error == YDMessageError.NONE) {
            this._audioOpened = false;
        }
        this.emit(YDMessageEvents.AUDIO_CLOSE, message.error);
    }

    private _isDataMessage(message: YDMessage): boolean {
        switch (message.cmd) {
            case YDMessageCmd.VIDEO_DATA:
            case YDMessageCmd.AUDIO_DATA:
                return true;
            default:
                return false;
        }
    }

    private _onDataMessage = (message: YDMessage): void => {
        if (!this._isDataMessage(message)) {
            return;
        }
        if (message.error != YDMessageError.NONE) {
            return;
        }

        let payload = message.payload;
        let packet = new YDAVPacket(payload);
        if (this.ondata != null) {
            this.ondata(packet);
        }
        this.emit(YDMessageEvents.DATA, packet);
    }

    private _onConnectionClose = () => {
        this._videoOpened = false;
        this._audioOpened = false;
    }

    private _onConnectionMessage = (message: YDMessage): void => {
        let func = this._messageParser[message.cmd];
        if (func) {
            func(message);
        }
    }

    public openVideo(streamIndex: 0 | 1 | 2 | 3 = 0): void {
        if (this._videoOpened) {
            throw new Error('video is already opened.');
        }
        this._openVideo(streamIndex);
    }

    public closeVideo() {
        if (!this._videoOpened) {
            throw new Error('video is not opened.');
        }
        this._closeVideo();
    }

    public openAudio() {
        if (this._audioOpened) {
            throw new Error('audio is alread opened.');
        }
        this._openAudio();
    }

    public closeAudio() {
        if (!this._videoOpened) {
            throw new Error('audio is not opened.');
        }
        this._closeAudio();
    }
}