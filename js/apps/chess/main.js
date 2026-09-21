// Chess — Lichess embeds for Windows 12.
// Uses only Lichess's official frame-friendly endpoints (lichess.org/developers):
// live TV + the daily puzzle. Anything else opens on the real site.
import WindowManager from '../../modules/windowManager.js';

const Chess = (() => {
    const APP_ID = 'chess';
    const MODES = {
        tv: { label: 'Live TV', url: 'https://lichess.org/tv/frame?theme=brown&bg=dark', hint: 'Top-rated live game, auto-updates' },
        puzzle: { label: 'Daily Puzzle', url: 'https://lichess.org/training/frame?theme=brown&bg=dark', hint: 'Black to play — a fresh puzzle every day' }
    };
    const HOME_URL = 'https://lichess.org/';
    const icon = `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="4" fill="#161512"/><circle cx="12" cy="7" r="2.4" fill="#e8e5df"/><path d="M9.5 10.5h5l.8 4.5H8.7l.8-4.5z" fill="#e8e5df"/><path d="M7.5 16.5h9l1 2.5h-11l1-2.5z" fill="#e8e5df"/></svg>`;

    function getContent() {
        const tabs = Object.entries(MODES).map(([id, m], i) =>
            `<button data-mode="${id}" class="chess-tab" style="background:${i === 0 ? 'rgba(255,255,255,.14)' : 'transparent'};border:none;color:#e8e5df;border-radius:6px;padding:4px 14px;cursor:pointer;font-size:12px;font-weight:600;">${m.label}</button>`
        ).join('');
        return `
        <div class="chess-root" style="position:absolute;inset:0;display:flex;flex-direction:column;min-height:0;background:#161512;color:#e8e5df;">
            <div style="flex:none;display:flex;align-items:center;gap:6px;padding:6px 10px;background:#211d16;border-bottom:1px solid rgba(255,255,255,.08);">
                ${tabs}
                <span class="chess-hint" style="font-size:11px;color:#9a958c;margin-left:4px;">${MODES.tv.hint}</span>
                <span style="flex:1"></span>
                <button class="chess-open" style="background:rgba(255,255,255,.08);border:none;color:#fff;border-radius:5px;padding:3px 10px;cursor:pointer;font-size:11px;">Play on Lichess</button>
            </div>
            <iframe class="chess-frame" title="Chess — Live TV" tabindex="0" src="${MODES.tv.url}"
                allow="autoplay; fullscreen; clipboard-write"
                sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-presentation allow-scripts allow-same-origin allow-downloads"
                style="flex:1;width:100%;min-height:0;border:none;display:block;background:#161512;"></iframe>
        </div>`;
    }

    function launch() {
        const win = WindowManager.createWindow(APP_ID, 'Chess', icon, getContent(), { width: 900, height: 680, minWidth: 520, minHeight: 420 });
        const el = win.element;
        const frame = el.querySelector('.chess-frame');
        const hint = el.querySelector('.chess-hint');
        el.querySelectorAll('.chess-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = MODES[btn.dataset.mode];
                if (!mode) return;
                el.querySelectorAll('.chess-tab').forEach(b => { b.style.background = 'transparent'; });
                btn.style.background = 'rgba(255,255,255,.14)';
                hint.textContent = mode.hint;
                frame.title = `Chess — ${mode.label}`;
                frame.src = mode.url;
            });
        });
        el.querySelector('.chess-open').addEventListener('click', () => { try { window.open(HOME_URL, '_blank', 'noopener'); } catch (e) {} });
        const capture = () => {
            try { frame.contentWindow.focus(); } catch (e) { /* cross-origin */ }
            try { frame.focus({ preventScroll: true }); } catch (e) { try { frame.focus(); } catch (e2) {} }
        };
        frame.addEventListener('load', () => { capture(); setTimeout(capture, 100); });
    }

    return { launch };
})();

export default Chess;
