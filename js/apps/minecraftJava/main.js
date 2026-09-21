// Minecraft Java — Eaglercraft launcher for Windows 12.
// SDK app: a curated version list, each version played in a sandboxed iframe.
// No username, no mods — clients handle everything themselves.
//
// Fullscreen uses the SDK's real browser fullscreen (v1.2.0
// app.window.setFullscreen) so the game is never stuck in window mode.
import { createApp } from '../../sdk/index.js';
import AppIcons from '../../modules/appIcons.js';

// Eaglermobile userscript adds on-screen touch controls to compatible clients.
const TOUCH_USERSCRIPT = 'flameddogo99-eaglermobile.js';

// Newest first. `touch` is the default state of the touch-controls toggle —
// only eaglercraft.com clients are known to accept the userscript parameter.
const VERSIONS = [
    { id: '26.2', label: '26.2', group: 'Snapshots', url: 'https://eaglercraft-26-2-client.u2471966200.workers.dev/', touch: false },
    { id: '26.1', label: '26.1', group: 'Snapshots', url: 'https://github.com/thebananamanjcgaming/EaglercraftZ-26.1.1/blob/main/index.html', touch: false },
    { id: '1.21.11', label: '1.21.11 (WASM)', group: 'Releases', url: 'https://www.mediafire.com/file/2oqt9ihytokhvh3/Eaglercraft_1.21.11_WASM_Offline_Download_(7)_(1).html/file', touch: false },
    { id: '1.20.4', label: '1.20.4', group: 'Releases', url: 'https://github.com/XxFluffyAsherxX/Eaglercraft-1.20.4-Updated-/blob/main/index%20(2).html', touch: false },
    { id: '1.12.2', label: '1.12.2 (WASM)', group: 'Releases', url: 'https://eaglercraft.com/play?version=1.12.2-wasm', touch: true },
    { id: '1.8.8', label: '1.8.8 (WASM)', group: 'Releases', url: 'https://eaglercraft.com/play?version=1.8.8-wasm', touch: true },
    { id: '1.5.2', label: '1.5.2', group: 'Releases', url: 'https://eaglercraft.com/play?version=1.5.2', touch: true },
    { id: 'b1.7.3', label: 'Beta 1.7.3', group: 'Legacy', url: 'https://eaglercraft.com/play?version=b1.7.3', touch: true },
    { id: 'b1.3', label: 'Beta 1.3', group: 'Legacy', url: 'https://eaglercraft.com/play?version=b1.3', touch: true },
    { id: 'a1.2.6', label: 'Alpha 1.2.6', group: 'Legacy', url: 'https://eaglercraft.com/play?version=a1.2.6', touch: true },
    { id: 'indev', label: 'Indev', group: 'Legacy', url: 'https://eaglercraft.com/play?version=indev', touch: true },
];

const GROUP_ORDER = ['Snapshots', 'Releases', 'Legacy'];

const GROUP_DESC = {
    'Snapshots': 'The newest experimental clients',
    'Releases': 'Full release versions',
    'Legacy': 'Historic builds from the early days',
};

function buildUrl(version, touch) {
    if (!touch) return version.url;
    const joiner = version.url.includes('?') ? '&' : '?';
    return version.url + joiner + 'userscript=' + TOUCH_USERSCRIPT;
}

// -- Launcher home screen -----------------------------------------------------

function launcherHtml(lastPlayed) {
    const lastChip = lastPlayed
        ? `<div class="mcj-last">Last played: <span>${lastPlayed.label}</span></div>`
        : '';
    const groups = GROUP_ORDER.map(group => {
        const rows = VERSIONS.filter(v => v.group === group).map(v => `
            <div class="mcj-row" data-version="${v.id}">
                <div class="mcj-row-info">
                    <div class="mcj-row-name">${v.label}</div>
                    <div class="mcj-row-touch">${v.touch ? 'Touch controls available' : 'Touch controls may not be supported'}</div>
                </div>
                <button class="mcj-play-btn" title="Play ${v.label}">Play</button>
            </div>
        `).join('');
        return `
            <div class="mcj-group">
                <div class="mcj-group-head">
                    <span class="mcj-group-name">${group}</span>
                    <span class="mcj-group-desc">${GROUP_DESC[group]}</span>
                </div>
                ${rows}
            </div>
        `;
    }).join('');
    return `
        <div class="mcj-home">
            <div class="mcj-header">
                <div class="mcj-logo">${AppIcons.get('minecraftJava')}</div>
                <div>
                    <div class="mcj-title">Minecraft Java</div>
                    <div class="mcj-sub">Eaglercraft launcher — no account, no mods. Pick a version and play.</div>
                </div>
                ${lastChip}
            </div>
            <div class="mcj-list">${groups}</div>
            <div class="mcj-footnote">Touch controls use the Eaglermobile userscript and are only supported by some clients.
                If a client refuses to load, its host may not allow embedding.</div>
        </div>
    `;
}

