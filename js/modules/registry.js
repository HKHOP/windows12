// The Windows 12 registry.
//
// The registry is the machine's settings database, Windows style: a set of
// HIVES, each a tree of keys, each key holding named VALUES. It is the one
// place where "what is installed on this machine" is recorded, so an app that
// lives in a folder nobody chose (a custom install path, a work in progress)
// is still found.
//
// Hives:
//
//   HKEY_LOCAL_MACHINE   (HKLM)  machine-wide settings and app registrations
//   HKEY_CURRENT_USER    (HKCU)  the current profile's settings
//   HKEY_CLASSES_ROOT    (HKCR)  file types and their handlers
//   HKEY_USERS           (HKU)   every profile's hive
//   HKEY_CURRENT_CONFIG  (HKCC)  the display/hardware configuration
//
// Paths are Windows style: 'HKLM\\SOFTWARE\\Windows 12\\Apps\\notepad'.
// Both the short (HKLM) and the long (HKEY_LOCAL_MACHINE) hive names work.
//
// The store lives in /system/registry/registry.json, which is OS-only: apps
// reach it through this module (and the SDK), never through the filesystem.
//
// An app may always use its own key, HKCU\\Software\\<its id>. Anything
// else needs the 'registry' permission.
import FileSystem from './fileSystem.js';
import Permissions from './permissions.js';
import { folderFromUrl } from './siteBase.js';

// /system/registry/registry.json - OS-only (see fsGuard's OS_ONLY_PREFIXES).
const REG_DIR = ['/', 'system', 'registry'];
const REG_FILE = [...REG_DIR, 'registry.json'];

const HIVES = [
    { name: 'HKEY_LOCAL_MACHINE', short: 'HKLM', label: 'HKEY_LOCAL_MACHINE' },
    { name: 'HKEY_CURRENT_USER', short: 'HKCU', label: 'HKEY_CURRENT_USER' },
    { name: 'HKEY_CLASSES_ROOT', short: 'HKCR', label: 'HKEY_CLASSES_ROOT' },
    { name: 'HKEY_USERS', short: 'HKU', label: 'HKEY_USERS' },
    { name: 'HKEY_CURRENT_CONFIG', short: 'HKCC', label: 'HKEY_CURRENT_CONFIG' }
];

// The value kinds, exactly like Windows.
const KINDS = {
    REG_SZ: 'String',
    REG_EXPAND_SZ: 'Expandable string',
    REG_MULTI_SZ: 'Multi-string',
    REG_DWORD: 'DWORD (32-bit) Number',
    REG_QWORD: 'QWORD (64-bit) Number',
    REG_BINARY: 'Binary'
};

const DEFAULT_VALUE = '(Default)';

