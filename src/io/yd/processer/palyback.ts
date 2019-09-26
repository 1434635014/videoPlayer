import { EventEmitter } from "events";
import { Processer } from "./processer";
import { YDConnection } from "../connection";
import { YDMessage, YDMessageCmd, YDMessageError } from "../message";
import { ConnectionEvents } from "../../base-connection";
import { YDAVPacket, RecordType, RecordInfo, PlaybackDescription, VideoEncoding, PlaybackRequestFrameType } from "../avformat";
import { ArgumentNullError } from "../../../utils/error";
import { YDMessageEvents } from "../events";
import { NumberUtils } from "../../../utils/number";
import { DateUtils } from "../../../utils/Date";
import { Log } from '../../../utils/log';

export const PlaybackEvents = {
    QUERY_RECORDS: 'QUERY_RECORDS',
}

export class YDPlaybackProcesser extends EventEmitter implements Processer {
    private LOG_TAG: string = '[YDPlaybackProcesser] > ';
    private readonly _messageParser: { [index: number]: (message: YDMessage) => any } = {};
    private _querying: boolean = false;
    private _playbackOpened: boolean = false;
    private _playbackPause: boolean = false;
    private _channel: number = 0;
    private _connection: YDConnection | null = null;

    public onquery: ((this: YDPlaybackProcesser, records: RecordInfo[]) => any) | null = null;
    public onplayback: ((this: YDPlaybackProcesser, desc: PlaybackDescription) => any) | null = null;
    public onplaybackend: ((this: YDPlaybackProcesser) => any) | null = null;
    public onplaybackclose: ((this: YDPlaybackProcesser, error: number) => any) | null = null;
    public ondata: ((this: YDPlaybackProcesser, packet: YDAVPacket) => any) | null = null;

    constructor(connection: YDConnection) {
        super();

        this._messageParser[YDMessageCmd.PLAYBACK_QUERY_VIDEO] = this._onQueryRecord;
        this._messageParser[YDMessageCmd.PLAYBACK_VIDEO_REQ] = this._onPlaybackOpen;
        this._messageParser[YDMessageCmd.PLAYBACK_VIDEO_STOP] = this._onPlaybackClose;
        this._messageParser[YDMessageCmd.PLAYBACK_DATA] = this._onDataMessage;
        this._messageParser[YDMessageCmd.PLAYBACK_VIDEO_END] = this._onPlaybackEnd;
        this._messageParser[YDMessageCmd.PLAYBACK_FILE_PAUSE] = this._onPlaybackPause;
        this._messageParser[YDMessageCmd.PLAYBACK_FILE_RESUME] = this._onPlaybackResume;
        this._messageParser[YDMessageCmd.PLAYBACK_SPEED] = this._onPlaybackChange;

        this._channel = connection.channel;
        this._connection = connection;
        this._connection.on(ConnectionEvents.CLOSE, this._onConnectionClose);
        this._connection.on(ConnectionEvents.MESSAGE, this._onConnectionMessage);
    }

    private sendMessage(cmd: YDMessageCmd, payload?: string) {
        if (this._connection == null)
            throw new ArgumentNullError();
        this._connection.sendMessage(cmd, payload);
    }

    private _parseRecordInfo(fileEl: Element): RecordInfo | null {
        if (fileEl == null)
            return null;
        let fileName = fileEl.getAttribute('FileName');
        if (fileName == null)
            return null;
        let startTime = DateUtils.parseDate(fileEl.getAttribute('StartTime'));
        let endTime = DateUtils.parseDate(fileEl.getAttribute('EndTime'));
        let recordType = NumberUtils.parseInt(fileEl.getAttribute('RecordType'));
        return new RecordInfo(fileName, startTime, endTime, recordType);
    }

    private _queryRecord(startTime: Date, endTime: Date, recordType: RecordType = RecordType.ALL) {
        let payload = `<?xml version="1.0" encoding="utf-8" ?>
<Message>
    <Channel>${this._channel}</Channel>
    <RecordType>${recordType}</RecordType>
    <StartTime>${DateUtils.toDateTimeString(startTime)}</StartTime>
    <EndTime>${DateUtils.toDateTimeString(endTime)}</EndTime>
</Message>`;
        this._querying = true;
        this.sendMessage(YDMessageCmd.PLAYBACK_QUERY_VIDEO, payload);
    }

