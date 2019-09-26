import { YDClient } from "./io/yd/client";
import { YDAVPacket, VideoDescription, FrameType, VideoEncoding, RecordInfo, RecordType, PlaybackDescription, AudioDescription, AudioType } from "./io/yd/avformat";
import { MSE } from "./presentation/mse";

import { saveAs } from 'file-saver';
import { PlaybackEvents } from './io/yd/processer/palyback';
import { DateUtils } from './utils/Date';
import { YDMessageEvents } from './io/yd/events';
import { PTZAction } from './io/yd/ptz_action';
import { YDMessageError } from './io/yd/message';
import { H264Remuxer } from './remux/h264-remuxer';
import { Remuxer } from './remux/remuxer';
import { AACRemuxer } from './remux/aac-remuxer';
import { EventEmitter } from 'events';
import { ConnectionEvents } from './io/base-connection';
import { YDUrl } from './io/yd/url';
import YDError, { YDErrorCode, yderror, ydmessageerror } from './core/yd-error';
import { Log } from './utils/log';
import { AuthEvent } from './io/yd/connection';

export type TrackType = 'video' | 'audio';
export type VideoStreamIndex = 0 | 1 | 2 | 3;
export type YDPlayerCoreEvents = 'buffering' | 'playing' | 'streamingStateChanged' | 'playbackEnd' | 'stop' | 'disconnected' | 'reconnect' | 'destroy';

export enum TrackState {
    STOP = 1,
    PENDING = 2,
    BUFFERING = 3,
    PLAYING = 4
}

export enum PlayMode {
    NONE = 0,
    STREAMING = 1,
    PLAYBACK = 2,
}

export enum PlayState {
    STOP = 1,
    PLAYING = 2,
    PENDING_STOP = 3,
    PENDING_PLAY = 4,
}

export enum QueryRecordState {
    STOP = 1,
    PENDING = 2,
}

export declare interface YDPlayerCore {
    addListener(event: YDPlayerCoreEvents, listener: (...args: any[]) => void): this;
    on(event: YDPlayerCoreEvents, listener: (...args: any[]) => void): this;
    once(event: YDPlayerCoreEvents, listener: (...args: any[]) => void): this;
    removeListener(event: YDPlayerCoreEvents, listener: (...args: any[]) => void): this;
    off(event: YDPlayerCoreEvents, listener: (...args: any[]) => void): this;
}

/**
 * 帧间隔时长
 */
export enum FrameDuration {
    /** 从 packet 中读取 */
    PACKET = 1,
    /** 以 fps 计算时长 */
    FPS = 2
}

/**
 * 播放器核心的选项
 */
export class YDPlayerCoreOptions {
    public frameDuration?: FrameDuration;
}

const _defaults: YDPlayerCoreOptions = {
    frameDuration: FrameDuration.PACKET
};

/**
 * 播放器核心
 */
export class YDPlayerCore extends EventEmitter {
    private LOG_TAG: string = '[PlayerCore] > ';
    private videoElement: HTMLVideoElement;

    private _trackState: { [index in TrackType]: TrackState } = { video: TrackState.STOP, audio: TrackState.STOP };
    private _playMode: PlayMode = PlayMode.NONE;
    private _playState: PlayState = PlayState.STOP;

    //private videoPlaying: PlayingState = PlayingState.STOP;
    //private audioPlaying: PlayingState = PlayingState.STOP;
    //private playbackState: PlayingState = PlayingState.STOP;
    private queryRecordState: QueryRecordState = QueryRecordState.STOP;

    private client: YDClient;

    private _videoStreamIndex?: VideoStreamIndex;
    private videoFPS: number = 0;
    private videoDesc?: VideoDescription;
    private audioDesc?: AudioDescription;
    private playbackDesc?: PlaybackDescription;

    private videoRemuxerInited: boolean = false;
    private audioRemuxerInited: boolean = false;
    private videoRemuxer: Remuxer | null = null;
    private audioRemuxer: Remuxer | null = null;
    private mseInited: boolean = false;
    private mse?: MSE;

    private audioFirstArrived: boolean = false;
    private totalAudioFrames: number = 0;
    private totalVideoFrames: number = 0;
    private totalAudioDuration: number = 0;
    private totalVideoDuration: number = 0;

    private videoBuffer: { buffer: Uint8Array, timestamp: number }[] = [];                  //buffer from network client
    private audioBuffer: { buffer: Uint8Array, timestamp: number }[] = [];

    private remuxedSegments: { track: string, data: Uint8Array }[] = [];                        //buffer to MSE
    private trackReady: { [index in TrackType]: boolean } = { video: true, audio: true };        //initialization: true

