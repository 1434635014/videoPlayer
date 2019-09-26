import { Encoding } from "../../utils/encoding";
import { Network } from "../protocol";

/**
 * 消息命令号
 */
export enum YDMessageCmd {
    /** Unkown CMD */
    UNKOWN = 0,

    /** 心跳 */
    KEEP_ALIVE = 0x00000A01,
    /**认证 */
    AUTHENTICATE = 0x0000060D,
    /**关闭连接 */
    CLOSE_CONNECTION = 0x0000060F,

    /**请求实时视频 */
    VIDEO_REQ = 0x00000101,
    /**实时视频数据 */
    VIDEO_DATA = 0x00000102,
    /**关闭实时视频 */
    VIDEO_CLOSE = 0x00000103,
    /**强制请求I帧 */
    FORCEIFRAME = 0x00000104,

    /** audio */
    AUDIO_REQ = 0x00000201,
    AUDIO_DATA = 0x00000202,
    AUDIO_CLOSE = 0x00000203,

    /** talk */
    TALK_REQ = 0x00000301,
    TALK_DATA = 0x00000302,
    TALK_CLOSE = 0x00000303,

    /** ptz */
    MOVE_PTZ = 0x00000401,

    /** playback */
    PLAYBACK_QUERY_VIDEO = 0x00000701,
    PLAYBACK_VIDEO_REQ = 0x00000702,
    PLAYBACK_DATA = 0x00000703,
    PLAYBACK_VIDEO_END = 0x00000704,
    PLAYBACK_VIDEO_STOP = 0x00000705,
    PLAYBACK_FILE_DEL = 0x00000706,
    PLAYBACK_FILE_PAUSE = 0x00000707,
    PLAYBACK_FILE_RESUME = 0x00000708,
    PLAYBACK_FILE_STEP = 0x00000709,
    PLAYBACK_SPEED = 0x00000710,
    PLAYBACK_SEEK = 0x00000711,
}

/**
 * 错误枚举
 */
export enum YDMessageError {
    NONE = 0,   /* 无错误 */
    UNDEF = 1,   /* 未定义错误 */
    BUSY = 2,   /* 设备忙 */
    BAD_PARAM = 3,   /* 错误的参数 */
    BAD_FORMAT = 4,   /* 错误的格式 */
    INTERNAL = 5,   /* PU内部错误 */
    UNREG_CMD = 6,   /* 不能识别的指令 */
    MAX_CONNECTION = 7,   /* 最大连接数限制 */
    NOT_LOGIN = 8,   /* 未认证 */
    BAD_USER = 9,   /* 错误的用户名 */
    UNSUPPORT = 10,  /* 不支持的参数，比如对讲格式等 */
    DISK_NOT_EXIST = 11,  /* 存储介质不存在 */
    DISK_FULL = 12,  /* 磁盘满 */
    CHANNEL_USED = 13,  /* 通道忙 */
    CHANNEL_CLOSED = 14,  /* 当前通道是关闭着的 */
    CHANNEL_ERR = 15,  /* 错误的通道号 */
    LENGTH_LIMIT = 16,  /* 协议体长度限制 */
    CMD_MODE_ERR = 17,  /* 指令使用方式错误 */
    SESSION = 18,  /* session错误 */
    /** 请求的码流不支持 */
    STREAMTYPE_NOTSUPPORTED = 0x00000018,
    /** 设备不在线 */
    DEVICE_OFFLINE = 0x00000209,
}

/**
 * V1 消息头
 */
export class YDMessageHeadV1 {
    public cmd: YDMessageCmd;
    public payloadLength: number;
    public error: YDMessageError;

    constructor(cmd: YDMessageCmd, payloadLength: number, error: YDMessageError) {
        this.cmd = cmd;
        this.payloadLength = payloadLength;
        this.error = error;
    }
}

/**
 * v2 消息头
 */
export class YDMessageHeadV2 {
    public cmd: YDMessageCmd;
    public payloadLength: number;
    public error: YDMessageError;
    public session: number;

    constructor(cmd: YDMessageCmd, payloadLength: number, error: YDMessageError, session: number) {
        this.cmd = cmd;
        this.payloadLength = payloadLength;
        this.error = error;
        this.session = session;
    }
}

export class YDSession {
    public id: number;

    constructor(id: number) {
        this.id = id;
    }
}

export interface YDMessage {
    /** head 大小 */
    readonly headSize: number;
    readonly cmd: YDMessageCmd;
    readonly payloadLength: number;
    readonly error: YDMessageError;
    readonly buffer: Uint8Array;
    readonly payload: Uint8Array;
    readonly payloadString: string;

    setHead(cmd: YDMessageCmd, error?: YDMessageError): YDMessage;
    setPayload(payload: Uint8Array | string): YDMessage;
    parseHead(buffer: Uint8Array): boolean;
    reset(): YDMessage;
}

/**
 * 云盯消息
 */
export class YDMessageV1 implements YDMessage {
    private _headSize = 12;
    private _buffer: Uint8Array;
    private _head: YDMessageHeadV1;

    public get headSize(): number { return this._headSize; }

