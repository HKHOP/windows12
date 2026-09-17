// To-Do Tasks — lists, priorities, due dates + background reminders.
import { createApp } from '../../sdk/index.js';
import AppIcons from '../../modules/appIcons.js';

const PRIOS = ['Low', 'Normal', 'High'];
let bgTimer = null;

function load(app) {
    try {
        const raw = app.files.read('tasks.json');
        if (raw) {
            const d = JSON.parse(raw);
            if (Array.isArray(d.tasks)) return d;
        }
    } catch { /* corrupt -> defaults */ }
    return { tasks: [], list: 'General', lists: ['General'] };
}
function save(app, d) { app.files.write('tasks.json', JSON.stringify(d)); }

function checkDue(app, notifyUser) {
    const d = load(app);
    const now = Date.now();
    let changed = false;
    for (const t of d.tasks) {
        if (!t.done && !t.reminded && t.due && t.due <= now) {
            t.reminded = true; changed = true;
            if (notifyUser) app.notify.action('Task due', `${t.title} (${d.lists.includes(t.list) ? t.list : ''})`, {
                actions: [{ label: 'Mark done', value: 'done', primary: true }, { label: 'Later', value: 'later' }],
                onAction: (v) => {
                    if (v === 'done') {
                        const dd = load(app);
                        const tt = dd.tasks.find(x => x.id === t.id);
                        if (tt) { tt.done = true; save(app, dd); }
                    }
                }
            });
        }
    }
    if (changed) save(app, d);
}

