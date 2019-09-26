## 概述

YDPlayer.js 是一个H5的云盯视频播放库，可以在最新版的Chrome、Firefox、Safari 等浏览器中实现无插件播放云盯设备的音视频。




## 功能

在现代浏览器中实现无插件播放云盯设备的音视频，支持以下特性：

- 多窗口
- 实时音、视频播放
- 录像查询、回放
- 云台控制
- 画面截图
- 全屏播放




## Demo

> 参考 example 目录



## Getting Started

```html
<div id="video-container"></div>
<!--引入 ydplayer.js-->
<script src="ydplayer.js"></script>
<script>
    const Player = require('YDPlayer');
    const container = document.getElementById('video-container');
    //创建播放器实例
    const player = new Player.YDPlayer(container, { screenX: 2, screenY: 2 });
    //播放实时音视频
    player.openStreaming('ws-yd://example.com/?args=example', 1);
</script>
```



## 限制

- 目前仅支持最新版 Chrome 浏览器；
- 目前仅支持 H.264 视频编码方式、 AAC 音频编码方式；
- 最大画面个数为 5x5，建议使用 2x2 或 3x3 ；



## API文档

See [api.md](docs/api.md)