// -- In-game view -------------------------------------------------------------

function gameHtml(version) {
    return `
        <div class="mcj-game">
            <div class="mcj-game-bar">
                <button class="mcj-back" title="Back to version list">
                    <svg viewBox="0 0 16 16" width="14" height="14" fill="none"><path d="M10.5 3 5.5 8l5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    Versions
                </button>
                <div class="mcj-game-title">Minecraft Java — ${version.label}</div>
                <label class="mcj-touch-toggle" title="Reload with on-screen touch controls">
                    <input type="checkbox" class="mcj-touch-check" ${version.touch ? 'checked' : ''}>
                    Touch controls
                </label>
                <button class="mcj-fullscreen" title="Fullscreen (F11)">
                    <svg viewBox="0 0 16 16" width="14" height="14" fill="none"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    <span>Fullscreen</span>
                </button>
            </div>
            <div class="mcj-frame-holder">
                <iframe class="mcj-frame" title="Minecraft Java ${version.label}" src="about:blank"
                    allow="autoplay; fullscreen; gamepad; pointer-lock; clipboard-write; screen-wake-lock; xr-spatial-tracking"
                    sandbox="allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-scripts allow-same-origin allow-downloads"></iframe>
            </div>
        </div>
    `;
}

const STYLES = `
    .mcj-home, .mcj-game { display:flex; flex-direction:column; height:100%; min-height:0;
        background:#141210; color:#e8e5df; font-family:'Segoe UI',sans-serif; box-sizing:border-box; }
    .mcj-home { overflow:auto; padding:20px 24px; }
    .mcj-header { display:flex; align-items:center; gap:14px; padding-bottom:16px;
        border-bottom:1px solid rgba(255,255,255,0.08); }
    .mcj-logo { width:48px; height:48px; flex:none; display:flex; align-items:center; justify-content:center;
        filter: drop-shadow(0 2px 6px rgba(0,0,0,0.5)); }
    .mcj-logo svg { width:44px; height:44px; }
    .mcj-title { font-size:21px; font-weight:600; letter-spacing:0.2px; }
    .mcj-sub { font-size:12px; color:#9a958c; margin-top:2px; }
    .mcj-last { margin-left:auto; font-size:11px; color:#9a958c; text-align:right; }
    .mcj-last span { color:#7ec850; font-weight:600; }
    .mcj-group { margin-top:18px; }
    .mcj-group-head { display:flex; align-items:baseline; gap:10px; margin-bottom:8px; }
    .mcj-group-name { font-size:13px; font-weight:600; text-transform:uppercase; letter-spacing:1px; color:#c9c4ba; }
    .mcj-group-desc { font-size:11px; color:#7a756c; }
    .mcj-row { display:flex; align-items:center; gap:12px; padding:9px 12px; border-radius:8px;
        background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06); margin-bottom:6px; }
    .mcj-row:hover { background:rgba(126,200,80,0.09); border-color:rgba(126,200,80,0.25); }
    .mcj-row-info { min-width:0; }
    .mcj-row-name { font-size:14px; font-weight:600; }
    .mcj-row-touch { font-size:11px; color:#8a857c; margin-top:1px; }
    .mcj-play-btn { margin-left:auto; flex:none; padding:6px 22px; border:none; border-radius:6px;
        background:#3d85c6; color:#fff; font-size:13px; font-weight:600; cursor:pointer; font-family:inherit; }
    .mcj-play-btn:hover { background:#4f9ada; }
    .mcj-play-btn:active { background:#2f6ca8; }
    .mcj-footnote { margin-top:16px; font-size:11px; color:#6d685f; line-height:1.5; }
    .mcj-game-bar { flex:none; display:flex; align-items:center; gap:10px; padding:6px 10px;
        background:#1d1b17; border-bottom:1px solid rgba(255,255,255,0.08); }
    .mcj-back, .mcj-fullscreen { display:flex; align-items:center; gap:6px; padding:5px 12px; border:none;
        border-radius:6px; background:rgba(255,255,255,0.07); color:#e8e5df; font-size:12px; font-weight:600;
        cursor:pointer; font-family:inherit; }
    .mcj-back:hover, .mcj-fullscreen:hover { background:rgba(255,255,255,0.14); }
    .mcj-game-title { font-size:13px; font-weight:600; color:#c9c4ba; white-space:nowrap; overflow:hidden;
        text-overflow:ellipsis; }
    .mcj-touch-toggle { margin-left:auto; display:flex; align-items:center; gap:6px; font-size:12px;
        color:#9a958c; cursor:pointer; white-space:nowrap; user-select:none; }
    .mcj-touch-toggle input { accent-color:#7ec850; cursor:pointer; }
    .mcj-fullscreen span { min-width:64px; text-align:left; }
    .mcj-frame-holder { flex:1; min-height:0; background:#000; }
    .mcj-frame { width:100%; height:100%; border:none; display:block; background:#000; }
`;

