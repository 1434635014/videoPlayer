"use strict";

var H264Player = require('h264-converter').default;
var url = require('url');

function CycleBuffer(capacity) {
    this._capacity = capacity;
    this._front = 0;
    this._back = 0;
    this.length = 0;
    this._buffer = new Uint8Array(capacity);
}

CycleBuffer.prototype.push = function (uint8Array) {
    var len = uint8Array.byteLength;
    var capacity = this._capacity;
    var buffer = this._buffer;
    var front = this._front;
    var back = this._back;
    if (this.length + len > capacity) {
        debugger;
        throw 'buffer is full.';
    }
    if (front + len < capacity) {
        buffer.set(uint8Array, front);
        this._front = front + len;
    }
    else {
        var len1 = capacity - front;
        var s1 = uint8Array.slice(0, len1);
        var len2 = len - len1;
        var s2 = uint8Array.slice(len1, len1 + len2);
        buffer.set(s1, front);
        buffer.set(s2, 0);
        this._front = len2;
    }
    this.length += len;
};

CycleBuffer.prototype.pop = function (len) {
    var capacity = this._capacity;
    var buffer = this._buffer;
    var front = this._front;
    var back = this._back;

    if (len > this.length) {
        debugger;
        throw 'the buffer is not enough element for pop.';
    }
    var end = front > back ? front : capacity;
    if (back + len <= end) {
        this._back += len;
        this.length -= len;
        return buffer.slice(back, len + back);
    }
    else {
        var len1 = capacity - back;
        var s1 = buffer.slice(back, len1 + back);
        var len2 = len - len1;
        var s2 = buffer.slice(0, len2);
        var result = new Uint8Array(len);
        result.set(s1, 0);
        result.set(s2, len1);
        this._back = (back + len) % capacity;
        this.length -= len;
        return result;
    }
}


/**
 * Convert a 32-bit quantity (long integer) from host byte order to network byte order (Little-Endian to Big-Endian).
 *
 * @param {Array|Buffer} b Array of octets or a nodejs Buffer
 * @param {number} i Zero-based index at which to write into b
 * @param {number} v Value to convert
 */
function htonl(b, i, v) {
    b[i] = (0xff & (v >> 24));
    b[i + 1] = (0xff & (v >> 16));
    b[i + 2] = (0xff & (v >> 8));
    b[i + 3] = (0xff & (v));
};

/**
 * Convert a 32-bit quantity (long integer) from network byte order to host byte order (Big-Endian to Little-Endian).
 *
 * @param {Array|Buffer} b Array of octets or a nodejs Buffer to read value from
 * @param {number} i Zero-based index at which to read from b
 * @returns {number}
 */
function ntohl(b, i) {
    return ((0xff & b[i]) << 24) |
        ((0xff & b[i + 1]) << 16) |
        ((0xff & b[i + 2]) << 8) |
        ((0xff & b[i + 3]));
};

function toInt16(b, i) {
    return ((0xff & b[i])) | ((0xff & b[i + 1]) << 8);
}

function toInt32(b, i) {
    return ((0xff & b[i])) | ((0xff & b[i + 1]) << 8) | ((0xff & b[i + 2]) << 16) | ((0xff & b[i + 3]) * 16777216);
}

function toInt64(b, i) {
    var i1 = ((0xff & b[i])) | ((0xff & b[i + 1]) << 8) | ((0xff & b[i + 2]) << 16) | ((0xff & b[i + 3]) * 16777216);
    var i2 = ((0xff & b[i + 4])) | ((0xff & b[i + 5]) << 8) | ((0xff & b[i + 6]) << 16) | ((0xff & b[i + 7]) * 16777216);
    return i1 + (i2 * 4294967296);
}

function getUTF8Bytes(string) {
    if (!("TextEncoder" in window))
        throw ("Sorry, this browser does not support TextEncoder...");
    var enc = new TextEncoder();    // always utf-8
    return enc.encode(string);
};

function getUTF8String(uint8Array) {
    if (!("TextDecoder" in window))
        throw ("Sorry, this browser does not support TextDecoder...");
    var enc = new TextDecoder("utf-8");
    return enc.decode(uint8Array);
}