    private options: YDPlayerCoreOptions;

    /** 获取正在使用的url */
    public get url() { return this.client.url; }

    /** 播放状态 */
    public get playState() { return this._playState; }

    /** 播放模式 */
    public get playMode() { return this._playMode; }

    /** 实时视频的码流 */
    public get videoStreamIndex() { return this._videoStreamIndex; }

    /**
     * 查询录像状态
     */
    public get queryRecord(): QueryRecordState { return this.queryRecordState; }

    /**
     * 当播放开始
     */
    public onPlaying: ((this: YDPlayerCore, track: string) => any) | null = null;

    /**
     * 查询到录像的事件
     */
    public onQueryRecords: ((this: YDPlayerCore, records: RecordInfo[]) => any) | null = null;

    /**
     * 回放结束事件（一个录像文件回放到末尾）
     */
    public onPlaybackEnd: ((this: YDPlayerCore) => any) | null = null;

    /**
     * 构造 YDPlayerCore 对象实例
     */
    constructor(element: HTMLVideoElement, url: string | YDUrl, options?: YDPlayerCoreOptions) {
        super();
        this.options = Object.assign({}, _defaults, options);

        this.videoElement = element;

        this.client = new YDClient(url);
        this.client.onclose = this.onClientClose;
        //this.client.connection.onerror = this.onConnectionError;
        this.client.connection.on(ConnectionEvents.ERROR, this.onConnectionError);

        this.client.streaming.onvideoopen = this.onStreamingVideoOpen;
        this.client.streaming.onaudioopen = this.onStreamingAudioOpen;
        this.client.streaming.ondata = this._onAVData;
        this.client.streaming.on(YDMessageEvents.VIDEO_CLOSE, this.onStreamingVideoClose);
        this.client.streaming.on(YDMessageEvents.AUDIO_CLOSE, this.onStreamingAudioClose);

        this.client.playback.onquery = this._onPlaybackQuery;
        this.client.playback.onplayback = this._onPlaybackOpen;
        this.client.playback.ondata = this._onAVData;
        this.client.playback.onplaybackend = this._onPlaybackEnd;
        this.client.playback.onplaybackclose = this._onPlaybackClose;

        this.changeTrackState('video', TrackState.STOP);
        this.changeTrackState('audio', TrackState.STOP);
        this.changePlayState(PlayState.STOP);
        this.changePlayMode(PlayMode.NONE);
    }

    private isAllTrackReady(): boolean {
        return this.trackReady['video'] && this.trackReady['audio'];
    }

    private changeTrackReady(track: TrackType, ready: boolean) {
        this.trackReady[track] = ready;
        //trigger playing events
        if (this.trackReady['video'] && this.trackReady['audio']) {
            if (this.mse)
                this.mse.play();
            else
                throw new Error('MSE not initialized.');
            if (this._trackState['video'] == TrackState.PLAYING) {
                this.emit('playing', 'video');
                if (this.onPlaying) {
                    this.onPlaying('video');
                }
            }
            if (this._trackState['audio'] == TrackState.PLAYING) {
                this.emit('playing', 'audio');
                if (this.onPlaying) {
                    this.onPlaying('audio');
                }
            }
        }
    }

    private changeTrackState(track: TrackType, state: TrackState) {
        if (this._trackState[track] !== state) {
            this._trackState[track] = state;
            this.emit('streamingStateChanged', track, this._trackState[track]);
        }
    }

    private changePlayState(state: PlayState) {
        if (this._playState != state) {
            this._playState = state;
        }
    }

    private changePlayMode(mode: PlayMode) {
        this._playMode = mode;
    }

    private onClientClose = (evt: any) => {
        this.onClientDisconnected(evt);
    }

    private onConnectionError = (evt: { error: any, message: string, type: string }) => {
        //this.onClientDisconnected(evt);
    }

    private onClientDisconnected(evt: any) {
        this.emit('disconnected', evt);
        this.destroyVideoControl();
        this.destroyAudioControl();
        this.changeTrackState('video', TrackState.STOP);
        this.changeTrackState('audio', TrackState.STOP);
        this.changePlayState(PlayState.STOP);
        this.changePlayMode(PlayMode.NONE);
        if (this.videoElement && !this.videoElement.paused) {
            this.videoElement.pause();
        }
    }

