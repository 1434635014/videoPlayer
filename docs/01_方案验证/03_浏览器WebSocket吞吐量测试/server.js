var path = require('path');
var app = require('express')();
var ws = require('express-ws')(app);

app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname, '/index.html'));
});

app.ws('/', (s, req) => {
    console.log('websocket connection');
    ws.on('message', function (msg) {
        console.log('received msg: ' + msg);
        s.send(msg.length);
    });
});

app.listen(3000, () => console.log('listening on *:3000/'));