    public get cmd(): YDMessageCmd { return this._head.cmd; }
    public get payloadLength(): number { return this._head.payloadLength; }
    public get error(): YDMessageError { return this._head.error; }
    public get buffer(): Uint8Array { return this._buffer.subarray(0, this._headSize + this._head.payloadLength); }
    public get payload(): Uint8Array { return this._buffer.subarray(this._headSize, this._headSize + this._head.payloadLength); }
    public get payloadString(): string { return Encoding.getUTF8String(this.payload); }

    constructor() {
        this._buffer = new Uint8Array(1 * 1024/* 2 KBytes */);
        this._head = new YDMessageHeadV1(0, 0, 0);
    }

    private _ensureBufferSize(len: number) {
        if (len > this._buffer.length - this._headSize) {
            let size = Math.max(len + this._headSize, this._buffer.length * 2);
            let buffer = new Uint8Array(size);
            buffer.set(this._buffer);
            this._buffer = buffer;
        }
    }

    private _updateBuffer() {
        Network.htonl(this._buffer, 0, this._head.cmd);
        Network.htonl(this._buffer, 4, this._head.payloadLength);
        Network.htonl(this._buffer, 8, this._head.error);
    }

    public setHead(cmd: YDMessageCmd, error?: YDMessageError) {
        this._head.cmd = cmd;
        this._head.error = (error == undefined) ? YDMessageError.NONE : error;
        this._updateBuffer();
        return this;
    }

    public setPayload(payload: Uint8Array | string) {
        let buffer = (typeof payload === "string") ? Encoding.getUTF8Bytes(payload) : payload;
        this._ensureBufferSize(buffer.length);
        this._buffer.set(buffer, this._headSize);
        this._head.payloadLength = buffer.length;
        this._updateBuffer();
        return this;
    }

    public parseHead(buffer: Uint8Array): boolean {
        if (buffer.byteLength < this._headSize)
            return false;
        this._head.cmd = parseCmd(buffer);
        this._head.payloadLength = Network.ntohl(buffer, 4);
        this._head.error = Network.ntohl(buffer, 8);
        return true;
    }

    public reset() {
        this._head.cmd = 0;
        this._head.payloadLength = 0;
        this._head.error = 0;
        this._updateBuffer();
        return this;
    }
}

/**
 * 云盯消息
 */
export class YDMessageV2 implements YDMessage {
    private _headSize = 16;
    private _buffer: Uint8Array;
    private _head: YDMessageHeadV2;

    public get headSize(): number { return this._headSize; }

    public get cmd(): YDMessageCmd { return this._head.cmd; }
    public get payloadLength(): number { return this._head.payloadLength; }
    public get error(): YDMessageError { return this._head.error; }
    public get sessionId(): number { return this._head.session; }
    public get buffer(): Uint8Array { return this._buffer.subarray(0, this._headSize + this._head.payloadLength); }
    public get payload(): Uint8Array { return this._buffer.subarray(this._headSize, this._headSize + this._head.payloadLength); }
    public get payloadString(): string { return Encoding.getUTF8String(this.payload); }

    constructor(session: YDSession) {
        this._buffer = new Uint8Array(2 * 1024/* 2 KBytes */);
        let sessionId = session.id;
        this._head = new YDMessageHeadV2(0, 0, 0, sessionId);
    }

    private _ensureBufferSize(payloadLength: number) {
        if (payloadLength > this._buffer.length - this._headSize) {
            let size = Math.max(payloadLength + this._headSize, this._buffer.length * 2);
            let buffer = new Uint8Array(size);
            buffer.set(this._buffer);
            this._buffer = buffer;
        }
    }

    private _updateBuffer() {
        Network.htonl(this._buffer, 0, this._head.cmd);
        Network.htonl(this._buffer, 4, this._head.payloadLength);
        Network.htonl(this._buffer, 8, this._head.error);
        Network.htonl(this._buffer, 12, this._head.session);
    }

    public setHead(cmd: YDMessageCmd, error?: YDMessageError) {
        this._head.cmd = cmd;
        this._head.error = (error == undefined) ? YDMessageError.NONE : error;
        this._updateBuffer();
        return this;
    }

    public setPayload(payload: Uint8Array | string) {
        let buffer = (typeof payload === "string") ? Encoding.getUTF8Bytes(payload) : payload;
        this._ensureBufferSize(buffer.length);
        this._buffer.set(buffer, this._headSize);
        this._head.payloadLength = buffer.length;
        this._updateBuffer();
        return this;
    }

    public parseHead(buffer: Uint8Array): boolean {
        if (buffer.byteLength < this._headSize)
            return false;
        this._head.cmd = parseCmd(buffer);
        this._head.payloadLength = Network.ntohl(buffer, 4);
        this._head.error = Network.ntohl(buffer, 8);
        this._head.session = Network.ntohl(buffer, 12);
        return true;
    }

    public reset() {
        this._head.cmd = 0;
        this._head.payloadLength = 0;
        this._head.error = 0;
        this._updateBuffer();
        return this;
    }
}

/**解析协议命令号 */
function parseCmd(buffer: Uint8Array): YDMessageCmd {
    if (buffer.length < 4)
        throw new RangeError("too few buffers.");
    return Network.ntohl(buffer, 0) & 0x0000FFFF;
}

