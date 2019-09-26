## Reference

1. Chrome MSE 信息查看：```chrome://media-internals```
2. Chrome Autoplay Policy Changes: https://goo.gl/xX8pDD
3. New ```<video>``` Policies for iOS： https://webkit.org/blog/6784/new-video-policies-for-ios/
4. object-fit: https://developer.mozilla.org/zh-CN/docs/Web/CSS/object-fit and https://caniuse.com/#search=object%20fit
5. tabIndex and key events: https://stackoverflow.com/questions/3149362/capture-key-press-or-keydown-event-on-div-element
6. Aspect Ratio(use pading top), see: https://www.w3schools.com/howto/howto_css_aspect_ratio.asp
7. https://developers.google.com/web/updates/2017/06/play-request-was-interrupted

## Build

```bash
git clone git@git.yunding360.cn:yunding/ydplayer.js.git
cd ydplayer.js
npm install
npm install -g gulp
npm run dev             #or gulp watch
```

## 注意：

1. 某些设备的AAC音频存在兼容性问题；
2. 某些设备的帧率（FPS）与协议中的帧率不相同，可能导致不能在safari中正常播放；