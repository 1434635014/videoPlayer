// Shinobi (http://shinobi.video) - FFMPEG FLV over HTTP Test
// How to Use
// 1. Navigate to directory where this file is.
// 2. Run `npm install express`
// 3. Start with `node ffmpegToWeb.js`
// 4. Get the IP address of the computer where you did step 1. Example : 127.0.0.1
// 5. Open `http://127.0.0.1:8001/` in your browser.

var child = require('child_process');
var events = require('events');
var express = require('express')
var app = express();
var server = require('http').Server(app);
var spawn = child.spawn;
var exec = child.exec;
var Emitters = {};
var firstChunks = {};
var config = {
    port: 8001,
    url: 'rtsp://192.168.8.52/live/00_0'
}
var initEmitter = function (feed) {
    if (!Emitters[feed]) {
        Emitters[feed] = new events.EventEmitter().setMaxListeners(0)
    }
    return Emitters[feed]
}
//hold first chunk of FLV video
var initFirstChunk = function (feed, firstBuffer) {
    if (!firstChunks[feed]) {
        firstChunks[feed] = firstBuffer
    }
    return firstChunks[feed];
}
console.log('Starting Express Web Server on port: ' + config.port)
//start webserver
server.listen(config.port);

//make libraries static
app.use('/libs', express.static(__dirname + '/libs'));
app.use('/', express.static(__dirname + '/'));

//homepage with video element.
//static file send of index.html
app.get('/', function (req, res) {
    console.log('http request: ' + req.originalUrl);
    res.sendFile(__dirname + '/index.html');
});

//// FLV over HTTP, this URL goes in the flv.js javascript player
// see ./index.html
app.get(['/flv', '/flv/:feed/s.flv'], function (req, res) {
    var feed = Date.now() + '';
    console.log('http request, requestId: ' + feed + ', url: ' + req.originalUrl);

    //get emitter
    req.Emitter = initEmitter(feed);
    //variable name of contentWriter
    var contentWriter;
    //set headers
    res.setHeader('Content-Type', 'video/x-flv');
    res.setHeader('Access-Control-Allow-Origin', '*');

    //write first frame on stream
    var firstChunk = initFirstChunk(feed);
    if (firstChunk) {
        console.log('write first chunk, requestId: ' + feed);
        res.write(firstChunk);
    }

    //write new frames as they happen
    req.Emitter.on('data', contentWriter = function (buffer) {
        console.log('write chunk, requestId: ' + feed + ', buffer length: ' + buffer.length);
        res.write(buffer);
    });

    //start ffmpeg
    var ffmpegProcess = startFFMpeg(feed);

    //remove contentWriter when client leaves
    res.on('close', function () {
        console.log('http request closed, requestId: ' + feed);
        req.Emitter.removeListener('data', contentWriter);
        if (ffmpegProcess) {
            console.log('killing ffmpeg...');
            ffmpegProcess.kill();
            firstChunks[feed] = null;
        }
    });
});

var startFFMpeg = function (feed) {
    //ffmpeg
    console.log('Starting FFMPEG...');
    var ffmpegString = '-i ' + config.url + ' -c:v copy -an -f flv pipe:1';
    //var ffmpegString = '-i '+config.url+' -c:v libx264 -preset superfast -tune zerolatency -c:a aac -ar 44100 -f flv pipe:4'
    //ffmpegString += ' -f mpegts -c:v mpeg1video -an http://localhost:'+config.port+'/streamIn/2'
    if (ffmpegString.indexOf('rtsp://') > -1) {
        ffmpegString = '-rtsp_transport tcp ' + ffmpegString;
    }
    console.log('Executing : ffmpeg ' + ffmpegString);
    var ffmpegProcess = spawn('ffmpeg', ffmpegString.split(' '), { stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe'] });
    ffmpegProcess.on('close', function (buffer) {
        console.log('ffmpeg died');
    });
    //// FFMPEG Error Logs
    //ffmpeg.stderr.on('data', function (buffer) {
    //    console.log(buffer.toString())
    //});
    //data from pipe:1 output of ffmpeg
    ffmpegProcess.stdio[1].on('data', function (buffer) {
        //console.log('ffmpeg data, feed: ' + feed + ', buffer length: ' + buffer.length);
        initFirstChunk(feed, buffer);
        initEmitter(feed).emit('data', buffer);
    });

    return ffmpegProcess;
};
