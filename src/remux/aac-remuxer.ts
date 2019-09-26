import { Remuxer } from './remuxer';
import { Track } from './track';
import MP4 from './mp4-generator';
import { AACParser } from './aac-parser';
import { TrackId } from './TrackId';
import { Log } from '../utils/log';

// tslint:disable:no-bitwise

interface AudioSample {
    units: Uint8Array;
    dts: number;
    duration: number;
    size: number;
}

export class AACRemuxer implements Remuxer {
    private LOG_TAG: string = '[AACRemuxer] > ';
    private frameCount: number = 0;
    private framePerFragment: number;
    private timescale: number = 1000;

    private audioSeq: number;
    private audioInitialized: boolean = false;
    private audioReadyToDecode: boolean = false;
    private audioDts: number = 0;
    private nextAudioDts: number = 0;

    private audioTrack: Track;
    private audioSamples: AudioSample[];

    public onready: ((this: Remuxer) => any) | null = null;
    public onInitSegment: ((this: Remuxer, segment: Uint8Array, type: 'video' | 'audio', mimeCodecs: string) => any) | null = null;
    public onMediaSegment: ((this: Remuxer, segment: Uint8Array, dts: number, type: 'video' | 'audio') => any) | null = null;

    constructor(framePerFragment: number, timescale: number = 1000) {
        this.framePerFragment = framePerFragment;
        this.timescale = timescale;

        this.audioTrack = {
            id: TrackId.getTrackId(),
            type: 'audio',
            channelCount: 0,
            len: 0,
            fragmented: true,
            timescale: this.timescale,
            duration: this.timescale,
            samples: [],
            codec: '',
        };

        this.audioSeq = 1;
        this.audioSamples = [];
    }

    private setAACConfig() {
        let objectType,
            sampleIndex,
            channelCount,
            config = new Uint8Array(2),
            headerData = AACParser.getAACHeaderData;

        if (!headerData) return;

        objectType = ((headerData[2] & 0xC0) >>> 6) + 1;
        sampleIndex = ((headerData[2] & 0x3C) >>> 2);
        channelCount = ((headerData[2] & 0x01) << 2);
        channelCount |= ((headerData[3] & 0xC0) >>> 6);

        /* refer to http://wiki.multimedia.cx/index.php?title=MPEG-4_Audio#Audio_Specific_Config */
        config[0] = objectType << 3;
        config[0] |= (sampleIndex & 0x0E) >> 1;
        config[1] |= (sampleIndex & 0x01) << 7;
        config[1] |= channelCount << 3;

        this.audioTrack.codec = 'mp4a.40.' + objectType;
        this.audioTrack.channelCount = channelCount;
        this.audioTrack.config = config;
        this.audioReadyToDecode = true;
    }

    private reset() {
        this.audioReadyToDecode = false;
        this.audioTrack.codec = '';
        this.audioTrack.channelCount = 0;
        this.audioTrack.config = undefined;
        this.audioTrack.timescale = this.timescale;
    }

    private fragmentSegment(sequenceNumber: number, baseMediaDecodeTime: number, track: Track, payload: Uint8Array): Uint8Array {
        const moof = MP4.moof(sequenceNumber, baseMediaDecodeTime, track);
        const mdat = MP4.mdat(payload);
        const result = new Uint8Array(moof.byteLength + mdat.byteLength);
        result.set(moof, 0);
        result.set(mdat, moof.byteLength);
        return result;
    }

    private flush(): void {
        if (((this.frameCount % this.framePerFragment) === 0) && this.audioReadyToDecode && this.audioSamples.length > 0) {
            if (!this.audioInitialized) {
                if (this.audioReadyToDecode && this.audioSamples.length > 0) {
                    let segment = MP4.initSegment([this.audioTrack], Infinity, this.audioTrack.timescale);
                    if (this.onInitSegment != null)
                        this.onInitSegment(segment, 'audio', 'audio/mp4; codecs="mp4a.40.2"');
                    //debug(`Initial segment generated, codec=${this.audioTrack.codec}, width=${this.audioTrack.width}, height=${this.audioTrack.height}, duration=${Infinity}, timescale=${this.audioTrack.timescale}`);
                    this.audioInitialized = true;
                }
            }

            if (this.audioInitialized) {
                let dts = this.audioDts;
                let payload = this.getPayload();
                if (payload && payload.byteLength) {
                    this.audioDts = this.nextAudioDts;
                    //debug
                    let duration = 0;
                    for (let i = 0, len = this.audioTrack.samples.length; i < len; i++) {
                        duration += this.audioTrack.samples[i].duration;
                    }
                    //debug(`media segment generated, audio=${this.audioSeq}, dts=${dts}, duration=${duration}, frames=${this.audioTrack.samples.length}, data size=${payload.byteLength}`);
                    //end debug
                    let segment = this.fragmentSegment(this.audioSeq, dts, this.audioTrack, payload);
                    if (this.onMediaSegment != null)
                        this.onMediaSegment(segment, dts, 'audio');

                    this.audioSeq++;
                    this.audioTrack.len = 0;
                    this.audioTrack.samples = [];
                }
                else {
                    throw new Error(`Nothing payload!`);
                }
            }
        }
    }

    private getPayload(): Uint8Array | undefined {
        if (!this.audioReadyToDecode || !this.audioSamples.length) {
            return undefined;
        }

        let payload = new Uint8Array(this.audioTrack.len);
        let offset = 0;
        let samples = this.audioTrack.samples;
        let mp4Sample, duration;

        this.audioDts = this.nextAudioDts;

        while (this.audioSamples.length) {
            let sample = this.audioSamples.shift();
            if (!sample)
                continue;
            duration = sample.duration;
            if (duration <= 0) {
                Log.debug(this.LOG_TAG, `remuxer: invalid sample duration at DTS: ${this.nextAudioDts} :${duration}`);
                this.audioTrack.len -= sample.size;
                continue;
            }
            this.nextAudioDts += duration;
            mp4Sample = {
                size: sample.size,
                duration: duration,
                cts: 0,
                flags: {
                    isLeading: 0,
                    isDependedOn: 0,
                    hasRedundancy: 0,
                    degradPrio: 0,
                    dependsOn: 1,
                },
            };
            payload.set(sample.units, offset);
            offset += sample.size;
            samples.push(mp4Sample);
        }

        if (!samples.length)
            return undefined;

        return payload;
    }

    public remux(data: Uint8Array, duration: number) {
        let size = data.byteLength;
        this.audioSamples.push({
            units: data,
            dts: 0,
            size: size,
            duration: duration,
        });
        this.audioTrack.len += size;
        this.frameCount++;
        if (!this.audioReadyToDecode) {
            this.setAACConfig();
        }
    }

    public feed(data: Uint8Array, duration: number) {
        let units = AACParser.extractAAC(data);
        for (let unit of units) {
            this.remux(unit, duration);
        }
        this.flush();
    }

    public destroy() {
        this.reset();
    }
}
