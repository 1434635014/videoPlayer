import { YDPlayerCore, VideoStreamIndex, PlayState, PlayMode } from './player-core';
import { EventEmitter } from 'events';
import { YDUrl } from './io/yd/url';
import { Spinner } from './lib/spin';
import { PTZAction } from './io/yd/ptz_action';
import { RecordInfo } from './io/yd/avformat';
import { yderror, YDErrorCode } from './core/yd-error';
import { Log } from './utils/log';

require('./lib/object.assign');
require('core-js/stable/typed-array/slice');
require('es6-promise/auto');
require('url-polyfill');
// Fast polyfill for TextEncoder and TextDecoder, only supports UTF-8
// https://github.com/samthor/fast-text-encoding
require("fast-text-encoding");
const ydplayerCss = require('../styles/ydplayer.css');

class PlayContext {
    public core?: YDPlayerCore;
    public video: HTMLVideoElement;
    public view: HTMLElement;
    public selected: boolean = false;
    public spinner?: Spinner;
    public timer: any;

    constructor(view: HTMLElement, video: HTMLVideoElement, core?: YDPlayerCore) {
        this.view = view;
        this.video = video;
        this.core = core;
    }
}

/** 画面数量 */
export type ScreenNumber = 1 | 2 | 3 | 4 | 5;
/** 画面位置 */
export type ScreenIndex = number;
/** 自动画面位置 */
export type AutoScreenIndex = -1;
/** 不可用画面位置 */
export const UnavailableScreenIndex: number = -1;
/** 画面比例 */
export type ScreenRatio = 0.5625 /*9:16*/ | 0.75 /* 3:4 */ | number;
/** YDPlayer 事件定义 */
export type YDPlayerEvents = 'selectedIndexChanged' | 'playing' | 'buffering' | 'streamingStateChanged' | 'stop';

//see: https://developer.mozilla.org/zh-CN/docs/Web/CSS/object-fit
//  and https://caniuse.com/#search=object%20fit
/** 视频在视频播放控件中的适应（缩放）模式 */
export type FitMode = 'contain' | 'fill' | 'cover' | 'none' | 'scale-down';

type MessageStyle = 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'danger' | 'light' | 'dark';

/** 截图结果 */
export declare interface CaputureResult {
    /** 截图的url */
    url: YDUrl;
    /** 截图的结果数据 */
    data: string | undefined;
}

/** 查询录像的结果 */
export declare interface QueryRecordResult {
    /** 查询录像的url */
    url: YDUrl,
    /** 查询结果录像 */
    records: RecordInfo[]
}

/** YDPlayer 选项 */
export class YDPlayerOptions {
    /** X方向上画面个数 */
    public screenX?: ScreenNumber;
    /** Y方向上画面个数 */
    public screenY?: ScreenNumber;
    /** 画面比例 */
    public ratio?: ScreenRatio;
    /** 是否显示spinner */
    public spinner?: boolean;
    /** 视频在视频播放控件中的适应（缩放）模式 */
    public fitMode?: FitMode;       //https://developer.mozilla.org/zh-CN/docs/Web/CSS/object-fit
    /** 是否隐藏播放界面上出现的提示信息 */
    public hideMessage?: boolean;
    /** 是否允许相同的url多个画面播放 */
    public multiplePlay?: boolean;
}

/** YDPlayer 播放器 */
export declare interface YDPlayer {
    addListener(event: YDPlayerEvents, listener: (...args: any[]) => void): this;
    on(event: YDPlayerEvents, listener: (...args: any[]) => void): this;
    once(event: YDPlayerEvents, listener: (...args: any[]) => void): this;
    removeListener(event: YDPlayerEvents, listener: (...args: any[]) => void): this;
    off(event: YDPlayerEvents, listener: (...args: any[]) => void): this;
}

/** YDPlayer 播放器 */
export class YDPlayer extends EventEmitter {
    private static readonly WRAPPER_CSS_CLASS_NAME = "ydplayer";
    private static readonly VIDEO_CSS_CLASS_NAME = "ydplayer-video";
    private static readonly VIDEO_VIEW_CSS_CLASS_NAME = "ydplayer-video-view";
    private static readonly VIDEO_VIEW_MESSAGE_CLASS_NAME = 'ydplayer-video-message';
    private static readonly DEFAULT_SCREEN_X = 2;
    private static readonly DEFAULT_SCREEN_Y = 2;
    private static readonly DEFAULT_RATIO = 0.5625;  /* 9:16 */

