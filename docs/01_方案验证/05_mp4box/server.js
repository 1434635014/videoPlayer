var ws_module = require('ws');
var net = require('net');
var url = require('url');
var path = require('path');
var express = require('express');
var app = express();

app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname, '/index.html'));
});
console.log('http listening on *:3000');
app.listen(3000);

var wsMask = false;

function initSocketCallbacks(state, ws, s) {

    function flushSocketBuffer() {
        if (state.sBuffer.length > 0) {
            s.write(Buffer.concat(state.sBuffer));
        }
        state.sBuffer = null;
    };

    function flushWebsocketBuffer() {
        if (state.wsBuffer.length > 0) {
            ws.send(Buffer.concat(state.wsBuffer), { binary: true, mask: wsMask });
        }
        state.wsBuffer = null;
    };

    s.on('close', function (had_error) {
        console.log('tcp closed.');
        ws.removeAllListeners('close');
        ws.close();
    });

    ws.on('close', function () {
        console.log('ws closed.');
        s.removeAllListeners('close');
        s.end();
    });

    ws.on('error', function (e) {
        console.log('websocket error');
        console.log(e);
        ws.removeAllListeners('close');
        s.removeAllListeners('close');
        ws.close();
        s.end();
    });

    s.on('error', function (e) {
        console.log('socket error');
        console.log(e);
        ws.removeAllListeners('close');
        s.removeAllListeners('close');
        ws.close();
        s.end();
    });

    s.on('connect', function () {
        console.log('tcp connected.');
        state.sReady = true;
        flushSocketBuffer();
    });

    ws.on('open', function () {
        console.log('ws opened.');
        state.wsReady = true;
        flushWebsocketBuffer();
    });

    s.on('data', function (data) {
        console.log('recv buffer from socket, length: ' + data.length);
        if (!state.wsReady) {
            state.wsBuffer.push(data);
        } else {
            ws.send(data, { binary: true, mask: wsMask });
            console.log('send buffer to ws, length: ' + data.length);
        }
    });

    ws.on('message', function (m, flags) {

        console.log('recv buffer from ws, length: ' + m.length);
        if (!state.sReady) {
            state.sBuffer.push(m);
        } else {
            s.write(m);
            console.log('send buffer to socket, length: ' + m.length);
        }
    });
}

// function tcp2ws() {
//     console.log('proxy mode tcp -> ws');
//     console.log('forwarding port ' + argv.lport + ' to ' + argv.rhost);

//     var server = net.createServer(function (s) {
//         var ws = new ws_module(300);

//         var state = {
//             sReady: true,
//             wsReady: false,
//             wsBuffer: [],
//             sBuffer: []
//         };
//         initSocketCallbacks(state, ws, s);
//     });
//     server.listen(3000);
// }

function ws2tcp() {

    console.log('proxy mode ws -> tcp');

    wss = new ws_module.Server({ port: 3001 });
    wss.on('connection', function (ws, req) {
        console.log(`ws connection, url: ${req.url}`);
        const current_url = url.parse(req.url);
        const query_string = current_url.search;
        const search_params = new URLSearchParams(query_string);
        var rhost = search_params.get('rhost') || '192.168.8.45';
        var rport = search_params.get('rport') || 8100;
        var s = net.connect(rport, rhost);

        var state = {
            sReady: false,
            wsReady: true,
            wsBuffer: [],
            sBuffer: []
        };
        initSocketCallbacks(state, ws, s);
    });
}

console.log('start ws2tcp bridge.');
ws2tcp();
