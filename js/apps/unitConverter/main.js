// Unit Converter — 7 categories offline + history + clipboard.
import { createApp } from '../../sdk/index.js';
import AppIcons from '../../modules/appIcons.js';

const CATS = {
    Length: { base: 'm', units: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 } },
    Mass: { base: 'kg', units: { mg: 1e-6, g: 0.001, kg: 1, t: 1000, oz: 0.0283495, lb: 0.453592 } },
    Time: { base: 's', units: { ms: 0.001, s: 1, min: 60, h: 3600, day: 86400, week: 604800 } },
    Speed: { base: 'm/s', units: { 'm/s': 1, 'km/h': 1 / 3.6, 'mph': 0.44704, kn: 0.514444 } },
    Data: { base: 'B', units: { B: 1, KB: 1024, MB: 1048576, GB: 1073741824, TB: 1099511627776 } },
    Temperature: { base: 'C', units: { C: 1, F: 1, K: 1 } },
    Currency: { base: 'USD', units: { USD: 1, EUR: 1.08, GBP: 1.27, JPY: 0.0067, CHF: 1.12, CAD: 0.73 } }
};

function convert(cat, val, from, to) {
    if (cat === 'Temperature') {
        let c = from === 'C' ? val : from === 'F' ? (val - 32) * 5 / 9 : val - 273.15;
        return to === 'C' ? c : to === 'F' ? c * 9 / 5 + 32 : c + 273.15;
    }
    const u = CATS[cat].units;
    return val * u[from] / u[to];
}

function launch() {
    const app = createApp({ id: 'unitConverter', name: 'Unit Converter' });
    let hist = [];
    try { const raw = app.files.read('history.json'); if (raw) hist = JSON.parse(raw).hist || []; } catch { /* empty */ }
    const saveHist = () => { try { app.files.write('history.json', JSON.stringify({ hist: hist.slice(0, 30) })); } catch { /* ignore */ } };

    const win = app.window.create({
        title: 'Unit Converter', icon: app.icon(),
        content: `<div style="display:flex;flex-direction:column;height:100%;background:#101b1a;color:#fff;font-family:'Segoe UI',sans-serif;padding:16px;box-sizing:border-box;">
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;" class="uc-cats"></div>
            <input class="uc-val" type="number" value="1" style="background:#1e2e2d;border:1px solid #2f4a48;color:#fff;border-radius:8px;padding:10px;font-size:18px;outline:none;margin-bottom:8px;">
            <div style="display:flex;gap:8px;margin-bottom:8px;">
                <select class="uc-from" style="flex:1;background:#1e2e2d;border:1px solid #2f4a48;color:#fff;border-radius:8px;padding:8px;"></select>
                <button class="uc-swap" style="background:rgba(255,255,255,.1);border:none;color:#fff;border-radius:8px;padding:8px 12px;cursor:pointer;">⇄</button>
                <select class="uc-to" style="flex:1;background:#1e2e2d;border:1px solid #2f4a48;color:#fff;border-radius:8px;padding:8px;"></select>
            </div>
            <div class="uc-out" style="background:rgba(20,184,166,.12);border:1px solid rgba(20,184,166,.4);border-radius:8px;padding:12px;font-size:20px;font-weight:600;margin-bottom:8px;">—</div>
            <div style="display:flex;gap:8px;margin-bottom:8px;">
                <button class="uc-copy" style="flex:1;background:#0d9488;border:none;color:#fff;border-radius:8px;padding:8px;cursor:pointer;font-weight:600;">Copy result</button>
                <button class="uc-clear" style="background:rgba(255,255,255,.08);border:none;color:#fff;border-radius:8px;padding:8px 12px;cursor:pointer;">Clear history</button>
            </div>
            <div class="uc-hist" style="flex:1;overflow:auto;display:flex;flex-direction:column;gap:4px;font-size:12px;color:#bbb;"></div>
        </div>`,
        width: 360, height: 540
    });
    const el = win.element;
    let cat = 'Length';
    const catsEl = el.querySelector('.uc-cats');

    function paintCats() {
        catsEl.innerHTML = '';
        Object.keys(CATS).forEach(c => {
            const b = document.createElement('button');
            b.textContent = c;
            b.style.cssText = `background:${c === cat ? '#0d9488' : 'rgba(255,255,255,.08)'};border:none;color:#fff;border-radius:12px;padding:5px 12px;cursor:pointer;font-size:12px;`;
            b.addEventListener('click', () => { cat = c; paintCats(); paintUnits(); calc(); });
            catsEl.appendChild(b);
        });
    }
    function paintUnits() {
        const units = Object.keys(CATS[cat].units);
        const f = el.querySelector('.uc-from'), t = el.querySelector('.uc-to');
        f.innerHTML = units.map(u => `<option>${u}</option>`).join('');
        t.innerHTML = units.map(u => `<option>${u}</option>`).join('');
        t.selectedIndex = units.length > 1 ? 1 : 0;
    }
    function fmt(n) {
        if (!Number.isFinite(n)) return '—';
        const a = Math.abs(n);
        if (a !== 0 && (a >= 1e12 || a < 1e-6)) return n.toExponential(4);
        return String(Math.round(n * 1e6) / 1e6);
    }
    function calc() {
        const v = Number(el.querySelector('.uc-val').value);
        const from = el.querySelector('.uc-from').value;
        const to = el.querySelector('.uc-to').value;
        if (!Number.isFinite(v)) { el.querySelector('.uc-out').textContent = '—'; return null; }
        const r = convert(cat, v, from, to);
        el.querySelector('.uc-out').textContent = `${fmt(v)} ${from} = ${fmt(r)} ${to}`;
        return { text: `${fmt(v)} ${from} = ${fmt(r)} ${to}`, v, from, to, r };
    }
    function paintHist() {
        el.querySelector('.uc-hist').innerHTML = hist.length
            ? hist.map(h => `<div style="background:rgba(255,255,255,.05);border-radius:6px;padding:6px 9px;">${escapeHtml(h)}</div>`).join('')
            : '<div style="color:#555;">No conversions yet.</div>';
    }
    function pushHist() {
        const r = calc();
        if (r) { hist.unshift(`${cat}: ${r.text}`); hist = hist.slice(0, 30); saveHist(); paintHist(); }
    }
    ['.uc-val', '.uc-from', '.uc-to'].forEach(s => el.querySelector(s).addEventListener('input', calc));
    el.querySelector('.uc-from').addEventListener('change', pushHist);
    el.querySelector('.uc-to').addEventListener('change', pushHist);
    el.querySelector('.uc-val').addEventListener('change', pushHist);
    el.querySelector('.uc-swap').addEventListener('click', () => {
        const f = el.querySelector('.uc-from'), t = el.querySelector('.uc-to');
        const i = f.selectedIndex; f.selectedIndex = t.selectedIndex; t.selectedIndex = i;
        pushHist(); calc();
    });
    el.querySelector('.uc-copy').addEventListener('click', async () => {
        const r = calc();
        if (!r) return;
        try { await app.clipboard.writeText(String(r.r)); app.notify.info('Unit Converter', 'Result copied.'); }
        catch { await app.dialogs.alert('Copy failed', 'Clipboard permission was denied.'); }
    });
    el.querySelector('.uc-clear').addEventListener('click', () => { hist = []; saveHist(); paintHist(); });
    paintCats(); paintUnits(); calc(); paintHist();
    app.shell.activity.trackAppOpen('unitConverter');
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

export default { launch, icon: AppIcons.get('unitConverter') };
