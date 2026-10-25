// Crashout Crew — embedded browser client.
import WindowManager from '../../modules/windowManager.js';
import AppIcons from '../../modules/appIcons.js';
import GameFullscreen from '../../modules/gameFullscreen.js';

const CrashoutCrew = (() => {
    const APP_ID = 'crashoutCrew';
    const GAME_URL = "https://wasm.rip/files/cc/index.html";
    const HOME_URL = "https://wasm.rip/";
    const HINT = "WASD / arrows to drive · Space to boost";

    function getContent() {
        return `
        <div class="arc-root" style="position:absolute;inset:0;display:flex;flex-direction:column;min-height:0;background:#000;color:#fff;">
            <div style="flex:none;display:flex;align-items:center;gap:8px;padding:5px 10px;background:#141419;font-size:11px;color:#9a9aa5;">
                <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${HINT}</span>
                <span style="flex:1"></span>
                <button class="arc-fullscreen" style="background:rgba(255,255,255,.08);border:none;color:#fff;border-radius:5px;padding:3px 10px;cursor:pointer;font-size:11px;white-space:nowrap;flex:none;">Fullscreen</button>
                <button class="arc-reload" style="background:rgba(255,255,255,.08);border:none;color:#fff;border-radius:5px;padding:3px 10px;cursor:pointer;font-size:11px;white-space:nowrap;flex:none;">Reload</button>
                <button class="arc-open" style="background:rgba(255,255,255,.08);border:none;color:#fff;border-radius:5px;padding:3px 10px;cursor:pointer;font-size:11px;white-space:nowrap;flex:none;">Open in Browser</button>
            </div>
            <iframe class="arc-frame" title="Crashout Crew" tabindex="0" src="${GAME_URL}"
                allow="autoplay; fullscreen; gamepad; keyboard-lock; pointer-lock; clipboard-write; screen-wake-lock"
                sandbox="allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-scripts allow-same-origin allow-downloads"
                style="flex:1 1 0%;width:100%;height:100%;min-height:0;min-width:0;border:none;display:block;background:#000;"></iframe>
        </div>`;
    }

    function launch() {
        const win = WindowManager.createWindow(APP_ID, "Crashout Crew", AppIcons.get(APP_ID), getContent(), { width: 1024, height: 680, minWidth: 560, minHeight: 420 });
        const el = win.element;
        GameFullscreen.attach({ win, button: el.querySelector('.arc-fullscreen') });
        const frame = el.querySelector('.arc-frame');
        const capture = () => {
            try { frame.contentWindow.focus(); } catch (e) { /* cross-origin */ }
            try { frame.focus({ preventScroll: true }); } catch (e) { try { frame.focus(); } catch (e2) {} }
        };
        frame.addEventListener('load', () => { capture(); setTimeout(capture, 100); });
        el.querySelector('.arc-root').addEventListener('pointerdown', () => { capture(); setTimeout(capture, 0); });
        el.querySelector('.arc-reload').addEventListener('click', () => { frame.src = GAME_URL; });
        el.querySelector('.arc-open').addEventListener('click', () => { try { window.open(HOME_URL, '_blank', 'noopener'); } catch (e) {} });
    }

    return { launch };
})();

export default CrashoutCrew;
