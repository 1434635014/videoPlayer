import { Remuxer } from './remuxer';
import { Track } from './track';
import { H264Parser } from './h264-parser';
import MP4 from './mp4-generator';
import { NALUParser } from './nalu-parser';
import { NALU } from './nalu';
import { TrackId } from './TrackId';
import { Log } from '../utils/log';

interface VideoSample {
    units: NALU[];
    dts: number;
    duration: number;
    size: number;
    keyFrame: boolean;
}

export class H264Remuxer implements Remuxer {
    private LOG_TAG: string = '[H264Remuxer] > ';
    private videoReadyToDecode: boolean = false;
    private videoSeq: number;
    private nextVideoDts: number = 0;
    private videoDts: number = 0;
    private timescale: number;
    private videoInitialized: boolean = false;

    private frameCount: number = 0;
    private framePerFragment: number;

    public track: Track;
    private videoSamples: VideoSample[];

    public onInitSegment: ((this: Remuxer, segment: Uint8Array, type: 'video' | 'audio', mimeCodecs: string) => any) | null = null;
    public onMediaSegment: ((this: Remuxer, segment: Uint8Array, dts: number, type: 'video' | 'audio') => any) | null = null;

    constructor(framePerFragment: number, timescale: number = 1000) {
        this.videoSeq = 1;
        this.timescale = timescale;
        this.framePerFragment = framePerFragment;

        this.track = {
            id: TrackId.getTrackId(),
            type: 'video',
            len: 0,
            codec: '',
            fragmented: true,
            sps: [],
            pps: [],
            width: 0,
            height: 0,
            timescale: this.timescale,
            duration: this.timescale,
            samples: [],
        };

        this.videoSamples = [];
    }

    public destroy() {
        this.videoReadyToDecode = false;
        this.track.sps = [];
        this.track.pps = [];
        this.videoSamples = [];
    }

    private resetVideoTrack() {
        this.videoReadyToDecode = false;
        this.track.sps = [];
        this.track.pps = [];
    }

    private parseSPS(sps: Uint8Array) {
        var config = H264Parser.readSPS(new Uint8Array(sps));

        this.track.width = config.width;
        this.track.height = config.height;
        this.track.sps = [sps.slice(0)];
        this.track.codec = 'avc1.';

        let codecarray = new DataView(sps.buffer, sps.byteOffset + 1, 4);
        for (let i = 0; i < 3; ++i) {
            var h = codecarray.getUint8(i).toString(16);
            if (h.length < 2) {
                h = '0' + h;
            }
            this.track.codec += h;
        }
    }

    private parsePPS(pps: Uint8Array) {
        this.track.pps = [pps.slice(0)];
    }

    private parseNAL(unit: NALU) {
        if (!unit) return false;

        let push = false;
        switch (unit.type) {
            case NALU.NDR:
                push = true;
                break;
            case NALU.IDR:
                push = true;
                break;
            case NALU.PPS:
                if (!this.track.pps || this.track.pps.length == 0) {
                    this.parsePPS(unit.getData().subarray(4));
                    if (!this.videoReadyToDecode && this.track.pps && this.track.pps.length > 0 && this.track.sps && this.track.sps.length > 0) {
                        this.videoReadyToDecode = true;
                    }
                }
                break;
            case NALU.SPS:
                if (!this.track.sps || this.track.sps.length == 0) {
                    this.parseSPS(unit.getData().subarray(4));
                    if (!this.videoReadyToDecode && this.track.pps && this.track.pps.length > 0 && this.track.sps && this.track.sps.length > 0) {
                        this.videoReadyToDecode = true;
                    }
                }
                break;
            case NALU.DELIMITER:
                Log.debug(this.LOG_TAG, 'DELIMITER - ignoing and disable HD mode for live channel');
                break;
            case NALU.SEI:
                Log.debug(this.LOG_TAG, 'SEI - ignoing');
                break;
            default:
        }
        return push;
    }

