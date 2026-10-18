// Packages — the package store and the package filesystem layout.
//
// A package is a self-contained app folder (manifest.json + code + assets).
// The Microsoft Store downloads a .w12pkg archive and unpacks it into the
// virtual filesystem; the *presence of the folder* is the install record:
//
//   system-wide install : /Program Files/<id>/
//   per-user install    : /users/<uid>/AppData/Programs/<id>/
//
// Package file contents are stored as blob-backed vFS nodes (manifest.json
// stays inline so the catalog can be read synchronously); that keeps the
// tree snapshot lean. The service worker serves /js/apps/<id>/… straight
// from this layout (see sw.js), so installed store apps execute from disk.
//
// Nothing here imports appLoader (that would be a cycle); appLoader reads
// this module's catalog instead.
import FileSystem from './fileSystem.js';
import Users from './users.js';
import UAC from './uac.js';
import OpfsClient from './opfsClient.js';
import Zip from './zip.js';
import { APP_MANIFESTS } from '../apps/registry.js';

const SYSTEM_ROOT = ['/', 'Program Files'];
const PROGRAM_SUBDIR = ['AppData', 'Programs'];

const MIME = {
    js: 'text/javascript', mjs: 'text/javascript', json: 'application/json',
    svg: 'image/svg+xml', css: 'text/css', html: 'text/html', htm: 'text/html',
    txt: 'text/plain', md: 'text/markdown', wasm: 'application/wasm',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', ico: 'image/x-icon', bmp: 'image/bmp',
    mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4',
    mp4: 'video/mp4', webm: 'video/webm',
    ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2'
};

function mimeOf(name) {
    const ext = String(name || '').split('.').pop().toLowerCase();
    return MIME[ext] || 'application/octet-stream';
}

