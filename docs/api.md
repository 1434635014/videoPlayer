YDPlayer API文档
==========

[TOC]



云盯播放器使用 typescript 编写，下列数据类型定义和函数声明也可以参考文档中d.ts文件。



## 数据类型

云盯使用的数据类型的定义。



### ScreenNumber

```typescript
declare type ScreenNumber = 1 | 2 | 3 | 4 | 5;
```

用于表示画面数量。



### ScreenIndex

```typescript
declare type ScreenIndex = number;
```

用于表示画面位置。



### AutoScreenIndex

```typescript
declare type AutoScreenIndex = -1;
```

用于表示自动的画面位置。



### ScreenRatio

```typescript
declare type ScreenRatio = 0.5625 | 0.75 | number;
```

用于表示画面高、宽比例。

-  0.5625：即 9:16 比例；
- 0.75：即 3:4 比例；



### FitMode

```typescript
declare type FitMode = 'contain' | 'fill' | 'cover' | 'none' | 'scale-down';
```

用于表示视频在视频播放控件中的适应（缩放）模式。

- **contain**：被替换的内容将被缩放，以在填充元素的内容框时保持其宽高比。 整个对象在填充盒子的同时保留其长宽比，因此如果宽高比与框的宽高比不匹配，该对象将被添加“黑边”。
- **cover**：被替换的内容在保持其宽高比的同时填充元素的整个内容框。如果对象的宽高比与内容框不相匹配，该对象将被剪裁以适应内容框。
- **fill**：被替换的内容正好填充元素的内容框。整个对象将完全填充此框。如果对象的宽高比与内容框不相匹配，那么该对象将被拉伸以适应内容框。
- **none**：被替换的内容将保持其原有的尺寸。
- **scale-down**：内容的尺寸与 none 或 contain 中的一个相同，取决于它们两个之间谁得到的对象尺寸会更小一些。



### YDUrl 

```typescript
/** YDUrl */
declare interface YDUrl {
    /** 原始字符串 */
    readonly originalString: string;
    /** 查询字符串 */
    readonly searchParams: URLSearchParams;
    /** 协议 */
    readonly protocol: string;
    /** 主机名 */
    readonly hostname: string;
    /** 主机 */
    readonly host: string;
    /** 端口号 */
    readonly port: string;
    /** SN */
    readonly sn: string;
    /** 通道号 */
    readonly channel: number;
    /** 认证信息 */
    readonly auth: {
        token: string;
        timestamp: string;
    };

    /**
     * 返回 YDUrl 对象的字符串形式
     */
    toString(): string;
}
```

用于表示云盯播放器使用的urld，可通过云盯平台的获取设备列表接口得到设备信息后，读取设备的mediaSource属性取得。

- **如果该设备是多通道，需要在mediaSource字符串后附加 “&chn=” + 通道号 后再作为参数传递给给openStreaming等方法，例如1通道附加：”&chn=1“；**
- **mediaSource字符串后附加的通道号从0开始；**



### RecordInfo

```typescript
declare interface RecordInfo {
    /** 文件名 */
    readonly filename: string;
    /** 开始时间 */
    readonly startTime: Date;
    /** 结束时间 */
    readonly endTime: Date;
    /** 录像类型 */
    readonly recordType: RecordType;
}
```

用于表示查询得到的录像信息。



### CaputureResult

```typescript
declare interface CaputureResult {
    /** 截图的url */
    url: YDUrl;
    /** 截图的结果数据 */
    data: string;
}
```

用于表示播放器截图结果。



### QueryRecordResult

```typescript
declare interface QueryRecordResult {
    /** 查询录像的url */
    url: YDUrl;
    /** 查询结果录像 */
    records: RecordInfo[];
}
```

用于表示录像查询结果。



### YDPlayerOptions