    private LOG_TAG: string = '[YDPlayer] > ';
    private options: YDPlayerOptions;

    private container: HTMLElement;
    private wrapper: HTMLElement;
    private screenX: ScreenNumber;
    private screenY: ScreenNumber;
    /** 播放画面的高宽比 */
    private ratio?: ScreenRatio;

    private viewWidth: number = 0;
    private viewHeight: number = 0;

    private contexts: { [index in ScreenIndex]: PlayContext } = {};
    private selectedIndexValue: ScreenIndex | undefined = undefined;
    private pendingCapture: boolean = false;

    /**
     * 获取已选择的画面位置
     */
    public get selectedIndex(): ScreenIndex | undefined { return this.selectedIndexValue; }

    //默认选项
    private defaults: YDPlayerOptions = {
        screenX: YDPlayer.DEFAULT_SCREEN_X,
        screenY: YDPlayer.DEFAULT_SCREEN_Y,
        spinner: true,
        fitMode: 'contain',
        hideMessage: false,
        multiplePlay: false
    }

    public static isSupported(): boolean {
        const mediaSource = (window as any).MediaSource;
        return mediaSource && typeof mediaSource.isTypeSupported === 'function';
    }

    /**
     * 创建 YDPlayer 实例
     * @param container HTML容器元素，例如 div
     * @param options YDPlayer选项
     */
    constructor(container: HTMLElement, options?: YDPlayerOptions) {
        super();

        if (!YDPlayer.isSupported())
            Log.error(this.LOG_TAG, `this browser is not supported.`);

        this.options = Object.assign(new YDPlayerOptions(), this.defaults, options);
        this.screenX = this.options.screenX || YDPlayer.DEFAULT_SCREEN_X;
        this.screenY = this.options.screenY || YDPlayer.DEFAULT_SCREEN_Y;
        this.ratio = this.options.ratio;

        if (this.screenX < 1 || this.screenY < 1)
            throw new Error('screens must be greater than 1');

        this.container = container;
        this.wrapper = this.createWrapper();
        this.container.appendChild(this.wrapper);
        this.wrapper.focus();
        this.init();
    }

    private init() {
        this.updateVideoViewSize();
        this.renderVideoViews();
        this.clearUnusedContexts();
    }

    private createElement(tagName: string, options?: ElementCreationOptions): HTMLElement {
        return document.createElement(tagName, options);
    }

    private createWrapper(): HTMLElement {
        const wrapper = this.createElement('div');
        wrapper.className = YDPlayer.WRAPPER_CSS_CLASS_NAME;
        //see: https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/tabindex
        //  and https://stackoverflow.com/questions/3149362/capture-key-press-or-keydown-event-on-div-element
        wrapper.tabIndex = 1;
        wrapper.onkeyup = this.onWrapperKeyUp;
        return wrapper;
    }

    private onWrapperKeyUp = (ev: KeyboardEvent): any => {
        let selectedIndex = this.selectedIndex;
        if (selectedIndex !== undefined && this.isAvailableScreenIndex(selectedIndex)) {
            //keycodes: https://css-tricks.com/snippets/javascript/javascript-keycodes/
            switch (ev.keyCode) {
                case 37:    //left arrow
                    selectedIndex -= 1;
                    break;
                case 38:    //up arrow
                    selectedIndex -= this.screenX;
                    break;
                case 39:    //right arrow
                    selectedIndex += 1;
                    break;
                case 40:    //down arrow
                    selectedIndex += this.screenX;
                    break;
            }
            if (this.isAvailableScreenIndex(selectedIndex)) {
                this.selectScreenByIndex(selectedIndex);
            }
        }
        else {
            this.selectScreenByIndex(0);
        }
    }

