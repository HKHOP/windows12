import WindowManager from '../../modules/windowManager.js';

const TempleRun2 = (() => {
    const APP_ID = 'templeRun2';
    const GAME_URL = 'https://subwayonline.io/temple-run-2.embed';
    const HOME_URL = 'https://subwayonline.io/temple-run-2';
    const icon = `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="4" fill="#1c1410"/><path d="M4 9h16l-2 9H6L4 9z" fill="#3a2c1e"/><path d="M4 9l8-4 8 4" fill="#8a6d3b"/><circle cx="12" cy="13.5" r="2.4" fill="#ffd166"/><circle cx="17" cy="7" r="1" fill="#ff5d5d"/></svg>`;

    function getContent() {
        return `
        <div class="arc-root" style="position:absolute;inset:0;display:flex;flex-direction:column;min-height:0;background:#000;color:#fff;">
            <div style="flex:none;display:flex;align-items:center;gap:8px;padding:5px 10px;background:#141419;font-size:11px;color:#9a9aa5;">
                <span>Click the game to capture keyboard · Arrows + Space</span>
                <span style="flex:1"></span>
                <button class="arc-reload" style="background:rgba(255,255,255,.08);border:none;color:#fff;border-radius:5px;padding:3px 10px;cursor:pointer;font-size:11px;">Reload</button>
                <button class="arc-open" style="background:rgba(255,255,255,.08);border:none;color:#fff;border-radius:5px;padding:3px 10px;cursor:pointer;font-size:11px;">Open in Browser</button>
            </div>
            <iframe class="arc-frame" title="Temple Run 2" tabindex="0" src="${GAME_URL}"
                allow="autoplay; fullscreen; gamepad; keyboard-lock; pointer-lock; clipboard-write; screen-wake-lock"
                sandbox="allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-scripts allow-same-origin allow-downloads"
                style="flex:1;width:100%;min-height:0;border:none;display:block;background:#000;"></iframe>
        </div>`;
    }

    function launch() {
        const win = WindowManager.createWindow(APP_ID, 'Temple Run 2', icon, getContent(), { width: 900, height: 620, minWidth: 480, minHeight: 360 });
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

export default TempleRun2;