function extOf(name) {
    const dot = String(name || '').lastIndexOf('.');
    return dot > -1 ? name.slice(dot + 1).toLowerCase() : '';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Packages = (() => {
    // id -> { id, scope: 'system'|'user', user: <uid|null>, manifest }
    let installed = new Map();
    // ids that are "installed" only in the old localStorage world: they still
    // open from the shipped HTTP bundle until migration completes.
    let legacy = new Set();
    let inited = false;

    // ---- helpers ----

    function currentUser() { return Users.getCurrent(); }
    function userId() { const u = currentUser(); return (u && u.id) || 'default'; }

    function userRoot() { return [...Users.home(), ...PROGRAM_SUBDIR]; }

    // Wrap a single synchronous FS call as shell-owned (install/uninstall is
    // a OS operation, never attributed to the focused app).
    function sh(fn) {
        const g = window._FSGuard;
        return g ? g.asShell(fn)() : fn();
    }

    function ensureDir(path) {
        for (let i = 1; i <= path.length; i++) {
            const partial = path.slice(0, i);
            if (!sh(() => FileSystem.itemExists(partial))) {
                sh(() => FileSystem.createFolder(partial.slice(0, -1), partial[partial.length - 1]));
            }
        }
    }

    function readManifest(dirPath) {
        const raw = sh(() => FileSystem.readFile([...dirPath, 'manifest.json']));
        if (!raw) return null;
        try { return JSON.parse(raw); } catch (e) { return null; }
    }

    function scan() {
        installed = new Map();
        if (sh(() => FileSystem.isFolder(SYSTEM_ROOT))) {
            for (const c of sh(() => FileSystem.getChildren(SYSTEM_ROOT))) {
                if (c.type !== 'folder') continue;
                const dir = [...SYSTEM_ROOT, c.name];
                installed.set(c.name, { id: c.name, scope: 'system', user: null, manifest: readManifest(dir) });
            }
        }
        const uroot = userRoot();
        if (sh(() => FileSystem.isFolder(uroot))) {
            const uid = userId();
            for (const c of sh(() => FileSystem.getChildren(uroot))) {
                if (c.type !== 'folder') continue;
                if (installed.has(c.name)) continue; // system install wins
                const dir = [...uroot, c.name];
                installed.set(c.name, { id: c.name, scope: 'user', user: uid, manifest: readManifest(dir) });
            }
        }
    }

    function uuidMap() {
        const map = {};
        for (const m of APP_MANIFESTS) map[String(m.uuid).toLowerCase()] = m.id;
        return map;
    }

    function pkgUrl(id) {
        return new URL(`../../packages/${id}.w12pkg`, import.meta.url).href;
    }

    // ---- public queries ----

    function getInstalled() { return [...installed.values()].map(r => ({ ...r })); }
    function isInstalled(id) { return installed.has(id); }
    function getRecord(id) { return installed.get(id) || null; }
    function getLegacy() { return new Set(legacy); }
    function legacyInstalled() { return legacy; }
    function manifests() {
        const out = {};
        for (const r of installed.values()) if (r.manifest) out[r.id] = r.manifest;
        return out;
    }
    // Whether store packages run from the virtual filesystem (OPFS backend).
    function vfsActive() { try { return FileSystem.backendId() === 'opfs'; } catch (e) { return false; } }
    function scopeOf(id) { const r = installed.get(id); return r ? r.scope : null; }

    // ---- persistence of session user (SW needs it to pick user packages) ----

    function writeSession() {
        try {
            if (OpfsClient.isDead && OpfsClient.isDead()) return;
            OpfsClient.writeFile('w12/session.json', JSON.stringify({ userId: userId() })).catch(() => {});
        } catch (e) { /* OPFS unavailable — SW host off anyway */ }
    }

    // ---- install / uninstall ----

    function labelFor(id) {
        const rec = installed.get(id);
        if (rec && rec.manifest && rec.manifest.name) return rec.manifest.name;
        const m = APP_MANIFESTS.find(x => x.id === id);
        return (m && m.name) || id;
    }

    function elevationDenied() {
        const err = new Error('Administrator approval is required to make system-wide changes.');
        err.elevationDenied = true;
        return err;
    }

    // System-wide changes (writing to /Program Files) require elevation; the
    // UAC prompt decides (admin consent or an administrator's credentials).
    async function requireElevation(id, message) {
        let ok = false;
        try {
            ok = await UAC.request({ name: labelFor(id), message });
        } catch (e) { ok = false; }
        if (!ok) throw elevationDenied();
    }

    async function install(id, opts = {}) {
        const scope = opts.scope === 'system' ? 'system' : 'user';
        const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;

        if (scope === 'system') {
            await requireElevation(id, `"${labelFor(id)}" will be installed for all users on this device, into \\Program Files. Allow it to make changes to your device?`);
        }

        onProgress && onProgress(0.02, 'Connecting');
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            throw new Error("You're offline — connect to the internet to download apps from the Store.");
        }
        let res;
        try {
            res = await fetch(pkgUrl(id), { cache: 'no-store' });
        } catch (e) {
            throw new Error("Couldn't reach the Store — check your internet connection and try again.");
        }
        if (!res.ok) throw new Error('Package download failed (' + res.status + ')');
        const buf = new Uint8Array(await res.arrayBuffer());
        onProgress && onProgress(0.35, 'Unpacking');

        let entries;
        try {
            entries = Zip.readZip(buf).filter(e => !e.isDir && !/(^|\/)\.gitkeep$/.test(e.name));
        } catch (e) {
            throw new Error('Package archive is corrupt');
        }
        if (entries.length === 0) throw new Error('Package archive is empty');

        const target = scope === 'system' ? [...SYSTEM_ROOT, id] : [...userRoot(), id];

        // Fresh install: clear any previous copy first.
        if (sh(() => FileSystem.itemExists(target))) {
            sh(() => FileSystem.permanentDelete(target));
        }
        ensureDir(target);

        let done = 0;
        for (const entry of entries) {
            const segments = entry.name.split('/').filter(Boolean);
            const fileName = segments.pop();
            const dir = [...target, ...segments];
            ensureDir(dir);

            const bytes = await Zip.extractFile(buf, entry);
            if (!bytes) continue;

            if (fileName === 'manifest.json') {
                sh(() => FileSystem.createFile(dir, fileName, new TextDecoder().decode(bytes), 'json'));
            } else {
                const blob = new Blob([bytes], { type: mimeOf(fileName) });
                await sh(() => FileSystem.writeFileBlob(dir, fileName, blob, extOf(fileName)));
            }
            done++;
            onProgress && onProgress(0.35 + 0.6 * (done / entries.length), 'Installing');
        }

        await FileSystem.flushAsync();
        legacy.delete(id);
        persistLegacy();
        scan();
        writeSession();
        onProgress && onProgress(1, 'Done');
        window.dispatchEvent(new CustomEvent('apps-changed'));
        return { id, scope };
    }

    async function uninstall(id) {
        const rec = installed.get(id);
        const systemDir = [...SYSTEM_ROOT, id];
        const isSystem = (rec && rec.scope === 'system') || !!sh(() => FileSystem.isFolder(systemDir));
        if (isSystem) {
            await requireElevation(id, `Remove "${labelFor(id)}" for all users (from \\Program Files)? It will no longer be available to anyone on this device.`);
        }
        let removed = false;
        if (rec) {
            const dir = rec.scope === 'system' ? [...SYSTEM_ROOT, id] : [...userRoot(), id];
            if (sh(() => FileSystem.itemExists(dir))) removed = sh(() => FileSystem.permanentDelete(dir));
        }
        if (!removed) {
            // Fall back to whichever scope actually holds it.
            for (const dir of [[...SYSTEM_ROOT, id], [...userRoot(), id]]) {
                if (sh(() => FileSystem.itemExists(dir))) { sh(() => FileSystem.permanentDelete(dir)); removed = true; break; }
            }
        }
        installed.delete(id);
        await FileSystem.flushAsync();
        writeSession();
        window.dispatchEvent(new CustomEvent('apps-changed'));
        return removed;
    }

    // ---- legacy install migration (localStorage era) ----

    function legacyKey() { return 'installed_apps_' + userId(); }
    const GLOBAL_KEY = 'installed_apps';

    function readLegacyUuids() {
        const out = [];
        const push = (arr) => { if (Array.isArray(arr)) arr.forEach(v => out.push(String(v))); };
        try { push(JSON.parse(localStorage.getItem(legacyKey()) || 'null')); } catch (e) { /* none */ }
        try { push(JSON.parse(localStorage.getItem(GLOBAL_KEY) || 'null')); } catch (e) { /* none */ }
        return [...new Set(out.filter(v => UUID_RE.test(v)))];
    }

    function persistLegacy() {
        const remaining = readLegacyUuids().filter(uuid => {
            const id = uuidMap()[uuid.toLowerCase()];
            return !id || !installed.has(id);
        });
        try {
            if (remaining.length) localStorage.setItem(legacyKey(), JSON.stringify(remaining));
            else localStorage.removeItem(legacyKey());
            localStorage.removeItem(GLOBAL_KEY);
        } catch (e) { /* storage unavailable */ }
    }

    async function migrateLegacy() {
        const map = uuidMap();
        const uuids = readLegacyUuids();
        if (uuids.length === 0) return;
        // Immediately honor them as legacy installs so nothing disappears
        // while the (network) migration runs.
        for (const uuid of uuids) {
            const id = map[uuid.toLowerCase()];
            if (id && !installed.has(id)) legacy.add(id);
        }
        window.dispatchEvent(new CustomEvent('apps-changed'));

        for (const uuid of uuids) {
            const id = map[uuid.toLowerCase()];
            if (!id || installed.has(id)) continue;
            try {
                await install(id, { scope: 'user' });
            } catch (e) { /* stays on the legacy shim for this session */ }
        }
        persistLegacy();
        window.dispatchEvent(new CustomEvent('apps-changed'));
    }

    // ---- boot ----

    async function init() {
        if (inited) return;
        inited = true;

        // Ensure the package roots exist so File Explorer shows them.
        if (!sh(() => FileSystem.itemExists(SYSTEM_ROOT.slice(0, 2)))) {
            ensureDir(SYSTEM_ROOT);
        }
        ensureDir(userRoot());

        scan();
        writeSession();
        try { migrateLegacy(); } catch (e) { /* best effort */ }
    }

    return {
        init, install, uninstall,
        getInstalled, isInstalled, getRecord, scopeOf,
        manifests, legacyInstalled, getLegacy,
        vfsActive, writeSession, pkgUrl,
        SYSTEM_ROOT, userRoot
    };
})();

export default Packages;