    private renderVideoViews() {
        for (let y = 0; y < this.screenY; y++) {
            for (let x = 0; x < this.screenX; x++) {
                const screenIndex = y * this.screenX + x;
                let context = this.contexts[screenIndex];
                if (context) {
                    const view = context.view;
                    this.setVideoViewStyle(view, x, y);
                }
                else {
                    const result = this.createVideoView();
                    const view = result[0];
                    const video = result[1];
                    this.setVideoViewStyle(view, x, y);
                    video.onclick = this.onVideoClick;
                    video.ondblclick = this.onVideoDoubleClick;
                    video.onerror = this.onVideoError;
                    video.onpause = this.onVideoPause;
                    video.onwaiting = (ev) => { Log.warn(this.LOG_TAG, 'video is waiting...'); };
                    context = new PlayContext(view, video);
                    this.contexts[screenIndex] = context;
                    this.wrapper.appendChild(view);
                }
            }
        }
    }

    private updateVideoViewSize() {
        const containerWidth = this.wrapper.offsetWidth;
        let containerHeight = this.wrapper.offsetHeight;
        if (!this.ratio) {
            if (containerHeight) {
                this.ratio = (this.wrapper.offsetHeight * this.screenX) / (containerWidth * this.screenY);
            }
            else {
                this.ratio = YDPlayer.DEFAULT_RATIO;
                containerHeight = containerWidth * this.ratio;
            }
        }
        this.viewWidth = Math.floor(containerWidth / this.screenX);
        this.viewHeight = Math.floor(containerHeight / this.screenY);
    }

    private async clearUnusedContexts() {
        //移除不再使用的
        let screenIndex = this.screenX * this.screenY;
        let ctx: PlayContext;
        while (ctx = this.contexts[screenIndex]) {
            this.clearTimeout(ctx);
            const core = ctx.core;
            ctx.view.removeChild(ctx.video);
            this.wrapper.removeChild(ctx.view);
            if (core) {
                core.destroy().catch((r) => {
                    Log.debug(this.LOG_TAG, `destroy core error: ` + r);
                });
                delete ctx.core;
            }
            delete this.contexts[screenIndex];
            screenIndex++;
        }
    }

    private setVideoViewStyle(view: HTMLElement, x: number, y: number): HTMLElement {
        view.style.width = `${100 / this.screenX}%`;
        //Aspect Ratio(use pading top), see: https://www.w3schools.com/howto/howto_css_aspect_ratio.asp
        const ratio = this.ratio || YDPlayer.DEFAULT_RATIO;
        view.style.paddingTop = `${ratio * 100 / this.screenX}%`;
        return view;
    }

    private setVideoStyle(video: HTMLVideoElement): HTMLVideoElement {
        if (this.options.fitMode)
            video.style.objectFit = this.options.fitMode;
        return video;
    }

    private createVideoView(): [HTMLElement, HTMLVideoElement] {
        let view = this.createElement('div') as HTMLElement;
        view.className = YDPlayer.VIDEO_VIEW_CSS_CLASS_NAME;
        let video = this.createElement('video') as HTMLVideoElement;
        video.className = YDPlayer.VIDEO_CSS_CLASS_NAME;
        this.setVideoStyle(video);
        //autoplay policy: https://goo.gl/xX8pDD
        video["muted"] = true;
        video["autoplay"] = true;
        //video['controls'] = true;
        //see: https://webkit.org/blog/6784/new-video-policies-for-ios/
        video["playsinline"] = true;
        video["webkit-playsinline"] = true;
        video["x5-playsinline"] = true;
        view.appendChild(video);
        return [view, video];
    }

    private isAvailableScreenIndex(screenIndex?: ScreenIndex): boolean {
        if (screenIndex !== undefined) {
            return (0 <= screenIndex && screenIndex < this.screenX * this.screenY);
        }
        return false;
    }

    private selectScreenByIndex(screenIndex: ScreenIndex) {
        let selectedIndex: ScreenIndex | undefined;
        let selectedContext: PlayContext | undefined;
        for (const key in this.contexts) {
            const idx = parseInt(key);
            const ctx = this.contexts[idx];
            if (ctx && ctx.video) {
                if (idx === screenIndex) {
                    selectedIndex = idx;
                    selectedContext = ctx;
                    ctx.video.classList.add('active');
                }
                else {
                    ctx.video.classList.remove('active');
                }
            }
        }
        this.selectedIndexValue = selectedIndex;
        const url = (selectedContext && selectedContext.core) ? selectedContext.core.url : undefined;
        this.emit('selectedIndexChanged', selectedIndex, url);
    }