const Registry = (() => {
    // The whole store, or null when it has not been read yet.
    let store = null;
    let loaded = false;
    // The registered apps, cached: they are read on every access check.
    let registeredCache = null;

    function emptyNode() {
        return { values: {}, subkeys: {}, created: Date.now(), modified: Date.now() };
    }

    function emptyStore() {
        const hives = {};
        for (const h of HIVES) hives[h.name] = emptyNode();
        return { hives, profiles: {} };
    }

    function asShell(fn) {
        const g = window._FSGuard;
        return g ? g.asShell(fn)() : fn();
    }

    function ensureDir() {
        let parts = [];
        for (const seg of REG_DIR.slice(1)) {
            parts.push(seg);
            if (!FileSystem.itemExists(parts)) FileSystem.createFolder(parts.slice(0, -1), seg);
        }
    }

    function read() {
        if (loaded) return store;
        loaded = true;
        let raw = null;
        try { raw = asShell(() => FileSystem.readFile(REG_FILE)); } catch (e) { raw = null; }
        if (typeof raw === 'string' && raw) {
            try {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object' && parsed.hives) {
                    store = parsed;
                    for (const h of HIVES) if (!store.hives[h.name]) store.hives[h.name] = emptyNode();
                    if (!store.profiles) store.profiles = {};
                    return store;
                }
            } catch (e) { /* corrupt: start over */ }
        }
        store = emptyStore();
        return store;
    }

    function write() {
        if (!store) return;
        registeredCache = null; // the registrations may have changed
        asShell(() => {
            try {
                ensureDir();
                const json = JSON.stringify(store);
                if (FileSystem.itemExists(REG_FILE)) FileSystem.writeFile(REG_FILE, json);
                else FileSystem.createFile(REG_DIR, 'registry.json', json, 'json');
            } catch (e) { /* the registry is in-memory for this session */ }
        });
    }

    // ---- paths ----

    // 'HKLM\SOFTWARE\Windows 12' -> { hive: 'HKEY_LOCAL_MACHINE', parts: [...] }
    function parsePath(path) {
        if (typeof path !== 'string' || !path.trim()) return null;
        const cleaned = path.trim().replace(/^\\+/, '');
        const segments = cleaned.split('\\').map(s => s.trim()).filter(Boolean);
        if (!segments.length) return null;

        const first = segments[0].toUpperCase();
        const hive = HIVES.find(h => h.name.toUpperCase() === first || h.short.toUpperCase() === first);
        if (!hive) return null;
        return { hive: hive.name, parts: segments.slice(1) };
    }

    function formatPath(parsed) {
        return parsed.hive + (parsed.parts.length ? '\\' + parsed.parts.join('\\') : '');
    }

    // The path as regedit shows it: Computer\HKEY_LOCAL_MACHINE\SOFTWARE\...
    function displayPath(path) {
        const parsed = parsePath(path);
        if (!parsed) return String(path || '');
        return 'Computer\\' + formatPath(parsed);
    }

    // ---- access ----

    function currentUserId() {
        try {
            const u = window._Users && window._Users.getCurrent();
            return (u && u.id) || 'default';
        } catch (e) {
            return 'default';
        }
    }

    // The app that is calling, if any. The app's code is served from
    // '/js/apps/<folder>/…', so the stack tells us the folder, and the
    // registry tells us which app lives there.
    //
    // Only the stack counts: a call from the shell's own modules is the
    // shell's business, whatever app happens to be focused. (The filesystem
    // guard uses the focused app as a fallback; here that would let an app
    // block the OS's own registry writes.)
    function callerApp() {
        try {
            const stack = new Error().stack || '';
            const m = stack.match(/js[\/\\]apps[\/\\]([^"')\s]+)[\/\\]/);
            if (!m) return null;
            const folder = folderFromUrl('/js/apps/' + m[1] + '/');
            if (!folder || !folder.length) return null;
            const id = appIdForFolder(folder);
            return id || folder[folder.length - 1];
        } catch (e) {
            return null;
        }
    }

    // An app may always use its own key.
    function isOwnKey(appId, parsed) {
        if (!appId) return false;
        if (parsed.hive !== 'HKEY_CURRENT_USER') return false;
        return parsed.parts.length >= 2
            && parsed.parts[0].toLowerCase() === 'software'
            && parsed.parts[1].toLowerCase() === appId.toLowerCase();
    }

    function allowed(path, write) {
        const parsed = parsePath(path);
        if (!parsed) return false;
        const appId = callerApp();
        if (!appId) return true; // shell
        if (isOwnKey(appId, parsed)) return true;
        try {
            if (!Permissions.isGranted(appId, 'registry')) return false;
        } catch (e) {
            return false;
        }
        return true;
    }

    // ---- reading ----

    // Windows' registry is case insensitive: a key is found whatever case it
    // is written in, and the casing it was created with is kept.
    function findSubkey(node, name) {
        if (!node || !node.subkeys) return null;
        if (node.subkeys[name]) return name;
        const lower = String(name).toLowerCase();
        for (const key of Object.keys(node.subkeys)) {
            if (key.toLowerCase() === lower) return key;
        }
        return null;
    }

    function findNode(parsed, userId) {
        const s = read();
        const uid = userId || currentUserId();
        let node;
        let parts = parsed.parts;
        if (parsed.hive === 'HKEY_CURRENT_USER') {
            node = (s.profiles[uid] || {}).HKEY_CURRENT_USER || null;
        } else if (parsed.hive === 'HKEY_USERS' && parts.length
            && parts[0].toLowerCase() === uid.toLowerCase()) {
            // HKU\<uid> IS the user's own hive: it is their
            // HKEY_CURRENT_USER, and the uid is not part of the path.
            // (ensureNode strips it too - the two must agree, or a key
            // written under HKU\<uid> could never be read back.)
            node = (s.profiles[uid] || {}).HKEY_CURRENT_USER || null;
            parts = parts.slice(1);
        } else {
            node = s.hives[parsed.hive] || null;
        }
        if (!node) return null;
        for (const part of parts) {
            if (!node || !node.subkeys) return null;
            const key = findSubkey(node, part);
            if (!key) return null;
            node = node.subkeys[key];
        }
        return node || null;
    }

    function hiveRoots() {
        const s = read();
        const uid = currentUserId();
        const out = [];
        for (const h of HIVES) {
            if (h.name === 'HKEY_CURRENT_USER') {
                out.push({ hive: h.name, node: (s.profiles[uid] || {}).HKEY_CURRENT_USER || emptyNode() });
            } else {
                out.push({ hive: h.name, node: s.hives[h.name] || emptyNode() });
            }
        }
        return out;
    }

    // The subkeys of a path, without the permission check. The registry's own
    // bookkeeping reads itself (the app registrations), and those reads must
    // not go through the check: the check asks who is calling, which asks
    // for the registrations, which would come back here.
    function rawKeys(path) {
        const parsed = parsePath(path);
        if (!parsed) return [];
        const node = findNode(parsed);
        return node && node.subkeys ? Object.keys(node.subkeys).sort() : [];
    }

    function rawGetString(path, name, fallback) {
        const parsed = parsePath(path);
        if (!parsed) return fallback;
        const node = findNode(parsed);
        const value = node && node.values ? node.values[name || DEFAULT_VALUE] : null;
        if (!value) return fallback;
        return value.data === undefined || value.data === null ? fallback : String(value.data);
    }

    // The subkeys of a path.
    function keys(path) {
        const parsed = parsePath(path);
        if (!parsed || !allowed(path, false)) return [];
        const node = findNode(parsed);
        if (!node || !node.subkeys) return [];
        return Object.keys(node.subkeys).sort((a, b) => a.localeCompare(b));
    }

    // The values of a path, without the permission check (see rawKeys).
    function rawValues(path) {
        const parsed = parsePath(path);
        if (!parsed) return [];
        const node = findNode(parsed);
        if (!node || !node.values) return [];
        return Object.keys(node.values).map(name => ({ name, ...node.values[name] }));
    }

    // The values of a path.
    function values(path) {
        const parsed = parsePath(path);
        if (!parsed || !allowed(path, false)) return [];
        const node = findNode(parsed);
        if (!node || !node.values) return [];
        return Object.keys(node.values).map(name => ({ name, ...node.values[name] }));
    }

    function get(path, name) {
        const parsed = parsePath(path);
        if (!parsed || !allowed(path, false)) return null;
        const node = findNode(parsed);
        if (!node || !node.values) return null;
        const value = node.values[name || DEFAULT_VALUE];
        return value ? { name: name || DEFAULT_VALUE, ...value } : null;
    }

    function getString(path, name, fallback) {
        const value = get(path, name);
        if (!value) return fallback === undefined ? null : fallback;
        if (value.kind === 'REG_DWORD' || value.kind === 'REG_QWORD') return String(value.data);
        if (value.kind === 'REG_MULTI_SZ') return Array.isArray(value.data) ? value.data.join(', ') : String(value.data);
        return String(value.data);
    }

    function keyInfo(path) {
        const parsed = parsePath(path);
        if (!parsed || !allowed(path, false)) return null;
        const node = findNode(parsed);
        if (!node) return null;
        return {
            path: formatPath(parsed),
            displayPath: displayPath(path),
            name: parsed.parts.length ? parsed.parts[parsed.parts.length - 1] : parsed.hive,
            hive: parsed.hive,
            created: node.created || 0,
            modified: node.modified || 0,
            subkeys: node.subkeys ? Object.keys(node.subkeys).sort() : [],
            values: values(path)
        };
    }

    // ---- writing ----

    // Finds (or creates) the node a path points at.
    function ensureNode(parsed, create) {
        const s = read();
        const uid = currentUserId();
        let node;
        if (parsed.hive === 'HKEY_CURRENT_USER') {
            if (!s.profiles[uid]) {
                if (!create) return null;
                s.profiles[uid] = { HKEY_CURRENT_USER: emptyNode() };
            }
            node = s.profiles[uid].HKEY_CURRENT_USER;
        } else if (parsed.hive === 'HKEY_USERS' && parsed.parts.length
            && parsed.parts[0].toLowerCase() === uid.toLowerCase()) {
            if (!s.profiles[uid]) {
                if (!create) return null;
                s.profiles[uid] = { HKEY_CURRENT_USER: emptyNode() };
            }
            node = s.profiles[uid].HKEY_CURRENT_USER;
            parsed = { hive: parsed.hive, parts: parsed.parts.slice(1) };
        } else {
            node = s.hives[parsed.hive];
        }
        if (!node) return null;
        for (const part of parsed.parts) {
            if (!node.subkeys) node.subkeys = {};
            const existing = findSubkey(node, part);
            if (!existing) {
                if (!create) return null;
                node.subkeys[part] = emptyNode();
                node = node.subkeys[part];
            } else {
                node = node.subkeys[existing];
            }
        }
        return node;
    }

    function createKey(path) {
        const parsed = parsePath(path);
        if (!parsed || !parsed.parts.length) return false;
        if (!allowed(path, true)) return false;
        ensureNode(parsed, true);
        write();
        return true;
    }

    function deleteKey(path) {
        const parsed = parsePath(path);
        if (!parsed || !parsed.parts.length) return false;
        if (!allowed(path, true)) return false;
        const parentParsed = { hive: parsed.hive, parts: parsed.parts.slice(0, -1) };
        const parent = findNode(parentParsed);
        const name = findSubkey(parent, parsed.parts[parsed.parts.length - 1]);
        if (!parent || !parent.subkeys || !name) return false;
        delete parent.subkeys[name];
        parent.modified = Date.now();
        write();
        return true;
    }

    // Writes a value without the permission check. For the registry's own
    // bookkeeping (the migration markers), which must not depend on a check
    // that reads the registry.
    function rawSet(path, name, kind, data) {
        const parsed = parsePath(path);
        if (!parsed) return false;
        const node = ensureNode(parsed, true);
        if (!node) return false;
        if (!node.values) node.values = {};
        const type = KINDS[kind] ? kind : 'REG_SZ';
        node.values[name || DEFAULT_VALUE] = {
            kind: type,
            data: normalizeData(type, data),
            modified: Date.now()
        };
        node.modified = Date.now();
        write();
        return true;
    }

    // Writes a value, creating the key if needed.
    function set(path, name, kind, data) {
        const parsed = parsePath(path);
        if (!parsed) return false;
        if (!allowed(path, true)) return false;
        return rawSet(path, name, kind, data);
    }

    function normalizeData(kind, data) {
        if (kind === 'REG_MULTI_SZ') return Array.isArray(data) ? data.map(String) : [String(data)];
        if (kind === 'REG_DWORD' || kind === 'REG_QWORD') {
            const n = Number(data);
            return Number.isFinite(n) ? Math.trunc(n) : 0;
        }
        if (kind === 'REG_BINARY') return String(data);
        return data === undefined || data === null ? '' : String(data);
    }

    function deleteValue(path, name) {
        const parsed = parsePath(path);
        if (!parsed || !allowed(path, true)) return false;
        const node = findNode(parsed);
        if (!node || !node.values) return false;
        const key = name || DEFAULT_VALUE;
        if (!node.values[key]) return false;
        delete node.values[key];
        node.modified = Date.now();
        write();
        return true;
    }

    function renameValue(path, name, newName) {
        const parsed = parsePath(path);
        if (!parsed || !allowed(path, true)) return false;
        const node = findNode(parsed);
        if (!node || !node.values) return false;
        const key = name || DEFAULT_VALUE;
        if (!node.values[key] || !newName) return false;
        node.values[newName] = node.values[key];
        delete node.values[key];
        node.modified = Date.now();
        write();
        return true;
    }

    function renameKey(path, newName) {
        const parsed = parsePath(path);
        if (!parsed || !parsed.parts.length || !newName) return false;
        if (!allowed(path, true)) return false;
        const parentParsed = { hive: parsed.hive, parts: parsed.parts.slice(0, -1) };
        const parent = findNode(parentParsed);
        const name = findSubkey(parent, parsed.parts[parsed.parts.length - 1]);
        if (!parent || !parent.subkeys || !name) return false;
        parent.subkeys[newName] = parent.subkeys[name];
        delete parent.subkeys[name];
        parent.modified = Date.now();
        write();
        return true;
    }

    // ---- import / export ----

    // A .reg file, Windows style.
    function exportKey(path) {
        const parsed = parsePath(path);
        if (!parsed || !allowed(path, false)) return null;
        const node = findNode(parsed);
        if (!node) return null;
        const lines = ['Windows Registry Editor Version 5.00', ''];
        const keyPath = formatPath(parsed);
        lines.push('[' + keyPath + ']');
        for (const value of values(path)) {
            const data = value.kind === 'REG_MULTI_SZ'
                ? value.data.map(d => d.replace(/\\/g, '\\\\')).join(',')
                : String(value.data).replace(/\\/g, '\\\\');
            lines.push(value.name === DEFAULT_VALUE
                ? `@="${data}"`
                : `"${value.name}"=${value.kind === 'REG_SZ' ? `"${data}"` : value.kind === 'REG_DWORD' ? `dword:${data}` : `"${data}"`}`);
        }
        lines.push('');
        for (const sub of keys(path)) {
            const child = exportKey(keyPath + '\\' + sub);
            if (child) lines.push(child);
        }
        return lines.join('\r\n');
    }

    function importReg(text) {
        if (typeof text !== 'string' || !text.trim()) return false;
        const lines = text.split(/\r?\n/);
        let current = null;
        let changed = false;
        for (const raw of lines) {
            const line = raw.trim();
            if (!line || line.startsWith(';') || line.startsWith('Windows Registry Editor')) continue;
            const m = line.match(/^\[(.+)\]$/);
            if (m) {
                current = m[1].trim();
                if (current) createKey(current);
                continue;
            }
            if (!current) continue;
            const vm = line.match(/^(@?)"([^"]*)"=(.*)$/);
            if (!vm) continue;
            const isDefault = vm[1] === '@';
            const name = isDefault ? DEFAULT_VALUE : vm[2];
            const raw = vm[3].trim();
            let kind = 'REG_SZ';
            let data = raw;
            if (/^dword:/i.test(raw)) { kind = 'REG_DWORD'; data = raw.slice(6); }
            else if (/^qword:/i.test(raw)) { kind = 'REG_QWORD'; data = raw.slice(6); }
            else {
                const quoted = raw.match(/^"(.*)"$/);
                data = quoted ? quoted[1] : raw;
            }
            if (set(current, name, kind, data)) changed = true;
        }
        return changed;
    }

    // ---- search ----

    function search(term) {
        const needle = String(term || '').toLowerCase();
        if (!needle) return [];
        const hits = [];
        const walk = (node, path, depth) => {
            if (!node || depth > 6) return;
            if (node.values) {
                for (const name of Object.keys(node.values)) {
                    const value = node.values[name];
                    const hay = (name + ' ' + (Array.isArray(value.data) ? value.data.join(' ') : value.data)).toLowerCase();
                    if (hay.includes(needle)) {
                        hits.push({ path, name, kind: value.kind, data: value.data });
                    }
                }
            }
            if (node.subkeys) {
                for (const name of Object.keys(node.subkeys)) {
                    const childPath = path ? path + '\\' + name : name;
                    const child = node.subkeys[name];
                    if (childPath.toLowerCase().includes(needle)) {
                        hits.push({ path: childPath, name: null, kind: 'key', data: '' });
                    }
                    walk(child, childPath, depth + 1);
                }
            }
        };
        const s = read();
        const uid = currentUserId();
        for (const h of HIVES) {
            const node = h.name === 'HKEY_CURRENT_USER'
                ? (s.profiles[uid] || {}).HKEY_CURRENT_USER
                : s.hives[h.name];
            walk(node, h.name, 0);
        }
        return hits;
    }

    // ---- app registrations (the catalog) ----

    // Where an app's registration lives.
    function appKey(id, userId) {
        if (userId) return 'HKU\\' + userId + '\\Software\\Windows 12\\Apps\\' + id;
        return 'HKLM\\Software\\Windows 12\\Apps\\' + id;
    }

    // Records an app in the registry: this is what makes an app findable, no
    // matter which folder it lives in.
    //
    // The registration is the registry's own bookkeeping, so it is written
    // through the UNCHECKED writers: an app that installs another app must
    // not be able to block the registration (and with it the catalog) by
    // not holding the 'registry' permission.
    function registerApp(id, info) {
        if (!id) return false;
        const key = appKey(id, info && info.user);
        const scope = (info && info.scope) === 'system' ? 'system' : 'user';
        const wanted = {
            Path: (info && info.path) || '',
            Version: (info && info.version) || '',
            DisplayName: (info && info.name) || id,
            Scope: scope
        };
        if (info && info.publisher) wanted.Publisher = info.publisher;

        // Only write what actually changed, so a rescan does not rewrite the
        // registry on every boot.
        const existing = rawGetString(key, 'Path', '');
        let changed = !existing;
        if (existing) {
            for (const name of Object.keys(wanted)) {
                if (rawGetString(key, name, '') !== wanted[name]) { changed = true; break; }
            }
        }
        if (!changed) return true;

        const parsed = parsePath(key);
        if (!parsed || !parsed.parts.length) return false;
        if (!ensureNode(parsed, true)) return false;
        for (const name of Object.keys(wanted)) {
            rawSet(key, name, 'REG_SZ', wanted[name]);
        }
        return true;
    }

    function unregisterApp(id) {
        if (!id) return false;
        let removed = false;
        for (const userId of [null, currentUserId()]) {
            if (deleteKey(appKey(id, userId))) removed = true;
        }
        return removed;
    }

    // Every registered app: { id, path, version, name, scope, user }
    function registeredApps() {
        if (registeredCache) return registeredCache;
        const out = [];
        const collect = (hivePath, scope, userId) => {
            const base = hivePath + '\\Software\\Windows 12\\Apps';
            for (const id of rawKeys(base)) {
                const key = base + '\\' + id;
                out.push({
                    id,
                    path: rawGetString(key, 'Path', '') || '',
                    version: rawGetString(key, 'Version', '') || '',
                    name: rawGetString(key, 'DisplayName', id) || id,
                    scope: rawGetString(key, 'Scope', scope) || scope,
                    user: userId || null
                });
            }
        };
        collect('HKLM', 'system', null);
        collect('HKU\\' + currentUserId(), 'user', currentUserId());
        registeredCache = out;
        return out;
    }

    // The app that lives in a folder. The registry knows which app a folder
    // belongs to, which matters for an app installed in a folder of its own
    // choosing (the folder is then not named after the app).
    function appIdForFolder(folderPath) {
        const parts = (Array.isArray(folderPath) ? folderPath : []).filter(p => p !== '/' && p !== '');
        if (!parts.length) return null;
        const key = parts.join('\\').toLowerCase();
        for (const app of registeredApps()) {
            if (app.path && app.path.replace(/^\/+|\/+$/g, '').replace(/\//g, '\\').toLowerCase() === key) {
                return app.id;
            }
        }
        return parts[parts.length - 1];
    }

    // Reads a key's values as a plain object.
    function getObject(path) {
        const out = {};
        for (const value of values(path)) out[value.name] = value.data;
        return out;
    }

    // Writes a settings object as the values of a key. The kind of each
    // value is decided by the caller, so a number stays a DWORD and a
    // boolean stays a readable 'true'/'false'.
    function setObject(path, obj, encode) {
        for (const name of Object.keys(obj || {})) {
            const encoded = encode ? encode(name, obj[name]) : { kind: 'REG_SZ', data: String(obj[name]) };
            set(path, name, encoded.kind, encoded.data);
        }
    }

    // Runs a one-time migration. The markers live in the registry itself, so
    // the registry remembers what it has already moved.
    function migrateOnce(marker, fn) {
        const path = 'HKLM\\SOFTWARE\\Windows 12\\Migrations';
        if (rawGetString(path, marker, '')) return false;
        // The marker is written BEFORE the migration runs, and without the
        // permission check: every registry write asks the permission check,
        // and the check reads the grants - which would run this migration
        // again, and again, and again.
        rawSet(path, marker, 'REG_DWORD', 1);
        try { fn(); } catch (e) { /* the migration is best effort */ }
        return true;
    }

    // ---- lifecycle ----

    function init() {
        read();
    }

    function refresh() {
        loaded = false;
        store = null;
        registeredCache = null;
        read();
    }

    return {
        init, refresh, hives: () => HIVES.map(h => ({ ...h })), kinds: () => ({ ...KINDS }),
        parsePath, formatPath, displayPath, DEFAULT_VALUE,
        keyInfo, keys, values, get, getString, getObject, setObject,
        // Unchecked readers, for the OS's own bookkeeping (the registry reads
        // itself, and the permission check asks the registry who is calling).
        rawKeys, rawValues, rawGetString,
        createKey, deleteKey, set, deleteValue, renameKey, renameValue,
        exportKey, importReg, search, migrateOnce,
        registerApp, unregisterApp, registeredApps, appIdForFolder
    };
})();

export default Registry;