    private initMse() {
        if (this.mseInited)
            return;
        this.mseInited = true;

        this.mse = new MSE(this.videoElement);

        //TODO: 对添加track及对remuxer的这部分逻辑进行优化
        //this.mse.addTrack('video', 'video/mp4; codecs="avc1.42E01E"');
        this.mse.addTrack('video', 'video/mp4; codecs="avc1.42002a"');
        this.mse.addTrack('audio', 'audio/mp4; codecs="mp4a.40.2"');
    }

    private initVideoControl(fps: number) {
        if (this.videoRemuxerInited)
            return;
        if (!fps) fps = 9;
        this.videoRemuxer = new H264Remuxer(4); /* this.fps * 1 */
        this.videoRemuxer.onInitSegment = this.onRemuxerInitSegment;
        this.videoRemuxer.onMediaSegment = this.onRemuxerMediaSegment;
        this.initMse();
    }

    private destroyVideoControl() {
        if (this.videoRemuxer) {
            this.videoRemuxer.destroy();
            this.videoRemuxer = null;
        }
        if (this.videoBuffer && this.videoBuffer.length > 0) {
            this.videoBuffer = [];
        }
    }

    private onStreamingVideoOpen = (desc: VideoDescription) => {
        if (desc.encoding == VideoEncoding.H265) {
            Log.warn(this.LOG_TAG, 'encoding is not supported.');
            return;
        }
        this.videoDesc = desc;
        const fps = desc.fps;
        this.videoFPS = fps;
        this.initVideoControl(fps);
        this.changeTrackState('video', TrackState.BUFFERING);
        this.emit('buffering', 'video');
    }

    private onStreamingVideoClose = () => {
        this.destroyVideoControl();
        this.changeTrackState('video', TrackState.STOP);
        this.changeTrackReady('video', false);
        this.emit('stop', 'video');
    }

    private initAudioControl() {
        if (this.audioRemuxerInited)
            return;
        this.audioRemuxer = new AACRemuxer(4); /* this.audioDesc.sample / 1000 */  /* 1024 / (1024000 / this.audioDesc.sample) */
        this.audioRemuxer.onInitSegment = this.onRemuxerInitSegment;
        this.audioRemuxer.onMediaSegment = this.onRemuxerMediaSegment;
        this.initMse();
    }

    private destroyAudioControl() {
        if (this.audioRemuxer) {
            this.audioRemuxer.destroy();
            this.audioRemuxer = null;
        }
        if (this.audioBuffer && this.audioBuffer.length > 0) {
            this.audioBuffer = [];
        }
    }

    private onStreamingAudioOpen = (desc: AudioDescription) => {
        if (desc.type != AudioType.AAC) {
            Log.warn(this.LOG_TAG, `audio format: ${(desc.type)} is not supported`);
            //没有AAC音频时，移除音频流
            if (this.mse)
                this.mse.removeTrack('audio');
            else
                throw new Error('MSE not initialized.');
            this.changeTrackState('audio', TrackState.STOP);
            this.changeTrackReady('audio', true);
            this.emit('stop', 'audio');
            return;
        }
        this.audioDesc = desc;
        this.initAudioControl();
        this.changeTrackState('audio', TrackState.BUFFERING);
        this.emit('buffering', 'audio');
    }

    private onStreamingAudioClose = () => {
        this.destroyAudioControl();
        this.changeTrackState('audio', TrackState.STOP);
        this.changeTrackReady('audio', false);
        this.emit('stop', 'audio');
    }

    private getVideoBufferedTime(): number {
        if (this.videoElement.buffered.length > 0) {
            let lastBufferedTime = this.videoElement.buffered.end(this.videoElement.buffered.length - 1);
            return lastBufferedTime - this.videoElement.currentTime;
        }
        return 0;
    }

    //接收到AV数据包
    private _onAVData = (packet: YDAVPacket) => {
        const frameType = packet.frameType;
        if (frameType == FrameType.H264_I || frameType == FrameType.H264_P) {
            const buffer = packet.frame.slice(0);     //copy buffer
            const timestamp = packet.timestamp;
            this.remuxVideoData(buffer, timestamp);
        }
        else if (frameType == FrameType.AUDIO_AAC) {
            if (this.totalAudioFrames === 0 && this.totalVideoFrames === 0) {
                this.audioFirstArrived = true;
                Log.debug(this.LOG_TAG, `audio first arrived`);
            }
            const buffer = packet.frame.slice(0);     //copy buffer
            const timestamp = packet.timestamp;
            this.remuxAudioData(buffer, timestamp);
        }
    }

