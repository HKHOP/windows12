// Archiver — real .zip compress/extract on the virtual FS (OS zip engine).
import { createApp, FileSystem } from '../../sdk/index.js';
import Zip from '../../modules/zip.js';
import AppIcons from '../../modules/appIcons.js';

const DOCS = ['/', 'users', 'default', 'Documents'];
const te = new TextEncoder();
const td = new TextDecoder();

function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}
function bytesToB64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(s);
}
function download(name, bytes, mime) {
    const url = URL.createObjectURL(new Blob([bytes], { type: mime || 'application/zip' }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
}

function launch(zipPath, zipContent) {
    const app = createApp({ id: 'archiver', name: 'Archiver' });
    const win = app.window.create({
        title: 'Archiver', icon: app.icon(),
        content: `<div style="display:flex;flex-direction:column;height:100%;background:#1c1410;color:#fff;font-family:'Segoe UI',sans-serif;">
            <div style="display:flex;gap:6px;padding:10px;border-bottom:1px solid #3a2d20;">
                <button class="ar-t" data-t="zip" style="flex:1;background:#b45309;border:none;color:#fff;border-radius:6px;padding:8px;cursor:pointer;font-weight:600;">Compress</button>
                <button class="ar-t" data-t="unzip" style="flex:1;background:rgba(255,255,255,.08);border:none;color:#fff;border-radius:6px;padding:8px;cursor:pointer;font-weight:600;">Extract</button>
            </div>
            <div class="ar-body" style="flex:1;overflow:auto;padding:12px;"></div>
        </div>`,
        width: 480, height: 520
    });
    const el = win.element;
    const body = el.querySelector('.ar-body');
    let tab = 'zip';
    let pendingZip = zipContent ? { name: (zipPath && zipPath[zipPath.length - 1]) || 'archive.zip', b64: zipContent } : null;

    function docFiles() {
        try {
            return FileSystem.list(DOCS).filter(f => f.type !== 'folder');
        } catch { return []; }
    }

    function paintZip() {
        const files = docFiles();
        body.innerHTML = `
            <div style="font-size:12px;color:#bbb;margin-bottom:8px;">Select Documents files to compress:</div>
            <div style="display:flex;flex-direction:column;gap:4px;max-height:260px;overflow:auto;margin-bottom:10px;">
                ${files.length ? files.map(f => `<label style="display:flex;gap:8px;align-items:center;background:rgba(255,255,255,.05);border-radius:6px;padding:7px 9px;font-size:13px;cursor:pointer;">
                    <input type="checkbox" data-n="${f.name.replace(/"/g, '')}" checked> <span>${escapeHtml(f.name)}</span>
                </label>`).join('') : '<div style="color:#777;font-size:13px;">Documents is empty — create files first.</div>'}
            </div>
            <div style="display:flex;gap:8px;">
                <input class="ar-name" value="archive.zip" style="flex:1;background:#2a2118;border:1px solid #4a3826;color:#fff;border-radius:6px;padding:8px;font-size:13px;">
                <button class="ar-go" style="background:#b45309;border:none;color:#fff;border-radius:6px;padding:8px 14px;cursor:pointer;font-weight:600;">Compress</button>
            </div>
            <div class="ar-msg" style="font-size:12px;color:#bbb;margin-top:10px;"></div>`;
        body.querySelector('.ar-go').addEventListener('click', async () => {
            const checked = [...body.querySelectorAll('input[type=checkbox]:checked')].map(c => c.dataset.n);
            if (!checked.length) { body.querySelector('.ar-msg').textContent = 'Select at least one file.'; return; }
            body.querySelector('.ar-msg').textContent = 'Compressing…';
            try {
                const entries = [];
                for (const n of checked) {
                    const content = FileSystem.readFile([...DOCS, n]);
                    if (content !== null) entries.push({ name: n, data: te.encode(content) });
                }
                const bytes = await Zip.createZip(entries);
                const name = body.querySelector('.ar-name').value.trim() || 'archive.zip';
                download(name, bytes);
                const b64 = bytesToB64(bytes);
                const full = [...DOCS, name];
                if (FileSystem.exists(full)) FileSystem.write(full, b64);
                else FileSystem.createFile(DOCS, name, b64, 'zip');
                body.querySelector('.ar-msg').textContent = `Created ${name} (${entries.length} files, ${(bytes.length / 1024).toFixed(1)} KB) — downloaded and saved to Documents.`;
                app.notify.info('Archiver', `${name} created.`);
            } catch (e) { body.querySelector('.ar-msg').textContent = 'Failed: ' + e.message; }
        });
    }

    async function showEntries(name, bytes, msg) {
        let entries = [];
        try { entries = Zip.readZip(bytes); }
        catch { body.querySelector('.ar-msg').textContent = 'Not a readable .zip file.'; return; }
        body.innerHTML = `
            <div style="font-size:13px;margin-bottom:8px;"><strong>${escapeHtml(name)}</strong> — ${entries.length} entries</div>
            <div style="display:flex;flex-direction:column;gap:4px;max-height:280px;overflow:auto;margin-bottom:10px;">
                ${entries.map((e, i) => `<label style="display:flex;gap:8px;align-items:center;background:rgba(255,255,255,.05);border-radius:6px;padding:7px 9px;font-size:13px;cursor:pointer;">
                    <input type="checkbox" data-i="${i}" ${e.isDir ? 'disabled' : 'checked'}> <span>${escapeHtml(e.name)}${e.isDir ? ' (folder)' : ` (${(e.size / 1024).toFixed(1)} KB)`}</span>
                </label>`).join('')}
            </div>
            <button class="ar-ex" style="background:#b45309;border:none;color:#fff;border-radius:6px;padding:8px 14px;cursor:pointer;font-weight:600;">Extract selected to Documents</button>
            <div class="ar-msg" style="font-size:12px;color:#bbb;margin-top:10px;">${msg || ''}</div>`;
        body.querySelector('.ar-ex').addEventListener('click', async () => {
            const checked = [...body.querySelectorAll('input[type=checkbox]:checked')].map(c => Number(c.dataset.i));
            let ok = 0, skipped = 0;
            for (const i of checked) {
                const e = entries[i];
                if (e.isDir) continue;
                const data = await Zip.extractFile(bytes, e);
                if (!data) { skipped++; continue; }
                const base = e.name.split('/').pop() || `file${i}`;
                const full = [...DOCS, base];
                const text = td.decode(data);
                if (FileSystem.exists(full)) FileSystem.write(full, text);
                else FileSystem.createFile(DOCS, base, text, base.includes('.') ? base.split('.').pop() : '');
                ok++;
            }
            body.querySelector('.ar-msg').textContent = `Extracted ${ok} file(s) to Documents${skipped ? `, ${skipped} skipped (undecodable)` : ''}.`;
            app.notify.info('Archiver', `Extracted ${ok} file(s).`);
        });
    }

    function paintUnzip() {
        body.innerHTML = `
            <div style="font-size:12px;color:#bbb;margin-bottom:8px;">Pick a .zip from your device or from Documents:</div>
            <input type="file" accept=".zip" class="ar-file" style="font-size:12px;color:#bbb;margin-bottom:8px;">
            <div style="display:flex;gap:8px;margin-bottom:8px;">
                <input class="ar-fsname" placeholder="archive.zip in Documents" style="flex:1;background:#2a2118;border:1px solid #4a3826;color:#fff;border-radius:6px;padding:8px;font-size:13px;">
                <button class="ar-fsgo" style="background:#b45309;border:none;color:#fff;border-radius:6px;padding:8px 12px;cursor:pointer;font-weight:600;">Load</button>
            </div>
            <div class="ar-msg" style="font-size:12px;color:#bbb;"></div>`;
        body.querySelector('.ar-file').addEventListener('change', async (e) => {
            const f = e.target.files[0];
            if (!f) return;
            const bytes = new Uint8Array(await f.arrayBuffer());
            showEntries(f.name, bytes);
        });
        body.querySelector('.ar-fsgo').addEventListener('click', () => {
            const n = body.querySelector('.ar-fsname').value.trim();
            if (!n) return;
            const content = FileSystem.readFile([...DOCS, n]);
            if (content === null) { body.querySelector('.ar-msg').textContent = 'File not found in Documents.'; return; }
            try { showEntries(n, b64ToBytes(content)); }
            catch { body.querySelector('.ar-msg').textContent = 'That file is not an Archiver-made (base64) zip. Use the file picker for real zips.'; }
        });
        if (pendingZip) {
            const p = pendingZip; pendingZip = null;
            try { showEntries(p.name, b64ToBytes(p.b64)); } catch { /* bad content */ }
        }
    }

    function paint() {
        el.querySelectorAll('.ar-t').forEach(b => b.style.background = b.dataset.t === tab ? '#b45309' : 'rgba(255,255,255,.08)');
        if (tab === 'zip') paintZip(); else paintUnzip();
    }
    el.querySelectorAll('.ar-t').forEach(b => b.addEventListener('click', () => { tab = b.dataset.t; paint(); }));
    if (pendingZip) tab = 'unzip';
    paint();
    app.shell.activity.trackAppOpen('archiver');
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function open(path, content) { launch(path, content || null); }

export default { launch, open, icon: AppIcons.get('archiver') };
