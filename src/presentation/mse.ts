import { Log } from '../utils/log';

//export const mimeType = 'video/mp4; codecs="mp4a.40.2"';
//export const mimeType = 'video/mp4; codecs="avc1.42E01E"';
//export const mimeType = 'video/mp4; codecs="avc1.4D4001,mp4a.40.2"';

let mseId = 0;

export class MSE {
    private LOG_TAG: string = "[MSE] > ";
    private _id: number = mseId++;
    private videoElement: HTMLVideoElement;

    private mediaSource: MediaSource;
    private mediaSourceURL: string | null = null;

    private sourceBuffers: { [index: string]: SourceBuffer } = {};

    private mediaReady: boolean = false;

    private queues: { [index: string]: Uint8Array[] } = {};

    private onMediaSourceReady: Promise<unknown> | null = null;
    private resolved: boolean = false;


    /**
     * buffered seconds
     */
    public get bufferedTime(): number {
        if (this.videoElement.buffered.length > 0) {
            let tr = this.videoElement.buffered.end(this.videoElement.buffered.length - 1);
            return tr - this.videoElement.currentTime;
        }
        return 0;
    }

    static get errorNotes() {
        return {
            [MediaError.MEDIA_ERR_ABORTED]: 'fetching process aborted by user',
            [MediaError.MEDIA_ERR_NETWORK]: 'error occurred when downloading',
            [MediaError.MEDIA_ERR_DECODE]: 'error occurred when decoding',
            [MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED]: 'audio/video source not supported',
        };
    }

    constructor(element: HTMLVideoElement) {
        if (!MediaSource) {
            throw new Error(`Your browser is not supported MediaSource`);
        }

        this.videoElement = element;
        this.mediaSource = new MediaSource();

        const that = this;
        that.resolved = false;
        that.onMediaSourceReady = new Promise((resolve, reject) => {
            const sourceOpen = () => {
                Log.debug(that.LOG_TAG, `[${that._id}] Media source opened: ${that.mediaSource.readyState}`);
                if (!that.resolved) {
                    that.resolved = true;
                    resolve();
                }
            };
            that.mediaSource.addEventListener('sourceopen', sourceOpen);
            that.mediaSource.addEventListener('sourceclose', () => {
                Log.debug(that.LOG_TAG, `[${that._id}] Media Source closed`);
                that.mediaReady = false;
            });
            that.mediaSource.addEventListener('sourceended', () => {
                Log.debug(that.LOG_TAG, `[${that._id}] Media Source ended`);
                that.mediaReady = false;
            });
        });
    }

    private bindVideoSrc() {
        if (!this.mediaSourceURL)
            this.mediaSourceURL = URL.createObjectURL(this.mediaSource);
        if (this.videoElement.src != this.mediaSourceURL)
            this.videoElement.src = this.mediaSourceURL;
    }

    public addTrack(type: string, sourceBufferType: string) {
        const track = type;
        const that = this;
        if (!MediaSource || !MediaSource.isTypeSupported(sourceBufferType)) {
            throw new Error(`Your browser is not supported: ${sourceBufferType}`);
        }
        that.queues[track] = [];
        if (that.onMediaSourceReady != null) {
            return that.onMediaSourceReady.then(() => {

                Log.debug(this.LOG_TAG, `[${this._id}] media source buffers: ${this.mediaSource.sourceBuffers.length}, activeSourceBuffers: ${this.mediaSource.activeSourceBuffers.length}`);
                let sourceBuffer = this.mediaSource.addSourceBuffer(sourceBufferType);
                that.sourceBuffers[track] = sourceBuffer;

                sourceBuffer.addEventListener('abort', () => {
                    Log.debug(this.LOG_TAG, `${track} sourceBuffer abort!`);
                });
                sourceBuffer.addEventListener('error', (ev) => {
                    Log.error(this.LOG_TAG, `[${this._id}] ${track} sourceBuffer errored!`);
                    Log.error(this.LOG_TAG, ev);
                });
                sourceBuffer.onupdateend = () => {
                    that.tryAppendToSourceBuffer(track);
                };

                that.mediaReady = true;
                that.tryAppendToSourceBuffer(track);
            });
        }
    }