    private _onQueryRecord = (message: YDMessage) => {
        if (message.error == YDMessageError.NONE) {
            let payload = message.payloadString;
            let parser = new DOMParser();
            let xmlDoc = parser.parseFromString(payload, 'text/xml');
            let channelEl = xmlDoc.getElementsByTagName('Channel');
            if (channelEl != null && channelEl.length > 0) {
                let channel = NumberUtils.parseInt(channelEl[0].textContent);
                if (channel != this._channel)
                    Log.warn(this.LOG_TAG, 'response channel is not equals request channl.');
            }
            let total = 0;
            let totalEl = xmlDoc.getElementsByTagName('TotalCount');
            if (totalEl && totalEl.length > 0) {
                total = NumberUtils.parseInt(totalEl[0].textContent);
            }
            let records: RecordInfo[] = [];
            let messageEl = xmlDoc.getElementsByTagName('Message');
            if (messageEl != null && messageEl.length > 0) {
                let fileElements = messageEl[0].children;
                for (let i = 0; i < fileElements.length; i++) {
                    let record = this._parseRecordInfo(fileElements[i]);
                    if (record == null)
                        continue;
                    records.push(record);
                }
            }
            if (total != records.length)
                throw new Error('total count is not equal record elements count.');
            if (this.onquery != null) {
                this.onquery(records);
            }
            this.emit(PlaybackEvents.QUERY_RECORDS, records);
        }

        this.emit(YDMessageEvents.QUERY_VIDEO, message.error);
        this._querying = false;
    }

    private _openPlayblack(filename: string, offsetSeconds: number, frameType: PlaybackRequestFrameType = PlaybackRequestFrameType.All, encoding: VideoEncoding = VideoEncoding.ALL) {
        let payload = `<?xml version="1.0" encoding="utf-8" ?>
<Message>
    <Channel>${this._channel}</Channel>
    <FileName>${filename}</FileName>
    <PlayTime>${Math.floor(offsetSeconds)}</PlayTime>
    <PlayMode>1</PlayMode>
    <StartTime>0</StartTime>
    <EndTime>0</EndTime>
    <FrameType>${frameType}</FrameType>
    <Encoding>${encoding}</Encoding>
</Message>`;
        this._playbackOpened = true;
        this.sendMessage(YDMessageCmd.PLAYBACK_VIDEO_REQ, payload);
    }

    private _onPlaybackOpen = (message: YDMessage) => {
        if (message.error == YDMessageError.NONE) {
            let payload = message.payloadString;
            let parser = new DOMParser();
            let xmlDoc = parser.parseFromString(payload, 'text/xml');
            let desc = new PlaybackDescription();
            let audioEl = xmlDoc.getElementsByTagName("Audio");
            if (audioEl && audioEl.length > 0) {
                desc.audio.format = NumberUtils.parseInt(audioEl[0].getAttribute("Format"));
                desc.audio.channel = NumberUtils.parseInt(audioEl[0].getAttribute("Channel"));
                desc.audio.sample = NumberUtils.parseInt(audioEl[0].getAttribute("Sample"));
            }
            let videoEl = xmlDoc.getElementsByTagName("Video");
            if (videoEl && videoEl.length > 0) {
                desc.video.format = NumberUtils.parseInt(videoEl[0].getAttribute("Format"));
                desc.video.fps = NumberUtils.parseInt(videoEl[0].getAttribute("Fps"));
                desc.video.weight = NumberUtils.parseInt(videoEl[0].getAttribute("Weight"));
                desc.video.height = NumberUtils.parseInt(videoEl[0].getAttribute("Height"));
            }
            let continuousTimeEl = xmlDoc.getElementsByTagName("ContinuousTime");
            if (continuousTimeEl && continuousTimeEl.length > 0) {
                desc.continuousTime = NumberUtils.parseInt(continuousTimeEl[0].textContent);
            }
            this._playbackOpened = true;
            if (this.onplayback != null) {
                this.onplayback(desc);
            }
        }
        else {
            this._playbackOpened = false;
        }
        this.emit(YDMessageEvents.PLAYBACK_OPEN, message.error);
    }