    private selectScreenByVideo(videoElement: HTMLElement) {
        let selectedIndex: ScreenIndex | undefined;
        let selectedContext: PlayContext | undefined;
        for (const idx in this.contexts) {
            const screenIndex = parseInt(idx);
            const ctx = this.contexts[screenIndex];
            if (ctx && ctx.video) {
                if (ctx.video == videoElement) {
                    selectedIndex = screenIndex;
                    selectedContext = ctx;
                    ctx.video.classList.add('active');
                }
                else {
                    ctx.video.classList.remove('active');
                }
            }
        }
        this.selectedIndexValue = selectedIndex;
        const url = (selectedContext && selectedContext.core) ? selectedContext.core.url : undefined;
        this.emit('selectedIndexChanged', selectedIndex, url);
    }

    private onVideoClick = (ev: Event): void => {
        ev.preventDefault();
        ev.stopPropagation();
        const el = ev.target as HTMLVideoElement;
        this.selectScreenByVideo(el);
    }

    private onVideoDoubleClick = (ev: Event) => {
        ev.preventDefault();
        ev.stopPropagation();
        const el = ev.target as HTMLVideoElement;
        for (const idx in this.contexts) {
            const screenIndex = parseInt(idx);
            const ctx = this.contexts[screenIndex];
            if (ctx && ctx.video == el) {
                this.toggleFullScreen(ctx.video);
                break;
            }
        }
    }

    private onVideoPause = (ev: Event) => {
        // Log.warn(this.LOG_TAG, `video is paused..`);
        // const v = ev.target as HTMLVideoElement;
        // v.play().catch(r => {
        //     Log.warn(this.LOG_TAG, `html video play failed: ` + r);
        // });
    }

    private onVideoError = (ev: Event | string) => {
        if (typeof ev === 'string') {
            Log.error(this.LOG_TAG, ev);
        }
        else if (ev.type === 'error') {
            const el = ev.target as HTMLVideoElement;
            var mediaError = el.error;
            if (mediaError && mediaError.message) {
                if (mediaError.message.indexOf('Empty src attribute') < 0) {
                    Log.error(this.LOG_TAG, mediaError);
                }
            }
        }
    }

    private getSelectedContext(screenIndex?: ScreenIndex): PlayContext | undefined {
        let idx = screenIndex;
        if (idx === undefined)
            idx = this.selectedIndex;
        if (idx !== undefined && this.isAvailableScreenIndex(idx)) {
            return this.contexts[idx];
        }
        return undefined;
    }

    private getIdlePlayContext(): [ScreenIndex | undefined, PlayContext | undefined] {
        for (const idx in this.contexts) {
            const screenIndex = parseInt(idx);
            const ctx = this.contexts[screenIndex];
            if (ctx && !ctx.core)
                return [screenIndex, ctx];
        }
        return [undefined, undefined];
    }

    private findNextPlayContext(screenIndex?: ScreenIndex): [ScreenIndex | undefined, PlayContext | undefined] {
        let ctx: PlayContext | undefined;
        if (screenIndex !== undefined && this.isAvailableScreenIndex(screenIndex)) {
            // 1.如果指定了正确的位置，就用指定的播放位置；
            ctx = this.contexts[screenIndex];
        }
        else {
            // 2.如果当前选中的位置未在播放，就使用当前选中的位置；
            screenIndex = this.selectedIndex;
            ctx = this.getSelectedContext();
            if (!ctx || ctx.core) {
                // 3.如果当前选中的画面位置不可用或正在播放，则寻找下一个可用的画面位置
                [screenIndex, ctx] = this.getIdlePlayContext();
            }
        }
        return [screenIndex, ctx];
    }

    private getPlayingContext(url: string): [ScreenIndex?, PlayContext?] {
        for (const idx in this.contexts) {
            const screenIndex = parseInt(idx);
            const ctx = this.contexts[screenIndex];
            if (ctx && ctx.core && ctx.core.url) {
                const ctxUrl = ctx.core.url;
                if (ctxUrl.toString() === url) {
                    return [screenIndex, ctx];
                }
                else {
                    const uri = new YDUrl(url);
                    if (ctxUrl.sn === uri.sn && ctxUrl.channel === uri.channel)
                        return [screenIndex, ctx];
                }
            }
        }
        return [undefined, undefined];
    }

