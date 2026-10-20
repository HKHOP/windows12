// Shortcuts — the `.lnk` layer.
//
// Shortcut files are plain UTF-8 JSON with a `w12-lnk` marker inside a
// `.lnk` file. The virtual filesystem is text/JSON based, so Windows binary
// shell links (MS-SHLLINK) would store real Windows paths that can never
// resolve here. The on-disk extension and the user-facing behaviour are
// still Windows-style: create, open, broken-target recovery, rename/delete,
// properties (target type, start in, run, comment, icon, hotkey).
//
// Target shapes per type:
//   file / folder -> POSIX vFS path array (['/', 'users', …])
//   url           -> URL string
//   app           -> installed app id
//
// FileAssociations delegates any `.lnk` open here (setShortcutHandler), so
// desktop, File Explorer, Search and future callers all resolve shortcuts
// the same way. Everything is exposed on `window._Shortcuts` too.
import FileSystem from './fileSystem.js';
import FileAssociations from './fileAssociations.js';
import WindowManager from './windowManager.js';
import Popup from './popup.js';
import UIIcons from './uiIcons.js';
import AppIcons from './appIcons.js';
import AppLoader from './appLoader.js';
import Keyboard from './keyboard.js';
import Users from './users.js';
import { DESTINATIONS, MANIFEST_DEFAULTS, normalizeConfig, mergeConfig, resolveCreate } from './shortcutConfig.js';

