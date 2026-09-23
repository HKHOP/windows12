// Apex Drive 3D — full 3D driving simulator.
// Modes: Circuit Race (3 laps vs 3 AI rivals) and Free Roam (open world,
// ramps, boost rings). WASD/arrows to drive, Space = boost.
// Engine split into scripts/: util, geo, world, car, audio, hud, game.
// Built on the SDK; createApp() is called inside launch() only.

import { createApp } from '../../sdk/index.js';
import { WindowManager as SDKWM } from '../../sdk/index.js';
import AppIcons from '../../modules/appIcons.js';
import { startGame } from './scripts/game.js';
import { fmtTime } from './scripts/util.js';

const APP_ID = 'apexDrive';
const icon = AppIcons.get('apexDrive');

function shellHTML(rec) {
    const best = rec.bestLapMs ? fmtTime(rec.bestLapMs) : '--';
    const top = rec.topSpeedKmh ? Math.round(rec.topSpeedKmh) + ' km/h' : '--';
    return `
    <style>
        .ax-root { position:relative; width:100%; height:100%; background:#0b0e13; overflow:hidden; outline:none; font-family:'Segoe UI',sans-serif; user-select:none; }
        .ax-root canvas.ax-3d { position:absolute; inset:0; width:100%; height:100%; display:block; }
        .ax-menu { position:absolute; inset:0; z-index:10; display:flex; align-items:center; justify-content:center; background:radial-gradient(1200px 700px at 50% 20%, #1c2942 0%, #0b0e13 70%); overflow:auto; }
        .ax-menu.hidden { display:none; }
        .ax-card { text-align:center; color:#fff; max-width:640px; padding:20px; }
        .ax-title { font-size:52px; font-weight:800; letter-spacing:3px; margin:0; background:linear-gradient(90deg,#f472b6,#e11d48,#f59e0b); -webkit-background-clip:text; background-clip:text; color:transparent; }
        .ax-sub { color:#9fb0c7; margin:6px 0 22px; font-size:14px; }
        .ax-modes { display:flex; gap:14px; justify-content:center; margin-bottom:18px; flex-wrap:wrap; }
        .ax-mode { width:250px; padding:18px 16px; border-radius:14px; border:1px solid #334155; cursor:pointer; background:#141b28; color:#fff; text-align:left; transition:transform .12s, border-color .12s; }
        .ax-mode:hover { transform:translateY(-3px); border-color:#e11d48; }
        .ax-mode h3 { margin:0 0 6px; font-size:18px; }
        .ax-mode p { margin:0; font-size:12px; color:#9fb0c7; line-height:1.5; }
        .ax-rec { display:flex; gap:16px; justify-content:center; color:#7d8ea8; font-size:12px; margin-bottom:14px; flex-wrap:wrap; }
        .ax-rec b { color:#fff; }
        .ax-keys { color:#7d8ea8; font-size:12px; line-height:2; }
        .ax-keys b { color:#fff; background:rgba(255,255,255,.1); padding:1px 8px; border-radius:4px; border:1px solid #334155; }
        .ax-hud { position:absolute; inset:0; pointer-events:none; z-index:5; display:none; }
        .ax-hud.on { display:block; }
        .ax-speed { position:absolute; left:16px; bottom:14px; color:#fff; text-shadow:0 2px 8px #000; }
        .ax-speed .v { font-size:44px; font-weight:800; line-height:1; }
        .ax-speed .u { font-size:13px; color:#9fb0c7; }
        .ax-boost { width:190px; height:9px; background:rgba(255,255,255,.15); border-radius:6px; margin-top:8px; overflow:hidden; border:1px solid rgba(255,255,255,.2); }
        .ax-boost > div { height:100%; width:100%; background:linear-gradient(90deg,#22d3ee,#818cf8); border-radius:6px; }
        .ax-boost.low > div { background:linear-gradient(90deg,#ef4444,#f59e0b); }
        .ax-race { position:absolute; top:10px; left:50%; transform:translateX(-50%); display:flex; gap:10px; align-items:center; }
        .ax-pill { background:rgba(8,10,15,.65); border:1px solid #334155; color:#fff; border-radius:20px; padding:6px 16px; font-size:14px; font-weight:600; white-space:nowrap; }
        .ax-pill small { color:#9fb0c7; font-weight:400; margin-right:6px; }
        .ax-pos { position:absolute; top:64px; left:50%; transform:translateX(-50%); font-size:13px; color:#fbbf24; font-weight:700; text-shadow:0 1px 6px #000; }
        .ax-msg { position:absolute; top:32%; width:100%; text-align:center; font-size:54px; font-weight:800; color:#fff; text-shadow:0 4px 24px #000; letter-spacing:2px; }
        .ax-sub2 { position:absolute; top:calc(32% + 66px); width:100%; text-align:center; font-size:15px; color:#e2e8f0; text-shadow:0 2px 8px #000; }
        .ax-warn { position:absolute; top:120px; width:100%; text-align:center; font-size:26px; font-weight:800; color:#ef4444; text-shadow:0 2px 10px #000; display:none; }
        .ax-map { position:absolute; top:10px; right:10px; width:150px; height:150px; background:rgba(8,10,15,.65); border:1px solid #334155; border-radius:12px; display:none; }
        .ax-map.on { display:block; }
        .ax-btns { position:absolute; bottom:14px; right:12px; display:flex; gap:8px; pointer-events:auto; }
        .ax-btns button { background:rgba(8,10,15,.7); border:1px solid #334155; color:#e2e8f0; border-radius:8px; padding:7px 12px; font-size:12px; cursor:pointer; }
        .ax-btns button:hover { border-color:#e11d48; color:#fff; }
        .ax-touch { position:absolute; inset:0; z-index:6; display:none; pointer-events:none; }
        .ax-root.touch .ax-touch.on { display:block; }
        .ax-tbtn { position:absolute; pointer-events:auto; width:66px; height:66px; border-radius:50%; background:rgba(255,255,255,.12); border:2px solid rgba(255,255,255,.3); color:#fff; font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center; }
        .ax-tbtn:active { background:rgba(225,29,72,.5); }
        .ax-final { position:absolute; inset:0; z-index:9; display:none; align-items:center; justify-content:center; background:rgba(5,7,10,.72); }
        .ax-final.on { display:flex; }
        .ax-panel { background:#141b28; border:1px solid #334155; border-radius:16px; padding:28px 36px; color:#fff; text-align:center; min-width:340px; }
        .ax-panel h2 { margin:0 0 4px; font-size:30px; }
        .ax-panel .t { color:#9fb0c7; font-size:13px; margin-bottom:14px; }
        .ax-row { display:flex; justify-content:space-between; gap:30px; font-size:14px; padding:5px 0; border-bottom:1px solid #243046; }
        .ax-row b { color:#fbbf24; }
        .ax-panel button { margin-top:16px; background:#e11d48; border:none; color:#fff; padding:10px 26px; border-radius:9px; font-size:14px; font-weight:700; cursor:pointer; }
        .ax-panel button.ghost { background:transparent; border:1px solid #475569; margin-left:8px; }
    </style>
    <div class="ax-root" tabindex="0">
        <canvas class="ax-3d"></canvas>
        <canvas class="ax-map" width="150" height="150"></canvas>
        <div class="ax-hud">
            <div class="ax-speed"><div class="v">0</div><div class="u">km/h &nbsp;·&nbsp; <span class="gear">D</span></div><div class="ax-boost"><div></div></div></div>
            <div class="ax-race">
                <div class="ax-pill pill-a"><small>LAP</small><span>1/3</span></div>
                <div class="ax-pill pill-b"><small>TIME</small><span>0:00.0</span></div>
                <div class="ax-pill pill-c"><small>BEST</small><span>--</span></div>
            </div>
            <div class="ax-pos"></div>
            <div class="ax-msg"></div>
            <div class="ax-sub2"></div>
            <div class="ax-warn">WRONG WAY</div>
            <div class="ax-btns">
                <button class="b-cam">Camera: Chase</button>
                <button class="b-sound">Sound: On</button>
                <button class="b-reset">Reset (R)</button>
                <button class="b-quit">Menu (Esc)</button>
            </div>
        </div>
        <div class="ax-touch">
            <div class="ax-tbtn t-left" style="left:16px;bottom:110px;">&#9664;</div>
            <div class="ax-tbtn t-right" style="left:96px;bottom:110px;">&#9654;</div>
            <div class="ax-tbtn t-gas" style="right:16px;bottom:150px;">GAS</div>
            <div class="ax-tbtn t-brake" style="right:16px;bottom:70px;">BRK</div>
            <div class="ax-tbtn t-boost" style="right:96px;bottom:70px;">BOOST</div>
        </div>
        <div class="ax-menu"><div class="ax-card">
            <p class="ax-title">APEX DRIVE 3D</p>
            <p class="ax-sub">Full 3D driving simulator — mountain circuit, open world, boost</p>
            <div class="ax-modes">
                <div class="ax-mode m-race"><h3>Circuit Race</h3><p>3 laps against 3 AI rivals on the lakeside mountain circuit. Hit every checkpoint — fastest lap is saved.</p></div>
                <div class="ax-mode m-roam"><h3>Free Roam</h3><p>Open world: forests, lake, mountains, ramps and 12 gold boost rings. No rules — chase your top speed.</p></div>
            </div>
            <div class="ax-rec"><span>Best lap <b class="r-best">${best}</b></span><span>Top speed <b class="r-top">${top}</b></span></div>
            <div class="ax-keys"><b>W A S D</b> drive &nbsp; <b>Space</b> boost &nbsp; <b>R</b> reset &nbsp; <b>C</b> camera &nbsp; <b>N</b> sound &nbsp; <b>Esc</b> menu</div>
        </div></div>
        <div class="ax-final"></div>
    </div>`;
}

