
export interface Track {
    id: number;
    type: 'video' | 'audio';
    len: number;
    codec: string;
    sps?: Uint8Array[];
    pps?: Uint8Array[];
    fragmented: boolean;
    width?: number;
    height?: number;
    timescale: number;
    duration: number;
    samples: TrackSample[];
    channelCount?: number;
    config?: Uint8Array;
}

export interface TrackSample {
    size: number;
    duration: number;
    cts: number;
    flags: {
        isLeading: number,
        isDependedOn: number,
        hasRedundancy: number,
        degradPrio: number,
        isNonSync?: number,
        dependsOn: number,
    }
}