    private indexOfPlayerCore(core: YDPlayerCore): ScreenIndex {
        for (let idx in this.contexts) {
            const screenIndex = parseInt(idx);
            const ctx = this.contexts[screenIndex];
            if (ctx && ctx.core && ctx.core == core) {
                return screenIndex;
            }
        }
        return -1;
    }

    private bindPlayerCoreEvents(core: YDPlayerCore): void {
        let that = this;
        core.addListener('playing', (...args: any[]) => { that.emit('playing', that.indexOfPlayerCore(core), args); });
        core.addListener('buffering', (...args: any[]) => { that.emit('buffering', that.indexOfPlayerCore(core), args); });
        core.addListener('streamingStateChanged', (...args: any[]) => { that.emit('streamingStateChanged', that.indexOfPlayerCore(core), args); });
        core.addListener('stop', (...args: any[]) => { that.emit('stop', that.indexOfPlayerCore(core), args); });
        core.addListener('disconnected', (...args: any[]) => { that.onCoreDisconnected(core); });
    }

    private createPlayerCore(video: HTMLVideoElement, url: string | YDUrl): YDPlayerCore {
        const core = new YDPlayerCore(video, url);
        this.bindPlayerCoreEvents(core);
        return core;
    }

    private setTimeout(ctx: PlayContext, callback: (...args: any[]) => void, ms: number) {
        if (ctx) {
            ctx.timer = window.setTimeout(callback, ms);
        }
    }

    private clearTimeout(ctx: PlayContext) {
        if (ctx && ctx.timer) {
            window.clearTimeout(ctx.timer);
        }
    }

    private showMessage(ctx: PlayContext, message: string, style?: MessageStyle) {
        this.hideMessage(ctx);
        const messageEl = this.createElement('div');
        messageEl.className = YDPlayer.VIDEO_VIEW_MESSAGE_CLASS_NAME;
        if (style) {
            messageEl.classList.add(style);
        }
        messageEl.innerText = message;
        ctx.view.appendChild(messageEl);
    }

    private hideMessage(ctx: PlayContext) {
        if (ctx && ctx.view) {
            const children = ctx.view.children;
            for (let i = 0; i < children.length; i++) {
                const el = ctx.view.children.item(i);
                if (el && el.className && el.classList.contains(YDPlayer.VIDEO_VIEW_MESSAGE_CLASS_NAME)) {
                    ctx.view.removeChild(el);
                }
            }
        }
    }

    private showSpinner(ctx: PlayContext): any {
        const spinner = new Spinner({ scale: 0.4 }).spin();
        ctx.view.appendChild(spinner.el);
        ctx.spinner = spinner;
        return spinner;
    }

    private hideSpinner(ctx: PlayContext): void {
        if (ctx && ctx.spinner) {
            ctx.spinner.stop();
            delete ctx.spinner;
        }
    }

    private beginPlayingSpinner(ctx: PlayContext) {
        const loadingTime = new Date();
        let logtime = false;
        const handler = (track: any) => {
            if (typeof track !== 'string' || track == 'video') {
                if (!logtime) {
                    logtime = true;
                    const now = new Date();
                    console.warn(this.LOG_TAG, `loading time: ${now.getTime() - loadingTime.getTime()}ms`);
                }
                this.hideSpinner(ctx);
                if (ctx.core)
                    ctx.core.removeListener('destroy', handler);
                //ctx.core.removeListener('playing', handler);
                ctx.video.removeEventListener('playing', handler);
            }
        };
        if (ctx.core)
            ctx.core.addListener('destroy', handler);
        //ctx.core.addListener('playing', handler);
        ctx.video.addEventListener('playing', handler, { once: true });
        this.showSpinner(ctx);
    }