function concatBuffer(uint8Array1, uint8Array2) {
    var result = new Uint8Array(uint8Array1.byteLength + uint8Array2.byteLength);
    result.set(uint8Array1, 0);
    result.set(uint8Array2, uint8Array1.byteLength);
    return result;
}

function buf2hex(uint8Array) {
    var arr = [];
    for (var i = 0; i < uint8Array.byteLength; i++) {
        arr.push(uint8Array[i].toString(16).padStart(2, '0'));
    }
    return arr.join(' ');
    // return Array.prototype.map.call(uint8Array, function (x) {
    //     return ('00' + x.toString(16)).slice(-2);
    // }).join(' ');
}

Date.prototype.format = function (fmt) {
    var o = {
        "M+": this.getMonth() + 1, //月份         
        "d+": this.getDate(), //日         
        "h+": this.getHours(), //小时         
        "H+": this.getHours(), //小时         
        "m+": this.getMinutes(), //分         
        "s+": this.getSeconds(), //秒         
        "q+": Math.floor((this.getMonth() + 3) / 3), //季度         
        "S": this.getMilliseconds() //毫秒         
    };
    var week = {
        "0": "/u65e5",
        "1": "/u4e00",
        "2": "/u4e8c",
        "3": "/u4e09",
        "4": "/u56db",
        "5": "/u4e94",
        "6": "/u516d"
    };
    if (/(y+)/.test(fmt)) {
        fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
    }
    if (/(E+)/.test(fmt)) {
        fmt = fmt.replace(RegExp.$1, ((RegExp.$1.length > 1) ? (RegExp.$1.length > 2 ? "/u661f/u671f" : "/u5468") : "") + week[this.getDay() + ""]);
    }
    for (var k in o) {
        if (new RegExp("(" + k + ")").test(fmt)) {
            fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
        }
    }
    return fmt;
}

/********************************************************************************************************************************************************* */

//import VideoConverter from 'h264-converter';
// var VideoConverter;
// import('/h264-converter/dist/index.js').then((m) => {
//     VideoConverter = m;
// });

var _videoElement = document.getElementById('video');
var _h264Player;

var ws;
var logsElement = document.getElementById('logs');
var recvMsgElemet = document.getElementById('recv');
var logs = '';
var _session = 0;
var _connected = false;
var _auth = false;
var _heartbeatTimer;

var _buffer = new CycleBuffer(8 * 1024 * 1024);

var _continuous = false;
var _lastHeader = {};
var _lastBody;

var _fps = 15;

function openConnection(serverAddress) {
    if (!serverAddress) {
        Log('input ws server address.');
        return;
    }

    if (_connected) {
        Log('ws is connected.');
        return;
    }

    ws = new WebSocket(serverAddress);

    ws.binaryType = "arraybuffer";
    ws.onopen = function () {
        if (_heartbeatTimer) clearInterval(_heartbeatTimer);
        _connected = true;
        _auth = false;
        Log("ws onnected.");
    }

    ws.onmessage = function (e) {
        _buffer.push(new Uint8Array(e.data));
        onReceivedMessage();
    }

    ws.onclose = function () {
        if (_heartbeatTimer) clearInterval(_heartbeatTimer);
        _session = 0;
        _connected = false;
        _auth = false;
        Log("ws connection is closed...");
    }

    ws.onerror = function (e) {
        console.log(e);
        Log(e);
    }
}

function closeConnection() {
    if (ws) {
        ws.close();
    }
}

function sendMsg(msgId, content) {
    if (!ws || !_connected) {
        Log('websocket is not connected.');
        return;
    }

    if (!_auth && (msgId != 0x0000060D)) {
        Log('pu is not auth.');
        return;
    }

    var msgIdValue = parseInt(msgId);
    //var auth = getUTF8Bytes('<?xml version="1.0" encoding="utf-8" ?><Message><Authentication>f8f4ab75564976722aaa05a9dd3f8a12</Authentication><Time>20190419113650</Time><Type>1</Type><Sn>D833517801549</Sn><Ver>2.0</Ver></Message>');
    var body = getUTF8Bytes(content);
    var bodyLen = body.byteLength;

    var headerLen = _session ? 16 : 12;
    var headerBuf = new ArrayBuffer(headerLen);
    var header = new Uint8Array(headerBuf);
    htonl(header, 0, msgIdValue);
    htonl(header, 4, bodyLen);
    if (headerLen >= 16)
        htonl(header, 12, _session);

    var message = concatBuffer(header, body);

    Log(`send message, msgId: ${msgIdValue}, bodyLength: ${bodyLen}, session: ${_session}, content: ${content}`);
    ws.send(message.buffer);
}

