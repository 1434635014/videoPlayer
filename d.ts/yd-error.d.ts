/**
 * 错误码
 */
export declare enum YDErrorCode {
    /** 无错误 */
    NONE = 0,
    /** 操作正在进行中，不能进行另一个操作 */
    ACTION_PENDING = 1,
    /** 连接错误 */
    CONNECTION_ERROR = 2,
    /** 连接超时 */
    CONNECTION_TIMEOUT = 3,
    /** 认证错误 */
    AUTH_ERROR = 4,
    /** 协议通信错误，请参考子错误码 */
    MESSAGE_ERROR = 5,
    /** 编码格式不支持 */
    ENCODING_NOT_SUPPORT = 6,
    /**  */
    /** 媒体错误 */
    MEDIA_ERROR = 7,
    /** MS 错误 */
    MEDIASOURCE_ERROR = 8,
    /** 其他错误 */
    UNKOWN_ERROR = 9
}
/**
 * 错误
 */
export default interface YDError {
    /** 错误码 */
    readonly code: YDErrorCode;
    /** 子错误码 */
    readonly subCode: number | undefined;
    /** 消息 */
    readonly message: string | undefined;
    /** 内部错误 */
    readonly innerError: any | undefined;
    /** 详细描述 */
    readonly description: string | undefined;
}