    private remuxVideoData(buffer: Uint8Array, timestamp: number) {
        this.totalVideoFrames++;
        //Log.debug(this.LOG_TAG, `A/V total duration, totalAudioFrames=${this.totalAudioFrames}, totalAudioDuration=${this.totalAudioDuration}, totalVideoFrames=${this.totalVideoFrames}, totalVideoDuration=${this.totalVideoDuration}`);
        if (this.videoRemuxer) {
            this.videoBuffer.push({ buffer: buffer, timestamp: timestamp });
            if (this.videoBuffer.length === 2) {
                const lastPacket = this.videoBuffer.shift();
                if (lastPacket) {
                    let duration = timestamp - lastPacket.timestamp;
                    //Log.debug(this.LOG_TAG, `avpacket timestamp: ${packet.timestamp}, last frame duration: ${duration}`);
                    //当缓冲时间大于4秒时，进行加速
                    if (this.options.frameDuration == FrameDuration.FPS && this.getVideoBufferedTime() > 10) {
                        //Log.debug(this.LOG_TAG, `html video element buffered time: ${this.mse.bufferedTime}`);
                        duration = Math.floor(duration * 0.9);
                    }
                    duration = Math.max(1, duration);
                    if (this.options.frameDuration === FrameDuration.FPS) {
                        duration = Math.floor(1000 / this.videoFPS);
                    }
                    //根据AAC音频时间戳来修正视频时间戳
                    if (this.audioDesc && this.audioDesc.sample && this.audioDesc.type == AudioType.AAC) {
                        const tv = this.totalVideoDuration;
                        const ta = this.audioFirstArrived ? this.totalAudioDuration : this.totalAudioDuration + (102400 / this.audioDesc.sample);
                        if (this.totalVideoDuration > 0 && this.totalAudioDuration > 0 && ta > tv) {
                            const adjust = Math.min(100, Math.floor((ta - tv)));
                            duration += adjust
                            //Log.debug(this.LOG_TAG, `A/V sync adjust=${adjust}, totalAudioDuration=${ta}, totalVideoDuration=${tv}`);
                        }
                    }
                    this.totalVideoDuration += duration;
                    this.videoRemuxer.feed(lastPacket.buffer, duration);
                }
            }
        }
    }

    private remuxAudioData(buffer: Uint8Array, timestamp: number) {
        this.totalAudioFrames++;
        if (this.audioRemuxer) {
            this.audioBuffer.push({ buffer: buffer, timestamp: timestamp });
            if (this.audioBuffer.length === 2) {
                const lastPacket = this.audioBuffer.shift();
                if (lastPacket) {
                    let duration = timestamp - lastPacket.timestamp;
                    duration = Math.max(1, duration);
                    //fixed duration for this version
                    const sample = ((this.audioDesc && this.audioDesc.sample) ? this.audioDesc.sample : 8000);
                    duration = 1024000 / sample;
                    this.totalAudioDuration += duration;
                    this.audioRemuxer.feed(lastPacket.buffer, duration);
                }
            }
        }
    }

    // private _fileBuffer: Uint8Array[] = [];

    private onRemuxerInitSegment = (segment: Uint8Array, track: TrackType, mimeCodecs: string) => {
        // if (track == 'video')
        //     this._fileBuffer.push(segment);
        if (this.mse)
            this.mse.feed(track, segment);
        else
            throw new Error('MSE not initialized.');
        //Log.debug(this.LOG_TAG, `${track} initSegment is writed.`);
        //设置状态，触发事件
        this.changeTrackState(track, TrackState.PLAYING);
        //track is ready.
        this.changeTrackReady(track, true);
    }

    private onRemuxerMediaSegment = (segment: Uint8Array, dts: number, track: TrackType) => {
        // //debug
        // if (track == 'video')
        //     this._fileBuffer.push(segment);
        // if (this._fileBuffer.length == 60) {
        //     let blob = new Blob(this._fileBuffer);
        //     saveAs(blob, 'fragment.mp4');
        // }

        if (this.mse && this.isAllTrackReady()) {
            let buffer;
            while ((buffer = this.remuxedSegments.shift())) {
                this.mse.feed(buffer.track, buffer.data);
            }
            this.mse.feed(track, segment);
        }
        else {
            Log.debug(this.LOG_TAG, `${(this.trackReady['video'] ? 'audio' : 'video')} track is not ready, this ${track} data will be queued.`);
            this.remuxedSegments.push({ track: track, data: segment });
        }
    }

