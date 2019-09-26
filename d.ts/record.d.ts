/// <reference types="node" />

/** 
 * 录像类型
 */
export declare enum RecordType {
    /** 手动录像 */
    HAND = 1,
    /** 报警类型 */
    ALARM = 2,
    /** 定时录像 */
    TIMER = 4,
    /** 全部 */
    ALL = 7
}

/**
 * 录像信息
 */
export declare interface RecordInfo {
    /** 文件名 */
    readonly filename: string;
    /** 开始时间 */
    readonly startTime: Date;
    /** 结束时间 */
    readonly endTime: Date;
    /** 录像类型 */
    readonly recordType: RecordType;
}