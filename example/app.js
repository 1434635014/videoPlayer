"use strict";

var showMessage = function (msg) {
    document.getElementById('message').innerText = msg;
}

console.clear();
showMessage('正在检测浏览器...');

var onReady = function () {
    var Player = require('YDPlayer');

    if (!Player.YDPlayer.isSupported()) {
        showMessage('该浏览器不被支持。');
        alert('该浏览器不被支持。');
    }
    else {
        showMessage('该浏览器支持播放。');
    }

    var screenX = (document.body.clientWidth < 1000) ? 1 : 2, screenY = screenX;
    var container = document.getElementById('video-container');
    var player = new Player.YDPlayer(container, { screenX: screenX, screenY: screenY, multiplePlay: true });
    console.log('ydplayer loaded.');

    //选中窗口变化事件
    player.on('selectedIndexChanged', function (selectedIndex, url) {
        console.debug('player selectedIndex: ' + selectedIndex + ', url: ' + url);
    });

    //实时音视频播放，不要使用 async 
    document.getElementById('btnLiving').onclick = function () {
        var url = document.getElementById('url').value;
        player.openStreaming(url, 1).then(function (screenIndex) {

        }).catch(alert);
    }

    //停止
    document.getElementById('btnStop').onclick = function () {
        player.stop();
    }

    //全部停止
    document.getElementById('btnStopAll').onclick = function () {
        player.stopAll();
    }

    //切换选中画面的音频播放
    document.getElementById('btnToggleAudio').onclick = function () {
        player.toggleAudio();
    }

    //静音
    document.getElementById('btnMute').onclick = function () {
        player.mute();
    }

    //全屏
    document.getElementById('btnFullscreen').onclick = function () {
        player.requestFullscreen(player.selectedIndex);
    }

    //全屏（全部画面）
    document.getElementById('btnFullscreenAll').onclick = function () {
        player.requestFullscreen().then(function () {
            console.debug('enter fullscreen mode');
        }, function (r) {
            console.error(r);
            debugger;
        });
    }

    //抓图
    document.getElementById('btnCapture').onclick = function () {
        player.capture().then(function (result) {
            if (result) {
                var images = document.getElementById('capture_image');
                images.innerHTML = '';
                var url = result.url;      //SN: url.sn;  Channel: url.channel
                var data = result.data;
                images.insertAdjacentHTML('beforeend', '<div style="box-sizing: border-box; min-width: 50%; display: inline-block; vertical-align:middle; position: relative; border: 1px solid transparent; width:100%"><img style="width:100%;" src="' + data + '" /><p>' + url.sn + ':' + url.channel + '</p></div>');
                $('#modal_capture_image').modal();
            }
        });
    }

    //全部抓图
    document.getElementById('btnCaptureAll').onclick = function () {
        player.captureAll().then(function (results) {
            if (results) {
                var images = document.getElementById('capture_image');
                images.innerHTML = '';
                for (var i = 0; i < results.length; i++) {
                    var url = results[i].url;
                    var data = results[i].data;
                    images.insertAdjacentHTML('beforeend', '<div style="box-sizing: border-box; min-width: 50%; display: inline-block; vertical-align:middle; position: relative; border: 1px solid transparent; width:' + (100 / results.length) + '%"><img style="width:100%;" src="' + data + '" /><p>' + url.sn + ':' + url.channel + '</p></div>');
                }
                $('#modal_capture_image').modal();
            }
        });
    }

    //按时间点回放，不要使用 async 
    document.getElementById('btnConfirmPlayback').onclick = function () {
        var server = document.getElementById('url').value;
        var time = document.getElementById('datetimePlayback').value;
        player.openPlayback(server, new Date(time)).then(function () {
            console.log('playback is playing');
        }).catch(function (r) {
            alert(r);
        });
        $('#datetime_modal').modal('hide');
    }

    //画面排列
    var btnScreens = document.querySelectorAll('.btnScreenItem');
    for (var i = 0; i < btnScreens.length; i++) {
        var el = btnScreens.item(i);
        el.addEventListener('click', function (e) {
            e.preventDefault();
            //e.stopPropagation();
            var text = this.innerText;
            var value = this.attributes['data-value'].value;
            document.querySelector('#btnScreen').innerText = 'Screen:' + text;
            var arr = value.split(',');
            if (arr.length > 1) {
                var x = parseInt(arr[0]);
                var y = parseInt(arr[1]);
                player.setScreens(x, y);
            }
        });
    };

    //视频画面的缩放方式
    var fitModes = ['contain', 'fill', 'cover', 'none', 'scale-down'];
    var fitIndex = 0;
    document.getElementById('btnFitMode').onclick = function () {
        fitIndex++;
        fitIndex = fitIndex % fitModes.length;
        for (var i = 0; i < screenX * screenY; i++) {
            player.setFitMode(fitModes[fitIndex], i);
        }
    }
}

if (document.readyState == 'complete') {
    onReady();
}
else {
    document.addEventListener('DOMContentLoaded', onReady, false);
}