    private afterConnect(): Promise<void> {
        const that = this;
        return new Promise((resolve, reject) => {
            if (that.client.connected) {
                resolve();
            }
            else {
                const errorHandler = (evt: any) => {
                    let str: string;
                    if (evt && typeof evt.code === 'number') {
                        str = `连接失败（code=${evt.code}）`;
                        //str = '连接失败';
                    }
                    else {
                        str = '连接失败';
                    }
                    reject(yderror(YDErrorCode.CONNECTION_ERROR, str, undefined, evt));
                };
                that.client.connection.once(ConnectionEvents.CLOSE, errorHandler);
                //that.client.connection.once(ConnectionEvents.ERROR, errorHandler);
                that.client.connection.once(ConnectionEvents.OPEN, () => {
                    that.client.connection.removeListener(ConnectionEvents.CLOSE, errorHandler);
                    //that.client.connection.removeListener(ConnectionEvents.ERROR, errorHandler);
                    resolve();
                });
                //open this client
                that.client.open();
            }
        });
    }

    private afterAuth(): Promise<void> {
        const that = this;
        return new Promise((resolve, reject) => {
            that.afterConnect().then(() => {
                if (that.client.isAuth) {
                    resolve();
                }
                else {
                    const closeHandler = () => {
                        reject(yderror(YDErrorCode.CONNECTION_CLOSED, '连接已断开'));
                    };
                    //等待认证结果
                    that.client.onauth = (event: AuthEvent) => {
                        const result = event.auth;
                        if (result) {
                            that.client.removeListener(ConnectionEvents.CLOSE, closeHandler);
                            resolve();
                        }
                        else {
                            reject(yderror(YDErrorCode.AUTH_ERROR, event.message || '认证失败', event.error));
                        }
                    }
                    that.client.once(ConnectionEvents.CLOSE, closeHandler);
                }
            }, reject);
        });
    }

    /**
     * 开启实时视频
     * @param streamIndex 
     */
    private openVideoStreaming(streamIndex?: 0 | 1 | 2 | 3) {
        const that = this;
        const p = new Promise((resolve, reject) => {
            if (that._trackState['video'] == TrackState.STOP) {
                that.trackReady['video'] = false;
                that.changeTrackState('video', TrackState.PENDING);
                that.client.streaming.once(YDMessageEvents.VIDEO_OPEN, (error, videoDesc: VideoDescription) => {
                    if (error) {
                        let errorMessage: string;
                        if (error == 15)
                            errorMessage = '开启视频失败，通道不存在或离线';
                        else
                            errorMessage = `开启视频失败，错误码：${error}`;
                        reject(yderror(YDErrorCode.MESSAGE_ERROR, errorMessage, undefined, error));
                    }
                    else if (videoDesc) {
                        if (videoDesc.encoding == VideoEncoding.H265)
                            reject(yderror(YDErrorCode.ENCODING_NOT_SUPPORT, '编码格式不支持'));
                        else
                            resolve();
                    }
                    else {
                        reject(yderror(YDErrorCode.UNKOWN_ERROR, '未知错误'));
                    }
                });
                that.afterAuth().then(() => {
                    that._videoStreamIndex = streamIndex;
                    that.client.streaming.openVideo(streamIndex);
                }, reject);
            }
            else if (that._trackState['video'] == TrackState.PLAYING) {
                resolve();
            }
            else {
                reject(yderror(YDErrorCode.MEDIA_ERROR, `track state is ${that._trackState['video']}`));
            }
        });
        return p;
    }

    /**
     * 关闭实时视频
     */
    private closeVideoStreaming() {
        const that = this;
        return new Promise((resolve, reject) => {
            if (that._trackState['video'] != TrackState.STOP) {
                that.changeTrackState('video', TrackState.PENDING);
                that.client.streaming.once(YDMessageEvents.VIDEO_CLOSE, (error) => {
                    if (error)
                        reject(yderror(YDErrorCode.MESSAGE_ERROR, `关闭视频失败，错误码：${error}`, undefined, error));
                    else
                        resolve();
                });
                that.client.streaming.closeVideo();
            }
            else {
                resolve();
            }
        });
    }

    /**
     * 开启实时音频
     */
    private openAudioStreaming() {
        const that = this;
        const p = new Promise((resolve, reject) => {
            if (that._trackState['audio'] == TrackState.STOP) {
                that.trackReady['audio'] = false;
                that.changeTrackState('audio', TrackState.PENDING);
                that.client.streaming.once(YDMessageEvents.AUDIO_OPEN, (error) => {
                    if (error)
                        reject(yderror(YDErrorCode.MESSAGE_ERROR, `开启音频失败，错误码：${error}`, undefined, error));
                    else
                        resolve();
                });
                that.afterAuth().then(() => {
                    that.client.streaming.openAudio();
                }).catch(reject);
            }
            else if (that._trackState['audio'] == TrackState.PLAYING) {
                resolve();
            }
            else {
                reject(yderror(YDErrorCode.MEDIA_ERROR, `track state is ${that._trackState['audio']}`));
            }
        });
        return p;
    }

