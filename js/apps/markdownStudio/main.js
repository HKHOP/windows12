// Markdown Studio — split editor with live preview, .md associations.
import { createApp, FileSystem } from '../../sdk/index.js';
import AppIcons from '../../modules/appIcons.js';

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function renderMd(src) {
    const lines = String(src).split('\n');
    let html = '', inList = false, inCode = false;
    const inline = (s) => escapeHtml(s)
        .replace(/`([^`]+)`/g, '<code style="background:#333;padding:1px 5px;border-radius:4px;font-family:Consolas,monospace;">$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#4da3ff;">$1</a>');
    for (const line of lines) {
        if (/^```/.test(line)) { html += inCode ? '</pre>' : '<pre style="background:#222;border:1px solid #444;border-radius:6px;padding:10px;overflow:auto;font-family:Consolas,monospace;font-size:12px;">'; inCode = !inCode; continue; }
        if (inCode) { html += escapeHtml(line) + '\n'; continue; }
        const h = line.match(/^(#{1,4})\s+(.*)/);
        if (h) { if (inList) { html += '</ul>'; inList = false; } html += `<h${h[1].length} style="margin:10px 0 6px;">${inline(h[2])}</h${h[1].length}>`; continue; }
        if (/^>\s?/.test(line)) { if (inList) { html += '</ul>'; inList = false; } html += `<blockquote style="border-left:3px solid #0078D4;margin:8px 0;padding:4px 10px;color:#bbb;">${inline(line.replace(/^>\s?/, ''))}</blockquote>`; continue; }
        if (/^---+$/.test(line.trim())) { if (inList) { html += '</ul>'; inList = false; } html += '<hr style="border:none;border-top:1px solid #444;margin:10px 0;">'; continue; }
        const li = line.match(/^[-*]\s+(.*)/);
        if (li) { if (!inList) { html += '<ul style="margin:6px 0;padding-left:22px;">'; inList = true; } html += `<li>${inline(li[1])}</li>`; continue; }
        if (inList) { html += '</ul>'; inList = false; }
        if (line.trim() === '') continue;
        html += `<p style="margin:6px 0;line-height:1.55;">${inline(line)}</p>`;
    }
    if (inList) html += '</ul>';
    if (inCode) html += '</pre>';
    return html;
}

