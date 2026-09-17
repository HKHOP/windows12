// Weather — Open-Meteo current + hourly, saved city, background alerts.
import { createApp } from '../../sdk/index.js';
import AppIcons from '../../modules/appIcons.js';

let bgTimer = null;
const WMO = { 0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Icy fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 80: 'Light showers', 81: 'Showers', 82: 'Violent showers', 95: 'Thunderstorm', 96: 'Storm + hail', 99: 'Storm + hail' };

function prefs(app) {
    try {
        const raw = app.files.read('prefs.json');
        if (raw) return { city: 'London', lat: 51.5, lon: -0.12, lastCode: null, ...JSON.parse(raw) };
    } catch { /* defaults */ }
    return { city: 'London', lat: 51.5, lon: -0.12, lastCode: null };
}
function savePrefs(app, p) { app.files.write('prefs.json', JSON.stringify(p)); }

async function fetchWeather(lat, lon) {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&hourly=temperature_2m,weather_code&forecast_days=2&timezone=auto`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
}
async function geocode(q) {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    return d.results || [];
}

function launch() {
    const app = createApp({ id: 'weather', name: 'Weather' });
    const win = app.window.create({
        title: 'Weather', icon: app.icon(),
        content: `<div style="display:flex;flex-direction:column;height:100%;background:linear-gradient(160deg,#0c2a4d,#0ea5e9);color:#fff;font-family:'Segoe UI',sans-serif;padding:16px;box-sizing:border-box;">
            <div style="display:flex;gap:8px;">
                <input class="w-q" placeholder="Search city…" style="flex:1;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);color:#fff;border-radius:8px;padding:8px 10px;font-size:13px;outline:none;">
                <button class="w-go" style="background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.3);color:#fff;border-radius:8px;padding:8px 14px;cursor:pointer;font-weight:600;">Go</button>
            </div>
            <div class="w-results" style="display:flex;flex-direction:column;gap:4px;margin-top:6px;"></div>
            <div class="w-body" style="flex:1;overflow:auto;margin-top:8px;"><div style="color:rgba(255,255,255,.8);font-size:13px;">Loading…</div></div>
        </div>`,
        width: 380, height: 540
    });
    const el = win.element;
    const q = el.querySelector('.w-q');
    const results = el.querySelector('.w-results');
    const body = el.querySelector('.w-body');

    async function show() {
        const p = prefs(app);
        body.innerHTML = '<div style="color:rgba(255,255,255,.8);font-size:13px;">Loading…</div>';
        try {
            const d = await fetchWeather(p.lat, p.lon);
            const c = d.current;
            const hours = d.hourly.time.slice(0, 24).map((t, i) => ({
                t: t.slice(11, 16),
                temp: Math.round(d.hourly.temperature_2m[i]),
                desc: WMO[d.hourly.weather_code[i]] || '—'
            }));
            body.innerHTML = `
                <div style="font-size:15px;opacity:.85;">${escapeHtml(p.city)}</div>
                <div style="font-size:56px;font-weight:200;line-height:1;">${Math.round(c.temperature_2m)}°</div>
                <div style="font-size:15px;margin-bottom:4px;">${WMO[c.weather_code] || '—'}</div>
                <div style="font-size:12px;opacity:.85;margin-bottom:12px;">Wind ${c.wind_speed_10m} km/h · Humidity ${c.relative_humidity_2m}%</div>
                <div style="font-size:11px;text-transform:uppercase;opacity:.7;margin-bottom:6px;">Next 24 hours</div>
                <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:6px;">
                    ${hours.map(h => `<div style="flex:none;background:rgba(255,255,255,.15);border-radius:8px;padding:8px 10px;text-align:center;min-width:62px;">
                        <div style="font-size:11px;opacity:.8;">${h.t}</div>
                        <div style="font-size:15px;font-weight:600;">${h.temp}°</div>
                        <div style="font-size:10px;opacity:.8;">${h.desc}</div>
                    </div>`).join('')}
                </div>`;
            const prev = prefs(app);
            prev.lastCode = c.weather_code;
            savePrefs(app, prev);
        } catch {
            body.innerHTML = '<div style="font-size:13px;">Could not load weather. Check your connection and try again.</div>';
        }
    }

    async function search() {
        const term = q.value.trim();
        if (!term) return;
        results.innerHTML = '<div style="font-size:12px;opacity:.8;">Searching…</div>';
        try {
            const list = await geocode(term);
            results.innerHTML = list.length ? '' : '<div style="font-size:12px;">No cities found.</div>';
            list.forEach(g => {
                const b = document.createElement('button');
                b.textContent = `${g.name}, ${g.country || ''}`;
                b.style.cssText = 'text-align:left;background:rgba(255,255,255,.15);border:none;color:#fff;border-radius:6px;padding:7px 10px;cursor:pointer;font-size:13px;';
                b.addEventListener('click', () => {
                    savePrefs(app, { ...prefs(app), city: g.name, lat: g.latitude, lon: g.longitude });
                    q.value = ''; results.innerHTML = '';
                    show();
                });
                results.appendChild(b);
            });
        } catch { results.innerHTML = '<div style="font-size:12px;">Search failed — offline?</div>'; }
    }
    el.querySelector('.w-go').addEventListener('click', search);
    q.addEventListener('keydown', e => { if (e.key === 'Enter') search(); });
    show();
    app.shell.activity.trackAppOpen('weather');
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

async function poll(app) {
    const p = prefs(app);
    try {
        const d = await fetchWeather(p.lat, p.lon);
        const code = d.current.weather_code;
        if (p.lastCode !== null && code !== p.lastCode) {
            const severe = code >= 95 || code === 65 || code === 75 || code === 82;
            if (severe) app.notify.action('Weather alert', `${p.city}: ${WMO[code] || 'conditions changed'} (${Math.round(d.current.temperature_2m)}°)`, {
                critical: true, actions: [{ label: 'Open', value: 'open', primary: true }],
                onAction: () => launch()
            });
            else app.notify.info('Weather', `${p.city}: now ${WMO[code] || '—'}, ${Math.round(d.current.temperature_2m)}° (was ${WMO[p.lastCode] || '—'}).`);
        }
        p.lastCode = code; savePrefs(app, p);
    } catch { /* offline — stay quiet */ }
}
async function onBackground() {
    const app = createApp({ id: 'weather', name: 'Weather' });
    poll(app);
    bgTimer = setInterval(() => poll(app), 30 * 60 * 1000);
}
async function onShutdown() { if (bgTimer) clearInterval(bgTimer); bgTimer = null; }

export default { launch, onBackground, onShutdown, icon: AppIcons.get('weather') };