const Shortcuts = (() => {
    const FORMAT = 'w12-lnk';
    const VERSION = 1;
    const TYPES = ['file', 'folder', 'url', 'app'];
    const RUN_STATES = ['normal', 'minimized', 'maximized'];
    const HOTKEY_OWNER = 'shortcuts';
    const BUILTIN_ICONS = [
        'folder', 'documents', 'downloads', 'pictures',
        'image', 'audio', 'video', 'zip', 'exe', 'txt', 'json', 'html', 'pdf'
    ];

    let hotkeyTimer = null;
    let wired = false;

    // Shell-owned FS access (shortcut I/O must never be attributed to an app).
    function shell(fn) {
        const g = window._FSGuard;
        return g ? g.asShell(fn)() : fn();
    }

    function esc(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function isShortcutName(name) {
        return /\.lnk$/i.test(String(name || ''));
    }

    function isShortcutPath(path) {
        return Array.isArray(path) && path.length > 0 && isShortcutName(path[path.length - 1]);
    }

    function extOf(name) {
        const s = String(name || '');
        const i = s.lastIndexOf('.');
        return i > 0 ? s.slice(i + 1).toLowerCase() : '';
    }

    function baseName(name) {
        const s = String(name || '');
        const i = s.lastIndexOf('.');
        return i > 0 ? s.slice(0, i) : s;
    }

    // ---------- paths ----------

    function homeDir(userId, sub) {
        if (userId) {
            try { return Users.homeFor(userId, sub); } catch { /* fall through */ }
        }
        return Users.home(sub);
    }

    function startMenuDir(userId) {
        return homeDir(userId, ['AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs']);
    }

    function taskbarDir(userId) {
        return homeDir(userId, ['AppData', 'Roaming', 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar']);
    }

    function desktopDir(userId) {
        return homeDir(userId, ['Desktop']);
    }

    function destinationDir(destination, userId) {
        if (destination === 'startMenu') return startMenuDir(userId);
        if (destination === 'taskbar') return taskbarDir(userId);
        if (destination === 'desktop') return desktopDir(userId);
        return null;
    }

    function ensureFolder(path) {
        if (!Array.isArray(path) || path.length === 0) return false;
        try {
            for (let i = 1; i < path.length; i++) {
                const partial = path.slice(0, i + 1);
                if (shell(() => FileSystem.itemExists(partial))) continue;
                const parent = path.slice(0, i);
                shell(() => FileSystem.createFolder(parent, path[i]));
            }
            return shell(() => FileSystem.isFolder(path));
        } catch { return false; }
    }

    function readJson(path, fallback = null) {
        try {
            const raw = shell(() => FileSystem.readFile(path));
            if (raw == null) return fallback;
            return JSON.parse(raw);
        } catch { return fallback; }
    }

    function writeJson(path, value) {
        try {
            if (!Array.isArray(path) || path.length < 2) return false;
            ensureFolder(path.slice(0, -1));
            const json = JSON.stringify(value, null, 2);
            if (shell(() => FileSystem.itemExists(path))) {
                return !!shell(() => FileSystem.writeFile(path, json));
            }
            const parent = path.slice(0, -1);
            return !!shell(() => FileSystem.createFile(parent, path[path.length - 1], json, 'json'));
        } catch { return false; }
    }

    function formatPath(path) {
        if (!Array.isArray(path)) return String(path || '');
        if (path.length === 0) return 'This PC';
        if (path.length === 1 && path[0] === '/') return 'C:\\';
        return 'C:\\' + path.slice(1).join('\\');
    }

    function parsePath(text) {
        let t = String(text || '').trim();
        if (!t) return null;
        if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
            t = t.slice(1, -1).trim();
        }
        if (!t) return null;
        if (/^this\s*pc$/i.test(t)) return ['/'];
        t = t.replace(/[\\/]+/g, '/').replace(/^[A-Za-z]:/, '');
        const parts = t.split('/').filter(Boolean);
        if (parts.length === 0) return ['/'];
        return ['/', ...parts];
    }

    function normalizeUrl(text) {
        const t = String(text || '').trim();
        if (!t) return '';
        if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return t;
        return 'https://' + t;
    }

    // Manual entry may use Windows-style casing (C:\Users\...). The vFS is
    // case-sensitive, so snap each segment to the real child name when it
    // exists; an unresolved tail is kept as typed (an intentionally broken
    // shortcut is still allowed).
    function resolveExistingPath(path) {
        if (!Array.isArray(path) || path.length <= 1) return path;
        let current = ['/'];
        for (const part of path.slice(1)) {
            let match = null;
            try {
                const children = shell(() => FileSystem.getChildren(current)) || [];
                match = children.find(c => c.name.toLowerCase() === String(part).toLowerCase()) || null;
            } catch { match = null; }
            if (!match) return path;
            current = [...current, match.name];
        }
        return current;
    }

    function sanitizeName(text) {
        let name = String(text || '').replace(/[\\/:*?"<>|]/g, '').trim();
        name = name.replace(/\.lnk$/i, '').replace(/[. ]+$/g, '');
        return name || 'New shortcut';
    }

    // ---------- read / write ----------

    function normalize(data) {
        if (!data || typeof data !== 'object') return null;
        if (data.format !== FORMAT) return null;
        if (!TYPES.includes(data.type)) return null;
        const out = {
            format: FORMAT,
            version: VERSION,
            type: data.type,
            target: data.target,
            arguments: String(data.arguments || ''),
            startIn: Array.isArray(data.startIn) ? data.startIn.slice() : null,
            comment: String(data.comment || ''),
            run: RUN_STATES.includes(data.run) ? data.run : 'normal',
            hotkey: typeof data.hotkey === 'string' && data.hotkey.trim() ? data.hotkey.trim() : null,
            icon: data.icon && typeof data.icon === 'object' ? data.icon : { kind: 'target' },
            created: data.created || new Date().toISOString()
        };
        if (data.source && typeof data.source === 'object') {
            const kind = ['installer', 'system', 'user'].includes(data.source.kind) ? data.source.kind : 'user';
            out.source = { kind, appId: data.source.appId ? String(data.source.appId) : null };
        }
        if (out.type === 'file' || out.type === 'folder' || (out.type === 'app' && Array.isArray(out.target))) {
            if (!Array.isArray(out.target) || out.target.length === 0) return null;
            out.target = out.target.slice();
        } else {
            if (typeof out.target !== 'string' || !out.target.trim()) return null;
            out.target = out.target.trim();
        }
        return out;
    }

    function parse(raw) {
        if (raw == null) return null;
        let obj = raw;
        if (typeof raw === 'string') {
            try { obj = JSON.parse(raw); } catch { return null; }
        }
        return normalize(obj);
    }

    function serialize(data) {
        const d = normalize(data);
        if (!d) return '';
        return JSON.stringify(d, null, 2);
    }

    function readSync(path) {
        try {
            return parse(shell(() => FileSystem.readFile(path)));
        } catch { return null; }
    }

    async function read(path) {
        try {
            const blobFile = shell(() => FileSystem.isBlobFile(path));
            if (blobFile) {
                const blob = await shell(() => FileSystem.readFileBlob(path));
                if (!blob) return null;
                return parse(await blob.text());
            }
            return readSync(path);
        } catch { return null; }
    }

    function write(path, data) {
        try {
            const json = serialize(data);
            if (shell(() => FileSystem.itemExists(path))) {
                return !!shell(() => FileSystem.writeFile(path, json));
            }
            if (!Array.isArray(path) || path.length < 2) return false;
            return !!shell(() => FileSystem.createFile(path.slice(0, -1), path[path.length - 1], json, 'lnk'));
        } catch { return false; }
    }

    function uniqueName(parentPath, base) {
        const root = sanitizeName(base);
        let name = `${root}.lnk`;
        let i = 2;
        while (shell(() => FileSystem.itemExists([...parentPath, name]))) {
            name = `${root} (${i++}).lnk`;
        }
        return name;
    }

    function create(parentPath, data, options = {}) {
        const d = normalize({ ...data, created: data.created || new Date().toISOString() });
        if (!d || !Array.isArray(parentPath)) return null;
        const name = uniqueName(parentPath, options.name || d.name || defaultName(d));
        const ok = shell(() => FileSystem.createFile(parentPath, name, serialize(d), 'lnk'));
        if (!ok) return null;
        notifyChanged();
        return [...parentPath, name];
    }

    function deleteShortcut(path) {
        const ok = shell(() => FileSystem.deleteItem(path));
        if (ok) notifyChanged();
        return ok;
    }

    // ---------- description / icons ----------

    function appName(appId) {
        try {
            const man = AppLoader.getManifest(appId);
            return (man && man.name) || appId;
        } catch { return appId; }
    }

    // The folder an app shortcut points at. New shortcuts store the folder
    // itself - the app's handle - while older ones stored the app id, which
    // is resolved through the catalog.
    function appFolder(data) {
        if (!data || data.type !== 'app') return null;
        if (Array.isArray(data.target)) return data.target;
        try { return AppLoader.folderFor(data.target); } catch { return null; }
    }

    // The manifest of the app a shortcut points at.
    function appManifest(data) {
        const folder = appFolder(data);
        if (!folder) return null;
        try { return AppLoader.manifestForFolder(folder); } catch { return null; }
    }

    function targetLabel(data) {
        if (!data) return '';
        if (data.type === 'url') return data.target;
        if (data.type === 'app') {
            const man = appManifest(data);
            if (man) return man.name;
            return appName(Array.isArray(data.target) ? data.target[data.target.length - 1] : data.target);
        }
        return formatPath(data.target);
    }

    function defaultName(data) {
        if (!data) return 'New shortcut';
        if (data.type === 'url') {
            try { return new URL(normalizeUrl(data.target)).hostname.replace(/^www\./, '') || 'Internet Shortcut'; }
            catch { return 'Internet Shortcut'; }
        }
        if (data.type === 'app') {
            const man = appManifest(data);
            if (man) return man.name;
            return appName(Array.isArray(data.target) ? data.target[data.target.length - 1] : data.target);
        }
        if (Array.isArray(data.target) && data.target.length > 0) {
            const last = data.target[data.target.length - 1];
            return data.type === 'file' ? baseName(last) : last;
        }
        return 'New shortcut';
    }

    function targetExists(data) {
        if (!data) return false;
        if (data.type === 'url') return !!data.target;
        if (data.type === 'app') {
            const folder = appFolder(data);
            if (!folder) return false;
            try { return shell(() => FileSystem.itemExists(folder)); } catch { return false; }
        }
        try { return shell(() => FileSystem.itemExists(data.target)); } catch { return false; }
    }

    function sized(html, size) {
        if (typeof html !== 'string' || !html.startsWith('<svg')) return html;
        if (/\swidth="/.test(html.slice(0, html.indexOf('>')))) {
            return html
                .replace(/(<svg[^>]*\s)width="[^"]*"/, `$1width="${size}"`)
                .replace(/(<svg[^>]*\s)height="[^"]*"/, `$1height="${size}"`);
        }
        return html.replace('<svg', `<svg width="${size}" height="${size}"`);
    }

    function appIconHtml(appId, size) {
        let html;
        try { html = AppIcons.get(appId); } catch { html = UIIcons.files.generic(size); }
        return `<span style="display:inline-flex;width:${size}px;height:${size}px;align-items:center;justify-content:center;">${sized(html, size)}</span>`;
    }

    function arrowBadge(size) {
        const b = Math.max(12, Math.round(size * 0.46));
        return `<span title="Shortcut" style="position:absolute;left:-2px;bottom:-2px;width:${b}px;height:${b}px;border-radius:3px;background:#f3f3f3;border:1px solid rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;box-sizing:border-box;box-shadow:0 1px 2px rgba(0,0,0,0.35);">
            <svg width="${Math.round(b * 0.7)}" height="${Math.round(b * 0.7)}" viewBox="0 0 24 24" fill="none"><path d="M5 19L19 5M10 5h9v9" stroke="#1b1b1b" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>`;
    }

    function withArrow(inner, size) {
        return `<span style="position:relative;display:inline-flex;width:${size}px;height:${size}px;align-items:center;justify-content:center;">${inner}${arrowBadge(size)}</span>`;
    }

    function targetIconHtml(data, size) {
        if (!data) return UIIcons.files.lnk(size);
        if (data.type === 'url') return appIconHtml('browser', size);
        if (data.type === 'app') {
            const folder = appFolder(data);
            const man = appManifest(data);
            if (folder) return AppIcons.forFolder(folder, man);
            return UIIcons.files.generic(size);
        }
        if (data.type === 'folder') {
            const man = AppLoader.manifestForFolder(data.target);
            if (man) return AppIcons.forFolder(data.target, man);
            const name = data.target && data.target[data.target.length - 1];
            return UIIcons.folder(name || '', size);
        }
        const name = data.target && data.target[data.target.length - 1];
        return UIIcons.file(extOf(name), name, size);
    }

    function iconHtml(data, size = 32, options = {}) {
        const icon = data && data.icon;
        let inner;
        if (icon && icon.kind === 'app' && icon.id) inner = appIconHtml(icon.id, size);
        else if (icon && icon.kind === 'builtin' && icon.name) {
            inner = UIIcons.get(icon.name, size) || UIIcons.files.generic(size);
        } else inner = targetIconHtml(data, size);
        return options.arrow === false ? inner : withArrow(inner, size);
    }

    function iconForPath(path, size = 32) {
        const data = readSync(path);
        return data ? iconHtml(data, size) : UIIcons.files.lnk(size);
    }

    function quickInfo(path) {
        return readSync(path);
    }

    // ---------- launching ----------

    function snapshotWindows() {
        return new Set([...document.querySelectorAll('.app-window')].map(el => el.id));
    }

    async function applyRunState(before, run) {
        if (!run || run === 'normal') return;
        const deadline = Date.now() + 1500;
        const seen = new Set();
        while (Date.now() < deadline) {
            const fresh = [...document.querySelectorAll('.app-window')].filter(el => !before.has(el.id) && !seen.has(el.id));
            if (fresh.length > 0) {
                fresh.forEach(el => {
                    seen.add(el.id);
                    try {
                        if (run === 'maximized') WindowManager.setMaximized(el.id, true);
                        else if (run === 'minimized') WindowManager.setMinimized(el.id, true);
                    } catch { /* window vanished */ }
                });
                return;
            }
            await new Promise(r => setTimeout(r, 50));
        }
    }

    function openFileTarget(path) {
        let opened = false;
        try {
            opened = FileAssociations.openDefault(path);
        } catch { opened = false; }
        if (opened) return true;

        // No association/viewer yet (File Explorer registers its viewers on
        // first launch) — fall back to Notepad, which renders anything.
        const notepad = AppLoader.folderFor('notepad');
        if (notepad) {
            AppLoader.ensureLoaded(notepad).then(app => {
                if (app && typeof app.launch === 'function') app.launch(path, path[path.length - 1]);
            }).catch(() => { /* crash monitor reports load failures */ });
        }
        return true;
    }

    async function openData(data, sourcePath, depth) {
        if (!data) return false;
        if (depth > 8) {
            Popup.error('Shortcut loop', 'This shortcut points to itself through a chain of shortcuts.');
            return false;
        }
        if (data.type === 'url') {
            const browserFolder = AppLoader.folderFor('browser');
            const browser = browserFolder ? await AppLoader.ensureLoaded(browserFolder) : null;
            if (browser && typeof browser.openUrl === 'function') browser.openUrl(data.target);
            else if (browser && typeof browser.launch === 'function') browser.launch(data.target);
            else return false;
            return true;
        }
        if (data.type === 'app') {
            // An app shortcut leads to the app's folder: that is where the
            // app lives and where it runs from.
            const folder = appFolder(data);
            if (!folder) {
                brokenDialog(data, sourcePath);
                return false;
            }
            return !!(await AppLoader.launch(folder));
        }

        if (!targetExists(data)) {
            brokenDialog(data, sourcePath);
            return false;
        }
        if (isShortcutPath(data.target)) {
            const inner = await read(data.target);
            if (!inner) {
                brokenDialog(data, data.target);
                return false;
            }
            return openData(inner, data.target, depth + 1);
        }
        if (data.type === 'folder') {
            const man = AppLoader.manifestForFolder(data.target);
            if (man) return !!(await AppLoader.launch(data.target));
            const popped = await AppLoader.launchById('fileExplorer', { path: data.target });
            return !!popped;
        }
        return openFileTarget(data.target);
    }

    async function open(path) {
        const name = Array.isArray(path) ? path[path.length - 1] : '';
        const data = await read(path);
        if (!data) {
            Popup.error('Cannot open shortcut', `"${esc(name)}" is not a valid Windows 12 shortcut.`);
            return false;
        }
        const before = snapshotWindows();
        let ok = false;
        try { ok = await openData(data, path, 0); } catch { ok = false; }
        if (ok) await applyRunState(before, data.run);
        return ok;
    }

    function brokenDialog(data, sourcePath) {
        const target = targetLabel(data);
        const body = `
            <div style="padding:4px 0 10px;font-size:13px;line-height:1.55;">
                The shortcut <b>${esc(Array.isArray(sourcePath) ? sourcePath[sourcePath.length - 1] : '')}</b>
                points to a location that no longer exists.
                <div style="margin-top:12px;padding:8px 10px;background:rgba(128,128,128,0.12);border-radius:6px;font-size:12px;word-break:break-all;">
                    <div style="color:var(--text-secondary);font-size:11px;margin-bottom:3px;">Target</div>
                    ${esc(target)}
                </div>
            </div>`;
        Popup.custom('Shortcut is broken', body, [
            { label: 'Delete', value: 'delete', danger: true },
            { label: 'Properties', value: 'properties' },
            { label: 'Close', value: null, primary: true }
        ], { width: 460, height: 300 }).then(choice => {
            if (choice === 'delete' && Array.isArray(sourcePath)) deleteShortcut(sourcePath);
            else if (choice === 'properties' && Array.isArray(sourcePath)) properties(sourcePath);
        });
    }

    // ---------- hotkeys ----------

    function notifyChanged() {
        try { window.dispatchEvent(new CustomEvent('shortcuts-changed')); } catch { /* noop */ }
    }

    function scheduleHotkeys() {
        if (hotkeyTimer) clearTimeout(hotkeyTimer);
        hotkeyTimer = setTimeout(() => {
            hotkeyTimer = null;
            try { refreshHotkeys(); } catch { /* noop */ }
        }, 180);
    }

    function collectShortcuts(dir, depth, out) {
        if (depth < 0) return;
        let children = [];
        try { children = shell(() => FileSystem.getChildren(dir)) || []; } catch { return; }
        for (const child of children) {
            const full = [...dir, child.name];
            if (child.type === 'folder') {
                collectShortcuts(full, depth - 1, out);
            } else if (child.ext === 'lnk') {
                const data = readSync(full);
                if (data && data.hotkey) out.push({ path: full, data });
            }
        }
    }

    function refreshHotkeys() {
        Keyboard.unregisterAll(HOTKEY_OWNER);
        if (!wired) return;
        const out = [];
        const roots = [
            desktopDir(),
            startMenuDir(),
            taskbarDir()
        ];
        const visited = new Set();
        roots.forEach(root => {
            const key = root.join('/');
            if (visited.has(key)) return;
            visited.add(key);
            collectShortcuts(root, 3, out);
        });
        out.sort((a, b) => a.path.join('/').localeCompare(b.path.join('/')));
        const used = new Set();
        out.forEach(entry => {
            const combo = normalizeHotkey(entry.data.hotkey);
            if (!combo || used.has(combo)) return;
            used.add(combo);
            try {
                Keyboard.register(combo, () => {
                    if (document.body.classList.contains('locked') ||
                        document.body.classList.contains('uac-active')) return;
                    open(entry.path);
                }, {
                    owner: HOTKEY_OWNER,
                    description: `Shortcut: ${entry.path[entry.path.length - 1]}`
                });
            } catch { /* invalid combo — skip */ }
        });
    }

    function normalizeHotkey(combo) {
        if (!combo) return null;
        const parts = String(combo).toUpperCase().split('+').map(p => p.trim()).filter(Boolean);
        const key = parts.pop();
        if (!key) return null;
        const validKey = /^[A-Z0-9]$/.test(key) || /^F([1-9]|1[0-2])$/.test(key) || key === 'SPACE';
        if (!validKey) return null;
        const set = new Set(parts);
        const ctrl = set.has('CTRL') || set.has('CONTROL');
        const alt = set.has('ALT');
        const shift = set.has('SHIFT');
        if (!((ctrl && alt) || (ctrl && shift) || (alt && shift))) return null;
        const mods = [];
        if (ctrl) mods.push('CTRL');
        if (shift) mods.push('SHIFT');
        if (alt) mods.push('ALT');
        return [...mods, key].join('+');
    }

    function comboFromEvent(e) {
        const ctrl = e.ctrlKey, alt = e.altKey, shift = e.shiftKey;
        if (!((ctrl && alt) || (ctrl && shift) || (alt && shift))) return null;
        let key = '';
        // Prefer the physical key code so Shift-modified digits keep working
        // on layouts where e.key becomes a symbol (Ctrl+Shift+1 → '!').
        if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
        else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5);
        else if (/^F([1-9]|1[0-2])$/.test(e.code)) key = e.code;
        else if (e.key === ' ') key = 'SPACE';
        else if (/^F([1-9]|1[0-2])$/i.test(e.key)) key = e.key.toUpperCase();
        else if (/^[a-z0-9]$/i.test(e.key)) key = e.key.toUpperCase();
        if (!key) return null;
        const mods = [];
        if (ctrl) mods.push('CTRL');
        if (shift) mods.push('SHIFT');
        if (alt) mods.push('ALT');
        return [...mods, key].join('+');
    }

    // ---------- pickers ----------

    function launchableApps() {
        try {
            return AppLoader.getAll()
                .filter(m => AppLoader.isLaunchable(m.id) && !AppLoader.isService(m.id))
                .sort((a, b) => String(a.name).localeCompare(String(b.name)));
        } catch { return []; }
    }

    function settleWindow(winId, resolve) {
        let done = false;
        const finish = (value) => {
            if (done) return;
            done = true;
            window.removeEventListener('window-closed', onClosed);
            resolve(value);
        };
        const onClosed = (e) => {
            if (e.detail && e.detail.id === winId) finish(null);
        };
        window.addEventListener('window-closed', onClosed);
        return finish;
    }

    function pickPath(kind, startPath) {
        return new Promise(resolve => {
            let current = Array.isArray(startPath) && shell(() => FileSystem.isFolder(startPath))
                ? startPath.slice()
                : Users.home();
            let selected = null;

            const html = `
                <div style="display:flex;flex-direction:column;height:100%;padding:12px;box-sizing:border-box;gap:8px;">
                    <div style="display:flex;align-items:center;gap:6px;">
                        <button class="scp-up" title="Up" style="padding:4px 9px;background:rgba(128,128,128,0.16);border:1px solid var(--window-border);border-radius:4px;color:var(--text-primary);cursor:pointer;">&#9650;</button>
                        <div class="scp-path" style="flex:1;font-size:12px;padding:6px 9px;background:rgba(128,128,128,0.12);border:1px solid var(--window-border);border-radius:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></div>
                    </div>
                    <div class="scp-list" style="flex:1;overflow-y:auto;border:1px solid var(--window-border);border-radius:6px;padding:4px;min-height:0;"></div>
                    <div class="scp-error" style="font-size:11px;color:#ff8a80;min-height:14px;"></div>
                    <div style="display:flex;justify-content:flex-end;gap:8px;">
                        ${kind === 'folder' ? '<button class="scp-current" style="padding:5px 14px;background:rgba(128,128,128,0.16);border:1px solid var(--window-border);border-radius:4px;color:var(--text-primary);cursor:pointer;font-size:12px;">Select this folder</button>' : ''}
                        <button class="scp-cancel" style="padding:5px 16px;background:rgba(128,128,128,0.16);border:1px solid var(--window-border);border-radius:4px;color:var(--text-primary);cursor:pointer;font-size:12px;">Cancel</button>
                        <button class="scp-ok" style="padding:5px 22px;background:#0078D4;border:none;border-radius:4px;color:#fff;cursor:pointer;font-size:12px;font-weight:600;">Select</button>
                    </div>
                </div>`;

            const title = kind === 'folder' ? 'Select Folder' : 'Select File';
            const win = WindowManager.createWindow('shortcuts', title, UIIcons.folder('', 16), html, {
                width: 520, height: 480, minWidth: 360, minHeight: 300, saveState: false
            });
            const finish = settleWindow(win.id, resolve);
            const el = win.element;
            const list = el.querySelector('.scp-list');
            const pathEl = el.querySelector('.scp-path');
            const errorEl = el.querySelector('.scp-error');
            const okBtn = el.querySelector('.scp-ok');

            const paint = () => {
                pathEl.textContent = current.length === 1 ? 'Local Disk (C:)' : formatPath(current);
                pathEl.title = formatPath(current);
                el.querySelector('.scp-up').disabled = current.length <= 1;
                selected = null;
                errorEl.textContent = '';
                list.innerHTML = '';
                let children = [];
                try { children = shell(() => FileSystem.getChildren(current)) || []; } catch { children = []; }
                children = children
                    .filter(c => c.type === 'folder' || kind === 'file')
                    .sort((a, b) => {
                        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
                        return a.name.localeCompare(b.name);
                    });
                if (children.length === 0) {
                    list.innerHTML = '<div style="padding:24px;text-align:center;font-size:12px;color:var(--text-secondary);">This folder is empty</div>';
                    return;
                }
                children.forEach(child => {
                    const row = document.createElement('div');
                    row.dataset.name = child.name;
                    row.dataset.type = child.type;
                    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:4px;cursor:pointer;font-size:12px;';
                    row.innerHTML = `<span style="width:18px;height:18px;display:inline-flex;flex-shrink:0;">${child.type === 'folder' ? UIIcons.folder(child.name, 18) : UIIcons.file(child.ext, child.name, 18)}</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(child.name)}</span>`;
                    const select = () => {
                        list.querySelectorAll('[data-name]').forEach(r => r.style.background = 'transparent');
                        row.style.background = 'rgba(0,120,212,0.28)';
                        selected = { name: child.name, type: child.type };
                    };
                    row.addEventListener('click', select);
                    row.addEventListener('dblclick', () => {
                        if (child.type === 'folder') {
                            current = [...current, child.name];
                            paint();
                        } else {
                            finish([...current, child.name]);
                            WindowManager.closeWindow(win.id);
                        }
                    });
                    list.appendChild(row);
                });
            };

            el.querySelector('.scp-up').addEventListener('click', () => {
                if (current.length > 1) {
                    current = current.slice(0, -1);
                    paint();
                }
            });
            okBtn.addEventListener('click', () => {
                if (kind === 'folder') {
                    if (!selected || selected.type !== 'folder') {
                        errorEl.textContent = 'Select a folder first.';
                        return;
                    }
                    finish([...current, selected.name]);
                } else {
                    if (!selected || selected.type !== 'file') {
                        errorEl.textContent = 'Select a file first.';
                        return;
                    }
                    finish([...current, selected.name]);
                }
                WindowManager.closeWindow(win.id);
            });
            el.querySelector('.scp-cancel').addEventListener('click', () => {
                finish(null);
                WindowManager.closeWindow(win.id);
            });
            const currentBtn = el.querySelector('.scp-current');
            if (currentBtn) {
                currentBtn.addEventListener('click', () => {
                    finish(current.slice());
                    WindowManager.closeWindow(win.id);
                });
            }
            paint();
        });
    }

    function pickIcon(current) {
        return new Promise(resolve => {
            let selectedIcon = current && current.kind
                ? { ...current }
                : { kind: 'target' };
            const apps = launchableApps();
            const html = `
                <div style="display:flex;flex-direction:column;height:100%;padding:12px;box-sizing:border-box;gap:8px;">
                    <div style="font-size:12px;color:var(--text-secondary);">Choose an icon for this shortcut.</div>
                    <div class="sci-scroll" style="flex:1;overflow-y:auto;min-height:0;display:flex;flex-direction:column;gap:10px;">
                        <div>
                            <div style="font-size:11px;font-weight:600;color:var(--text-secondary);padding:2px 0 6px;">Default</div>
                            <div class="sci-grid" data-section="target" style="display:flex;flex-wrap:wrap;gap:6px;"></div>
                        </div>
                        <div>
                            <div style="font-size:11px;font-weight:600;color:var(--text-secondary);padding:2px 0 6px;">Apps</div>
                            <div class="sci-grid" data-section="app" style="display:flex;flex-wrap:wrap;gap:6px;"></div>
                        </div>
                        <div>
                            <div style="font-size:11px;font-weight:600;color:var(--text-secondary);padding:2px 0 6px;">Built-in icons</div>
                            <div class="sci-grid" data-section="builtin" style="display:flex;flex-wrap:wrap;gap:6px;"></div>
                        </div>
                    </div>
                    <div style="display:flex;justify-content:flex-end;gap:8px;">
                        <button class="sci-cancel" style="padding:5px 16px;background:rgba(128,128,128,0.16);border:1px solid var(--window-border);border-radius:4px;color:var(--text-primary);cursor:pointer;font-size:12px;">Cancel</button>
                        <button class="sci-ok" style="padding:5px 22px;background:#0078D4;border:none;border-radius:4px;color:#fff;cursor:pointer;font-size:12px;font-weight:600;">OK</button>
                    </div>
                </div>`;
            const win = WindowManager.createWindow('shortcuts', 'Change Icon', UIIcons.files.lnk(16), html, {
                width: 540, height: 460, minWidth: 380, minHeight: 320, saveState: false
            });
            const finish = settleWindow(win.id, resolve);
            const el = win.element;

            const paintSelection = () => {
                el.querySelectorAll('.sci-cell').forEach(cell => {
                    const on = cell.dataset.section === selectedIcon.kind
                        && (selectedIcon.kind === 'target'
                            ? cell.dataset.key === 'target'
                            : cell.dataset.key === (selectedIcon.id || selectedIcon.name));
                    cell.style.borderColor = on ? 'var(--accent-color)' : 'transparent';
                    cell.style.background = on ? 'rgba(0,120,212,0.22)' : 'transparent';
                });
            };

            const addCell = (section, key, icon, label, value) => {
                const grid = el.querySelector(`.sci-grid[data-section="${section}"]`);
                if (!grid) return;
                const cell = document.createElement('div');
                cell.className = 'sci-cell';
                cell.dataset.section = section;
                cell.dataset.key = key;
                cell.title = label;
                cell.style.cssText = 'width:52px;height:58px;border:1px solid transparent;border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;cursor:pointer;';
                cell.innerHTML = `<span style="width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;">${sized(icon, 26)}</span><span style="font-size:9px;color:var(--text-secondary);max-width:48px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(label)}</span>`;
                cell.addEventListener('click', () => {
                    selectedIcon = value;
                    paintSelection();
                });
                grid.appendChild(cell);
            };

            addCell('target', 'target', UIIcons.files.lnk(26), 'Target', { kind: 'target' });
            apps.forEach(app => addCell('app', app.id, AppIcons.get(app.id), app.name, { kind: 'app', id: app.id }));
            BUILTIN_ICONS.forEach(name => addCell('builtin', name, UIIcons.get(name, 26), name, { kind: 'builtin', name }));

            el.querySelector('.sci-ok').addEventListener('click', () => {
                finish(selectedIcon);
                WindowManager.closeWindow(win.id);
            });
            el.querySelector('.sci-cancel').addEventListener('click', () => {
                finish(null);
                WindowManager.closeWindow(win.id);
            });
            paintSelection();
        });
    }

    // ---------- shared form (create wizard + properties) ----------

    function openForm(mode, options = {}) {
        return new Promise(resolve => {
            const original = options.data || null;
            const parentPath = (options.parentPath || Users.home()).slice();
            const path = options.path || null;
            let pendingIcon = original && original.icon ? { ...original.icon } : { kind: 'target' };
            let hotkeyValue = original && original.hotkey ? original.hotkey : '';
            // An explicit suggestion (e.g. "Report - Shortcut") must survive the
            // first type/target paint, so treat it as user-edited from the start.
            let nameEdited = mode === 'properties' || !!(options.name);
            let capturing = false;

            const appOptions = launchableApps()
                .map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`)
                .join('');

            const initialName = mode === 'properties'
                ? (path ? path[path.length - 1] : 'Shortcut.lnk')
                : (options.name || (original ? defaultName(original) : 'New shortcut'));

            const html = `
                <div style="display:flex;flex-direction:column;height:100%;padding:16px;box-sizing:border-box;gap:10px;overflow-y:auto;">
                    <div style="font-size:12px;color:var(--text-secondary);">
                        ${mode === 'create'
                            ? 'Create a shortcut to a file, folder, website, or app.'
                            : `Edit the properties of <b style="color:var(--text-primary);">${esc(path ? path[path.length - 1] : '')}</b>.`}
                    </div>
                    <label class="sc-field" style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
                        <span style="color:var(--text-secondary);">Shortcut name</span>
                        <input class="sc-name" type="text" value="${esc(initialName)}" spellcheck="false" style="padding:6px 8px;background:rgba(128,128,128,0.12);border:1px solid var(--window-border);border-radius:4px;color:var(--text-primary);font-size:13px;outline:none;">
                    </label>
                    <label class="sc-field" style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
                        <span style="color:var(--text-secondary);">Target type</span>
                        <select class="sc-type" style="padding:6px 8px;background:rgba(128,128,128,0.12);border:1px solid var(--window-border);border-radius:4px;color:var(--text-primary);font-size:13px;outline:none;">
                            <option value="file">File</option>
                            <option value="folder">Folder</option>
                            <option value="url">Website / URL</option>
                            <option value="app">App</option>
                        </select>
                    </label>
                    <label class="sc-field" style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
                        <span style="color:var(--text-secondary);">Target</span>
                        <div style="display:flex;gap:6px;">
                            <input class="sc-target" type="text" spellcheck="false" style="flex:1;min-width:0;padding:6px 8px;background:rgba(128,128,128,0.12);border:1px solid var(--window-border);border-radius:4px;color:var(--text-primary);font-size:13px;outline:none;">
                            <button class="sc-browse" style="padding:6px 12px;background:rgba(128,128,128,0.16);border:1px solid var(--window-border);border-radius:4px;color:var(--text-primary);cursor:pointer;font-size:12px;">Browse…</button>
                            <select class="sc-app" style="display:none;flex:1;min-width:0;padding:6px 8px;background:rgba(128,128,128,0.12);border:1px solid var(--window-border);border-radius:4px;color:var(--text-primary);font-size:13px;outline:none;">
                                ${appOptions}
                            </select>
                        </div>
                    </label>
                    <label class="sc-field" style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
                        <span style="color:var(--text-secondary);">Arguments <span style="opacity:0.65;">(optional)</span></span>
                        <input class="sc-args" type="text" spellcheck="false" style="padding:6px 8px;background:rgba(128,128,128,0.12);border:1px solid var(--window-border);border-radius:4px;color:var(--text-primary);font-size:13px;outline:none;">
                    </label>
                    <label class="sc-field" style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
                        <span style="color:var(--text-secondary);">Start in <span style="opacity:0.65;">(optional folder)</span></span>
                        <input class="sc-start" type="text" spellcheck="false" style="padding:6px 8px;background:rgba(128,128,128,0.12);border:1px solid var(--window-border);border-radius:4px;color:var(--text-primary);font-size:13px;outline:none;">
                    </label>
                    <label class="sc-field" style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
                        <span style="color:var(--text-secondary);">Run</span>
                        <select class="sc-run" style="padding:6px 8px;background:rgba(128,128,128,0.12);border:1px solid var(--window-border);border-radius:4px;color:var(--text-primary);font-size:13px;outline:none;">
                            <option value="normal">Normal window</option>
                            <option value="minimized">Minimized</option>
                            <option value="maximized">Maximized</option>
                        </select>
                    </label>
                    <label class="sc-field" style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
                        <span style="color:var(--text-secondary);">Shortcut key</span>
                        <div style="display:flex;gap:6px;">
                            <input class="sc-hotkey" type="text" readonly value="${esc(hotkeyValue || 'None')}" placeholder="None" style="flex:1;min-width:0;padding:6px 8px;background:rgba(128,128,128,0.12);border:1px solid var(--window-border);border-radius:4px;color:var(--text-primary);font-size:13px;outline:none;cursor:pointer;">
                            <button class="sc-hotkey-clear" style="padding:6px 12px;background:rgba(128,128,128,0.16);border:1px solid var(--window-border);border-radius:4px;color:var(--text-primary);cursor:pointer;font-size:12px;">Clear</button>
                        </div>
                        <span class="sc-hotkey-hint" style="font-size:10px;color:var(--text-secondary);">Click the field, then press Ctrl+Alt, Ctrl+Shift or Alt+Shift with a letter, number or F-key.</span>
                    </label>
                    <label class="sc-field" style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
                        <span style="color:var(--text-secondary);">Comment <span style="opacity:0.65;">(optional)</span></span>
                        <textarea class="sc-comment" rows="2" spellcheck="false" style="resize:vertical;min-height:44px;padding:6px 8px;background:rgba(128,128,128,0.12);border:1px solid var(--window-border);border-radius:4px;color:var(--text-primary);font-size:13px;outline:none;font-family:inherit;"></textarea>
                    </label>
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span class="sc-icon-preview" style="width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;"></span>
                        <button class="sc-icon-change" style="padding:6px 12px;background:rgba(128,128,128,0.16);border:1px solid var(--window-border);border-radius:4px;color:var(--text-primary);cursor:pointer;font-size:12px;">Change Icon…</button>
                    </div>
                    <div class="sc-error" style="font-size:11px;color:#ff8a80;min-height:14px;"></div>
                    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:auto;padding-top:4px;">
                        <button class="sc-cancel" style="padding:6px 20px;background:rgba(128,128,128,0.16);border:1px solid var(--window-border);border-radius:4px;color:var(--text-primary);cursor:pointer;font-size:13px;">Cancel</button>
                        <button class="sc-ok" style="padding:6px 26px;background:#0078D4;border:none;border-radius:4px;color:#fff;cursor:pointer;font-size:13px;font-weight:600;">${mode === 'create' ? 'Create' : 'Save'}</button>
                    </div>
                </div>`;

            const title = mode === 'create' ? 'Create Shortcut' : `${path ? path[path.length - 1] : 'Shortcut'} Properties`;
            const win = WindowManager.createWindow('shortcuts', title, UIIcons.files.lnk(16), html, {
                width: 500, height: 680, minWidth: 380, minHeight: 420, saveState: false
            });
            const finish = settleWindow(win.id, resolve);
            const el = win.element;

            const nameInput = el.querySelector('.sc-name');
            const typeSel = el.querySelector('.sc-type');
            const targetInput = el.querySelector('.sc-target');
            const browseBtn = el.querySelector('.sc-browse');
            const appSel = el.querySelector('.sc-app');
            const argsInput = el.querySelector('.sc-args');
            const startInput = el.querySelector('.sc-start');
            const runSel = el.querySelector('.sc-run');
            const hotkeyInput = el.querySelector('.sc-hotkey');
            const commentInput = el.querySelector('.sc-comment');
            const iconPreview = el.querySelector('.sc-icon-preview');
            const errorEl = el.querySelector('.sc-error');

            nameInput.addEventListener('input', () => { nameEdited = true; });

            // Seed initial values.
            typeSel.value = original && TYPES.includes(original.type) ? original.type : (options.type || 'file');
            if (original) {
                if (original.type === 'app') {
                    appSel.value = original.target;
                    if (appSel.value !== original.target) {
                        const opt = document.createElement('option');
                        opt.value = original.target;
                        opt.textContent = `${original.target} (not installed)`;
                        appSel.appendChild(opt);
                        appSel.value = original.target;
                    }
                } else if (original.type === 'url') targetInput.value = original.target;
                else targetInput.value = formatPath(original.target);
                argsInput.value = original.arguments || '';
                startInput.value = original.startIn ? formatPath(original.startIn) : '';
                runSel.value = original.run || 'normal';
                commentInput.value = original.comment || '';
            } else if (options.target) {
                if (options.type === 'app') appSel.value = options.target;
                else if (options.type === 'url') targetInput.value = options.target;
                else if (Array.isArray(options.target)) targetInput.value = formatPath(options.target);
            }

            const suggestName = () => {
                const type = typeSel.value;
                if (type === 'app') return appName(appSel.value) || 'App shortcut';
                if (type === 'url') {
                    const v = normalizeUrl(targetInput.value);
                    try { return new URL(v).hostname.replace(/^www\./, '') || 'Internet Shortcut'; }
                    catch { return 'Internet Shortcut'; }
                }
                const p = parsePath(targetInput.value);
                if (!p || p.length <= 1) return 'New shortcut';
                const last = p[p.length - 1];
                return type === 'file' ? baseName(last) : last;
            };

            const dataFromForm = () => {
                const type = typeSel.value;
                let target;
                if (type === 'app') target = appSel.value;
                else if (type === 'url') target = targetInput.value;
                else target = targetInput.value;
                return {
                    format: FORMAT,
                    version: VERSION,
                    type,
                    target,
                    arguments: argsInput.value,
                    startIn: parsePath(startInput.value),
                    comment: commentInput.value,
                    run: runSel.value,
                    hotkey: hotkeyValue || null,
                    icon: pendingIcon,
                    created: original ? original.created : undefined
                };
            };

            const paintIcon = () => {
                const d = dataFromForm();
                if (d.type === 'file' || d.type === 'folder') d.target = parsePath(targetInput.value) || [];
                if (d.type === 'url') d.target = normalizeUrl(targetInput.value);
                iconPreview.innerHTML = iconHtml(d, 32);
            };

            const applyType = () => {
                const type = typeSel.value;
                const isApp = type === 'app';
                targetInput.style.display = isApp ? 'none' : 'block';
                appSel.style.display = isApp ? 'block' : 'none';
                browseBtn.style.display = (type === 'file' || type === 'folder') ? 'inline-block' : 'none';
                targetInput.placeholder = type === 'url'
                    ? 'https://example.com'
                    : 'C:\\Users\\…';
                if (isApp && !appSel.value) {
                    const first = appSel.options[0];
                    if (first) appSel.value = first.value;
                }
                if (!nameEdited) nameInput.value = suggestName();
                paintIcon();
            };

            typeSel.addEventListener('change', applyType);
            targetInput.addEventListener('input', () => {
                if (!nameEdited) nameInput.value = suggestName();
                paintIcon();
            });
            appSel.addEventListener('change', () => {
                if (!nameEdited) nameInput.value = suggestName();
                paintIcon();
            });
            hotkeyInput.addEventListener('focus', () => {
                capturing = true;
                hotkeyInput.value = '';
                hotkeyInput.placeholder = 'Press shortcut keys…';
            });
            hotkeyInput.addEventListener('blur', () => {
                capturing = false;
                hotkeyInput.value = hotkeyValue || 'None';
            });
            hotkeyInput.addEventListener('keydown', (e) => {
                if (!capturing) return;
                e.preventDefault();
                e.stopPropagation();
                if (e.key === 'Escape') { hotkeyInput.blur(); return; }
                if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
                const combo = comboFromEvent(e);
                if (!combo) {
                    hotkeyInput.value = 'Unsupported';
                    return;
                }
                hotkeyValue = combo;
                hotkeyInput.value = combo;
                hotkeyInput.blur();
            });
            el.querySelector('.sc-hotkey-clear').addEventListener('click', () => {
                hotkeyValue = '';
                hotkeyInput.value = 'None';
            });
            browseBtn.addEventListener('click', () => {
                const type = typeSel.value;
                const start = parsePath(targetInput.value);
                pickPath(type, start).then(p => {
                    if (!p || !win.element.isConnected) return;
                    targetInput.value = formatPath(p);
                    if (!nameEdited) nameInput.value = suggestName();
                    paintIcon();
                });
            });
            el.querySelector('.sc-icon-change').addEventListener('click', () => {
                pickIcon(pendingIcon).then(icon => {
                    if (!icon || !win.element.isConnected) return;
                    pendingIcon = icon;
                    paintIcon();
                });
            });
            el.querySelector('.sc-cancel').addEventListener('click', () => {
                finish(null);
                WindowManager.closeWindow(win.id);
            });

            el.querySelector('.sc-ok').addEventListener('click', () => {
                errorEl.textContent = '';
                const type = typeSel.value;
                let target;
                if (type === 'app') {
                    target = appSel.value;
                    if (!target) { errorEl.textContent = 'Choose an app.'; return; }
                } else if (type === 'url') {
                    target = normalizeUrl(targetInput.value);
                    if (!target) { errorEl.textContent = 'Enter a website address.'; return; }
                } else {
                    target = resolveExistingPath(parsePath(targetInput.value));
                    if (!target) { errorEl.textContent = 'Enter a file or folder path.'; return; }
                }

                let name = sanitizeName(nameInput.value);
                const startIn = resolveExistingPath(parsePath(startInput.value));
                if (mode === 'create') {
                    const data = {
                        format: FORMAT, version: VERSION, type, target,
                        arguments: argsInput.value,
                        startIn,
                        comment: commentInput.value,
                        run: runSel.value,
                        hotkey: normalizeHotkey(hotkeyValue),
                        icon: pendingIcon,
                        created: new Date().toISOString()
                    };
                    const created = create(parentPath, data, { name });
                    if (!created) { errorEl.textContent = 'Could not create the shortcut.'; return; }
                    finish(created);
                    WindowManager.closeWindow(win.id);
                    return;
                }

                const data = {
                    format: FORMAT, version: VERSION, type, target,
                    arguments: argsInput.value,
                    startIn,
                    comment: commentInput.value,
                    run: runSel.value,
                    hotkey: normalizeHotkey(hotkeyValue),
                    icon: pendingIcon,
                    created: original && original.created ? original.created : new Date().toISOString()
                };
                let finalPath = path.slice();
                const wanted = `${name}.lnk`;
                if (wanted !== finalPath[finalPath.length - 1]) {
                    const renamed = shell(() => FileSystem.renameItem(finalPath, wanted));
                    if (!renamed) {
                        errorEl.textContent = 'Could not rename the shortcut. A file with that name may already exist.';
                        return;
                    }
                    finalPath = [...finalPath.slice(0, -1), wanted];
                }
                if (!write(finalPath, data)) {
                    errorEl.textContent = 'Could not save the shortcut.';
                    return;
                }
                notifyChanged();
                finish(finalPath);
                WindowManager.closeWindow(win.id);
            });

            if (original) {
                if (Array.isArray(original.startIn)) startInput.value = formatPath(original.startIn);
                runSel.value = original.run || 'normal';
                commentInput.value = original.comment || '';
            }
            applyType();
        });
    }

    function wizard(parentPath, options = {}) {
        return openForm('create', {
            parentPath: Array.isArray(parentPath) ? parentPath.slice() : Users.home(),
            type: options.type || 'file',
            target: options.target || '',
            name: options.name || ''
        });
    }

    function createForPath(itemPath, parentPath) {
        if (!Array.isArray(itemPath) || itemPath.length === 0) return Promise.resolve(null);
        const isDir = shell(() => FileSystem.isFolder(itemPath));
        const name = itemPath[itemPath.length - 1];
        return wizard(parentPath || itemPath.slice(0, -1), {
            type: isDir ? 'folder' : 'file',
            target: itemPath.slice(),
            name: `${isDir ? name : baseName(name)} - Shortcut`
        });
    }

    function properties(path) {
        return read(path).then(data => {
            if (!data) {
                Popup.error('Shortcut properties', 'This file is not a valid Windows 12 shortcut.');
                return null;
            }
            return openForm('properties', { path: path.slice(), data });
        });
    }

    // ---------- app shortcuts / shell folders ----------

    function listShortcutFiles(destination, userId) {
        const dir = destinationDir(destination, userId);
        if (!dir) return [];
        const out = [];
        const walk = (d, depth) => {
            if (depth < 0) return;
            let children = [];
            try { children = shell(() => FileSystem.getChildren(d)) || []; } catch { return; }
            for (const child of children) {
                const full = [...d, child.name];
                if (child.type === 'folder') {
                    if (destination === 'startMenu') walk(full, depth - 1);
                } else if (child.ext === 'lnk') {
                    out.push(full);
                }
            }
        };
        walk(dir, destination === 'startMenu' ? 6 : 0);
        return out;
    }

    function managedShortcut(path, appId) {
        const data = readSync(path);
        if (!data || !data.source || !data.source.appId) return null;
        if (data.source.appId !== appId) return null;
        if (!['installer', 'system'].includes(data.source.kind)) return null;
        return data;
    }

    function findManagedShortcut(destination, appId, userId) {
        for (const path of listShortcutFiles(destination, userId)) {
            if (managedShortcut(path, appId)) return path;
        }
        return null;
    }

    function appShortcutConfig(manifest, installer) {
        try {
            return mergeConfig(
                normalizeConfig(manifest && manifest.shortcuts, MANIFEST_DEFAULTS),
                installer ? normalizeConfig(installer.shortcuts, null) : null
            );
        } catch {
            return normalizeConfig(undefined, MANIFEST_DEFAULTS);
        }
    }

    function appIdForShortcut(data) {
        if (!data) return null;
        if (data.type === 'app') {
            if (data.source && data.source.appId) return data.source.appId;
            const man = appManifest(data);
            if (man) return man.id;
            return Array.isArray(data.target) ? data.target[data.target.length - 1] : data.target;
        }
        if (data.type === 'folder') {
            const man = AppLoader.manifestForFolder(data.target);
            return man ? man.id : null;
        }
        return null;
    }

    function shortcutLocation(data) {
        if (!data) return null;
        if (data.type === 'app') {
            const folder = appFolder(data);
            return folder ? folder.slice() : null;
        }
        if (data.type === 'folder' && Array.isArray(data.target)) return data.target.slice();
        if (data.type === 'file' && Array.isArray(data.target) && data.target.length > 1) {
            return data.target.slice(0, -1);
        }
        return null;
    }

    // Where "Open file location" should go for a shortcut: the target's folder
    // when it has a real path, otherwise the folder that contains the .lnk.
    function locationFor(path, data) {
        const d = data || readSync(path);
        const target = shortcutLocation(d);
        if (target) return target;
        return Array.isArray(path) && path.length > 1 ? path.slice(0, -1) : null;
    }

    function createAppShortcut(appId, destination, options = {}) {
        if (!DESTINATIONS.includes(destination)) return null;
        const man = options.manifest || AppLoader.getManifest(appId) || { id: appId, name: appId };
        if (man.service === true) return null;
        const cfg = appShortcutConfig(man, options.installer);
        const destCfg = cfg[destination] || {};
        const shouldCreate = options.create !== undefined
            ? !!options.create
            : resolveCreate(cfg, options.selection || null)[destination];
        if (!shouldCreate) {
            const explicitFalse = options.selection && options.selection[destination] === false;
            if (explicitFalse) {
                const existing = findManagedShortcut(destination, appId, options.userId);
                if (existing) deleteShortcut(existing);
            }
            return null;
        }

        const dir = destinationDir(destination, options.userId);
        if (!dir) return null;
        ensureFolder(dir);

        // The shortcut leads to the app's folder: that is the app's handle,
        // and the app runs from there.
        const folder = options.folder || AppLoader.folderFor(appId);
        if (!folder) return null;

        const data = {
            format: FORMAT,
            version: VERSION,
            type: 'app',
            target: folder.slice(),
            arguments: destCfg.arguments || '',
            startIn: Array.isArray(destCfg.startIn) ? destCfg.startIn.slice() : null,
            comment: destCfg.comment || '',
            run: RUN_STATES.includes(destCfg.run) ? destCfg.run : 'normal',
            hotkey: destCfg.hotkey || null,
            icon: destCfg.icon || { kind: 'target' },
            source: options.source || { kind: 'installer', appId },
            created: new Date().toISOString()
        };
        const name = String(options.name || destCfg.name || man.name || appId).replace(/\.lnk$/i, '');

        const existing = findManagedShortcut(destination, appId, options.userId);
        if (existing) {
            const old = readSync(existing);
            if (old && old.created) data.created = old.created;
            if (!write(existing, data)) return null;
            const wanted = `${sanitizeName(name)}.lnk`;
            if (existing[existing.length - 1] !== wanted &&
                !shell(() => FileSystem.itemExists([...dir, wanted]))) {
                if (shell(() => FileSystem.renameItem(existing, wanted))) {
                    notifyChanged();
                    return [...dir, wanted];
                }
            }
            notifyChanged();
            return existing;
        }
        return create(dir, data, { name });
    }

    function onAppInstalled(appId, manifest, options = {}) {
        const man = manifest || AppLoader.getManifest(appId);
        if (!man || man.service === true) return;
        const selection = options.selection || null;
        const cfg = appShortcutConfig(man, options.installer);
        const shouldCreate = resolveCreate(cfg, selection);
        for (const dest of DESTINATIONS) {
            createAppShortcut(appId, dest, {
                manifest: man,
                installer: options.installer,
                selection,
                create: shouldCreate[dest],
                source: { kind: 'installer', appId },
                userId: options.userId
            });
        }
    }

    function removeAppShortcuts(appId, userId) {
        let removed = 0;
        for (const dest of DESTINATIONS) {
            for (const path of listShortcutFiles(dest, userId)) {
                if (managedShortcut(path, appId)) {
                    if (deleteShortcut(path)) removed++;
                }
            }
        }
        return removed;
    }

    function pinToTaskbar(sourcePath, options = {}) {
        if (!Array.isArray(sourcePath) || sourcePath.length === 0) return null;
        const dir = taskbarDir(options.userId);
        ensureFolder(dir);
        const name = options.name || baseName(sourcePath[sourcePath.length - 1]);
        let data;
        if (isShortcutPath(sourcePath)) {
            const inner = readSync(sourcePath);
            if (!inner) return null;
            data = { ...inner, source: { kind: 'user', appId: appIdForShortcut(inner) } };
        } else {
            const isDir = shell(() => FileSystem.isFolder(sourcePath));
            const man = isDir ? AppLoader.manifestForFolder(sourcePath) : null;
            data = {
                format: FORMAT,
                version: VERSION,
                type: isDir ? 'folder' : 'file',
                target: sourcePath.slice(),
                icon: { kind: 'target' },
                source: { kind: 'user', appId: man ? man.id : null },
                created: new Date().toISOString()
            };
        }
        const targetAppId = appIdForShortcut(data);
        if (targetAppId) {
            for (const path of listShortcutFiles('taskbar', options.userId)) {
                const existing = readSync(path);
                if (existing && appIdForShortcut(existing) === targetAppId) return path;
            }
        }
        return create(dir, data, { name: options.name || baseName(sourcePath[sourcePath.length - 1]) || name });
    }

    // ---------- lifecycle ----------

    function init() {
        FileAssociations.setShortcutHandler((path) => {
            open(path);
            return true;
        });
        if (wired) return;
        wired = true;
        window.addEventListener('shortcuts-changed', scheduleHotkeys);
        scheduleHotkeys();
    }

    function activate() {
        scheduleHotkeys();
    }

    return {
        init, activate, notifyChanged,
        isShortcutName, isShortcutPath,
        parse, serialize, read, readSync, write, create, deleteShortcut,
        open, wizard, createForPath, properties,
        iconHtml, iconForPath, quickInfo, targetLabel, defaultName, targetExists,
        formatPath, parsePath, normalizeUrl, normalizeHotkey,
        startMenuDir, taskbarDir, desktopDir, destinationDir,
        ensureFolder, readJson, writeJson,
        listShortcutFiles, appIdForShortcut, shortcutLocation, locationFor,
        createAppShortcut, onAppInstalled, onAppUninstalled: removeAppShortcuts,
        removeAppShortcuts, pinToTaskbar, appShortcutConfig,
        refreshHotkeys
    };
})();

window._Shortcuts = Shortcuts;

export default Shortcuts;
