import WindowManager from '../../modules/windowManager.js';

const TunnelRush = (() => {
    const APP_ID = 'tunnelRush';
    const GAME_URL = 'https://slope-slope.github.io/tunnel-rush';
    const HOME_URL = 'https://slope-slope.github.io/tunnel-rush';
    const icon = `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="10" fill="#0b0b10"/><circle cx="12" cy="12" r="7.5" stroke="#ff5d8f" stroke-width="1.8"/><circle cx="12" cy="12" r="4.8" stroke="#ffb3c9" stroke-width="1.4"/><circle cx="12" cy="12" r="2" fill="#ff5d8f"/></svg>`;

    function getContent() {
        return `
        <div class="arc-root" style="position:absolute;inset:0;display:flex;flex-direction:column;min-height:0;background:#000;color:#fff;">
            <div style="flex:none;display:flex;align-items:center;gap:8px;padding:5px 10px;background:#141419;font-size:11px;color:#9a9aa5;">
                <span>Click the game, then PLAY · Arrows to dodge</span>
                <span style="flex:1"></span>
                <button class="arc-reload" style="background:rgba(255,255,255,.08);border:none;color:#fff;border-radius:5px;padding:3px 10px;cursor:pointer;font-size:11px;">Reload</button>
                <button class="arc-open" style="background:rgba(255,255,255,.08);border:none;color:#fff;border-radius:5px;padding:3px 10px;cursor:pointer;font-size:11px;">Open in Browser</button>
            </div>
            <iframe class="arc-frame" title="Tunnel Rush" tabindex="0" src="${GAME_URL}"
                allow="autoplay; fullscreen; gamepad; keyboard-lock; pointer-lock; clipboard-write; screen-wake-lock"
                sandbox="allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-scripts allow-same-origin allow-downloads"
                style="flex:1 1 0%;width:100%;height:100%;min-height:0;min-width:0;border:none;display:block;background:#000;"></iframe>
        </div>`;
    }

    function launch() {
        const win = WindowManager.createWindow(APP_ID, 'Tunnel Rush', icon, getContent(), { width: 900, height: 620, minWidth: 480, minHeight: 360 });
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

export default TunnelRush;
