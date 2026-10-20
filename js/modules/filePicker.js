import WindowManager from './windowManager.js';
import FileSystem from './fileSystem.js';
import UIIcons from './uiIcons.js';
import Users from './users.js';

// A small Windows-style open dialog for the virtual filesystem. It is used by
// shell surfaces that need the user to pick an existing file (or import one
// into a folder first), without leaving the OS to a native file input.
const FilePicker = (() => {
    function esc(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function asShell(fn) {
        const guard = window._FSGuard;
        if (guard) return guard.asShell(fn)();
        return fn();
    }

    function displayPath(path) {
        if (!Array.isArray(path) || path.length <= 1) return 'Local Disk (C:)';
        const names = { users: 'Users', system: 'System', 'programs data': 'Programs Data', '$Recycle.Bin': 'Recycle Bin' };
        return ['Local Disk (C:)', ...path.slice(1).map(part => names[part] || part)].join(' > ');
    }

    function extOf(name) {
        const dot = String(name || '').lastIndexOf('.');
        return dot > 0 ? String(name).slice(dot + 1).toLowerCase() : '';
    }

    function ensureFolder(path) {
        for (let i = 2; i <= path.length; i++) {
            const partial = path.slice(0, i);
            if (!asShell(() => FileSystem.itemExists(partial))) {
                asShell(() => FileSystem.createFolder(partial.slice(0, -1), partial[partial.length - 1]));
            }
        }
    }

    function uniqueName(dir, name) {
        const dot = name.lastIndexOf('.');
        const base = dot > 0 ? name.slice(0, dot) : name;
        const ext = dot > 0 ? name.slice(dot) : '';
        let candidate = name;
        let i = 2;
        while (asShell(() => FileSystem.itemExists([...dir, candidate]))) {
            candidate = `${base} (${i++})${ext}`;
        }
        return candidate;
    }

    function open(opts = {}) {
        const extensions = new Set((opts.extensions || []).map(ext => String(ext).toLowerCase().replace(/^\./, '')));
        const allowUpload = !!opts.allowUpload;
        const uploadPath = Array.isArray(opts.uploadPath) ? opts.uploadPath.slice() : null;
        const appId = opts.appId || 'filePicker';
        const title = opts.title || 'Open';
        const confirmLabel = opts.confirmLabel || 'Select';
        const start = Array.isArray(opts.startPath) && asShell(() => FileSystem.isFolder(opts.startPath))
            ? opts.startPath.slice()
            : Users.home();

        return new Promise(resolve => {
            let current = start;
            let selected = null;
            let settled = false;

            const places = [
                { name: 'Home', icon: 'home', path: Users.home() },
                { name: 'Desktop', icon: 'desktop', path: Users.home(['Desktop']) },
                { name: 'Documents', icon: 'documents', path: Users.home(['Documents']) },
                { name: 'Downloads', icon: 'downloads', path: Users.home(['Downloads']) },
                { name: 'Music', icon: 'music', path: Users.home(['Music']) },
                { name: 'Pictures', icon: 'pictures', path: Users.home(['Pictures']) },
                { name: 'Videos', icon: 'videos', path: Users.home(['Videos']) }
            ];

            const html = `
                <div style="display:flex;flex-direction:column;height:100%;padding:12px;box-sizing:border-box;gap:10px;">
                    <div style="display:flex;align-items:center;gap:6px;">
                        <button class="fp-up" title="Up" style="padding:4px 9px;background:rgba(128,128,128,0.16);border:1px solid var(--window-border);border-radius:4px;color:var(--text-primary);cursor:pointer;">&#9650;</button>
                        <div class="fp-path" style="flex:1;font-size:12px;padding:6px 9px;background:rgba(128,128,128,0.12);border:1px solid var(--window-border);border-radius:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></div>
                    </div>
                    <div style="display:flex;flex:1;min-height:0;border:1px solid var(--window-border);border-radius:6px;overflow:hidden;">
                        <div class="fp-places" style="width:150px;flex-shrink:0;padding:6px;background:rgba(0,0,0,0.12);border-right:1px solid var(--window-border);overflow-y:auto;"></div>
                        <div class="fp-list" style="flex:1;padding:4px;overflow-y:auto;"></div>
                    </div>
                    <div class="fp-hint" style="font-size:11px;color:var(--text-secondary);">
                        ${allowUpload ? 'Files come from the Windows filesystem. Upload copies a file into your Music folder.' : 'Pick a file from the Windows filesystem.'}
                    </div>
                    <div class="fp-error" style="font-size:11px;color:#ff8a80;min-height:14px;"></div>
                    <div style="display:flex;justify-content:flex-end;align-items:center;gap:8px;">
                        ${allowUpload ? '<button class="fp-upload" style="margin-right:auto;padding:5px 12px;background:rgba(128,128,128,0.16);border:1px solid var(--window-border);border-radius:4px;color:var(--text-primary);cursor:pointer;font-size:12px;">Upload from device</button>' : ''}
                        <button class="fp-cancel" style="padding:5px 16px;background:rgba(128,128,128,0.16);border:1px solid var(--window-border);border-radius:4px;color:var(--text-primary);cursor:pointer;font-size:12px;">Cancel</button>
                        <button class="fp-ok" style="padding:5px 22px;background:var(--accent-color);border:none;border-radius:4px;color:#fff;cursor:pointer;font-size:12px;font-weight:600;">${esc(confirmLabel)}</button>
                    </div>
                </div>`;

            const win = WindowManager.createWindow(appId, title, UIIcons.folder('', 16), html, {
                width: 590, height: 470, minWidth: 380, minHeight: 320, saveState: false
            });
            const el = win.element;
            const list = el.querySelector('.fp-list');
            const pathEl = el.querySelector('.fp-path');
            const placesEl = el.querySelector('.fp-places');
            const errorEl = el.querySelector('.fp-error');
            const upBtn = el.querySelector('.fp-up');

            const finish = (value) => {
                if (settled) return;
                settled = true;
                window.removeEventListener('window-closed', onClosed);
                resolve(value);
            };
            const onClosed = (e) => {
                if (e.detail && e.detail.id === win.id) finish(null);
            };
            window.addEventListener('window-closed', onClosed);

            const choose = (path) => {
                selected = path.slice();
                errorEl.textContent = '';
                list.querySelectorAll('[data-name]').forEach(row => { row.style.background = 'transparent'; });
                const row = [...list.querySelectorAll('[data-name]')].find(r =>
                    JSON.parse(r.dataset.path).join('/') === path.join('/'));
                if (row) row.style.background = 'rgba(0,120,212,0.28)';
            };

            const paintPlaces = () => {
                placesEl.innerHTML = places.map(place => `
                    <div class="fp-place" data-path='${JSON.stringify(place.path)}' style="display:flex;align-items:center;gap:6px;padding:5px 7px;border-radius:4px;cursor:pointer;font-size:12px;">
                        <span style="width:14px;height:14px;display:inline-flex;flex-shrink:0;">${UIIcons.sidebar(place.name, 14)}</span>${place.name}
                    </div>`).join('');
                placesEl.querySelectorAll('.fp-place').forEach(row => {
                    row.addEventListener('click', () => {
                        const path = JSON.parse(row.dataset.path);
                        if (!asShell(() => FileSystem.isFolder(path))) return;
                        current = path.slice();
                        paint();
                    });
                });
            };

            const paint = () => {
                pathEl.textContent = displayPath(current);
                pathEl.title = displayPath(current);
                upBtn.disabled = current.length <= 1;
                selected = null;
                errorEl.textContent = '';
                list.innerHTML = '';
                let children = [];
                try { children = asShell(() => FileSystem.getChildren(current)) || []; } catch (e) { children = []; }
                children = children.filter(child => {
                    if (child.type === 'folder') return true;
                    if (extensions.size === 0) return true;
                    const ext = String(child.ext || extOf(child.name)).toLowerCase();
                    return extensions.has(ext);
                }).sort((a, b) => {
                    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
                    return a.name.localeCompare(b.name);
                });
                if (children.length === 0) {
                    list.innerHTML = '<div style="padding:24px;text-align:center;font-size:12px;color:var(--text-secondary);">No matching files here</div>';
                    return;
                }
                children.forEach(child => {
                    const full = [...current, child.name];
                    const row = document.createElement('div');
                    row.dataset.name = child.name;
                    row.dataset.type = child.type;
                    row.dataset.path = JSON.stringify(full);
                    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:4px;cursor:pointer;font-size:12px;';
                    row.innerHTML = `<span style="width:18px;height:18px;display:inline-flex;flex-shrink:0;">${child.type === 'folder' ? UIIcons.folder(child.name, 18) : UIIcons.file(child.ext, child.name, 18)}</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(child.name)}</span>`;
                    row.addEventListener('click', () => choose(full));
                    row.addEventListener('dblclick', () => {
                        if (child.type === 'folder') {
                            current = full;
                            paint();
                        } else {
                            finish(full);
                            WindowManager.closeWindow(win.id);
                        }
                    });
                    list.appendChild(row);
                });
            };

            upBtn.addEventListener('click', () => {
                if (current.length > 1) {
                    current = current.slice(0, -1);
                    paint();
                }
            });

            el.querySelector('.fp-ok').addEventListener('click', () => {
                if (!selected) {
                    errorEl.textContent = 'Select a file first.';
                    return;
                }
                finish(selected);
                WindowManager.closeWindow(win.id);
            });

            el.querySelector('.fp-cancel').addEventListener('click', () => {
                finish(null);
                WindowManager.closeWindow(win.id);
            });

            const uploadBtn = el.querySelector('.fp-upload');
            if (uploadBtn) {
                uploadBtn.addEventListener('click', () => {
                    if (!uploadPath) {
                        errorEl.textContent = 'No upload folder is configured.';
                        return;
                    }
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = extensions.size ? [...extensions].map(ext => '.' + ext).join(',') : 'audio/*';
                    input.addEventListener('change', async () => {
                        const file = input.files && input.files[0];
                        if (!file) return;
                        const name = String(file.name || 'sound').replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 80) || 'sound';
                        const ext = extOf(name);
                        if (!ext || (extensions.size && !extensions.has(ext))) {
                            errorEl.textContent = 'That file type is not supported.';
                            return;
                        }
                        try {
                            ensureFolder(uploadPath);
                            const final = uniqueName(uploadPath, name);
                            const blob = file.slice(0, file.size, file.type || undefined);
                            const saved = await asShell(() => FileSystem.writeFileBlob(uploadPath, final, blob, ext));
                            if (!saved) throw new Error('save failed');
                            const path = [...uploadPath, final];
                            finish(path);
                            WindowManager.closeWindow(win.id);
                        } catch (e) {
                            errorEl.textContent = 'Could not save that file to the filesystem.';
                        }
                    });
                    input.click();
                });
            }

            paintPlaces();
            paint();
        });
    }

    return { open };
})();

export default FilePicker;