    private _closePlayback() {
        this.sendMessage(YDMessageCmd.PLAYBACK_VIDEO_STOP);
    }

    private _onPlaybackClose = (message: YDMessage) => {
        if (message.error == YDMessageError.NONE) {
            this._playbackOpened = false;
        }
        if (this.onplaybackclose != null)
            this.onplaybackclose(message.error);
        this.emit(YDMessageEvents.PLAYBACK_CLOSE, message.error);
    }

    private _onDataMessage = (message: YDMessage) => {
        if (message.error != YDMessageError.NONE) {
            return;
        }
        let payload = message.payload;
        let packet = new YDAVPacket(payload);
        //debug(`payload, data=${Buffer.from(packet.frame.slice(0, 8)).toString('hex')}`);
        if (this.ondata != null) {
            this.ondata(packet);
        }
        this.emit(YDMessageEvents.DATA, packet);
    }

    private _onPlaybackEnd = (message: YDMessage) => {
        if (message.error == YDMessageError.NONE) {
            this._playbackOpened = false;
        }
        if (this.onplaybackend != null) {
            this.onplaybackend();
        }
        this.emit(YDMessageEvents.PLAYBACK_END, message.error);
    }

    private _pausePlayback() {
        this.sendMessage(YDMessageCmd.PLAYBACK_FILE_PAUSE);
    }

    private _onPlaybackPause = (message: YDMessage) => {
        if (message.error == YDMessageError.NONE) {
            this._playbackPause = true;
        }
        this.emit(YDMessageEvents.PLAYBACK_PAUSE, message.error);
    }

    private _resumePlayback() {
        this.sendMessage(YDMessageCmd.PLAYBACK_FILE_RESUME);
    }

    private _onPlaybackResume = (message: YDMessage) => {
        if (message.error == YDMessageError.NONE) {
            this._playbackPause = false;
        }
        this.emit(YDMessageEvents.PLAYBACK_RESUME, message.error);
    }

    private _changePlayback(speed: 0.25 | 0.5 | 0 | 1 | 2 | 4 | 8 | 16) {
        let payload = `<?xml version="1.0" encoding="utf-8" ?>
<Message>
    <Channel>${this._channel}</Channel>
    <PlaySpeed>${speed}</PlaySpeed>
</Message>`;
        this.sendMessage(YDMessageCmd.PLAYBACK_SPEED, payload);
    }

    private _onPlaybackChange = (message: YDMessage) => {
        this.emit(YDMessageEvents.PLAYBACK_CHANGE, message.error);
    }

    private _onConnectionClose = () => {
        this._playbackOpened = false;
    }

    private _onConnectionMessage = (message: YDMessage): void => {
        let func = this._messageParser[message.cmd];
        if (func) {
            func(message);
        }
    }

    /**
     * 查询回放录像文件
     * @param startTime 
     * @param endTime 
     * @param recordType 
     */
    public query(startTime: Date, endTime: Date, recordType: RecordType = RecordType.ALL) {
        if (this._querying)
            throw new Error('record query is executing.');
        this._queryRecord(startTime, endTime, recordType);
    }

    /**
     * 打开录像文件进行回放
     * @param filename 
     * @param offsetSeconds 
     */
    public open(filename: string, offsetSeconds: number) {
        if (this._playbackOpened)
            throw new Error('playback is opened.');
        this._openPlayblack(filename, offsetSeconds);
    }

    /**
     * 关闭正在进行的回放
     */
    public close() {
        if (!this._playbackOpened)
            throw new Error('playback is not opened.');
        this._closePlayback();
    }

    /**
   * 暂停正在进行的回放
   */
    public pause() {
        if (!this._playbackOpened)
            throw new Error('playback is not opened.');
        this._pausePlayback();
    }

    /**
   * 恢复暂停的回放
   */
    public resume() {
        if (!this._playbackOpened)
            throw new Error('playback is not opened.');
        this._resumePlayback();
    }

    /**
     * 改变正在进行的回放
     * @param speed 
     */
    public change(speed: 0.25 | 0.5 | 0 | 1 | 2 | 4 | 8 | 16) {
        if (!this._playbackOpened)
            throw new Error('playback is not opened.');
        this._changePlayback(speed);
    }
}