    public removeTrack(track: string) {
        if (this.onMediaSourceReady !== null) {
            return this.onMediaSourceReady.then(() => {
                let sourceBuffer = this.sourceBuffers[track];
                if (sourceBuffer) {
                    this.mediaSource.removeSourceBuffer(sourceBuffer);
                    delete this.sourceBuffers[track];
                    Log.debug(this.LOG_TAG, `[${this._id}] ${track} track is removed`);
                }
            });
        }
    }

    private logSourceBuffer(track: string) {
        Log.debug(this.LOG_TAG, `[${this._id}] SourceBuffer updateend`);
        //Log.debug(this.LOG_TAG,`[${this._id}]   ${track}.sourceBuffer.buffered.length=${this.sourceBuffers[track].buffered.length}`);
        for (let i = 0, len = this.sourceBuffers[track].buffered.length; i < len; i++) {
            Log.debug(this.LOG_TAG, `[${this._id}]     ${track}.sourceBuffer.buffered [${i}]: ${this.sourceBuffers[track].buffered.start(i)}, ${this.sourceBuffers[track].buffered.end(i)}`);
        }
        //Log.debug(this.LOG_TAG, `[${this._id}]   mediasource.duration=${this.mediaSource.duration}`);
        //Log.debug(this.LOG_TAG, `[${this._id}]   mediasource.readyState=${this.mediaSource.readyState}`);
        //Log.debug(this.LOG_TAG, `[${this._id}]   ${track}.videoEl.duration=${this.videoElement.duration}`);
        //Log.debug(this.LOG_TAG, `[${this._id}]   ${track}.videoEl.buffered.length=${this.videoElement.buffered.length}`);
        for (let i = 0, len = this.videoElement.buffered.length; i < len; i++) {
            Log.debug(this.LOG_TAG, `[${this._id}]     ${track}.videoEl.buffered [${i}]: ${this.videoElement.buffered.start(i)}, ${this.videoElement.buffered.end(i)}`);
        }
        Log.debug(this.LOG_TAG, `[${this._id}]   ${track}.videoEl.currentTime=${this.videoElement.currentTime}`);
        //Log.debug(this.LOG_TAG,`[${this._id}]   video.readyState=${this._videoElement.readyState}`);
    }

    private appendToSourceBuffer(type: string, data: Uint8Array): void {
        //this.logSourceBuffer(type);
        try {
            //Log.debug(this.LOG_TAG, `sourceBuffer append data: track=${type}, length=${data.length}`);
            this.sourceBuffers[type].appendBuffer(data);
        } catch (err) {
            throw new Error(`MSE Error occured while appending buffer. ${err.name}: ${err.message}`);
        }
    }

    private autoCleanupSourceBuffer(type: string) {
        let currentTime = this.videoElement.currentTime;
        const sb = this.sourceBuffers[type];
        if (sb) {
            const buffered = sb.buffered;
            let doRemove = false;

            let removeRanges: { start: number, end: number }[] = [];

            for (let i = 0; i < buffered.length; i++) {
                let start = buffered.start(i);
                let end = buffered.end(i);

                if (start <= currentTime && currentTime < end + 3) {  // padding 3 seconds
                    if (currentTime - start >= 180) {
                        doRemove = true;
                        let removeEnd = currentTime - 120;
                        removeRanges.push({ start: start, end: removeEnd });
                    }
                } else if (end < currentTime) {
                    doRemove = true;
                    removeRanges.push({ start: start, end: end });
                }
            }

            if (doRemove && !sb.updating) {
                for (const { start, end } of removeRanges) {
                    sb.remove(start, end);
                    Log.debug(this.LOG_TAG, `[${this._id}] cleanup buffers: track=${type}, start=${start}, end=${end}`);
                }
            }
        }
    }