function launch() {
    const app = createApp({ id: 'minecraftJava', name: 'Minecraft Java' });

    const readLast = () => {
        try {
            const raw = app.files.read('lastplayed.json');
            if (raw) {
                const saved = JSON.parse(raw);
                return VERSIONS.find(v => v.id === saved.id) || null;
            }
        } catch { /* corrupt -> ignore */ }
        return null;
    };

    const win = app.window.create({
        title: 'Minecraft Java',
        icon: app.icon(),
        content: `<style>${STYLES}</style><div class="mcj-root">${launcherHtml(readLast())}</div>`,
        width: 900,
        height: 620,
        minWidth: 560,
        minHeight: 400
    });
    const el = win.element;

    let cleanupGame = null;

    const showLauncher = () => {
        if (cleanupGame) { cleanupGame(); cleanupGame = null; }
        if (app.window.isFullscreen(win.id)) app.window.exitFullscreen(win.id);
        app.window.setTitle(win.id, 'Minecraft Java');
        el.querySelector('.mcj-root').innerHTML = launcherHtml(readLast());
    };

    const showGame = (version) => {
        if (cleanupGame) { cleanupGame(); cleanupGame = null; }
        el.querySelector('.mcj-root').innerHTML = gameHtml(version);
        app.window.setTitle(win.id, `Minecraft Java — ${version.label}`);

        try { app.files.write('lastplayed.json', JSON.stringify({ id: version.id })); } catch { /* non-fatal */ }

        const game = el.querySelector('.mcj-game');
        const frame = el.querySelector('.mcj-frame');
        const touchCheck = el.querySelector('.mcj-touch-check');
        const fsBtn = el.querySelector('.mcj-fullscreen');
        let touchOn = touchCheck.checked;

        const loadFrame = () => { frame.src = buildUrl(version, touchOn); };
        loadFrame();

        touchCheck.addEventListener('change', () => {
            touchOn = touchCheck.checked;
            loadFrame();
        });

        const syncFsBtn = () => {
            const active = app.window.isFullscreen(win.id);
            fsBtn.querySelector('span').textContent = active ? 'Exit fullscreen' : 'Fullscreen';
        };
        document.addEventListener('fullscreenchange', syncFsBtn);

        const toggleFullscreen = () => {
            if (app.window.isFullscreen(win.id)) {
                app.window.exitFullscreen(win.id);
            } else {
                app.window.setFullscreen(win.id).catch(() => {
                    app.notify.warn('Minecraft Java', 'Fullscreen was blocked by the browser. Click the button again.');
                });
            }
        };
        fsBtn.addEventListener('click', toggleFullscreen);
        app.keyboard.register('F11', toggleFullscreen, { scope: game, description: 'Toggle game fullscreen' });

        el.querySelector('.mcj-back').addEventListener('click', showLauncher);

        // F11's scope (game element) self-unregisters when detached; the document
        // listener and this view's game state need explicit cleanup.
        cleanupGame = () => {
            document.removeEventListener('fullscreenchange', syncFsBtn);
            if (app.window.isFullscreen(win.id)) app.window.exitFullscreen(win.id);
            frame.src = 'about:blank';
        };
    };

    el.addEventListener('click', (e) => {
        const play = e.target.closest('.mcj-play-btn');
        if (!play) return;
        const row = play.closest('.mcj-row');
        const version = VERSIONS.find(v => v.id === row.dataset.version);
        if (version) showGame(version);
    });

    app.window.onClosed((appId, id) => {
        if (id === win.id && cleanupGame) cleanupGame();
    });
}

export default { launch, icon: AppIcons.get('minecraftJava') };
