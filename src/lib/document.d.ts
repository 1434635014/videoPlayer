interface Document {
    mozFullScreenElement?: Element;
    webkitFullscreenElement?: Element;
    msFullscreenElement?: Element;

    mozCancelFullScreen: () => void;
    webkitExitFullscreen: () => void;
    msExitFullscreen?: () => void;
}

interface HTMLElement {
    mozRequestFullScreen?: () => void;
    webkitRequestFullscreen?: () => void;
    msRequestFullscreen?: () => void;
}

interface HTMLVideoElement {
    playsinline?: boolean;
    'webkit-playsinline': boolean;
    'x5-playsinline': boolean;
}