```typescript
declare interface YDPlayerOptions {
    /** X方向上画面个数，默认为：2 */
    screenX?: ScreenNumber;
    /** Y方向上画面个数，默认为：2 */
    screenY?: ScreenNumber;
    /** 画面高宽比例：默认为 9:16 */
    ratio?: ScreenRatio;
    /** 是否显示spinner */
    spinner?: boolean;
    /** 视频在视频播放控件中的适应（缩放）模式 */
    fitMode?: FitMode;
    /** 是否允许相同的 url 在多个画面同时播放 */
    multiplePlay?: boolean;
}
```

表示播放器选项，创建播放器实例时传入。



### YDPlayerEvents 

```typescript
declare type YDPlayerEvents = 'selectedIndexChanged' | 'playing' | 'buffering' | 'streamingStateChanged' | 'stop';
```

用于表示播放器事件。



### VideoStreamIndex

```typescript
declare type VideoStreamIndex = 0 | 1 | 2 | 3;
```

表示视频码流。



### PTZAction

```typescript
declare enum PTZAction {
    /** 0(无指令状态) */
    none = 0,
    /** 1（上） */
    mv_up = 1,
    /** 2（左） */
    mv_left = 2,
    /** 3（下） */
    mv_down = 3,
    /** 4（右） */
    mv_right = 4,
    /** 5（巡航左右） */
    cruise_lr = 5,
    /** 6(停止巡航) */
    cruise_stop = 6,
    /** 7(聚焦) */
    focus_in = 7,
    /** 8(散焦) */
    focus_out = 8,
    /** 9(放大) */
    zoom_out = 9,
    /** 10(缩小) */
    zoom_in = 10,
    aperture_small = 11,
    aperture_large = 12,
    light_on = 13,
    light_off = 14,
    /** 15(转至预置位) */
    prepoint_moveto = 15,
    /** 16(设置预置位) */
    prepoint_set = 16,
    /** 17(删除预置位) */
    prepoint_del = 17,
    /** 18(停止) */
    stop = 18,
    /** 19(巡航上下左右) */
    cruise_lfud = 19,
    /** 20(巡航上下) */
    cruise_ud = 20,
    /** 21(预置位轨迹巡航 开启/关闭) */
    cruise_prepoint = 21,
}
```

用于表示云台控制动作。



## YDPlayer 播放器

```typescript
/** YDPlayer 播放器 */
declare interface YDPlayer {
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
     * @param startTime 查询的开始事件
     * @param endTime 查询的结束事件
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
```

表示播放器，是整个库主要的类型，通过创建播放器实例，进行音视频播放、录像回放等操作。



### selectedIndex

```typescript
/**
 * 获取已选择的画面位置
 */
readonly selectedIndex: ScreenIndex | undefined;
```

用于获取已选择的画面位置，当未选择任何画面时，返回undefined。



### .constructor

```typescript
/**
 * 创建 YDPlayer 实例
 * @param container HTML容器元素，例如 div
 * @param options YDPlayer选项
 */
constructor(container: HTMLElement, options?: YDPlayerOptions);
```

构造函数，创建 YDPlayer 实例。