function loadRec(app) {
    try {
        const raw = app.files.read('records.json');
        if (raw) return Object.assign({ bestLapMs: null, bestRaceMs: null, topSpeedKmh: 0, ringsTotal: 0 }, JSON.parse(raw));
    } catch (e) { /* corrupt -> defaults */ }
    return { bestLapMs: null, bestRaceMs: null, topSpeedKmh: 0, ringsTotal: 0 };
}

function launch() {
    const app = createApp({ id: APP_ID, name: 'Apex Drive 3D' });
    const rec = loadRec(app);
    function saveRec() {
        try { app.files.write('records.json', JSON.stringify(rec)); } catch (e) { /* storage full — keep playing */ }
    }
    const win = app.window.create({
        title: 'Apex Drive 3D',
        icon: app.icon(),
        content: shellHTML(rec),
        width: 1020, height: 640, minWidth: 640, minHeight: 420
    });
    const el = win.element;
    const root = el.querySelector('.ax-root');
    let session = null;

    function showMenu() {
        el.querySelector('.ax-menu').classList.remove('hidden');
        const best = rec.bestLapMs ? fmtTime(rec.bestLapMs) : '--';
        const top = rec.topSpeedKmh ? Math.round(rec.topSpeedKmh) + ' km/h' : '--';
        el.querySelector('.r-best').textContent = best;
        el.querySelector('.r-top').textContent = top;
    }
    function play(mode) {
        el.querySelector('.ax-menu').classList.add('hidden');
        try {
            session = startGame({
                root, app, mode, rec, saveRec,
                onQuit: () => { session = null; saveRec(); showMenu(); },
                onRetry: () => play(mode)
            });
        } catch (err) {
            session = null;
            showMenu();
            app.dialogs.alert('Apex Drive 3D', 'Could not start 3D mode: ' + err.message);
        }
    }

    el.querySelector('.m-race').addEventListener('click', () => play('race'));
    el.querySelector('.m-roam').addEventListener('click', () => play('roam'));
    app.shell.activity.trackAppOpen(APP_ID);

    const unsubMin = SDKWM.onMinimizeState((appId, id, minimized) => {
        if (id !== win.id || !session) return;
        // RAF pauses on its own; nothing else needed while minimized.
    });
    const unsubClosed = SDKWM.onClosed((appId, id) => {
        if (id !== win.id) return;
        try { if (session) session.destroy(); } catch (e) { /* ignore */ }
        saveRec();
        unsubMin(); unsubClosed();
    });
}

export default { launch };
