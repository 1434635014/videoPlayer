import { YDPlayerPlugIn } from './player-plugin';
import { ScreenNumber } from '../player';

declare global {
    interface Window {
        _PlayerCols: ScreenNumber;
        _PlayerRows: ScreenNumber;
        Player: YDPlayerPlugIn;
        jQuery: Function;
        compatibility: any;
    }
}

//compatible
const onReady = () => {
    if (!window.Player) {
        let container = document.getElementById('video');
        if (container) {
            while (container.lastChild) {
                container.removeChild(container.lastChild);
            }
            let screenX = window._PlayerCols || 2;
            let screenY = window._PlayerRows || 2;
            var plugIn = new YDPlayerPlugIn(container, { screenX: screenX, screenY: screenY });
            window.Player = plugIn;
            window.compatibility = window.compatibility || {};
            window.compatibility.adv_replay = true;
        }
    }
}

if (typeof window.jQuery === 'function') {
    window.jQuery(onReady);
}
else {
    if (document.readyState == 'complete') {
        onReady();
    }
    else {
        document.addEventListener('DOMContentLoaded', onReady, false);
    }
}