    private enqueueBuffer(type: string, data: Uint8Array, shift?: boolean): void {
        if (shift) {
            this.queues[type].splice(0, 0, data);
        }
        else {
            this.queues[type].push(data);
        }
    }

    private tryAppendToSourceBuffer(type: string) {
        const sb = this.sourceBuffers[type];
        if (this.mediaReady && sb && !sb.updating) {
            const data = this.queues[type].shift();
            if (data) {
                this.appendToSourceBuffer(type, data);
                //Log.debug(this.LOG_TAG, `video element readyState=${this._videoElement.readyState}`);
            }
        }
    }

    public feed(type: string, data: Uint8Array, shift?: boolean): void {
        this.enqueueBuffer(type, data, shift);
        //auto cleanup
        this.autoCleanupSourceBuffer(type);
        //append data
        this.tryAppendToSourceBuffer(type);
    }

    /**
     * 
     * remark for chrome autoplay policy: https://goo.gl/xX8pDD
     */
    public play(): void {
        let that = this;
        that.bindVideoSrc();
        if (!that.videoElement.paused) {
            return;
        }
        if (that.mediaReady && that.videoElement.readyState > 2) {
            Log.debug(this.LOG_TAG, `[${this._id}] video element readyState=${that.videoElement.readyState}`);
            const prom = that.videoElement.play();
            if (prom) {
                prom.catch((reason) => {
                    Log.error(this.LOG_TAG, `[${this._id}] exception, name="${reason.name}", code=${reason.code}, message="${reason.message}"`);
                });
            }
        } else {
            const handler = () => {
                that.play();
                that.videoElement.removeEventListener('canplaythrough', handler);
            };
            that.videoElement.addEventListener('canplaythrough', handler);
        }
    }

    public clear() {
        Log.debug(this.LOG_TAG, `[${this._id}] clearing mse...`);
        const that = this;
        for (const track in that.queues) {
            const queue = that.queues[track];
            if (queue)
                queue.splice(0, queue.length);
        }
        const promises = [];
        for (const key in that.sourceBuffers) {
            const track = key;
            const sb = that.sourceBuffers[track];
            if (sb) {
                const promise = new Promise((resolve, reject) => {
                    if (!sb.updating) {
                        for (let i = 0; i < sb.buffered.length; i++) {
                            sb.remove(sb.buffered.start(i), sb.buffered.end(i));
                            resolve();
                        }
                    }
                    else {
                        sb.onupdateend = null;
                        sb.onupdateend = () => {
                            for (let i = 0; i < sb.buffered.length; i++) {
                                if (sb) {
                                    //Log.error(this.LOG_TAG,  `[MSE] [${that.id}] sourceBuffer clear, track=${track}`);
                                    try {
                                        sb.remove(sb.buffered.start(i), sb.buffered.end(i));
                                    }
                                    catch (e) {
                                        throw new Error(`[${that._id}]` + e);
                                    }
                                }
                                resolve();
                            }
                        };
                    }
                });
                promises.push(promise);
            }
        }
        return Promise.all(promises);
    }

    public destroy(remainVideo?: boolean) {
        Log.debug(this.LOG_TAG, `[${this._id}] destroy mse...`);
        const that = this;
        that.mediaReady = false;
        return that.clear().then(() => {
            for (const track in that.sourceBuffers) {
                const sb = that.sourceBuffers[track];
                if (sb) {
                    //Log.error(this.LOG_TAG,  `[MSE] [${that.id}] removeSourceBuffer, track=${track}`);
                    that.mediaSource.removeSourceBuffer(sb);
                }
            }
            const src = that.mediaSourceURL;
            if (src) {
                if (!remainVideo) {
                    that.videoElement.src = '';
                }
                URL.revokeObjectURL(src);
            }
        });
    }
}
