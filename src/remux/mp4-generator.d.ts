import { Track } from "./track";

export default class MP4 {
    static moof(sn: number, baseMediaDecodeTime: number, track: Track): Uint8Array;
    static mdat(data: Uint8Array): Uint8Array;

    static initSegment(tracks: Track[], duration: number, timescale: number): Uint8Array;
}