import { YDPlayer, YDPlayerOptions, ScreenNumber, ScreenIndex } from '../player';
import { EventEmitter } from 'events';
import { YDUrl } from '../io/yd/url';

export type YDPlayerPlugInEvents = 'activewindowex' | 'searchrecord' | 'capturepicture' | 'callbackcapture';

export class YDPlayerPlugIn {
    private player: YDPlayer;
    private emitter: EventEmitter;

    public onsearchrecord: ((this: YDPlayerPlugIn, sn: string, channel: number, records: string) => void) | null = null;

    constructor(container: HTMLElement, options?: YDPlayerOptions) {
        this.player = new YDPlayer(container, options);
        this.emitter = new EventEmitter();
        this.player.on('selectedIndexChanged', (selectedIndex: ScreenIndex, url: YDUrl) => {
            if (url) {
                this.emitter.emit('activewindowex', url.sn, url.channel, selectedIndex);
            }
        });
    }

    public SetScreenNum(screenX: ScreenNumber, screenY: ScreenNumber) {
        return this.player.setScreens(screenX, screenY);
    }

    public fullscreen() {
        return this.player.requestFullscreen();
    }

    public PlayUrlEx(url: string, name: string, num: ScreenIndex, args: string | null, mediaSource: string, mediaSource1?: string) {
        let screenIndex = num - 1;
        if (!url || url.indexOf('ws') !== 0) {
            if (typeof mediaSource === 'string')
                url = mediaSource;
            else if (typeof mediaSource1 === 'string')
                url = mediaSource1;
            else
                return;
        }

        return this.player.openStreaming(url, 1, screenIndex);
    }

    public PlayUrl(url: string, name: string, num: ScreenIndex, mediaSource: string) {
        return this.PlayUrlEx(url, name, num, null, mediaSource);
    }

    public PlayOnlineRecord(url: string, device_name: string, time: string, screen: ScreenIndex, args: string, mediaSource: string) {
        if (!url || url.indexOf('ws') !== 0) {
            if (typeof mediaSource === 'string')
                url = mediaSource;
            else
                return;
        }
        let playbackTime = new Date(time);
        let screenIndex = screen - 1;
        return this.player.openPlayback(url, playbackTime, screenIndex);
    }

    public SearchRemoteRecordEx(url: string, device_name: string, args: string, from: string, to: string, mediaSource: string) {
        if (!url || url.indexOf('ws') !== 0) {
            if (typeof mediaSource === 'string')
                url = mediaSource;
            else
                return;
        }
        let fromTime = new Date(from);
        let toTime = new Date(to);
        let that = this;
        that.player.queryRecords(url, fromTime, toTime).then((result) => {
            var ydurl = result.url;
            var records = result.records;
            let list = [];
            for (let record of records) {
                list.push({ 'starttime': record.startTime, 'endtime': record.endTime, 'filename': record.filename, 'recordType': record.recordType });
            }
            const data = JSON.stringify(list);
            that.emitter.emit('searchrecord', ydurl.sn, ydurl.channel, data);
            if (typeof this.onsearchrecord === 'function')
                this.onsearchrecord(ydurl.sn, ydurl.channel, data);
        });
        return this;
    }

    public StopActiveVideo() {
        return this.player.stop(this.player.selectedIndex);
    }

    public StopAllVideo() {
        return this.player.stopAll();
    }

    public GetViewInfoEx() {
        //not implement
    }

    public GetVersionNum() {
        return 30000;
    }

    public SelectLanguage() {
        //not implement
    }

    public SetAuthLevel(...args: any[]) {
        //not implement
    }

    public SetFilePath() {
        //not implement
    }

    public OpenSavePicFolder() {
        //not implement
    }

    public Ptz_Ctrl(action: number, value: number = 5, name: string = "") {
        let screenIndex = this.player.selectedIndex;
        return this.player.controlPtz(screenIndex, action, value, name);
    }

    public OpenSaveVedioFolder() {
        //not implement
    }

    private capture(caputureAll: 0 | 1) {
        if (caputureAll == 1) {
            this.player.captureAll().then((results) => {
                for (let result of results) {
                    if (result.data && result.data.length > 0) {
                        this.emitter.emit('capturepicture', result.url.sn, result.data, result.data.length);
                        this.emitter.emit('callbackcapture', result.url.sn, result.data, result.data.length);
                    }
                }
            });
        }
        else {
            this.player.capture(this.player.selectedIndex).then((result) => {
                if (result.data && result.data.length > 0) {
                    this.emitter.emit('capturepicture', result.url.sn, result.data, result.data.length);
                    this.emitter.emit('callbackcapture', result.url.sn, result.data, result.data.length);
                }
            });
        }
    }

    /**
     * 抓图
     * @param caputureAll 是否抓取所有画面，0-否；1-是；
     * @param total 抓图次数
     * @param interval 抓图间隔
     */
    public Screenshot(caputureAll: 0 | 1, total: number, interval: number) {
        if (total > 0) {
            this.capture(caputureAll);     //first time
            let count = total;
            if (count > 1) {
                let that = this;
                let timer = setInterval(() => {
                    count--;
                    if (count > 0) {
                        that.capture(caputureAll);
                    }
                    else {
                        clearInterval(timer);
                    }
                }, interval * 1000);
            }
        }
        return this;
    }

    public attachEvent(event: YDPlayerPlugInEvents, listener: (...args: any[]) => void) {
        let eventName: string = event;
        while (eventName && eventName.indexOf('on') === 0) {
            eventName = eventName.slice(2);
        }
        this.emitter.on(eventName, listener);
    }

    public addEventListener(event: YDPlayerPlugInEvents, listener: (...args: any[]) => any) {
        let eventName: string = event;
        if (eventName && eventName.indexOf('on') === 0)
            eventName = eventName.slice(2);
        this.emitter.on(eventName, listener);
    }
}