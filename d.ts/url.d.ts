/// <reference types="node" />

/** YDUrl */
export declare interface YDUrl {
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