    /**
     * 关闭实时音频
     */
    private closeAudioStreaming() {
        const that = this;
        return new Promise((resolve, reject) => {
            if (that._trackState['audio'] != TrackState.STOP) {
                that.changeTrackState('audio', TrackState.PENDING);
                that.client.streaming.once(YDMessageEvents.AUDIO_CLOSE, (error) => {
                    if (error)
                        reject(yderror(YDErrorCode.MESSAGE_ERROR, `关闭音频失败，错误码：${error}`, undefined, error));
                    else
                        resolve();
                });
                that.client.streaming.closeAudio();
            }
            else {
                resolve();
            }
        });
    }

    private _onPlaybackQuery = (records: RecordInfo[]) => {
        if (this.onQueryRecords != null) {
            this.onQueryRecords(records);
        }
    }

    private _onPlaybackOpen = (desc: PlaybackDescription) => {
        if (desc.video.format == VideoEncoding.H265) {
            Log.warn(this.LOG_TAG, 'encoding format is not supported.');
            return;
        }
        this.playbackDesc = desc;
        const fps = desc.video.fps;
        this.videoFPS = fps;
        this.initVideoControl(fps);
        if (desc.audio.format == AudioType.AAC) {
            this.initAudioControl();
            this.changeTrackState('audio', TrackState.BUFFERING);
        }
        else {
            Log.debug(this.LOG_TAG, `record not supoort audio format: ${desc.audio.format}`);
            //没有AAC音频时，移除音频流
            if (this.mse)
                this.mse.removeTrack('audio');
            else
                throw new Error('MSE not initialized.');
            this.changeTrackState('audio', TrackState.STOP);
            this.changeTrackReady('audio', true);
            this.emit('stop', 'audio');
        }
        this.changeTrackState('video', TrackState.BUFFERING);
    }

    private _onPlaybackStop() {
        this.changeTrackState('video', TrackState.STOP);
        this.changeTrackState('audio', TrackState.STOP);
        this.changeTrackReady('video', false);
        this.changeTrackReady('audio', false);
        this.destroyVideoControl();
        this.destroyAudioControl();
    }

    private _onPlaybackEnd = () => {
        this._onPlaybackStop();
        this.changePlayState(PlayState.STOP);
        this.changePlayMode(PlayMode.NONE);
        if (this.onPlaybackEnd != null)
            this.onPlaybackEnd();
        this.emit('playbackEnd');
    }

    private _onPlaybackClose = () => {
        this._onPlaybackStop();
    }

    /**
     * 开始实时音视频
     * @param videoStreamIndex 视频流序号
     */
    public openStreaming(videoStreamIndex?: VideoStreamIndex) {
        const that = this;
        return new Promise((resolve, reject) => {
            if (that._playMode != PlayMode.NONE) {
                reject(yderror(YDErrorCode.MEDIA_ERROR, `player mode is ${that._playMode}`));
            }
            else {
                if (that._playState == PlayState.STOP) {
                    that.changePlayState(PlayState.PENDING_PLAY);
                    that.changePlayMode(PlayMode.STREAMING);
                    that.openVideoStreaming(videoStreamIndex).then(() => {
                        that.openAudioStreaming();
                        //video开启成功即认为播放已开始
                        that.changePlayState(PlayState.PLAYING);
                        resolve();
                    }, reject);
                }
                else {
                    reject(yderror(YDErrorCode.ACTION_PENDING, `player state is ${that._playState}`));
                }
            }
        });
    }

    /**
     * 关闭实时音视频
     */
    public closeStreaming() {
        const that = this;
        return new Promise((resolve, reject) => {
            if ((that._playMode != PlayMode.STREAMING)) {
                resolve();
            }
            else {
                if (that._playState == PlayState.PLAYING) {
                    that.changePlayState(PlayState.PENDING_STOP);
                    //pause first
                    if (that.videoElement && !that.videoElement.paused) {
                        that.videoElement.pause();
                    }
                    that.closeAudioStreaming().then(() => {
                        that.closeVideoStreaming().then(() => {
                            //video 关闭才认为是关闭成功
                            that.changePlayState(PlayState.STOP);
                            that.changePlayMode(PlayMode.NONE);
                            resolve();
                        }, reject);
                    }, reject);
                }
                else if (that._playState == PlayState.PENDING_PLAY) {
                    resolve();
                }
                else if (that._playState == PlayState.STOP) {
                    resolve();
                }
                else {
                    reject(yderror(YDErrorCode.ACTION_PENDING, `player state is ${that._playState}`));
                }
            }
        });
    }

