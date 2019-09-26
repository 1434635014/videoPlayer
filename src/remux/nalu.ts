
export class NALU {
    static get NDR() { return 1; }
    static get SLICE_PART_A() { return 2; }
    static get SLICE_PART_B() { return 3; }
    static get SLICE_PART_C() { return 4; }
    static get IDR() { return 5; }
    static get SEI() { return 6; }
    static get SPS() { return 7; }
    static get PPS() { return 8; }
    static get DELIMITER() { return 9; }
    static get EOSEQ() { return 10; }
    static get EOSTR() { return 11; }
    static get FILTER() { return 12; }
    static get STAP_A() { return 24; }
    static get STAP_B() { return 25; }
    static get FU_A() { return 28; }
    static get FU_B() { return 29; }

    static get TYPES() {
        return {
            [NALU.IDR]: 'IDR',
            [NALU.SEI]: 'SEI',
            [NALU.SPS]: 'SPS',
            [NALU.PPS]: 'PPS',
            [NALU.NDR]: 'NDR',
        };
    }

    public static type(nalu: NALU) {
        if (nalu.type in NALU.TYPES) {
            return NALU.TYPES[nalu.type];
        } else {
            return 'UNKNOWN';
        }
    }

    public nri: number;
    public type: number;
    public data: Uint8Array;

    public get size(): number { return this.data.byteLength; }
    public get rawData(): Uint8Array { return this.data; }

    constructor(data: Uint8Array) {
        // this.nri = (data[0] & 0x60) >> 5;
        // this.type = data[0] & 0x1f;
        this.nri = (data[4] & 0x60) >> 5;
        this.type = data[4] & 0x1f;
        this.data = data;
    }

    public isKeyframe(): boolean {
        return this.type === NALU.IDR;
    }

    // public getSize(): number {
    //     return 4 + this.data.byteLength;
    // }

    public getData(): Uint8Array {
        const view = new DataView(this.data.buffer, this.data.byteOffset);
        view.setUint32(0, this.size - 4);
        return this.data;
        // const result = new Uint8Array(this.size);
        // const view = new DataView(result.buffer);
        // view.setUint32(0, this.size - 4);
        // result.set(this.data.subarray(4), 4);
        // return result;
    }
}