    private async toggleFullScreen(fs: HTMLElement): Promise<void> {
        if (!document.fullscreenElement &&    // alternative standard method
            !document['mozFullScreenElement'] && !document['webkitFullscreenElement'] && !document['msFullscreenElement']) {  // current working methods
            if (fs.requestFullscreen) {
                await fs.requestFullscreen();
            } else if (fs['msRequestFullscreen']) {
                fs['msRequestFullscreen']();
            } else if (fs['mozRequestFullScreen']) {
                fs['mozRequestFullScreen']();
            } else if (fs['webkitRequestFullscreen']) {
                fs['webkitRequestFullscreen']();
            }
        } else {
            if (document.exitFullscreen) {
                await document.exitFullscreen();
            } else if (document['msExitFullscreen']) {
                document['msExitFullscreen']();
            } else if (document['mozCancelFullScreen']) {
                document['mozCancelFullScreen']();
            } else if (document['webkitExitFullscreen']) {
                document['webkitExitFullscreen']();
            }
        }
    }

    private checkConcurrence(url: string): { conflict: boolean, conflictIdx: ScreenIndex } {
        if (!this.options.multiplePlay) {
            const [screenIndex, ctx] = this.getPlayingContext(url);
            if (ctx && screenIndex !== undefined && this.isAvailableScreenIndex(screenIndex)) {
                this.selectScreenByIndex(screenIndex);
                return { conflict: true, conflictIdx: screenIndex };
            }
        }
        return { conflict: false, conflictIdx: UnavailableScreenIndex };
    }

    private async internalOpenStreaming(ctx: PlayContext, screenIndex: ScreenIndex, url: string | YDUrl, videoStreamIndex?: VideoStreamIndex, remainVideo?: boolean): Promise<ScreenIndex> {
        if (ctx.core) {
            await ctx.core.destroy(remainVideo);
            delete ctx.core;
        }

        const core = this.createPlayerCore(ctx.video, url);
        ctx.core = core;

        this.beginPlayingSpinner(ctx);

        try {
            await core.openStreaming(videoStreamIndex);
        }
        catch (e) {
            await ctx.core.destroy(remainVideo);
            delete ctx.core;
            this.showMessage(ctx, '' + e);
            throw e;
        }
        return screenIndex;
    }

    private async internalOpenPlayback(ctx: PlayContext, screenIndex: ScreenIndex, url: string | YDUrl, time: Date): Promise<ScreenIndex> {
        if (ctx.core) {
            await ctx.core.destroy();
            delete ctx.core;
        }
        const core = this.createPlayerCore(ctx.video, url);
        ctx.core = core;
        this.hideMessage(ctx);
        this.beginPlayingSpinner(ctx);
        try {
            await core.openPlayback(time);
        }
        catch (e) {
            await ctx.core.destroy();
            delete ctx.core;
            this.showMessage(ctx, '' + e);
            throw e;
        }
        return screenIndex;
    }

    private onCoreDisconnected(core: YDPlayerCore) {
        const idx = this.indexOfPlayerCore(core);
        const ctx = this.contexts[idx];
        if (ctx && ctx.core) {
            if (ctx.core.playState === PlayState.PLAYING && ctx.core.playMode === PlayMode.STREAMING) {
                const that = this;
                const url = ctx.core.url;
                const streamIndex = ctx.core.videoStreamIndex;
                that.showMessage(ctx, '正在重连...');
                const handler = () => {
                    that.setTimeout(ctx, () => {
                        that.internalOpenStreaming(ctx, idx, url, streamIndex, true).then(() => {
                            that.clearTimeout(ctx);
                            that.hideMessage(ctx);
                        }).catch(() => {
                            that.clearTimeout(ctx);
                            handler();
                        });
                    }, 5000);
                };
                handler();
            }
            else if (ctx.core.playState === PlayState.PLAYING) {
                this.showMessage(ctx, '连接已断开', 'danger');
            }
        }
    }

    /**
     * 设置画面显示排列
     * @param x 
     * @param y 
     */
    public setScreens(x: ScreenNumber, y: ScreenNumber): this {
        this.screenX = x;
        this.screenY = y;
        this.init();
        return this;
    }