    /**
     * 查询录像
     * @param startTime 
     * @param endTime 
     * @param recordType 
     */
    public queryRecords(startTime: Date, endTime: Date, recordType: RecordType = RecordType.ALL): Promise<RecordInfo[]> {
        const that = this;
        return new Promise<RecordInfo[]>((resolve, reject) => {
            if (that.queryRecordState == QueryRecordState.STOP) {
                that.queryRecordState = QueryRecordState.PENDING;
                that.afterAuth().then(() => {
                    that.client.playback.once(PlaybackEvents.QUERY_RECORDS, (records: RecordInfo[]) => {
                        that.queryRecordState = QueryRecordState.STOP;
                        resolve(records);
                    });
                    that.client.playback.once(YDMessageEvents.QUERY_VIDEO, (error) => {
                        if (error) {
                            reject(yderror(YDErrorCode.MESSAGE_ERROR, `查询录像失败，错误码：${error}`, undefined, error));
                        }
                    });
                    that.client.playback.query(startTime, endTime, recordType);
                }, reject);
            }
            else {
                reject(yderror(YDErrorCode.ACTION_PENDING, '操作正在进行中'));
            }
        });
    }

    /**
     * 按文件开始回放。
     * @param file 从录像查询接口中取得的录像文件的名称。
     * @param offsetSeconds 偏移时间，单位：秒。
     */
    public openPlaybackFile(file: string, offsetSeconds: number = 0) {
        const that = this;
        return new Promise((resolve, reject) => {
            if ((that._playMode != PlayMode.NONE)) {
                reject(yderror(YDErrorCode.MEDIA_ERROR, `player mode is ${that._playMode}`));
            }
            else {
                if (that._playState == PlayState.STOP) {
                    that.changePlayMode(PlayMode.PLAYBACK);
                    that.changePlayState(PlayState.PENDING_PLAY);
                    that.trackReady['video'] = false;
                    that.trackReady['audio'] = false;
                    that.afterAuth().then(() => {
                        that.client.playback.once(YDMessageEvents.PLAYBACK_OPEN, (error) => {
                            if (error) {
                                that.changePlayState(PlayState.STOP);
                                reject(yderror(YDErrorCode.MESSAGE_ERROR, `回放录像失败，错误码：${error}`, undefined, error));
                            }
                            else {
                                that.changePlayState(PlayState.PLAYING);
                                resolve();
                            }
                        });
                        that.client.playback.open(file, offsetSeconds);
                    }, reject);
                }
                else if (that._playState == PlayState.PLAYING) {
                    reject(yderror(YDErrorCode.ACTION_PENDING, `playback is playing`));
                }
                else {
                    reject(yderror(YDErrorCode.ACTION_PENDING, '操作正在进行中'));
                }
            }
        });
    }

    /**
     * 按时间回放
     * @param time 回放的时间点
     */
    public openPlayback(time: Date) {
        const that = this;
        /*
        文件末尾的录像的回放策略，按以下逻辑顺序处理：
        1、若回放的录像文件剩余时长小于等于5秒，则从0秒开始回放下一个起始时间在15秒内的录像文件；
        2、若回放的录像文件剩余回放时长大于5秒小于等于15秒，则回放最后15秒录像；
        3、若回放的录像文件总时长小于15秒，则从0秒开始回放；
        4、正常按偏移量回放；
        */
        return new Promise((resolve, reject) => {
            if (that._playState == PlayState.STOP) {
                that.queryRecords(DateUtils.addHours(time, -1), DateUtils.addHours(time, 2)).then((records) => {
                    let matched = false, playNext = false;
                    let offset: number = 0;
                    let filename: string | undefined = undefined;
                    for (const record of records) {
                        //下一文件的起始时间与指定时间点的间隔小于15秒，则开始播放
                        if (playNext && Math.abs((record.startTime.getTime() - time.getTime()) / 1000) < 15) {
                            filename = record.filename;
                            offset = 0;
                            matched = true;
                            break;
                        }
                        else if (record.startTime <= time && time < record.endTime) {
                            const duration = (record.endTime.getTime() - record.startTime.getTime()) / 1000;
                            const offsetEnd = (record.endTime.getTime() - time.getTime()) / 1000;
                            offset = (time.getTime() - record.startTime.getTime()) / 1000;
                            //仅播放剩余时长大于5秒的文件
                            if (offsetEnd > 5) {
                                //文件末尾修正，最小从剩余15秒开始
                                filename = record.filename;
                                offset = Math.max(0, Math.min(offset, duration - 15));
                                matched = true;
                                break;
                            }
                            else {
                                playNext = true;
                            }
                        }
                    }
                    if (matched && filename) {
                        that.openPlaybackFile(filename, offset).then(resolve, reject);
                    }
                    else {
                        //can not find record
                        reject(yderror(YDErrorCode.NONE, `没有符合条件的录像`));
                    }
                }, reject);
            }
            else if (that._playState == PlayState.PLAYING) {
                reject(yderror(YDErrorCode.ACTION_PENDING, `playback is playing`));
            }
            else {
                reject(yderror(YDErrorCode.ACTION_PENDING, '操作正在进行中'));
            }
        });
    }

