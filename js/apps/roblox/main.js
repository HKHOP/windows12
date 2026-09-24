import WindowManager from '../../modules/windowManager.js';

const Roblox = (() => {
    const APP_ID = 'roblox';
    const GAME_URL = 'https://www.roblox.com';
    const HOME_URL = 'https://www.roblox.com';
    const icon = `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="4" fill="#0f0f12"/><path d="M9.2 5.5 18.5 8l-2.5 9.3L6.7 14.8 9.2 5.5Z" fill="#e2e2e6" transform="rotate(0)" opacity="0"/><path d="M8.5 6 17 8.3l-2.2 8.2L6.3 14.2 8.5 6Z" fill="#fff"/><path d="m10.6 8.9 4.4 1.2-.9 3.3-4.4-1.2.9-3.3Z" fill="#0f0f12"/></svg>`;

    function getContent() {
        return `
        <div class="arc-root" style="position:absolute;inset:0;display:flex;flex-direction:column;min-height:0;background:#0f0f12;color:#fff;">
            <div style="flex:none;display:flex;align-items:center;gap:8px;padding:5px 10px;background:#1a1a20;font-size:11px;color:#9a9aa5;">
                <span>Roblox — millions of experiences, sign in to play</span>
                <span style="flex:1"></span>
                <button class="arc-reload" style="background:rgba(255,255,255,.08);border:none;color:#fff;border-radius:5px;padding:3px 10px;cursor:pointer;font-size:11px;">Reload</button>
                <button class="arc-open" style="background:rgba(255,255,255,.08);border:none;color:#fff;border-radius:5px;padding:3px 10px;cursor:pointer;font-size:11px;">Open in Browser</button>
            </div>
            <iframe class="arc-frame" title="Roblox" tabindex="0" src="${GAME_URL}"
                allow="autoplay; fullscreen; gamepad; keyboard-lock; pointer-lock; clipboard-write; screen-wake-lock"
                sandbox="allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-scripts allow-same-origin allow-downloads"
                style="flex:1 1 0%;width:100%;height:100%;min-height:0;min-width:0;border:none;display:block;background:#0f0f12;"></iframe>
        </div>`;
    }

    function launch() {
        const win = WindowManager.createWindow(APP_ID, 'Roblox', icon, getContent(), { width: 1100, height: 720, minWidth: 480, minHeight: 360 });
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

export default Roblox;
