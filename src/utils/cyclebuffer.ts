export class CycleBuffer {
    private _capacity: number;
    private _front: number;
    private _back: number;
    private _length: number;
    private _buffer: Uint8Array;

    public get length(): number {
        return this._length;
    }

    constructor(capacity: number) {
        this._capacity = capacity;
        this._front = 0;
        this._back = 0;
        this._length = 0;
        this._buffer = new Uint8Array(capacity);
    }

    push(data: Uint8Array): void {
        var len = data.byteLength;
        var capacity = this._capacity;
        var front = this._front;
        var back = this._back;
        if (this._length + len > capacity) {
            debugger;
            throw 'buffer is full.';
        }
        if (front + len < capacity) {
            this._buffer.set(data, front);
            this._front = front + len;
        }
        else {
            var len1 = capacity - front;
            var s1 = data.slice(0, len1);
            var len2 = len - len1;
            var s2 = data.slice(len1, len1 + len2);
            this._buffer.set(s1, front);
            this._buffer.set(s2, 0);
            this._front = len2;
        }
        this._length += len;
    };

    pop(len: number): Uint8Array {
        var capacity = this._capacity;
        var front = this._front;
        var back = this._back;

        if (len > this._length) {
            debugger;
            throw 'the buffer is not enough element for pop.';
        }
        var end = front > back ? front : capacity;
        if (back + len <= end) {
            this._back += len;
            this._length -= len;
            return this._buffer.slice(back, len + back);
        }
        else {
            var len1 = capacity - back;
            var s1 = this._buffer.slice(back, len1 + back);
            var len2 = len - len1;
            var s2 = this._buffer.slice(0, len2);
            var result = new Uint8Array(len);
            result.set(s1, 0);
            result.set(s2, len1);
            this._back = (back + len) % capacity;
            this._length -= len;
            return result;
        }
    }
}