    /**
     * 改变回放参数，例如回放速度等。
     * @param speed 
     */
    public changePlayback(speed: 0.25 | 0.5 | 0 | 1 | 2 | 4 | 8 | 16) {
        const that = this;
        return new Promise((resolve, reject) => {
            if (that._playMode != PlayMode.PLAYBACK) {
                reject(yderror(YDErrorCode.MEDIA_ERROR, 'player is not in playback mode'));
            }
            else if (that._playState == PlayState.PLAYING) {
                that.afterAuth().then(() => {
                    that.client.playback.once(YDMessageEvents.PLAYBACK_CHANGE, (error) => {
                        if (error)
                            reject(yderror(YDErrorCode.MESSAGE_ERROR, `更改回放速度失败，错误码：${error}`, undefined, error));
                        else
                            resolve();
                    });
                    that.client.playback.change(speed);
                }, reject);
            }
            else {
                reject(yderror(YDErrorCode.ACTION_PENDING, `state is ${that._playState}`));
            }
        });
    }

    /**
     * 关闭回放
     */
    public closePlayback() {
        const that = this;
        return new Promise((resolve, reject) => {
            if (that._playMode != PlayMode.PLAYBACK) {
                resolve();      //if player is not in playback mode, return resolve
            }
            else if (that._playState == PlayState.PLAYING) {
                that.changePlayState(PlayState.PENDING_STOP);
                that.client.playback.once(YDMessageEvents.PLAYBACK_CLOSE, (error) => {
                    if (error) {
                        reject(ydmessageerror(`关闭回放失败，错误码：${error}`, error));
                    }
                    else {
                        that.changePlayState(PlayState.STOP);
                        that.changePlayMode(PlayMode.NONE);
                        resolve();
                    }
                });
                that.client.playback.close();
            }
            else if (that._playState == PlayState.PENDING_PLAY) {
                //
                resolve();
            }
            else {
                reject(yderror(YDErrorCode.ACTION_PENDING, `state is ${that._playState}`));
            }
        });
    }

    /**
     * PTZ控制
     * @param action PTZ动作
     * @param value PTZ动作的值
     * @param name PTZ动作的名称（如果需要）
     */
    public controlPtz(action: PTZAction, value: number = 5, name: string = "") {
        const that = this;
        return new Promise((resolve, reject) => {
            that.afterAuth().then(() => {
                that.client.ptz.once(YDMessageEvents.PTZ_ACTION, (error) => {
                    if (reject)
                        reject(ydmessageerror(`云台控制失败，错误码：${error}`, error));
                    else
                        resolve();
                });
                that.client.ptz.control(action, value, name);
            }, reject);
        });
    }

    public requestFullscreen() {
        return this.videoElement.requestFullscreen();
    }

    public capture(): string | undefined {
        const canvas = document.createElement("canvas") as HTMLCanvasElement;
        canvas.width = this.videoElement.videoWidth;
        canvas.height = this.videoElement.videoHeight;
        const context = canvas.getContext('2d');
        if (context) {
            context.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height);
            var data = canvas.toDataURL('image/jpeg');
            if (typeof canvas.remove === 'function')
                canvas.remove();
            return data;
        }
    }

    public async destroy(remainVideo?: boolean) {
        try {
            await this.closeStreaming();
            await this.closePlayback();
        }
        catch (e) {
            Log.warn(this.LOG_TAG, 'close player error: ' + e);
        }
        this.client.close();
        this.client.destroy();
        if (this.mse) {
            await this.mse.destroy(remainVideo);
            this.mse = undefined;
            this.mseInited = false;
        }
        this.emit('destroy');
    }
}