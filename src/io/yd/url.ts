import { ArgumentNullError } from "../../utils/error";

export class YDUrl {
    private _url: URL;
    private _originalString: string;
    private _sn: string;
    private _channel: number;
    private _auth: { token: string, timestamp: string } = { token: "", timestamp: "" };

    public get originalString(): string { return this._originalString; }
    public get searchParams(): URLSearchParams { return this._url.searchParams; }
    public get protocol(): string { return this._url.protocol; }
    public get hostname(): string { return this._url.hostname; }
    public get host(): string { return this._url.host; }
    public get port(): string { return this._url.port; }
    public get pathname(): string { return this._url.pathname; }
    public get username(): string { return this._url.username; }
    public get password(): string { return this._url.password; }
    public get sn(): string { return this._sn; }
    public get channel(): number { return this._channel; }
    public get auth() { return this._auth; }

    /**
     * 初始化Url对象实例。
     * @param url 连接url，类似：ws://<host>:<port>/?sn=<sn>&chn=<chn>&auth_token=<auth_token>&auth_ts=<auth_ts>
     * @param base 
     */
    constructor(url: string, base?: string | URL) {
        if (url == null || url.length < 1)
            throw new ArgumentNullError("url is null or empty");
        this._originalString = url;
        if (base)
            this._url = new URL(url, base);
        else
            this._url = new URL(url);   //fix safari “Typed Error”
        let searchParams = this._url.searchParams;
        let sn = searchParams.get("sn");
        let chn = searchParams.get("chn") || searchParams.get("channel");
        let authToken = this.username || searchParams.get("auth_token");
        let authTs = this.password || searchParams.get("auth_ts");
        if (sn == null || sn.length < 1)
            throw new ArgumentNullError("sn is null or empty.");
        if (authToken == null || authToken.length < 1)
            throw new ArgumentNullError("authToken is null or empty.");
        if (authTs == null || authTs.length < 1)
            throw new ArgumentNullError("authTs is null or empty.");
        this._sn = sn;
        this._channel = chn ? parseInt(chn) : 0;
        this._auth.token = authToken;
        this._auth.timestamp = authTs;
    }

    public toString(): string {
        return this._originalString;
    }
}