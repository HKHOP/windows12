// Pomodoro Focus — timestamp-based phases, works headless.
import { createApp } from '../../sdk/index.js';
import Sounds from '../../modules/sounds.js';
import AppIcons from '../../modules/appIcons.js';

let bgTimer = null;

function load(app) {
    try {
        const raw = app.files.read('state.json');
        if (raw) return { focus: 25, short: 5, long: 15, phase: 'focus', endAt: 0, running: false, completed: 0, totalMin: 0, ...JSON.parse(raw) };
    } catch { /* defaults */ }
    return { focus: 25, short: 5, long: 15, phase: 'focus', endAt: 0, running: false, completed: 0, totalMin: 0 };
}
function save(app, s) { app.files.write('state.json', JSON.stringify(s)); }
function phaseLen(s) { return (s.phase === 'focus' ? s.focus : s.phase === 'short' ? s.short : s.long) * 60 * 1000; }
function phaseName(s) { return s.phase === 'focus' ? 'Focus' : s.phase === 'short' ? 'Short break' : 'Long break'; }

function advance(app) {
    const s = load(app);
    if (s.phase === 'focus') { s.completed++; s.totalMin += s.focus; }
    s.phase = s.phase === 'focus' ? (s.completed % 4 === 0 ? 'long' : 'short') : 'focus';
    s.endAt = Date.now() + phaseLen(s);
    save(app, s);
    app.notify.info('Pomodoro', s.phase === 'focus' ? 'Break over — back to focus!' : `${phaseName(s)} time — take a breath.`);
    try { Sounds.confirm(); } catch { /* sound optional */ }
    return s;
}

function launch() {
    const app = createApp({ id: 'pomodoro', name: 'Pomodoro Focus' });
    const win = app.window.create({
        title: 'Pomodoro Focus', icon: app.icon(),
        content: `<div class="pm-root" style="display:flex;flex-direction:column;height:100%;background:#1b1214;color:#fff;font-family:'Segoe UI',sans-serif;padding:20px;box-sizing:border-box;text-align:center;">
            <div class="pm-phase" style="font-size:13px;color:#bbb;text-transform:uppercase;letter-spacing:1px;"></div>
            <div class="pm-time" style="font-size:72px;font-weight:200;margin:6px 0;">25:00</div>
            <div class="pm-dots" style="font-size:12px;color:#888;margin-bottom:12px;"></div>
            <div style="display:flex;gap:8px;justify-content:center;">
                <button class="pm-toggle" style="background:#dc2626;border:none;color:#fff;border-radius:8px;padding:10px 26px;cursor:pointer;font-weight:700;font-size:14px;">Start</button>
                <button class="pm-reset" style="background:rgba(255,255,255,.1);border:none;color:#fff;border-radius:8px;padding:10px 16px;cursor:pointer;">Reset</button>
            </div>
            <div style="display:flex;gap:8px;justify-content:center;margin-top:14px;font-size:12px;color:#aaa;">
                <label>Focus <input class="pm-f" type="number" min="1" max="120" value="25" style="width:44px;background:#2a2a2a;border:1px solid #444;color:#fff;border-radius:4px;padding:3px;"></label>
                <label>Short <input class="pm-s" type="number" min="1" max="60" value="5" style="width:44px;background:#2a2a2a;border:1px solid #444;color:#fff;border-radius:4px;padding:3px;"></label>
                <label>Long <input class="pm-l" type="number" min="1" max="90" value="15" style="width:44px;background:#2a2a2a;border:1px solid #444;color:#fff;border-radius:4px;padding:3px;"></label>
            </div>
            <div class="pm-stats" style="margin-top:auto;font-size:11px;color:#777;"></div>
        </div>`,
        width: 340, height: 480
    });
    const el = win.element;
    const s0 = load(app);
    el.querySelector('.pm-f').value = s0.focus;
    el.querySelector('.pm-s').value = s0.short;
    el.querySelector('.pm-l').value = s0.long;

    function remaining() {
        const s = load(app);
        if (!s.running) return { s, ms: s.remaining ?? phaseLen(s) };
        const ms = s.endAt - Date.now();
        if (ms <= 0) { const ns = advance(app); return { s: ns, ms: phaseLen(ns) }; }
        return { s, ms };
    }
    function paint() {
        const { s, ms } = remaining();
        const m = Math.floor(ms / 60000), sec = Math.floor((ms % 60000) / 1000);
        el.querySelector('.pm-time').textContent = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        el.querySelector('.pm-phase').textContent = phaseName(s);
        el.querySelector('.pm-dots').textContent = '●'.repeat(s.completed % 4) + '○'.repeat(4 - (s.completed % 4)) + `  (${s.completed} sessions)`;
        el.querySelector('.pm-toggle').textContent = s.running ? 'Pause' : 'Start';
        el.querySelector('.pm-stats').textContent = `Lifetime: ${s.completed} sessions · ${s.totalMin} focus minutes`;
        el.querySelector('.pm-root').style.background = s.phase === 'focus' ? '#1b1214' : '#0e1a12';
    }
    el.querySelector('.pm-toggle').addEventListener('click', () => {
        const s = load(app);
        if (s.running) {
            s.remaining = Math.max(0, s.endAt - Date.now());
            s.running = false;
        } else {
            s.endAt = Date.now() + (s.remaining ?? phaseLen(s));
            s.remaining = undefined;
            s.running = true;
        }
        save(app, s); paint();
    });
    el.querySelector('.pm-reset').addEventListener('click', () => {
        const s = load(app);
        s.running = false; s.phase = 'focus'; s.remaining = undefined;
        save(app, s); paint();
    });
    [['.pm-f', 'focus'], ['.pm-s', 'short'], ['.pm-l', 'long']].forEach(([sel, key]) => {
        el.querySelector(sel).addEventListener('change', (e) => {
            const s = load(app);
            const v = Math.max(1, Math.min(180, Number(e.target.value) || s[key]));
            s[key] = v;
            if (!s.running) s.remaining = phaseLen(s);
            save(app, s); paint();
        });
    });
    paint();
    const iv = setInterval(() => { if (!el.isConnected) clearInterval(iv); else paint(); }, 1000);
    app.shell.activity.trackAppOpen('pomodoro');
}

async function onBackground() {
    const app = createApp({ id: 'pomodoro', name: 'Pomodoro Focus' });
    const tick = () => {
        const s = load(app);
        if (s.running && Date.now() >= s.endAt) advance(app);
    };
    tick();
    bgTimer = setInterval(tick, 5000);
}
async function onShutdown() { if (bgTimer) clearInterval(bgTimer); bgTimer = null; }

export default { launch, onBackground, onShutdown, icon: AppIcons.get('pomodoro') };