function launch(openPath, openContent) {
    const app = createApp({ id: 'markdownStudio', name: 'Markdown Studio' });
    let curPath = openPath || null;
    let dirty = false;
    const win = app.window.create({
        title: curPath ? 'Markdown Studio — ' + curPath[curPath.length - 1] : 'Markdown Studio — Untitled',
        icon: app.icon(),
        content: `<div style="display:flex;flex-direction:column;height:100%;background:#1b1b1b;color:#eee;font-family:'Segoe UI',sans-serif;">
            <div style="display:flex;gap:4px;padding:8px;border-bottom:1px solid #333;flex-wrap:wrap;align-items:center;">
                <button data-ins="# " title="heading" style="background:#2a2a2a;border:1px solid #444;color:#fff;border-radius:5px;padding:5px 9px;cursor:pointer;font-weight:700;">H</button>
                <button data-ins="**bold**" title="bold" style="background:#2a2a2a;border:1px solid #444;color:#fff;border-radius:5px;padding:5px 9px;cursor:pointer;font-weight:700;">B</button>
                <button data-ins="*italic*" title="italic" style="background:#2a2a2a;border:1px solid #444;color:#fff;border-radius:5px;padding:5px 9px;cursor:pointer;font-style:italic;">I</button>
                <button data-ins="\`code\`" title="code" style="background:#2a2a2a;border:1px solid #444;color:#fff;border-radius:5px;padding:5px 9px;cursor:pointer;font-family:Consolas,monospace;">&lt;&gt;</button>
                <button data-ins="\\n- item" title="list" style="background:#2a2a2a;border:1px solid #444;color:#fff;border-radius:5px;padding:5px 9px;cursor:pointer;">• List</button>
                <button data-ins="[text](url)" title="link" style="background:#2a2a2a;border:1px solid #444;color:#fff;border-radius:5px;padding:5px 9px;cursor:pointer;">Link</button>
                <span style="flex:1;"></span>
                <button class="md-open" style="background:#2a2a2a;border:1px solid #444;color:#fff;border-radius:5px;padding:5px 10px;cursor:pointer;">Open</button>
                <button class="md-save" style="background:#0078D4;border:none;color:#fff;border-radius:5px;padding:5px 12px;cursor:pointer;font-weight:600;">Save</button>
                <button class="md-html" style="background:#2a2a2a;border:1px solid #444;color:#fff;border-radius:5px;padding:5px 10px;cursor:pointer;">Export HTML</button>
            </div>
            <div style="flex:1;display:flex;min-height:0;">
                <textarea class="md-src" spellcheck="false" style="flex:1;background:#141414;color:#e8e8e8;border:none;outline:none;resize:none;padding:12px;font-family:Consolas,monospace;font-size:13px;line-height:1.6;"></textarea>
                <div class="md-prev" style="flex:1;overflow:auto;padding:12px 16px;border-left:1px solid #333;"></div>
            </div>
            <div class="md-status" style="padding:6px 12px;border-top:1px solid #333;font-size:11px;color:#888;"></div>
        </div>`,
        width: 900, height: 600
    });
    const el = win.element;
    const src = el.querySelector('.md-src');
    const prev = el.querySelector('.md-prev');
    const status = el.querySelector('.md-status');
    src.value = openContent || app.files.read('draft.md') || '# Untitled\n\nStart writing **markdown** here…';
    function paint() {
        prev.innerHTML = renderMd(src.value);
        const words = src.value.trim() ? src.value.trim().split(/\s+/).length : 0;
        status.textContent = `${words} words · ${src.value.length} chars${dirty ? ' · unsaved' : ''}${curPath ? ' · ' + curPath[curPath.length - 1] : ''}`;
    }
    src.addEventListener('input', () => {
        dirty = true;
        try { app.files.write('draft.md', src.value); } catch { /* ignore */ }
        paint();
    });
    el.querySelectorAll('[data-ins]').forEach(b => b.addEventListener('click', () => {
        const ins = b.dataset.ins.replace(/\\n/g, '\n');
        const s = src.selectionStart || src.value.length;
        src.value = src.value.slice(0, s) + ins + src.value.slice(src.selectionEnd || s);
        src.focus(); dirty = true; paint();
    }));
    el.querySelector('.md-open').addEventListener('click', async () => {
        const name = await app.dialogs.text('Open file', 'File name in Documents (e.g. notes.md):');
        if (!name) return;
        const p = ['/', 'users', 'default', 'Documents', name];
        const content = FileSystem.readFile(p);
        if (content === null) { await app.dialogs.alert('Not found', `"${name}" was not found in Documents.`); return; }
        src.value = content; curPath = p; dirty = false; paint();
    });
    async function doSave() {
        if (curPath) {
            FileSystem.write(curPath, src.value);
        } else {
            const r = await FileSystem.pickSave({ defaultName: 'notes.md', extensions: [{ value: 'md', label: 'Markdown' }], parentApp: 'markdownStudio' });
            if (!r) return;
            FileSystem.createFile(r.path, r.fullName, src.value, r.ext);
            curPath = [...r.path, r.fullName];
        }
        dirty = false; paint();
        app.shell.activity.trackFileOpen(curPath, curPath[curPath.length - 1]);
        app.notify.info('Markdown Studio', 'Saved.');
    }
    el.querySelector('.md-save').addEventListener('click', doSave);
    el.querySelector('.md-html').addEventListener('click', async () => {
        const r = await FileSystem.pickSave({ defaultName: 'notes.html', extensions: [{ value: 'html', label: 'HTML' }], parentApp: 'markdownStudio' });
        if (!r) return;
        const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Export</title></head><body style="font-family:sans-serif;max-width:800px;margin:40px auto;padding:0 20px;">${renderMd(src.value)}</body></html>`;
        FileSystem.createFile(r.path, r.fullName, doc, r.ext);
        app.notify.info('Markdown Studio', 'Exported HTML.');
    });
    app.keyboard.register('CTRL+S', () => { doSave(); }, { scope: el, description: 'Save' });
    app.lifecycle.onClose(async () => {
        if (!dirty) return true;
        return app.dialogs.confirm('Unsaved changes', 'Close without saving?');
    });
    paint();
    app.shell.activity.trackAppOpen('markdownStudio');
}

function open(path, content) { launch(path, content || ''); }

export default { launch, open, icon: AppIcons.get('markdownStudio') };