function readHeader() {
    if (_buffer.length > 12) {
        var headerLen = 12;
        var msgIdBuf = _buffer.pop(4);
        var msgId = ntohl(msgIdBuf, 0) & 0x0000FFFF;
        //auth message, msgHeader is 12 bytes
        if (msgId == 0x0000060D) {
            headerLen = 12;
        }
        else {
            headerLen = 16;
        }
        var header = new Uint8Array(headerLen);
        header.set(msgIdBuf, 0);
        header.set(_buffer.pop(headerLen - 4), 4);
        var msgLen = ntohl(header, 4);
        var msgErr = ntohl(header, 8);
        if (headerLen >= 16) {
            var session = ntohl(header, 12);
            if (session != _session)
                console.log('sessionId is not matched.');
        }
        _lastHeader['msgId'] = msgId;
        _lastHeader['msgLen'] = msgLen;
        _lastHeader['msgErr'] = msgErr;
        _lastHeader['session'] = _session;
        if (_logMsgHeader)
            Log(`recv message header, msgId: ${msgId}, msgLen: ${msgLen}, msgErr: ${msgErr}, Session: ${_session}`);
        document.getElementById('recvMsg').value = `msgId: ${msgId}, msgLen: ${msgLen}, msgErr: ${msgErr}, Session: ${_session}`;
        //auth message, auth
        if (msgId == 0x0000060D && msgErr == 0) {
            _session = parseInt(Math.random() * 10000);
            _auth = true;
            if (_heartbeatTimer) clearInterval(_heartbeatTimer);
            _heartbeatTimer = setInterval(writeHeartbeat, 10 * 1000);
        }
        return true;
    }

    return false;
}

function readBody(msgLen) {
    if (msgLen <= 0)
        throw 'msgLen must >0.'
    if (_buffer.length >= msgLen) {
        _lastBody = _buffer.pop(msgLen);
        if (_logMsgBody)
            Log(`recv message body, length: ${msgLen}, buffer length: ${_buffer.length}`);
        return true;
    }
    return false;
}

function onReceivedMessage() {
    while (_continuous || _buffer.length >= 12) {
        if (!_continuous) {
            //接收header
            if (readHeader()) {
                //设置是否需要接收BODY
                if (_lastHeader.msgLen > 0)
                    _continuous = true;
                else
                    showMessage('');
            }
            else {
                break;
            }
        }

        if (_continuous) {
            if (readBody(_lastHeader.msgLen)) {
                _continuous = false;
                var bodyString;
                var buf = _lastBody;
                var msgId = _lastHeader.msgId;
                if (msgId == 0x00000102 || msgId == 0x00010102 || msgId == 0x00000202 || msgId == 0x00000302) {
                    onVideoData(buf);
                }
                else {
                    bodyString = getUTF8String(buf);
                    if (msgId == 0x00000101) {   //open video
                        onOpenVideo(bodyString);
                    }
                    showMessage(bodyString);
                    console.log('recv message body: ' + bodyString);
                }
            }
            else {
                break;
            }
        }
    }
}

function showMessage(msgBody) {
    recvMsgElemet.value = msgBody;
}

function onOpenVideo(msgBody) {
    // parse msgbody
    var parser = new DOMParser();
    var xmlDoc = parser.parseFromString(msgBody, 'text/xml');
    var videoEl = xmlDoc.getElementsByTagName('Video');
    if (videoEl && videoEl.length > 0) {
        _fps = parseInt(videoEl[0].getAttribute('Fps'));
    }
    _h264Player = new H264Player(_videoElement, _fps, parseInt(_fps / 2));
    _initedFirstFrame = false;
}

