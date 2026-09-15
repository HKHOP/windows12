import WindowManager from '../../modules/windowManager.js';
import AppIcons from '../../modules/appIcons.js';

const SubwaySurfers = (() => {
    // Simple game controller icon: two circles with a bar
    const icon = `<svg viewBox="0 0 24 24" fill="none"><circle cx="6" cy="12" r="4" stroke="#0078D4" stroke-width="2"/><circle cx="18" cy="12" r="4" stroke="#0078D4" stroke-width="2"/><path d="M6 12h12" stroke="#0078D4" stroke-width="2" stroke-linecap="round"/></svg>`;

    function getContent() {
        return `
            <iframe id="game-element" allowfullscreen="true" allow="autoplay; fullscreen; camera; gamepad; keyboard-map; xr-spatial-tracking; clipboard-write; web-share; accelerometer; magnetometer; gyroscope; microphone; screen-wake-lock" name="gameFrame" scrolling="no" sandbox="allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-scripts allow-same-origin allow-downloads" src="https://games.poki.com/5dd312fa-015f-11ea-ad56-9cb6d0d995f7?tag=pg-f39012e9dd1d2384c1009c5869ee84dcedcc00da&amp;site_id=3&amp;iso_lang=en&amp;country=US&amp;poki_url=https://poki.com/en/g/subway-surfers&amp;hoist=yes&amp;nonPersonalized=n&amp;cloudsavegames=n&amp;familyFriendly=n&amp;device=desktop&amp;categories=3,4,6,9,93,103,228,903,929,1140,1185,1190,1193&amp;special_condition=landing&amp;user_id=apHraCZI8xHne2knOOe34w" title="Game" style="width:100%;height:100%;border:none;"></iframe>
        `;
    }

    function launch() {
        const win = WindowManager.createWindow('subwaySurfers', 'Subway Surfers', icon, getContent(), { width: 800, height: 600 });
    }

    return { launch };
})();

export default SubwaySurfers;