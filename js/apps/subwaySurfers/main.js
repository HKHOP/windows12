import WindowManager from '../../modules/windowManager.js';
import AppIcons from '../../modules/appIcons.js';

const SubwaySurfers = (() => {
    // Simple game controller icon: two circles with a bar
    const icon = `<svg viewBox="0 0 24 24" fill="none"><circle cx="6" cy="12" r="4" stroke="#0078D4" stroke-width="2"/><circle cx="18" cy="12" r="4" stroke="#0078D4" stroke-width="2"/><path d="M6 12h12" stroke="#0078D4" stroke-width="2" stroke-linecap="round"/></svg>`;

    function getContent() {
        return `
            <iframe id="game-element" allowfullscreen="true" allow="autoplay; fullscreen; camera; gamepad; keyboard-map; xr-spatial-tracking; clipboard-write; web-share; accelerometer; magnetometer; gyroscope; microphone; screen-wake-lock" name="gameFrame" scrolling="no" sandbox="allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-scripts allow-same-origin allow-downloads" src="https://subwayonline.io/subway-surfers.embed" title="Game" style="width:100%;height:100%;border:none;"></iframe>
        `;
    }

    function launch() {
        const win = WindowManager.createWindow('subwaySurfers', 'Subway Surfers', icon, getContent(), { width: 800, height: 600 });
    }

    return { launch };
})();

export default SubwaySurfers;