    /**
     * 开启实时音视频流播放
     * @param url 
     * @param videoStreamIndex 
     * @param screenIndex 
     */
    public openStreaming(url: string, videoStreamIndex?: VideoStreamIndex, screenIndex?: ScreenIndex | AutoScreenIndex): Promise<ScreenIndex> {
        const { conflict, conflictIdx } = this.checkConcurrence(url);
        if (conflict)
            return Promise.resolve(conflictIdx);
        //找到播放位置
        let [idx, ctx] = this.findNextPlayContext(screenIndex);
        //如果播放位置不可用，就直接返回
        if (!ctx || idx === undefined) {
            Log.debug(this.LOG_TAG, `can not find available player`);
            return Promise.resolve(UnavailableScreenIndex);
        }
        //
        //https://developers.google.com/web/updates/2017/06/play-request-was-interrupted
        if (ctx.video) {
            // This will allow us to play video later...
            ctx.video.load();
            const prom = ctx.video.play();
            if (prom) {
                prom.catch(r => {
                    Log.warn(this.LOG_TAG, `html video play failed: ` + r);
                });
            }
        }

        this.hideMessage(ctx);

        return this.internalOpenStreaming(ctx, idx, url, videoStreamIndex);
    }

    /**
     * 关闭实时音视频播放
     * @param screenIndex 
     */
    public async closeStreaming(screenIndex?: ScreenIndex) {
        const ctx = this.getSelectedContext(screenIndex);
        if (ctx) {
            this.clearTimeout(ctx);
            if (ctx.core) {
                try {
                    await ctx.core.closeStreaming();
                }
                catch (e) {
                    Log.error(this.LOG_TAG, e);
                }
                try {
                    await ctx.core.destroy();
                }
                catch (e) {
                    Log.error(this.LOG_TAG, e);
                }
                delete ctx.core;
            }
        }
    }

    /**
     * 关闭所有窗口的实时音视频播放
     */
    public closeAllStreaming() {
        let promise: Promise<unknown>[] = [];
        for (const idx in this.contexts) {
            const screenIndex = parseInt(idx);
            const p = this.closeStreaming(screenIndex);
            promise.push(p);
        }
        return Promise.all(promise);
    }

    /**
     * 查询录像
     * @param url 
     * @param startTime 
     * @param endTime 
     */
    public async queryRecords(url: string, startTime: Date, endTime: Date): Promise<QueryRecordResult> {
        const video = document.createElement('video') as HTMLVideoElement;
        const core = new YDPlayerCore(video, url);
        const ydurl = core.url;
        const records = await core.queryRecords(startTime, endTime);
        core.destroy();
        if (typeof video.remove) {
            video.remove();
        }
        return { url: ydurl, records: records };
    }

    /**
     * 开启音视频回放
     * @param url 
     * @param time 
     * @param screenIndex 
     */
    public openPlayback(url: string, time: Date, screenIndex?: ScreenIndex | AutoScreenIndex): Promise<ScreenIndex> {
        //找到播放位置
        let [idx, ctx] = this.findNextPlayContext(screenIndex);
        //如果播放位置不可用，就直接返回
        if (!ctx || idx === undefined) {
            Log.debug(this.LOG_TAG, `can not find available player`);
            return Promise.resolve(UnavailableScreenIndex);
        }
        if (ctx.video) {
            //https://developers.google.com/web/updates/2017/06/play-request-was-interrupted
            // This will allow us to play video later...
            ctx.video.load();
            ctx.video.play().catch(r => {
                Log.warn(this.LOG_TAG, `html video play failed: ` + r);
            });
        }
        return this.internalOpenPlayback(ctx, idx, url, time);
    }

    /**
     * 关闭回放
     * @param screenIndex 
     */
    public async closePlayback(screenIndex?: ScreenIndex) {
        const ctx = this.getSelectedContext(screenIndex);
        if (ctx && ctx.core) {
            try {
                await ctx.core.closePlayback();
            }
            catch (e) {
                Log.error(this.LOG_TAG, e);
            }
            try {
                await ctx.core.destroy();
            }
            catch (e) {
                Log.error(this.LOG_TAG, e);
            }
            delete ctx.core;
        }
    }

