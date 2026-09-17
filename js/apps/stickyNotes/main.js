// Sticky Notes — one window per note, autosaved, colored.
import { createApp } from '../../sdk/index.js';
import AppIcons from '../../modules/appIcons.js';

const COLORS = ['#fef08a', '#fecaca', '#bbf7d0', '#bfdbfe', '#e9d5ff', '#fed7aa'];

function loadAll(app) {
    try {
        const raw = app.files.read('notes.json');
        if (raw) { const d = JSON.parse(raw); if (Array.isArray(d.notes)) return d; }
    } catch { /* corrupt -> empty */ }
    return { notes: [] };
}
function saveAll(app, d) { app.files.write('notes.json', JSON.stringify(d)); }

function openNoteWindow(app, id) {
    const d = loadAll(app);
    const note = d.notes.find(n => n.id === id);
    if (!note) return;
    const win = app.window.create({
        title: (note.text.split('\n')[0] || 'Sticky Note').slice(0, 28) || 'Sticky Note',
        icon: app.icon(),
        content: `<div class="sn-root" style="display:flex;flex-direction:column;height:100%;background:${note.color};color:#222;">
            <div style="display:flex;gap:4px;padding:6px;align-items:center;">
                ${COLORS.map(c => `<button data-c="${c}" title="color" style="width:18px;height:18px;border-radius:50%;background:${c};border:${c === note.color ? '2px solid #222' : '1px solid rgba(0,0,0,.25)'};cursor:pointer;"></button>`).join('')}
                <span class="sn-saved" style="margin-left:auto;font-size:10px;opacity:.6;">saved</span>
                <button class="sn-del" title="delete" style="background:none;border:none;cursor:pointer;font-size:14px;color:#444;">×</button>
            </div>
            <textarea class="sn-text" style="flex:1;background:transparent;border:none;outline:none;resize:none;padding:4px 12px 12px;font-family:'Segoe UI',sans-serif;font-size:14px;color:#222;" placeholder="Type a note…">${note.text.replace(/</g, '&lt;')}</textarea>
        </div>`,
        width: 260, height: 280, minWidth: 180, minHeight: 160
    });
    const el = win.element;
    const area = el.querySelector('.sn-text');
    const saved = el.querySelector('.sn-saved');
    let t = null;
    area.addEventListener('input', () => {
        saved.textContent = '…';
        clearTimeout(t);
        t = setTimeout(() => {
            const dd = loadAll(app);
            const n = dd.notes.find(x => x.id === id);
            if (n) { n.text = area.value; n.modified = Date.now(); saveAll(app, dd); }
            saved.textContent = 'saved';
        }, 400);
    });
    el.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => {
        const dd = loadAll(app);
        const n = dd.notes.find(x => x.id === id);
        if (n) { n.color = b.dataset.c; saveAll(app, dd); el.querySelector('.sn-root').style.background = n.color; }
    }));
    el.querySelector('.sn-del').addEventListener('click', async () => {
        if (await app.dialogs.confirm('Delete note', 'Delete this sticky note?')) {
            const dd = loadAll(app);
            dd.notes = dd.notes.filter(x => x.id !== id);
            saveAll(app, dd);
            app.window.close(win.id);
        }
    });
}

function launch() {
    const app = createApp({ id: 'stickyNotes', name: 'Sticky Notes' });
    const win = app.window.create({
        title: 'Sticky Notes', icon: app.icon(),
        content: `<div style="display:flex;flex-direction:column;height:100%;background:#1b1b1b;color:#fff;font-family:'Segoe UI',sans-serif;padding:12px;box-sizing:border-box;">
            <button class="sn-new" style="background:#eab308;border:none;color:#222;border-radius:8px;padding:10px;cursor:pointer;font-weight:700;font-size:13px;">+ New note</button>
            <div class="sn-list" style="flex:1;overflow:auto;margin-top:10px;display:flex;flex-direction:column;gap:6px;"></div>
        </div>`,
        width: 300, height: 440
    });
    const el = win.element;
    function paint() {
        const d = loadAll(app);
        el.querySelector('.sn-list').innerHTML = d.notes.length ? d.notes.map(n =>
            `<div data-id="${n.id}" style="background:${n.color};color:#222;border-radius:8px;padding:9px 10px;cursor:pointer;">
                <div style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(n.text.split('\n')[0] || '(empty note)')}</div>
                <div style="font-size:10px;opacity:.6;">${new Date(n.modified).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            </div>`).join('')
            : '<div style="color:#666;font-size:13px;text-align:center;margin-top:24px;">No notes yet.</div>';
        el.querySelectorAll('.sn-list [data-id]').forEach(x => x.addEventListener('click', () => openNoteWindow(app, Number(x.dataset.id))));
    }
    el.querySelector('.sn-new').addEventListener('click', () => {
        const d = loadAll(app);
        const note = { id: Date.now(), text: '', color: COLORS[d.notes.length % COLORS.length], modified: Date.now() };
        d.notes.unshift(note); saveAll(app, d); paint();
        openNoteWindow(app, note.id);
    });
    paint();
    app.shell.activity.trackAppOpen('stickyNotes');
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function open(path, content) {
    const app = createApp({ id: 'stickyNotes', name: 'Sticky Notes' });
    const d = loadAll(app);
    const note = { id: Date.now(), text: content || '', color: COLORS[d.notes.length % COLORS.length], modified: Date.now() };
    d.notes.unshift(note); saveAll(app, d);
    launch();
    openNoteWindow(app, note.id);
}

export default { launch, open, icon: AppIcons.get('stickyNotes') };
