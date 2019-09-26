import { Log } from '../utils/log';

/**
 * 错误码
 */
export enum YDErrorCode {
    /** 无错误 */
    NONE,

    /** 操作正在进行中，不能进行另一个操作 */
    ACTION_PENDING,

    /** 连接已关闭 */
    CONNECTION_CLOSED,
    /** 连接错误 */
    CONNECTION_ERROR,
    /** 连接超时 */
    CONNECTION_TIMEOUT,
    /** 认证错误 */
    AUTH_ERROR,
    /** 协议通信错误，请参考子错误码 */
    MESSAGE_ERROR,

    /** 编码格式不支持 */
    ENCODING_NOT_SUPPORT,

    /**  */

    /** 媒体错误 */
    MEDIA_ERROR,
    /** MS 错误 */
    MEDIASOURCE_ERROR,

    /** 其他错误 */
    UNKOWN_ERROR,
}

/**
 * 错误
 */
export default class YDError {
    /** 错误码 */
    public readonly code: YDErrorCode;
    /** 子错误码 */
    public readonly subCode: number | undefined;
    /** 消息 */
    public readonly message: string | undefined;
    /** 内部错误 */
    public readonly innerError: any | undefined;
    /** 详细描述 */
    public readonly description: string | undefined;

    /**
     * 创建错误实例
     * @param code 错误码
     * @param subCode 子错误码
     * @param message 消息
     * @param innerError 内部错误
     * @param description 详细描述
     */
    constructor(code: YDErrorCode = YDErrorCode.NONE, message?: string, subCode?: number, innerError?: any, description?: string) {
        this.code = code;
        this.subCode = subCode;
        this.message = message;
        this.innerError = innerError;
        this.description = description;
    }

    public toString(): string {
        if (this.description) {
            return this.description;
        }
        else if (typeof this.message === 'string') {
            return this.message;
        }
        else {
            return `${this}`;
        }
    }
}

export function yderror(code: YDErrorCode = YDErrorCode.NONE, message?: string, subCode?: number, innerError?: any, description?: string) {
    const error = new YDError(code, message, subCode, innerError, description);
    return error;
}

export function ydmessageerror(message?: string, innerError?: string) {
    return yderror(YDErrorCode.MESSAGE_ERROR, message, undefined, innerError);
}