function rowHtml(t) {
    const due = t.due ? new Date(t.due).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const over = !t.done && t.due && t.due < Date.now();
    return `<div class="td-row" data-id="${t.id}" style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;background:${t.done ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)'};${over ? 'border:1px solid rgba(239,68,68,.5);' : ''}">
        <button class="td-toggle" style="width:20px;height:20px;border-radius:50%;border:2px solid ${t.done ? '#4ade80' : '#666'};background:${t.done ? '#4ade80' : 'transparent'};cursor:pointer;flex:none;"></button>
        <div style="flex:1;min-width:0;">
            <div style="font-size:13px;${t.done ? 'text-decoration:line-through;color:#888;' : 'color:#fff;'}white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(t.title)}</div>
            <div style="font-size:11px;color:${over ? '#f87171' : '#888'};">${t.list} · ${t.prio}${due ? ' · ' + due : ''}</div>
        </div>
        <button class="td-del" style="background:none;border:none;color:#777;cursor:pointer;font-size:14px;">×</button>
    </div>`;
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function launch() {
    const app = createApp({ id: 'todoTasks', name: 'To-Do Tasks' });
    const win = app.window.create({
        title: 'To-Do Tasks', icon: app.icon(),
        content: `<div style="display:flex;height:100%;background:#1b1b1b;color:#fff;font-family:'Segoe UI',sans-serif;">
            <div style="width:150px;background:#222;border-right:1px solid #333;padding:10px;display:flex;flex-direction:column;gap:4px;">
                <div style="font-size:11px;color:#888;text-transform:uppercase;margin:2px 4px;">Lists</div>
                <div class="td-lists" style="flex:1;overflow:auto;display:flex;flex-direction:column;gap:2px;"></div>
                <button class="td-newlist" style="background:rgba(255,255,255,.07);border:none;color:#fff;border-radius:6px;padding:6px;cursor:pointer;font-size:12px;">+ List</button>
            </div>
            <div style="flex:1;display:flex;flex-direction:column;min-width:0;">
                <div style="padding:12px;display:flex;gap:8px;">
                    <input class="td-input" placeholder="Add a task…" style="flex:1;background:#2a2a2a;border:1px solid #444;color:#fff;border-radius:6px;padding:8px 10px;font-size:13px;outline:none;">
                    <button class="td-add" style="background:#0078D4;border:none;color:#fff;border-radius:6px;padding:8px 14px;cursor:pointer;font-weight:600;">Add</button>
                </div>
                <div style="padding:0 12px 8px;display:flex;gap:6px;font-size:12px;color:#aaa;">
                    <button class="td-f" data-f="all" style="background:#0078D4;border:none;color:#fff;border-radius:10px;padding:3px 10px;cursor:pointer;">All</button>
                    <button class="td-f" data-f="open" style="background:rgba(255,255,255,.08);border:none;color:#fff;border-radius:10px;padding:3px 10px;cursor:pointer;">Open</button>
                    <button class="td-f" data-f="done" style="background:rgba(255,255,255,.08);border:none;color:#fff;border-radius:10px;padding:3px 10px;cursor:pointer;">Done</button>
                </div>
                <div class="td-items" style="flex:1;overflow:auto;padding:0 12px 12px;display:flex;flex-direction:column;gap:6px;"></div>
                <div class="td-stats" style="padding:8px 12px;border-top:1px solid #333;font-size:11px;color:#888;"></div>
            </div>
        </div>`,
        width: 640, height: 480
    });
    const el = win.element;
    let filter = 'all';
    const norm = (d) => { if (!d.lists.includes(d.list)) d.list = d.lists[0] || 'General'; return d; };

    function paint() {
        const d = norm(load(app));
        el.querySelector('.td-lists').innerHTML = d.lists.map(l =>
            `<button data-l="${escapeHtml(l)}" style="text-align:left;background:${l === d.list ? '#0078D4' : 'transparent'};border:none;color:#fff;border-radius:6px;padding:7px 10px;cursor:pointer;font-size:13px;">${escapeHtml(l)}</button>`).join('');
        let items = d.tasks.filter(t => t.list === d.list);
        if (filter === 'open') items = items.filter(t => !t.done);
        if (filter === 'done') items = items.filter(t => t.done);
        items.sort((a, b) => (a.done - b.done) || ((a.due || 9e15) - (b.due || 9e15)));
        el.querySelector('.td-items').innerHTML = items.length ? items.map(rowHtml).join('')
            : '<div style="color:#666;font-size:13px;text-align:center;margin-top:30px;">No tasks — add one above.</div>';
        const open = d.tasks.filter(t => !t.done).length;
        const due = d.tasks.filter(t => !t.done && t.due && t.due < Date.now()).length;
        el.querySelector('.td-stats').textContent = `${d.tasks.length} tasks · ${open} open${due ? ` · ${due} overdue` : ''}`;
        el.querySelectorAll('.td-lists button').forEach(b => b.addEventListener('click', () => {
            const dd = norm(load(app)); dd.list = b.dataset.l; save(app, dd); paint();
        }));
        el.querySelectorAll('.td-row').forEach(r => {
            const id = Number(r.dataset.id);
            r.querySelector('.td-toggle').addEventListener('click', () => {
                const dd = load(app); const t = dd.tasks.find(x => x.id === id);
                if (t) { t.done = !t.done; save(app, dd); paint(); }
            });
            r.querySelector('.td-del').addEventListener('click', async () => {
                if (await app.dialogs.confirm('Delete task', 'Delete this task?')) {
                    const dd = load(app); dd.tasks = dd.tasks.filter(x => x.id !== id); save(app, dd); paint();
                }
            });
            r.addEventListener('dblclick', async () => {
                const dd = load(app); const t = dd.tasks.find(x => x.id === id);
                if (!t) return;
                const res = await app.dialogs.form('Edit task', [
                    { key: 'title', label: 'Title', value: t.title },
                    { key: 'due', label: 'Due (YYYY-MM-DD HH:MM, empty = none)', value: t.due ? new Date(t.due).toISOString().slice(0, 16).replace('T', ' ') : '' },
                    { key: 'prio', label: 'Priority (Low/Normal/High)', value: t.prio }
                ]);
                if (res) {
                    t.title = res.title || t.title;
                    t.prio = PRIOS.includes(res.prio) ? res.prio : 'Normal';
                    const parsed = Date.parse((res.due || '').replace(' ', 'T'));
                    t.due = Number.isFinite(parsed) ? parsed : null;
                    t.reminded = false;
                    save(app, dd); paint();
                }
            });
        });
    }

    async function addTask() {
        const input = el.querySelector('.td-input');
        const title = input.value.trim();
        if (!title) return;
        const d = norm(load(app));
        d.tasks.unshift({ id: Date.now(), title, done: false, prio: 'Normal', due: null, reminded: false, list: d.list });
        save(app, d); input.value = ''; paint();
    }
    el.querySelector('.td-add').addEventListener('click', addTask);
    el.querySelector('.td-input').addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });
    el.querySelector('.td-newlist').addEventListener('click', async () => {
        const name = await app.dialogs.text('New list', 'List name:');
        if (name && name.trim()) {
            const d = norm(load(app));
            if (!d.lists.includes(name.trim())) { d.lists.push(name.trim()); d.list = name.trim(); save(app, d); paint(); }
        }
    });
    el.querySelectorAll('.td-f').forEach(b => b.addEventListener('click', () => {
        filter = b.dataset.f;
        el.querySelectorAll('.td-f').forEach(x => x.style.background = x === b ? '#0078D4' : 'rgba(255,255,255,.08)');
        paint();
    }));
    app.keyboard.register('CTRL+F', () => el.querySelector('.td-input').focus(), { scope: el, description: 'Focus task input' });
    paint();
    checkDue(app, true);
    const iv = setInterval(() => { if (!el.isConnected) clearInterval(iv); else checkDue(app, true); }, 60000);
    app.shell.activity.trackAppOpen('todoTasks');
}

function open(path, content) {
    try {
        const items = JSON.parse(content);
        if (Array.isArray(items)) {
            const app = createApp({ id: 'todoTasks', name: 'To-Do Tasks' });
            const d = load(app);
            for (const t of items) d.tasks.unshift({ id: Date.now() + Math.random(), title: String(t.title || t), done: false, prio: 'Normal', due: null, reminded: false, list: d.list || 'General' });
            save(app, d);
        }
    } catch { /* ignore bad file */ }
    launch();
}

async function onBackground() {
    const app = createApp({ id: 'todoTasks', name: 'To-Do Tasks' });
    const tick = () => checkDue(app, true);
    tick();
    bgTimer = setInterval(tick, 60000);
}
async function onShutdown() { if (bgTimer) clearInterval(bgTimer); bgTimer = null; }

export default { launch, open, onBackground, onShutdown, icon: AppIcons.get('todoTasks') };