var _firstFrameTime = new Date();
var _lastTimestamp = 0;
var _frameCount = 0;
var _initedFirstFrame = false;
var _lastRecvTime = new Date().getTime();
function onVideoData(buf) {
    if (!_initedFirstFrame) {
        _firstFrameTime = new Date();
        _frameCount = 0;
        _h264Player.play();
        _initedFirstFrame = true;
        _lastRecvTime = new Date().getTime();
    }

    var ts = toInt64(buf, 8);
    var interval = _lastTimestamp > 0 ? ts - _lastTimestamp : 0;
    var thisRecvTime = new Date().getTime();
    var recvInterval = _lastRecvTime > 0 ? thisRecvTime - _lastRecvTime : 0;
    _frameCount++;
    var now = new Date();
    var fps = Math.round(_frameCount * 1000 / (now - _firstFrameTime) * 100) / 100;
    if (recvInterval > 100 || _logVideoFrame) {
        Log(`video frame, frameIndex: ${_frameCount}, chn: ${toInt16(buf, 0)}, streamType: ${toInt16(buf, 2)}, streamIndex: ${toInt16(buf, 4)}, frameType: ${toInt16(buf, 6)}, timestamp: ${ts}, frameSize: ${buf.byteLength - 16}, recvInterval: ${recvInterval}, interval: ${interval}, fps: ${fps}, expectFps: ${_fps}`);
    }
    _lastTimestamp = ts;
    _lastRecvTime = thisRecvTime;

    var frame = buf.slice(16);

    //append frame
    onVideoFrame(frame);

    //show raw hex data
    showMessage(buf2hex(frame));
}

function onVideoFrame(uint8Array) {
    _h264Player.appendRawData(uint8Array);
}

function onVideoClosed() {

}

function writeHeartbeat() {
    sendMsg(0x00000A01, '');
}

function Log(log) {
    logs = '[' + new Date().format('hh:mm:ss.S') + '] ' + log + '\r\n' + logs;
    if (logs.length > 128 * 1024)
        logs = logs.substring(0, 64 * 1024);
    logsElement.value = logs;
}

/********************************************************************************************************** */

function writeMsg() {
    var msgId = document.getElementById('msgId').value;
    var content = document.getElementById('msgBody').value;
    sendMsg(msgId, content);
}

document.getElementById('btnConnect').addEventListener('click', function () {
    var serverAddress = document.getElementById('server').value;
    openConnection(serverAddress);
});
document.getElementById('btnDisconnect').addEventListener('click', function () {
    closeConnection();
});
document.getElementById('btnSendMsg').addEventListener('click', function () {
    writeMsg();
});

document.getElementById('btnAuth').addEventListener('click', function () {
    var current_url = url.parse(document.getElementById('server').value);
    var searchParams = new URLSearchParams(current_url.search);
    var sn = searchParams.get('sn');
    var msgAuth = document.getElementById('msgAuth').value;
    msgAuth = msgAuth.replace('{sn}', sn);

    document.getElementById('msgId').value = '0x0000060D';
    document.getElementById('msgBody').value = msgAuth;
    writeMsg();
});

document.getElementById('btnHeartbeat').addEventListener('click', function () {
    document.getElementById('msgId').value = '0x00000A01';
    document.getElementById('msgBody').value = '';
    writeMsg();
});

document.getElementById('btnOpenVideo').addEventListener('click', function () {
    var msgOpenVideo = document.getElementById('msgOpenVideo').value;
    var current_url = url.parse(document.getElementById('server').value);
    var searchParams = new URLSearchParams(current_url.search);
    var chn = searchParams.get('chn');
    msgOpenVideo = msgOpenVideo.replace('{channel}', chn);

    document.getElementById('msgId').value = '0x00000101';
    document.getElementById('msgBody').value = msgOpenVideo;
    writeMsg();
});

document.getElementById('btnCloseVideo').addEventListener('click', function () {
    document.getElementById('msgId').value = '0x00000103';
    document.getElementById('msgBody').value = '';
    writeMsg();
});

var _logMsgHeader, _logMsgBody, _logVideoFrame;
document.getElementById('logMsgHeader').addEventListener('change', function () {
    _logMsgHeader = this.checked;
});
document.getElementById('logMsgBody').addEventListener('change', function () {
    _logMsgBody = this.checked;
});
document.getElementById('logVideoFrame').addEventListener('change', function () {
    _logVideoFrame = this.checked;
});