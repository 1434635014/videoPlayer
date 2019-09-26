var ws_module = require('ws');
var net = require('net');

module.exports = function (argv) {
	if (!argv) {
		argv = require('optimist')
			.usage('Forward tcp connections to websocket servers, or websocket connections to tcp servers.')
			.demand('lport')
			.describe('lport', 'port to listen for connections on.')
			.demand('rhost')
			.describe('rhost', 'address to forward the connection to.')
			.demand('method')
			.describe('method', 'either tcp2ws or ws2tcp').argv;
	}

	var wsMask = (argv.method == 'tcp2ws');

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

	function tcp2ws() {
		console.log('proxy mode tcp -> ws');
		console.log('forwarding port ' + argv.lport + ' to ' + argv.rhost);

		var server = net.createServer(function (s) {
			var ws = new ws_module(argv.rhost);

			var state = {
				sReady: true,
				wsReady: false,
				wsBuffer: [],
				sBuffer: []
			};
			initSocketCallbacks(state, ws, s);
		});
		server.listen(argv.lport);
	}

	function ws2tcp() {

		console.log('proxy mode ws -> tcp');
		console.log('forwarding port ' + argv.lport + ' to ' + argv.rhost);

		wss = new ws_module.Server({ port: argv.lport });
		wss.on('connection', function (ws) {
			var addr_port = argv.rhost.split(':');
			var s = net.connect(addr_port[1], addr_port[0]);

			var state = {
				sReady: false,
				wsReady: true, // there is no callback so i assume its already connected
				wsBuffer: [],
				sBuffer: []
			};
			initSocketCallbacks(state, ws, s);
		});
	}

	if (argv.method == 'tcp2ws') {
		tcp2ws();
	} else if (argv.method == 'ws2tcp') {
		ws2tcp();
	} else {
		console.error("Method must be either tcp2ws or ws2tcp!");
	}
}