    private getPayload(): Uint8Array | undefined {
        if (!this.videoReadyToDecode || !this.videoSamples.length) {
            return undefined;
        }

        let payload = new Uint8Array(this.track.len);
        let offset = 0;
        let video_track_samples = this.track.samples;

        while (this.videoSamples.length > 0) {
            let sample = this.videoSamples.shift();
            if (!sample)
                continue;
            let units = sample.units;
            let duration = sample.duration;
            if (duration <= 0) {
                throw new Error(`remuxer: invalid sample duration at DTS: ${this.nextVideoDts} :${duration}`);
            }
            this.nextVideoDts += duration;
            let mp4Sample = {
                size: sample.size,
                duration: duration,
                cts: 0,
                flags: {
                    isLeading: 0,
                    isDependedOn: 0,
                    hasRedundancy: 0,
                    degradPrio: 0,
                    isNonSync: sample.keyFrame ? 0 : 1,
                    dependsOn: sample.keyFrame ? 2 : 1,
                },
            };
            for (const unit of units) {
                payload.set(unit.getData(), offset);
                offset += unit.size;
            }
            video_track_samples.push(mp4Sample);
        }

        if (!video_track_samples.length)
            return undefined;

        // if (track_samples.length && (!this.nextDts || navigator.userAgent.toLowerCase().indexOf('chrome') > -1)) {
        //     let flags = track_samples[0].flags;
        //     // chrome workaround, mark first sample as being a Random Access Point to avoid sourcebuffer append issue
        //     // https://code.google.com/p/chromium/issues/detail?id=229412
        //     flags.dependsOn = 2;
        //     flags.isNonSync = 0;
        // }

        return payload;
    }

    private fragmentSegment(sequenceNumber: number, baseMediaDecodeTime: number, track: Track, payload: Uint8Array): Uint8Array {
        const moof = MP4.moof(sequenceNumber, baseMediaDecodeTime, track);
        const mdat = MP4.mdat(payload);
        const result = new Uint8Array(moof.byteLength + mdat.byteLength);
        result.set(moof, 0);
        result.set(mdat, moof.byteLength);
        return result;
    }

    private flush() {
        if ((this.frameCount % this.framePerFragment === 0) && this.videoReadyToDecode && this.videoSamples.length > 0) {
            if (!this.videoInitialized) {
                if (this.videoReadyToDecode && this.videoSamples.length > 0) {
                    let segment = MP4.initSegment([this.track], Infinity, this.track.timescale);
                    if (this.onInitSegment != null)
                        this.onInitSegment(segment, 'video', 'video/mp4; codecs="avc1.42E01E"');
                    //debug(`initial segment generated, codec=${this.track.codec}, width=${this.track.width}, height=${this.track.height}, duration=${Infinity}, timescale=${this.track.timescale}`);
                    this.videoInitialized = true;
                }
            }

            if (this.videoInitialized) {
                let dts = this.videoDts;
                let payload = this.getPayload();
                if (payload && payload.byteLength) {
                    this.videoDts = this.nextVideoDts;
                    //debug
                    let duration = 0;
                    for (let i = 0, len = this.track.samples.length; i < len; i++) {
                        duration += this.track.samples[i].duration;
                    }
                    //debug(`media segment generated, video=${this.videoSeq}, dts=${dts}, duration=${duration}, frames=${this.track.samples.length}, data size=${payload.byteLength}`);
                    //end debug
                    let segment = this.fragmentSegment(this.videoSeq, dts, this.track, payload);
                    if (this.onMediaSegment != null)
                        this.onMediaSegment(segment, dts, 'video');

                    this.videoSeq++;
                    this.track.len = 0;
                    this.track.samples = [];
                }
                else {
                    throw new Error(`Nothing payload!`);
                }
            }
        }
    }

    public remux(nalus: NALU[], duration: number) {
        let units: NALU[] = [];
        let size = 0;
        let keyFrame = false;
        for (let unit of nalus) {
            if (this.parseNAL(unit)) {
                units.push(unit);
                size += unit.size;
                if (!keyFrame) {
                    keyFrame = unit.isKeyframe();
                }
                this.frameCount++;
            }
        }

        if (units.length > 0 && this.videoReadyToDecode) {
            this.track.len += size;
            this.videoSamples.push({
                units: units,
                size: size,
                dts: 0,
                keyFrame: keyFrame,
                duration: duration,
            });
        }
    }

    public feed(data: Uint8Array, duration: number) {
        let nalus = NALUParser.extractNALU(data);
        this.remux(nalus, duration);
        this.flush();
    }
}