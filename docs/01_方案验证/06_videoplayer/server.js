const fs = require('fs');
const ws_module = require('ws');
const net = require('net');
const url = require('url');
const path = require('path');
const http = require("http");
const https = require("https");
const express = require('express');
const app = express();

const http_port = 3000;
const ws_port = 10084;

app.use(express.static('node_modules'));
app.use(express.static(__dirname));

app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname, '/index.html'));
});
console.log(`http listening on *:${http_port}`);
app.listen(http_port);

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
        //console.log('recv buffer from socket, length: ' + data.length);
        if (!state.wsReady) {
            state.wsBuffer.push(data);
        } else if (ws.readyState == ws_module.OPEN) {
            ws.send(data, { binary: true, mask: wsMask });
            //console.log('send buffer to ws, length: ' + data.length);
        }
    });

    ws.on('message', function (m, flags) {
        //console.log('recv buffer from ws, length: ' + m.length);
        if (!state.sReady) {
            state.sBuffer.push(m);
        } else {
            s.write(m);
            //console.log('send buffer to socket, length: ' + m.length);
        }
    });
}

function ws2tcp() {
    wss = new ws_module.Server({ port: ws_port });
    wss.on('connection', function (ws, req) {
        console.log(`ws connection, url: ${req.url}, remote: ${req.connection.remoteAddress}:${req.connection.remotePort}`);
        const current_url = url.parse(req.url);
        const query_string = current_url.search;
        const search_params = new URLSearchParams(query_string);
        var rhost = search_params.get('rhost') || '127.0.0.1';
        var rport = search_params.get('rport') || (ws_port - 2);
        var s = net.connect(parseInt(rport), rhost);
        var state = {
            url: current_url,
            sReady: false,
            wsReady: true,
            wsBuffer: [],
            sBuffer: []
        };
        initSocketCallbacks(state, ws, s);
    });
    console.log(`websocket listening on *:${ws_port}`);
    console.log('proxy mode ws -> tcp');
}

function wss2tcp() {
    const key = fs.readFileSync('./relay021.yunding360.com.key');
    const cert = fs.readFileSync('./relay021.yunding360.com.pem');
    const server = https.createServer({ key: key, cert: cert });
    wss = new ws_module.Server({ server: server });
    wss.on('connection', function (ws, req) {
        console.log(`ws connection, url: ${req.url}, remote: ${req.connection.remoteAddress}:${req.connection.remotePort}`);
        const current_url = url.parse(req.url);
        const query_string = current_url.search;
        const search_params = new URLSearchParams(query_string);
        var rhost = search_params.get('rhost') || '127.0.0.1';
        var rport = search_params.get('rport') || (ws_port - 2);
        var s = net.connect(parseInt(rport), rhost);
        var state = {
            url: current_url,
            sReady: false,
            wsReady: true,
            wsBuffer: [],
            sBuffer: []
        };
        initSocketCallbacks(state, ws, s);
    });
    server.listen(ws_port);
    console.log(`websocket listening on *:${ws_port}`);
    console.log('proxy mode ws -> tcp');
}

//console.log('start ws2tcp bridge.');
ws2tcp();
