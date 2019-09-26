/// <reference types="node" />

import { YDUrl } from './url';
import { PTZAction } from './ptz_action';
import { RecordInfo } from './record';

/** 视频码流，1：主码流；2：次码流 */
export declare type VideoStreamIndex = 0 | 1 | 2 | 3;

/** 画面数量 */
export declare type ScreenNumber = 1 | 2 | 3 | 4 | 5;
/** 画面位置 */
export declare type ScreenIndex = number;
/** 自动画面位置 */
export declare type AutoScreenIndex = -1;
/** 画面高、宽比例 */
export declare type ScreenRatio = 0.5625 | 0.75 | number;
/** 视频在视频播放控件中的适应（缩放）模式 */
export declare type FitMode = 'contain' | 'fill' | 'cover' | 'none' | 'scale-down';

/** 截图结果 */
export declare interface CaputureResult {
    /** 截图的url */
    url: YDUrl;
    /** 截图的结果数据 */
    data: string;
}

/** 查询录像的结果 */
export declare interface QueryRecordResult {
    /** 查询录像的url */
    url: YDUrl;
    /** 查询结果录像 */
    records: RecordInfo[];
}

/** YDPlayer 选项 */
export declare interface YDPlayerOptions {
    /** X方向上画面个数 */
    screenX?: ScreenNumber;
    /** Y方向上画面个数 */
    screenY?: ScreenNumber;
    /** 画面比例 */
    ratio?: ScreenRatio;
    /** 是否显示spinner */
    spinner?: boolean;
    /** 视频在视频播放控件中的适应（缩放）模式 */
    fitMode?: FitMode;
    /** 是否允许相同的url多个画面播放 */
    multiplePlay?: boolean;
}

/** YDPlayer 事件定义 */
export declare type YDPlayerEvents = 'selectedIndexChanged' | 'playing' | 'buffering' | 'streamingStateChanged' | 'stop';

/** selectedIndexChanged 事件监听器定义 */
export declare type SelectedIndexChangedListener = (selectedIndex: ScreenIndex, url: YDUrl) => void;

/** YDPlayer 播放器 */
export declare interface YDPlayer {
    addListener(event: YDPlayerEvents, listener: (...args: any[]) => void): this;
    on(event: YDPlayerEvents, listener: (...args: any[]) => void): this;
    once(event: YDPlayerEvents, listener: (...args: any[]) => void): this;
    removeListener(event: YDPlayerEvents, listener: (...args: any[]) => void): this;
    off(event: YDPlayerEvents, listener: (...args: any[]) => void): this;
}

/** YDPlayer 播放器 */
export declare class YDPlayer {
    /**
     * 获取已选择的画面位置
     */
    readonly selectedIndex: ScreenIndex | undefined;

    /**
     * 创建 YDPlayer 实例
     * @param container HTML容器元素，例如 div
     * @param options YDPlayer选项
     */
    constructor(container: HTMLElement, options?: YDPlayerOptions);

    /**
     * 设置画面显示排列
     * @param x X方向上画面个数
     * @param y Y方向上画面个数
     */
    setScreens(x: ScreenNumber, y: ScreenNumber): this;

    /**
     * 开启实时音视频流播放
     * @param url 设备媒体URL
     * @param videoStreamIndex 视频码流
     * @param screenIndex 画面位置
     */
    openStreaming(url: string, videoStreamIndex?: VideoStreamIndex, screenIndex?: ScreenIndex | AutoScreenIndex): Promise<ScreenIndex>;

    /**
     * 关闭实时音视频播放
     * @param screenIndex 画面位置
     */
    closeStreaming(screenIndex?: ScreenIndex): Promise<void>;

    /**
     * 关闭所有窗口的实时音视频播放
     */
    closeAllStreaming(): Promise<unknown[]>;

    /**
     * 查询录像
     * @param url 设备媒体URL
     * @param startTime 查询的开始时间
     * @param endTime 查询的结束时间
     */
    queryRecords(url: string, startTime: Date, endTime: Date): Promise<QueryRecordResult>;

    /**
     * 开启音视频回放
     * @param url 设备媒体URL
     * @param time 回放的时间
     * @param screenIndex 画面位置
     */
    openPlayback(url: string, time: Date, screenIndex?: ScreenIndex | AutoScreenIndex): Promise<ScreenIndex>;

    /**
     * 关闭回放
     * @param screenIndex 画面位置
     */
    closePlayback(screenIndex?: ScreenIndex): Promise<void>;

    /**
     * 停止
     * @param screenIndex 画面位置
     */
    stop(screenIndex?: ScreenIndex): Promise<void>;

    /**
     * 停止所有
     */
    stopAll(): Promise<unknown[]>;

    /**
     * 切换音频播放（如果有）
     * @param screenIndex 画面位置
     */
    toggleAudio(screenIndex?: ScreenIndex): void;

    /**
     * 静音
     */
    mute(): void;

    /**
     * 使指定画面或全部画面全屏显示
     * @param screenIndex 画面位置
     */
    requestFullscreen(screenIndex?: ScreenIndex): Promise<void>;

    /**
     * 抓图
     * @param screenIndex 画面位置
     */
    capture(screenIndex?: ScreenIndex): Promise<CaputureResult>;

    /**
     * 全部播放画面抓图
     */
    captureAll(): Promise<CaputureResult[]>;

    /**
     * 云台控制
     * @param screenIndex 画面位置
     * @param action 云台动作
     * @param value 参数值
     * @param name 名称（预置位）
     */
    controlPtz(screenIndex: ScreenIndex, action: PTZAction, value?: number, name?: string): Promise<void>;

    /**
     * 视频在视频播放控件中的适应（缩放）模式
     * @param mode 适应模式
     * @param screenIndex 画面位置
     */
    setFitMode(mode: FitMode, screenIndex?: ScreenIndex): void;
}
