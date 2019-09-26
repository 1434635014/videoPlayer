import { NumberUtils } from "../../utils/number";

export enum FrameType {
    H264_P = 0x00,
    H264_I = 0x01,
    H264_Init = 0x03,
    AUDIO_PCM = 0x05,
    AUDIO_SPEEX = 0x06,
    AUDIO_AAC = 0x07,
    TEXT_OSD = 0x9,
    AUDIO_G711a = 0x0B,
    AUDIO_G711u = 0x0C,
    H265_P = 0x20,
    H265_I = 0x21,
    H265_B = 0x22,
}

export enum VideoEncoding {
    H264 = 1,
    H265 = 4,
    ALL = 5
}

export enum AudioType {
    PCM8 = 0x00,
    AMR = 0x01,
    SPEEX = 0x02,
    ADPCM = 0x03,
    AAC = 0x04,
    G711A = 0x05,
    G711U = 0x06
}

export enum RecordType {
    HAND = 0x01, /* 手动录像 */
    ALARM = 0x02, /* 报警录像 */
    TIMER = 0x04, /* 定时录像 */
    ALL = 0x07
}

export enum PlaybackRequestFrameType {
    All = 0,
    KEY = 1,
    NONE_KEY = 2
}

export class VideoDescription {
    public channel: number = 0;
    public fps: number = 0;
    public encoding: VideoEncoding = VideoEncoding.H264;
    public imageWidth: number = 0;
    public imageHeight: number = 0;
    public gopSize: number = 0;
}

export class AudioDescription {
    public channel: number = 0;
    public type: AudioType = 0;
    public sample: number = 0;
    public audioChannel: number = 0;
}

export class RecordInfo {
    public filename: string;
    public startTime: Date;
    public endTime: Date;
    public recordType: RecordType;

    constructor(fileName: string, startTime: Date, endTime: Date, recordType: RecordType) {
        this.filename = fileName;
        this.startTime = startTime;
        this.endTime = endTime;
        this.recordType = recordType;
    }
}

export class PlaybackDescription {
    public video = { format: 0, fps: 0, weight: 0, height: 0 };
    public audio = { format: 0, channel: 0, sample: 0 }
    public continuousTime: number = 0;
}

export class YDAVPacket {
    public readonly channel: number;
    /** 流类型:1(实时)； 2(预录)； 3(回放) ；4（音频） ；10（未知类型）； */
    public readonly dataType: number;
    public readonly streamIndex: number;
    public readonly frameType: FrameType;
    public readonly timestamp: number;
    public readonly frame: Uint8Array;

    constructor(buffer: Uint8Array) {
        //channel: number, dataType: number, streamIndex: number, frameType: number, timestamp: number
        let channel = NumberUtils.readInt16(buffer, 0);
        let dataType = NumberUtils.readInt16(buffer, 2);
        let streamIndex = NumberUtils.readInt16(buffer, 4);
        let frameType = NumberUtils.readInt16(buffer, 6);
        let timestamp = NumberUtils.readInt64(buffer, 8);

        this.channel = channel;
        this.dataType = dataType;
        this.streamIndex = streamIndex;
        this.frameType = frameType;
        this.timestamp = timestamp;
        this.frame = buffer.subarray(16);
    }
}