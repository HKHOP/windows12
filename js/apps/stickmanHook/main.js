import WindowManager from '../../modules/windowManager.js';

const StickmanHook = (() => {
    const APP_ID = 'stickmanHook';
    const GAME_URL = 'https://slope2unblocked.github.io/play/stickman-hook.html';
    const HOME_URL = 'https://slope2unblocked.github.io/play/stickman-hook.html';
    const icon = `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="4" fill="#0d1b12"/><circle cx="14" cy="6.5" r="2.2" fill="#7cff9d"/><path d="M14 9v4m0-2.5L10 8m4 2.5L18 8m-4 5.5-3 5m3-5 3 5" stroke="#7cff9d" stroke-width="1.6" stroke-linecap="round"/><path d="M5 5c2 4 5 5 7 5" stroke="#ffd166" stroke-width="1.6" stroke-linecap="round"/></svg>`;

    function getContent() {
        return `
        <div class="arc-root" style="position:absolute;inset:0;display:flex;flex-direction:column;min-height:0;background:#000;color:#fff;">
            <div style="flex:none;display:flex;align-items:center;gap:8px;padding:5px 10px;background:#141419;font-size:11px;color:#9a9aa5;">
                <span>Hold Space / click to swing · release to fly</span>
                <span style="flex:1"></span>
                <button class="arc-reload" style="background:rgba(255,255,255,.08);border:none;color:#fff;border-radius:5px;padding:3px 10px;cursor:pointer;font-size:11px;">Reload</button>
                <button class="arc-open" style="background:rgba(255,255,255,.08);border:none;color:#fff;border-radius:5px;padding:3px 10px;cursor:pointer;font-size:11px;">Open in Browser</button>
            </div>
            <iframe class="arc-frame" title="Stickman Hook" tabindex="0" src="${GAME_URL}"
                allow="autoplay; fullscreen; gamepad; keyboard-lock; pointer-lock; clipboard-write; screen-wake-lock"
                sandbox="allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-scripts allow-same-origin allow-downloads"
                style="flex:1;width:100%;min-height:0;border:none;display:block;background:#000;"></iframe>
        </div>`;
    }

    function launch() {
        const win = WindowManager.createWindow(APP_ID, 'Stickman Hook', icon, getContent(), { width: 900, height: 620, minWidth: 480, minHeight: 360 });
        const el = win.element;
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

export default StickmanHook;