    /**
     * 停止
     * @param screenIndex 
     */
    public async stop(screenIndex?: ScreenIndex) {
        const ctx = this.getSelectedContext(screenIndex);
        if (ctx) {
            this.clearTimeout(ctx);
            if (ctx.core) {
                try {
                    await ctx.core.destroy();
                }
                catch (e) {
                    Log.warn(this.LOG_TAG, e);
                }
                delete ctx.core;
            }
            if (ctx.video && ctx.video.src) {
                ctx.video.src = '';
            }
            this.hideMessage(ctx);
        }
    }

    /**
     * 停止所有
     */
    public stopAll() {
        let promises: Promise<unknown>[] = [];
        for (const idx in this.contexts) {
            const screenIndex = parseInt(idx);
            const p = this.stop(screenIndex);
            promises.push(p);
        }
        return Promise.all(promises);
    }

    /**
     * 切换指定画面位置的音频播放（如果有）
     * @param screenIndex 
     */
    public toggleAudio(screenIndex?: ScreenIndex) {
        const selectedContext = this.getSelectedContext(screenIndex);
        //如果选中了一个画面，则切换声音
        if (selectedContext && selectedContext.video) {
            //关闭其他播放画面的声音
            for (const idx in this.contexts) {
                const ctx = this.contexts[idx];
                if (ctx && ctx.video && ctx != selectedContext) {
                    ctx.video.muted = true;
                }
            }
            //切换当前选中画面的声音
            selectedContext.video.muted = !selectedContext.video.muted;
        }
    }

    /**
     * 静音
     */
    public mute() {
        for (const idx in this.contexts) {
            const ctx = this.contexts[idx];
            if (ctx && ctx.video) {
                ctx.video.muted = true;
            }
        }
    }

    /**
     * 使指定画面或全部画面全屏显示
     * @param screenIndex 
     */
    public async requestFullscreen(screenIndex?: ScreenIndex): Promise<void> {
        if (screenIndex !== undefined) {
            const ctx = this.contexts[screenIndex];
            if (ctx && ctx.view) {
                await this.toggleFullScreen(ctx.view);
                return;
            }
        }
        await this.toggleFullScreen(this.wrapper);
    }

    /**
     * 抓图
     * @param screenIndex 
     */
    public capture(screenIndex?: ScreenIndex): Promise<CaputureResult> {
        const that = this;
        return new Promise((resolve, reject) => {
            if (!that.pendingCapture) {
                that.pendingCapture = true;
                const ctx = this.getSelectedContext(screenIndex);
                if (ctx && ctx.core) {
                    const url = ctx.core.url;
                    const data = ctx.core.capture();
                    resolve({ url, data });
                }
                else {
                    reject(yderror(YDErrorCode.NONE, `未开启视频播放或播放失败`));
                }
                that.pendingCapture = false;
            }
            else {
                reject(yderror(YDErrorCode.ACTION_PENDING, `截图操作正在进行中`));
            }
        });
    }

    /**
     * 全部播放画面抓图
     */
    public captureAll(): Promise<CaputureResult[]> {
        const that = this;
        return new Promise((resolve, reject) => {
            if (!that.pendingCapture) {
                that.pendingCapture = true;
                let results: CaputureResult[] = [];
                for (const idx in this.contexts) {
                    const ctx = this.contexts[idx];
                    if (ctx && ctx.core) {
                        const url = ctx.core.url;
                        const data = ctx.core.capture();
                        if (data && data.length > 0) {
                            results.push({ url, data });
                        }
                    }
                }
                resolve(results);
                that.pendingCapture = false;
            }
            else {
                reject(yderror(YDErrorCode.ACTION_PENDING, `截图操作正在进行中`));
            }
        });
    }

    /**
     * 云台控制
     * @param screenIndex 
     * @param action 
     * @param value 
     * @param name 
     */
    public async controlPtz(screenIndex: ScreenIndex | undefined, action: PTZAction, value: number = 5, name: string = "") {
        const ctx = this.getSelectedContext(screenIndex);
        if (ctx && ctx.core) {
            await ctx.core.controlPtz(action, value, name);
        }
    }

    /**
     * 设置视频内容呈现时的缩放方式
     * @param mode 
     * @param screenIndex 
     */
    public setFitMode(mode: FitMode, screenIndex?: ScreenIndex) {
        const ctx = this.getSelectedContext(screenIndex);
        if (ctx && ctx.video) {
            ctx.video.style.objectFit = mode;
        }
    }
}