- container：HTML容器元素，例如 div，创建好的播放器将放入改元素位置；
- options：可选选项；
  - 参考：[YDPlayerOptions](#YDPlayerOptions) 
  - screenX、screenY：这2个字段用于指定在播放器内横、纵方向上显示的画面个数；
  - ratio ：该字段用于指定画面的高、宽比例，一般有 0.5625 （9:16）、0.75（3:4）；默认值为0.5625；如果不指定该值，当指定了 container 容器的高度，则将自动根据容器的宽高比计算该值；
  - fitMode：该字段用于指定当播放的视频的尺寸与视频所在画面尺寸不一致时，视频的缩放方式；
    - 参考：[FitMode](#FitMode) 



### setScreens

```typescript
/**
 * 设置画面显示排列
 * @param x X方向上画面个数
 * @param y Y方向上画面个数
 */
setScreens(x: ScreenNumber, y: ScreenNumber): this;
```

 调用该方法可更改播放器显示的画面个数，如果更改的画面个数小于原来的画面个数，多余的画面将被销毁。

- x：X方向上画面个数；
- y：Y方向上画面个数；

播放器最大支持25个画面，即x、y的取值范围为：1 <= x <= 5、1 <= y <= 5。



### openStreaming

```typescript
/**
 * 开启实时音视频流播放
 * @param url 设备媒体URL
 * @param videoStreamIndex 视频码流
 * @param screenIndex 画面位置
 */
openStreaming(url: string, videoStreamIndex?: VideoStreamIndex, screenIndex?: ScreenIndex | AutoScreenIndex): Promise<ScreenIndex>;
```

调用该方法打开实时音视频播放；

- url：设备媒体url，通过云盯平台的接口获取设备列表后得到的设备的mediaSource属性；
  - 参考：[YDUrl](#YDUrl)
  - 如果该设备是多通道，需要在设备的mediaSource属性字符串后附加 “&chn=” + 通道号 后再作为参数传递给给openStreaming等方法，例如1通道附加：”&chn=1“；
  - mediaSource字符串后附加的通道号从0开始；
- videoStreamIndex：视频码流；
  - 参考：[VideoStreamIndex](#VideoStreamIndex)
- screenIndex：画面位置，如果不指定画面位置或指定为自动位置，则自动寻找下一个未进行播放的画面位置进行播放；如果未能找到可用的画面位置则不进行播放；如果指定的画面位置已有正在播放的画面，则先停止原来的播放动作后再进行新的播放；

调用执行成功以后，返回播放画面的位置。



### closeStreaming

```typescript
/**
 * 关闭实时音视频播放
 * @param screenIndex 画面位置
 */
closeStreaming(screenIndex?: ScreenIndex): Promise<void>;
```

调用该方法停止实时音视频播放；

- screenIndex：指定需要停止实时音视频的画面位置，如果指定，则停止当前选中位置的音视频播放；



### closeAllStreaming

```typescript
/**
 * 关闭所有窗口的实时音视频播放
 */
closeAllStreaming(): Promise<unknown[]>;
```

关闭所有窗口的实时音视频播放；



### queryRecords

```typescript
/**
 * 查询录像
 * @param url 设备媒体URL
 * @param startTime 查询的开始事件
 * @param endTime 查询的结束事件
 */
queryRecords(url: string, startTime: Date, endTime: Date): Promise<QueryRecordResult>;
```

根据指定时间条件查询设备端存储的录像文件；

- url：设备媒体url，通过云盯平台的接口获取设备列表后得到的设备的mediaSource属性；
  - 参考：[YDUrl](#YDUrl)
- startTime：查询的开始时间
- endTime：查询的结束时间

调用执行成功以后，返回查询得到的录像信息；

- 参见：[QueryRecordResult](#QueryRecordResult)



### openPlayback

```typescript
/**
 * 开启音视频回放
 * @param url 设备媒体URL
 * @param time 回放的时间
 * @param screenIndex 画面位置
 */
openPlayback(url: string, time: Date, screenIndex?: ScreenIndex | AutoScreenIndex): Promise<ScreenIndex>;
```

根据传入的时间点，回放设备端存储的指定时间的录像。

- url：设备媒体url，通过云盯平台的接口获取设备列表后得到的设备的mediaSource属性；
  - 参考：[YDUrl](#YDUrl)
- time：回放录像的时间点；
- screenIndex：画面位置，不指定或指定为自动位置时，播放器寻找下一可用位置进行回放；



### closePlayback

```typescript
/**
 * 关闭回放
 * @param screenIndex 画面位置
 */
closePlayback(screenIndex?: ScreenIndex): Promise<void>;
```

调用本方法关闭正在进行的回放；

- screenIndex：画面位置，如果不指定画面位置，则停止当前选中画面的回放；



### stop

```typescript
/**
 * 停止
 * @param screenIndex 画面位置
 */
stop(screenIndex?: ScreenIndex): Promise<void>;
```

调用本方法停止正在进行的实时音视频播放或正在进行的录像回放；

- screenIndex：画面位置，如果不指定画面位置，则停止当前选中画面的播放；

可用本方法代替 ```closeStreaming``` 和 ```closePlayback``` 来停止实时音视频和录像回放；



### stopAll

```typescript
/**
 * 停止所有
 */
stopAll(): Promise<unknown[]>;
```

调用本方法停止所有画面正在进行的音视频播放或录像回放；



### toggleAudio

```typescript
/**
 * 切换音频播放（如果有）
 * @param screenIndex 画面位置
 */
toggleAudio(screenIndex?: ScreenIndex): void;
```

切换声音开启或关闭，如果画面支持声音。

- screenIndex：画面位置，如果不指定画面位置，则切换当前选中画面的声音开关；其他画面位置的声音播放将停止；


### mute

```typescript
/**
 * 静音
 */
mute(): void;
```

播放器静音。


### requestFullscreen

```typescript
/**
 * 使指定画面或全部画面全屏显示
 * @param screenIndex 画面位置
 */
requestFullscreen(screenIndex?: ScreenIndex): Promise<void>;
```

调用本方法使指定画面或全部画面全屏显示。

- screenIndex：画面位置，如果不指定画面位置或指定的画面位置无效，则将整个播放器进行全屏显示；



### capture

```typescript
/**
 * 抓图
 * @param screenIndex 画面位置
 */
capture(screenIndex?: ScreenIndex): Promise<CaputureResult>;
```

调用本方法对指定画面进行抓图。

- screenIndex：画面位置，如果不指定画面位置，则对当前选中画面进行抓图；

调用执行成功以后，返回抓图结果；

- 参见：[CaputureResult](#CaputureResult)



### captureAll

```typescript
/**
 * 全部播放画面抓图
 */
captureAll(): Promise<CaputureResult[]>;
```

调用本方法对所有画面进行抓图。

调用执行成功以后，返回抓图结果；

- 参见：[CaputureResult](#CaputureResult)



### controlPtz

```typescript
/**
 * 云台控制
 * @param screenIndex 画面位置
 * @param action 云台动作
 * @param value 参数值
 * @param name 名称（预置位）
 */
controlPtz(screenIndex: ScreenIndex, action: PTZAction, value?: number, name?: string): Promise<void>;
```

调用本方法对设备进行云台控制（如果设备支持云台控制）。

- screenIndex：画面位置（必须指定）；
- action：云台动作
  - 参考：[PTZAction](#PTZAction)
- value：云台控制参数值，例如转动方向时的速度值；
  - 转动方向时速度值：0-10，数值越大转动越快；
- name：名称，例如预置位的名称



### setFitMode

```typescript
/**
 * 视频在视频播放控件中的适应（缩放）模式
 * @param mode 适应模式
 * @param screenIndex 画面位置
 */
setFitMode(mode: FitMode, screenIndex?: ScreenIndex): void;
```

设置视频在视频播放控件中的适应（缩放）模式。

- mode：适应（缩放）模式；
  
  - 参考：[FitMode](#FitMode)
  
- screenIndex：画面位置，默认当前选中画面；



### selectedIndexChanged

*【事件】*

```typescript
/** selectedIndexChanged 事件监听器定义 */
export declare type SelectedIndexChangedListener = (selectedIndex: ScreenIndex, url: YDUrl) => void;
```

当播放器选中的画面发生变化时，触发该事件。

- SelectedIndexChangedListener：事件监听器定义；
  - selectedIndex：被选中的画面位置；
  - url：选中的画面的播放媒体源地址（如果该位置正在进行实时音视频播放或录像回放）；

