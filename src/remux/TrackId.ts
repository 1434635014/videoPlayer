let trackId = 1;

export class TrackId {
    public static getTrackId() {
        return trackId++;
    }
}