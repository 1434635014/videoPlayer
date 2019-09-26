export interface Remuxer {
    feed(data: Uint8Array, duration: number): any;
    destroy(): any;

    onInitSegment: ((this: Remuxer, segment: Uint8Array, type: 'video' | 'audio', mimeCodecs: string) => any) | null;
    onMediaSegment: ((this: Remuxer, segment: Uint8Array, dts: number, type: 'video' | 'audio') => any) | null;
}