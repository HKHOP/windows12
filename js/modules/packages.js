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
import Registry from './registry.js';
import { notifyTreeChanged } from './treeNotify.js';
import { APP_MANIFESTS } from '../apps/registry.js';
import { normalizeConfig, DESTINATIONS } from './shortcutConfig.js';

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
const APP_ID_RE = /^[A-Za-z][A-Za-z0-9]*$/;
const EXT_RE = /^[a-z0-9]+$/;
const KNOWN_PERMISSIONS = ['filesystem', 'notifications', 'network', 'clipboard', 'background', 'microphone', 'camera'];

// Package Installer workspace. Staging lives outside the package roots so a
// cancelled or failed install never touches an existing copy, and backups are
// kept only for the few synchronous moves that swap a staging tree in.
const INSTALLER_ROOT = ['/', 'system', 'programs data', 'installer'];
const STAGING_ROOT = [...INSTALLER_ROOT, 'staging'];
// Top-level paths in an .msi that describe the installer instead of the app.
const INSTALLER_ONLY = new Set(['installer', 'installer.json']);
const EULA_CANDIDATES = ['license.txt', 'eula.txt', 'license.md', 'eula.md'];

function pkgError(message, code) {
    const err = new Error(message);
    if (code) err.code = code;
    return err;
}

function lower(value) {
    return String(value || '').toLowerCase();
}

function safeRelPath(value) {
    const parts = String(value || '').replace(/\\/g, '/').split('/').filter(p => p && p !== '.');
    if (parts.length === 0 || parts.some(p => p === '..' || p.includes(':'))) return null;
    return parts.join('/');
}

function isInstallerOnly(path) {
    return INSTALLER_ONLY.has(String(path).split('/')[0]);
}

const Packages = (() => {
    // id -> { id, scope: 'system'|'user', user: <uid|null>, path, manifest }
    let installed = new Map();
    let inited = false;
    // The ids the OS publishes (the shipped catalog). An app that is not in
    // here was never published: it is somebody's own app, living in a
    // folder, and it stays out of the catalog and out of the Store.
    let knownAppIds = null;
    function isPublishedApp(id) {
        if (!knownAppIds) {
            try { knownAppIds = new Set(APP_MANIFESTS.map(m => m.id)); }
            catch (e) { knownAppIds = new Set(); }
        }
        return knownAppIds.has(id);
    }
    // Package Installer guard: one install per app id at a time.
    const installing = new Set();

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
        try {
            const man = JSON.parse(raw);
            if (!man || typeof man !== 'object') return null;
            // App icons live inside the package. The registry knows this for
            // shipped apps; installed packages are discovered here, so stamp
            // the resolved icon path (and whether it exists) for AppIcons.
            const icon = safeRelPath(man.icon) || 'assets/icon.svg';
            man.icon = icon;
            man._iconPath = icon;
            man._hasIcon = sh(() => FileSystem.itemExists([...dirPath, ...icon.split('/')]));
            return man;
        } catch (e) { return null; }
    }

    function scan(forUserId) {
        installed = new Map();
        const uid = forUserId || userId();
        if (sh(() => FileSystem.isFolder(SYSTEM_ROOT))) {
            for (const c of sh(() => FileSystem.getChildren(SYSTEM_ROOT))) {
                if (c.type !== 'folder') continue;
                const dir = [...SYSTEM_ROOT, c.name];
                installed.set(c.name, { id: c.name, scope: 'system', user: null, path: dir, manifest: readManifest(dir) });
            }
        }
        const uroot = [...Users.homeFor(uid), ...PROGRAM_SUBDIR];
        if (sh(() => FileSystem.isFolder(uroot))) {
            for (const c of sh(() => FileSystem.getChildren(uroot))) {
                if (c.type !== 'folder') continue;
                if (installed.has(c.name)) continue; // system install wins
                const dir = [...uroot, c.name];
                installed.set(c.name, { id: c.name, scope: 'user', user: uid, path: dir, manifest: readManifest(dir) });
            }
        }
        // Record the apps the OS knows about in the registry, so the catalog
        // finds them wherever they live. Only the apps that are part of the
        // shipped catalog are registered by a scan: an app somebody dropped
        // into Program Files by hand is NOT published, it just runs from its
        // folder when you start it.
        for (const rec of installed.values()) {
            if (!rec.manifest) continue;
            if (!isPublishedApp(rec.id)) continue;
            try {
                Registry.registerApp(rec.id, {
                    path: rec.path ? rec.path.filter(p => p !== '/').join('\\') : '',
                    version: rec.manifest.version || '',
                    name: rec.manifest.name || rec.id,
                    scope: rec.scope,
                    user: rec.scope === 'user' ? rec.user : null
                });
            } catch (e) { /* the registry is optional */ }
        }
    }

    function pkgUrl(id) {
        return new URL(`../../packages/${id}.w12pkg`, import.meta.url).href;
    }

    // ---- public queries ----

    function getInstalled() { return [...installed.values()].map(r => ({ ...r })); }
    function isInstalled(id) { return installed.has(id); }
    function getRecord(id) { return installed.get(id) || null; }
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
    async function requireElevation(id, message, label) {
        let ok = false;
        try {
            ok = await UAC.request({ name: label || labelFor(id), message });
        } catch (e) { ok = false; }
        if (!ok) throw elevationDenied();
    }

    // ---- Package Installer (.msi / .w12pkg opened from disk) ----
    //
    // A package file is the same folder layout the Store downloads: a ZIP
    // whose root holds manifest.json + the app. Package Installer may add
    // installer.json and an installer/ folder (custom UI, branding); those
    // describe the setup wizard and are not copied into the installed app.

    function cancellationError() {
        const err = pkgError('Installation cancelled.', 'cancelled');
        err.cancelled = true;
        return err;
    }

    function validateManifest(m, filePaths) {
        if (!m || typeof m !== 'object' || Array.isArray(m)) {
            throw pkgError('The package has no valid manifest.json.', 'invalid-manifest');
        }
        const id = String(m.id || '');
        if (!APP_ID_RE.test(id)) {
            throw pkgError(`The package id "${id}" is invalid. Use letters and digits, starting with a letter.`, 'invalid-manifest');
        }
        const uuid = lower(m.uuid);
        if (!UUID_RE.test(uuid)) {
            throw pkgError('The package uuid in manifest.json is not a valid UUID.', 'invalid-manifest');
        }
        if (m.distribution === 'builtin') {
            throw pkgError('Built-in apps cannot be installed from a package file.', 'builtin');
        }
        const name = String(m.name || '').trim().slice(0, 100);
        if (!name) throw pkgError('The package manifest is missing a name.', 'invalid-manifest');
        const version = String(m.version || '1.0.0').trim().slice(0, 40) || '1.0.0';
        const entry = safeRelPath(m.entry || 'main.js');
        if (!entry) throw pkgError('The package entry path is invalid.', 'invalid-manifest');
        if (!filePaths.has(lower(entry))) {
            throw pkgError(`The package entry "${entry}" is missing from the archive.`, 'invalid-manifest');
        }
        const associations = [];
        if (m.associations !== undefined) {
            if (!Array.isArray(m.associations)) {
                throw pkgError('The package associations field must be an array.', 'invalid-manifest');
            }
            for (const ext of m.associations) {
                if (typeof ext !== 'string') {
                    throw pkgError('Each package association must be a string.', 'invalid-manifest');
                }
                const clean = lower(ext);
                if (!EXT_RE.test(clean)) {
                    throw pkgError(`The package declares an invalid file association "${ext}".`, 'invalid-manifest');
                }
                if (!associations.includes(clean)) associations.push(clean);
            }
        }
        let permissions = [];
        if (m.permissions !== undefined) {
            if (!Array.isArray(m.permissions)) {
                throw pkgError('The package permissions field must be an array.', 'invalid-manifest');
            }
            for (const perm of m.permissions) {
                if (typeof perm !== 'string' || !KNOWN_PERMISSIONS.includes(perm)) {
                    throw pkgError(`The package declares an unknown permission "${perm}".`, 'invalid-manifest');
                }
                if (!permissions.includes(perm)) permissions.push(perm);
            }
        }
        for (const key of ['background', 'service']) {
            if (m[key] !== undefined && typeof m[key] !== 'boolean') {
                throw pkgError(`The package "${key}" field must be a boolean.`, 'invalid-manifest');
            }
        }
        const icon = safeRelPath(m.icon) || 'assets/icon.svg';

        // Identity is frozen: builtins and shipped catalog apps keep their
        // id/uuid. Sideloading a shipped store app is allowed only when both
        // match, which makes a local install an update of that app.
        const known = APP_MANIFESTS.find(x => x.id === id);
        const knownByUuid = APP_MANIFESTS.find(x => lower(x.uuid) === uuid);
        if (known && known.distribution === 'builtin') {
            throw pkgError(`"${known.name}" is a built-in app and cannot be replaced by a package.`, 'builtin');
        }
        if (knownByUuid && knownByUuid.id !== id) {
            throw pkgError(`This package reuses the identity of "${knownByUuid.name}" but uses a different id.`, 'identity');
        }
        if (known && lower(known.uuid) !== uuid) {
            throw pkgError(`The id "${id}" belongs to another app. Change the package id or uuid.`, 'identity');
        }

        return {
            ...m,
            id,
            uuid,
            name,
            version,
            entry,
            icon,
            distribution: 'store',
            associations,
            permissions
        };
    }

    function normalizeInstaller(raw, findFile) {
        if (raw === null) return null;
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            throw pkgError('installer.json must contain a JSON object.', 'invalid-installer');
        }
        if (raw.schema !== undefined && raw.schema !== 1) {
            throw pkgError('This installer was built for a newer version of Package Installer.', 'unsupported-schema');
        }
        const mode = ['gui', 'headless', 'silent'].includes(raw.mode) ? raw.mode : 'gui';
        const scope = ['user', 'system'].includes(raw.scope) ? raw.scope : 'either';
        let defaultScope = raw.defaultScope === 'system' ? 'system' : 'user';
        if (scope !== 'either') defaultScope = scope;
        const publisher = String(raw.publisher || '').trim().slice(0, 80);

        const features = [];
        for (const f of (Array.isArray(raw.features) ? raw.features : [])) {
            if (!f || typeof f !== 'object') continue;
            const id = String(f.id || '');
            if (!/^[A-Za-z0-9._-]+$/.test(id) || features.some(x => x.id === id)) continue;
            features.push({
                id,
                name: String(f.name || id),
                description: String(f.description || ''),
                default: f.default !== false,
                required: !!f.required
            });
        }
        const fields = [];
        for (const f of (Array.isArray(raw.fields) ? raw.fields : [])) {
            if (!f || typeof f !== 'object') continue;
            const id = String(f.id || '');
            if (!/^[A-Za-z0-9._-]+$/.test(id) || fields.some(x => x.id === id)) continue;
            const type = ['text', 'password', 'checkbox', 'select'].includes(f.type) ? f.type : 'text';
            let options = [];
            if (type === 'select' && Array.isArray(f.options)) {
                options = f.options.map(o => (o && typeof o === 'object')
                    ? { value: String(o.value ?? o.id ?? ''), label: String(o.label ?? o.value ?? o.id ?? '') }
                    : { value: String(o ?? ''), label: String(o ?? '') }
                ).filter(o => o.value);
            }
            fields.push({
                id,
                label: String(f.label || id),
                type,
                options,
                default: f.default !== undefined ? f.default : (type === 'select' ? (options[0] ? options[0].value : '') : undefined),
                required: !!f.required,
                placeholder: String(f.placeholder || ''),
                help: String(f.help || ''),
                // Password fields are never written to install.json unless the
                // author explicitly opts in.
                persist: type !== 'password' && f.persist !== false
            });
        }

        const rawWelcome = raw.welcome;
        const welcome = typeof rawWelcome === 'string'
            ? { message: rawWelcome }
            : (rawWelcome && typeof rawWelcome === 'object' ? {
                title: String(rawWelcome.title || ''),
                message: String(rawWelcome.message || ''),
                image: safeRelPath(rawWelcome.image) || ''
            } : {});
        if (welcome.image && !findFile(welcome.image)) welcome.image = '';

        const rawTheme = raw.theme && typeof raw.theme === 'object' ? raw.theme : {};
        const accent = String(rawTheme.accent || '');
        const banner = safeRelPath(rawTheme.banner) || '';
        const logo = safeRelPath(rawTheme.logo) || '';
        const theme = {
            accent: /^#[0-9a-f]{3,8}$/i.test(accent) ? accent : '',
            banner: banner && findFile(banner) ? findFile(banner).path : '',
            logo: logo && findFile(logo) ? findFile(logo).path : ''
        };

        const rawFinish = raw.finish && typeof raw.finish === 'object' ? raw.finish : {};
        const finish = {
            message: String(rawFinish.message || ''),
            launch: rawFinish.launch !== false
        };

        let shortcuts = null;
        if (raw.shortcuts !== undefined) {
            try { shortcuts = normalizeConfig(raw.shortcuts, null); }
            catch (e) { throw pkgError('installer.shortcuts must be a boolean or an object.', 'invalid-installer'); }
        }

        const rawEula = raw.eula;
        let eulaPath = '';
        let eulaRequired = true;
        if (rawEula === false) {
            eulaPath = '';
        } else if (typeof rawEula === 'string') {
            eulaPath = safeRelPath(rawEula) || '';
            if (!eulaPath) throw pkgError('installer.eula must be a file path inside the package.', 'invalid-installer');
        } else if (rawEula && typeof rawEula === 'object') {
            eulaPath = safeRelPath(rawEula.path) || '';
            eulaRequired = rawEula.required !== false;
            if (!eulaPath) throw pkgError('installer.eula.path must be a file path inside the package.', 'invalid-installer');
        } else {
            // No explicit choice: pick up a conventional license file.
            eulaPath = EULA_CANDIDATES.find(p => findFile(p)) || '';
        }
        let eula = null;
        if (eulaPath) {
            const found = findFile(eulaPath);
            if (!found) throw pkgError(`The license file "${eulaPath}" is missing from the package.`, 'invalid-installer');
            eula = { path: found.path, required: eulaRequired };
        }

        const ui = safeRelPath(raw.ui) || '';
        if (ui && (!/\.m?js$/i.test(ui) || !findFile(ui))) {
            throw pkgError(`The custom installer UI "${raw.ui}" is missing from the package.`, 'invalid-installer');
        }

        return {
            schema: 1,
            mode,
            scope,
            defaultScope,
            publisher,
            features,
            fields,
            welcome,
            theme,
            finish,
            eula,
            ui: ui ? findFile(ui).path : '',
            shortcuts,
            data: raw.data && typeof raw.data === 'object' ? raw.data : null
        };
    }

    async function inspectArchive(bytes) {
        if (bytes instanceof ArrayBuffer) bytes = new Uint8Array(bytes);
        if (!(bytes instanceof Uint8Array)) {
            throw pkgError('The package file could not be read.', 'unreadable');
        }
        let rawEntries;
        try {
            rawEntries = Zip.readZip(bytes);
        } catch (e) {
            throw pkgError('This file is not a valid package: ' + (e.message || 'the archive is corrupt') + '.', 'corrupt');
        }

        const parsed = [];
        for (const entry of rawEntries) {
            if (entry.isDir) continue;
            if (/(^|\/)\.gitkeep$/i.test(entry.name)) continue;
            const parts = String(entry.name).replace(/\\/g, '/').split('/').filter(Boolean);
            if (parts.length === 0 || parts.some(p => p === '.' || p === '..' || p.includes(':'))) {
                throw pkgError('The package contains an unsafe file path.', 'unsafe-path');
            }
            parsed.push({ parts, entry });
        }
        if (parsed.length === 0) throw pkgError('The package archive is empty.', 'empty');

        // Accept both a flat package root and a single wrapping folder (the
        // usual result of zipping an app folder from Explorer).
        let root = [];
        const hasRootManifest = parsed.some(x => x.parts.length === 1 && lower(x.parts[0]) === 'manifest.json');
        if (!hasRootManifest) {
            const tops = [...new Set(parsed.map(x => x.parts[0]))];
            if (tops.length === 1) {
                const top = tops[0];
                if (parsed.some(x => x.parts.length === 2 && x.parts[0] === top && lower(x.parts[1]) === 'manifest.json')) {
                    root = [top];
                }
            }
        }

        const files = [];
        const seen = new Set();
        for (const x of parsed) {
            const rel = x.parts.slice(root.length).join('/');
            if (!rel) continue;
            if (seen.has(lower(rel))) {
                throw pkgError('The package contains duplicate file paths.', 'duplicate-paths');
            }
            seen.add(lower(rel));
            files.push({ path: rel, entry: x.entry });
        }

        const byPath = new Map(files.map(f => [lower(f.path), f]));
        const findFile = (path) => byPath.get(lower(path)) || null;
        const filePaths = new Set(byPath.keys());
        const manifestFile = findFile('manifest.json');
        if (!manifestFile) {
            throw pkgError('This package does not contain a manifest.json at its root.', 'missing-manifest');
        }
        const manifestBytes = await Zip.extractFile(bytes, manifestFile.entry);
        if (!manifestBytes) throw pkgError('The package manifest could not be unpacked.', 'corrupt');
        let rawManifest;
        try {
            rawManifest = JSON.parse(new TextDecoder().decode(manifestBytes));
        } catch (e) {
            throw pkgError('The package manifest.json is not valid JSON.', 'invalid-manifest');
        }
        const manifest = validateManifest(rawManifest, filePaths);

        let rawInstaller = null;
        const installerFile = findFile('installer.json');
        if (installerFile) {
            const installerBytes = await Zip.extractFile(bytes, installerFile.entry);
            if (!installerBytes) throw pkgError('installer.json could not be unpacked.', 'corrupt');
            try {
                rawInstaller = JSON.parse(new TextDecoder().decode(installerBytes));
            } catch (e) {
                throw pkgError('installer.json is not valid JSON.', 'invalid-installer');
            }
        }
        const installer = normalizeInstaller(rawInstaller, findFile);

        let eula = null;
        if (installer && installer.eula) {
            const eulaFile = findFile(installer.eula.path);
            const eulaBytes = eulaFile ? await Zip.extractFile(bytes, eulaFile.entry) : null;
            if (!eulaBytes) throw pkgError('The license file could not be unpacked.', 'corrupt');
            eula = {
                path: installer.eula.path,
                required: installer.eula.required,
                text: new TextDecoder().decode(eulaBytes.slice(0, 262144))
            };
        }

        return {
            bytes,
            root: root.join('/'),
            files,
            manifest,
            installer,
            eula,
            size: bytes.length
        };
    }

    function normalizeSelection(installer, options) {
        const scopeLock = installer ? installer.scope : 'either';
        let scope = options.scope === 'system' ? 'system' : 'user';
        if (scopeLock === 'user' || scopeLock === 'system') scope = scopeLock;

        const requested = Array.isArray(options.features) ? new Set(options.features.map(String)) : null;
        const features = [];
        if (installer) {
            for (const f of installer.features) {
                if (f.required || (requested ? requested.has(f.id) : f.default)) features.push(f.id);
            }
        }

        const fields = {};
        if (installer) {
            const supplied = options.fields && typeof options.fields === 'object' ? options.fields : {};
            for (const f of installer.fields) {
                let value = Object.prototype.hasOwnProperty.call(supplied, f.id) ? supplied[f.id] : f.default;
                if (f.type === 'checkbox') value = !!value;
                else value = value === undefined || value === null ? '' : String(value);
                if (f.required && (value === '' || value === false)) {
                    const err = pkgError(`"${f.label}" is required.`, 'input-required');
                    err.field = f.id;
                    throw err;
                }
                fields[f.id] = value;
            }
        }
        const shortcuts = {};
        const suppliedShortcuts = options.shortcuts && typeof options.shortcuts === 'object' ? options.shortcuts : {};
        for (const dest of DESTINATIONS) {
            if (typeof suppliedShortcuts[dest] === 'boolean') {
                shortcuts[dest] = suppliedShortcuts[dest];
            } else if (installer && installer.shortcuts && installer.shortcuts[dest]
                && installer.shortcuts[dest].default !== undefined) {
                shortcuts[dest] = !!installer.shortcuts[dest].default;
            }
        }
        return { scope, features, fields, shortcuts };
    }

    function existingRecord(man, allowReplace) {
        const rec = installed.get(man.id);
        if (rec) {
            const recUuid = rec.manifest && rec.manifest.uuid ? lower(rec.manifest.uuid) : '';
            if (!recUuid) {
                throw pkgError(`"${man.name}" is already installed and its identity cannot be verified. Uninstall it first.`, 'installed');
            }
            if (recUuid !== man.uuid && !allowReplace) {
                throw pkgError(`A different app is already installed with the id "${man.id}". Uninstall it first, or confirm that you want to replace it.`, 'replace-required');
            }
        }
        for (const other of installed.values()) {
            if (other.id === man.id) continue;
            if (other.manifest && lower(other.manifest.uuid) === man.uuid) {
                throw pkgError(`"${other.manifest.name || other.id}" is already installed with the same uuid.`, 'identity');
            }
        }
        return rec || null;
    }

    async function installArchive(bytes, opts = {}) {
        const inspection = opts.inspection || await inspectArchive(bytes);
        const man = inspection.manifest;
        const installer = inspection.installer;
        const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
        const report = (p, status) => {
            try { onProgress && onProgress(p, status); } catch (e) { /* UI callback must not abort */ }
        };
        const selection = normalizeSelection(installer, opts);

        if (installing.has(man.id)) {
            throw pkgError(`"${man.name}" is already being installed. Wait for that setup to finish.`, 'busy');
        }
        const rec = existingRecord(man, !!opts.allowReplace);
        if (rec) {
            // An update keeps the original scope so one app never ends up
            // installed twice (once per user, once system-wide).
            selection.scope = rec.scope;
        }

        installing.add(man.id);
        const uid = userId();
        let stagingParent = null;
        let preserveStaging = false;
        try {
            if (selection.scope === 'system') {
                await requireElevation(
                    man.id,
                    rec
                        ? `"${man.name}" will be updated for all users on this device. Allow it to make changes to your device?`
                        : `"${man.name}" will be installed for all users on this device, into \\Program Files. Allow it to make changes to your device?`,
                    man.name
                );
            }

            // The app's folder. It may be the default for the scope, or a
            // path the caller asked for.
            const target = targetFolder(man.id, selection.scope, uid, opts.path);
            const targetParent = target.slice(0, -1);
            ensureDir(targetParent);

            const token = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
            stagingParent = [...STAGING_ROOT, token];
            ensureDir(stagingParent);
            const staging = [...stagingParent, target[target.length - 1]];
            ensureDir(staging);

            const files = inspection.files.filter(f => !isInstallerOnly(f.path));
            if (!files.some(f => lower(f.path) === lower(man.entry))) {
                throw pkgError('The package entry is inside the reserved installer folder.', 'invalid-manifest');
            }

            report(0.05, 'Preparing');
            let done = 0;
            for (const file of files) {
                if (opts.isCancelled && opts.isCancelled()) throw cancellationError();
                const segments = file.path.split('/');
                const fileName = segments.pop();
                const dir = [...staging, ...segments];
                ensureDir(dir);

                let data;
                try {
                    data = await Zip.extractFile(bytes, file.entry);
                } catch (e) {
                    throw pkgError(`Could not unpack "${file.path}": ${e.message}`, 'corrupt');
                }
                if (!data) {
                    throw pkgError(`"${file.path}" uses an unsupported compression method.`, 'unsupported-compression');
                }

                if (segments.length === 0 && lower(fileName) === 'manifest.json') {
                    // Normalized copy: distribution is always "store" and the
                    // icon path defaults to the package asset.
                    sh(() => FileSystem.createFile(dir, 'manifest.json', JSON.stringify(man, null, 4), 'json'));
                } else {
                    const blob = new Blob([data], { type: mimeOf(fileName) });
                    const ok = await sh(() => FileSystem.writeFileBlob(dir, fileName, blob, extOf(fileName)));
                    if (!ok) throw pkgError(`Could not write "${file.path}" to the virtual filesystem.`, 'write-failed');
                }
                done++;
                report(0.08 + 0.72 * (done / files.length), 'Installing files');
            }

            const persistedFields = {};
            if (installer) {
                for (const field of installer.fields) {
                    if (field.persist) persistedFields[field.id] = selection.fields[field.id];
                }
            }
            const record = {
                format: 'msi',
                schema: 1,
                id: man.id,
                name: man.name,
                version: man.version,
                scope: selection.scope,
                installedAt: new Date().toISOString(),
                features: selection.features,
                fields: persistedFields,
                shortcuts: selection.shortcuts,
                data: installer ? installer.data : null,
                // Where the app came from. A store app is the only kind that
                // is ever re-downloaded; a package you brought yourself is
                // never fetched again.
                source: opts.storeId
                    ? { type: 'store', id: opts.storeId }
                    : { type: 'package', name: opts.sourceName || null }
            };
            if (sh(() => FileSystem.itemExists([...staging, 'install.json']))) {
                sh(() => FileSystem.permanentDelete([...staging, 'install.json']));
            }
            sh(() => FileSystem.createFile(staging, 'install.json', JSON.stringify(record, null, 4), 'json'));
            await FileSystem.flushAsync();
            if (opts.isCancelled && opts.isCancelled()) throw cancellationError();

            report(0.84, 'Finalizing');
            const backupParent = [...stagingParent, 'backup'];
            let backedUp = false;
            if (sh(() => FileSystem.itemExists(target))) {
                ensureDir(backupParent);
                if (!sh(() => FileSystem.moveItem(target, backupParent))) {
                    throw pkgError('Could not replace the existing installation.', 'commit-failed');
                }
                backedUp = true;
            }
            if (!sh(() => FileSystem.moveItem(staging, targetParent))) {
                if (backedUp) {
                    const restored = sh(() => FileSystem.moveItem([...backupParent, target[target.length - 1]], targetParent));
                    if (!restored) preserveStaging = true;
                }
                throw pkgError('Could not move the installed files into place.', 'commit-failed');
            }
            if (backedUp) sh(() => FileSystem.permanentDelete([...backupParent, target[target.length - 1]]));
            sh(() => FileSystem.permanentDelete(stagingParent));
            stagingParent = null;

            await FileSystem.flushAsync();
            scan(uid);
            writeSession();
            notifyTreeChanged();
            report(1, 'Done');
            window.dispatchEvent(new CustomEvent('apps-changed', {
                detail: { installed: man.id, updated: !!rec }
            }));
            // The app is registered in the registry, which is what makes it
            // findable no matter which folder it was installed into.
            try {
                Registry.registerApp(man.id, {
                    path: target.filter(p => p !== '/').join('\\'),
                    version: man.version || '',
                    name: man.name || man.id,
                    scope: selection.scope,
                    user: selection.scope === 'user' ? uid : null
                });
            } catch (e) { /* the registry is optional */ }
            try {
                const shortcuts = window._Shortcuts;
                if (shortcuts) {
                    shortcuts.onAppInstalled(man.id, man, {
                        selection: selection.shortcuts,
                        installer,
                        // The folder the app now lives in: the shortcut leads
                        // to it.
                        folder: target,
                        userId: uid
                    });
                }
            } catch { /* shortcuts are best-effort */ }
            return {
                id: man.id,
                scope: selection.scope,
                manifest: man,
                inspection,
                features: selection.features,
                fields: selection.fields,
                updated: !!rec,
                path: target
            };
        } catch (err) {
            if (stagingParent && !preserveStaging) {
                try {
                    if (sh(() => FileSystem.itemExists(stagingParent))) {
                        sh(() => FileSystem.permanentDelete(stagingParent));
                    }
                } catch (e) { /* best-effort cleanup */ }
            }
            throw err;
        } finally {
            installing.delete(man.id);
        }
    }

    // ---- installation ----

    // An installation source is either a store app ("download this from the
    // Store") or a package you already have ("install these bytes"). Both
    // end the same way: the app's folder is written to the virtual
    // filesystem and the app runs from there.
    function normalizeSource(source) {
        if (!source) return null;
        if (typeof source === 'string') return { type: 'store', id: source };
        if (source.type === 'store' && source.id) {
            return { type: 'store', id: String(source.id), name: source.name || null };
        }
        if (source.type === 'package' && source.bytes) {
            const bytes = source.bytes instanceof Uint8Array
                ? source.bytes
                : (source.bytes instanceof ArrayBuffer ? new Uint8Array(source.bytes) : null);
            if (!bytes) return null;
            return { type: 'package', id: source.id || null, bytes, name: source.name || null };
        }
        return null;
    }

    // The folder an app is installed into.
    function targetFolder(id, scope, uid, explicitPath) {
        if (Array.isArray(explicitPath) && explicitPath.length) {
            const parts = explicitPath.filter(p => p !== '/' && p !== '');
            if (parts.length && !parts.some(p => p === '.' || p === '..')) return parts;
        }
        return scope === 'system' ? [...SYSTEM_ROOT, id] : [...Users.homeFor(uid), ...PROGRAM_SUBDIR, id];
    }

    async function install(source, opts = {}) {
        const src = normalizeSource(source);
        if (!src) throw new Error('Unknown app source');
        const scope = opts.scope === 'system' ? 'system' : 'user';
        const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;

        let bytes = src.bytes;
        if (!bytes) {
            if (scope === 'system') {
                await requireElevation(src.id, `"${labelFor(src.id)}" will be installed for all users on this device, into \\Program Files. Allow it to make changes to your device?`);
            }
            onProgress && onProgress(0.02, 'Connecting');
            if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                throw new Error("You're offline — connect to the internet to download apps from the Store.");
            }
            let res;
            try {
                res = await fetch(pkgUrl(src.id), { cache: 'no-store' });
            } catch (e) {
                throw new Error("Couldn't reach the Store — check your internet connection and try again.");
            }
            if (!res.ok) throw new Error('Package download failed (' + res.status + ')');
            bytes = new Uint8Array(await res.arrayBuffer());
        }
        onProgress && onProgress(0.35, 'Unpacking');

        return installArchive(bytes, {
            ...opts,
            scope,
            storeId: src.type === 'store' ? src.id : null,
            sourceName: src.name || null
        });
    }

    async function uninstall(id) {
        const rec = installed.get(id);
        const systemDir = [...SYSTEM_ROOT, id];
        const isSystem = (rec && rec.scope === 'system') || !!sh(() => FileSystem.itemExists(systemDir));
        if (isSystem) {
            await requireElevation(id, `Remove "${labelFor(id)}" for all users (from \\Program Files)? It will no longer be available to anyone on this device.`);
        }
        let removed = false;
        if (rec) {
            // Builtin apps belong to the OS core: they are part of the
            // system, not something the user installed.
            if (isBuiltinFolder(rec.path)) {
                throw new Error(`"${labelFor(id)}" is part of Windows 12 and cannot be uninstalled.`);
            }
            const dir = rec.path || (rec.scope === 'system'
                ? [...SYSTEM_ROOT, id]
                : [...Users.homeFor(rec.user), ...PROGRAM_SUBDIR, id]);
            if (sh(() => FileSystem.itemExists(dir))) removed = sh(() => FileSystem.permanentDelete(dir));
        }
        if (!removed) {
            // Fall back to whichever scope actually holds it.
            const recHome = rec && rec.user ? Users.homeFor(rec.user) : userRoot();
            const dirs = [[...SYSTEM_ROOT, id], [...recHome, ...PROGRAM_SUBDIR, id]];
            if (recHome !== userRoot()) dirs.push([...userRoot(), id]);
            for (const dir of dirs) {
                if (sh(() => FileSystem.itemExists(dir))) { sh(() => FileSystem.permanentDelete(dir)); removed = true; break; }
            }
        }
        installed.delete(id);
        try { Registry.unregisterApp(id); } catch (e) { /* the registry is optional */ }
        await FileSystem.flushAsync();
        writeSession();
        window.dispatchEvent(new CustomEvent('apps-changed'));
        try {
            const shortcuts = window._Shortcuts;
            if (shortcuts) shortcuts.removeAppShortcuts(id, (rec && rec.user) || userId());
        } catch { /* shortcuts are best-effort */ }
        return removed;
    }

    // Factory reset: clear all installed packages (both system and user scope)
    function clearAll() {
        // Clear system packages
        for (const id of installed.keys()) {
            const dir = [...SYSTEM_ROOT, id];
            if (isBuiltinFolder(dir)) continue; // part of the OS core
            if (sh(() => FileSystem.itemExists(dir))) sh(() => FileSystem.permanentDelete(dir));
        }
        // Clear user packages
        try {
            const uRoot = userRoot();
            for (const id of installed.keys()) {
                const dir = [...uRoot, id];
                if (isBuiltinFolder(dir)) continue;
                if (sh(() => FileSystem.itemExists(dir))) sh(() => FileSystem.permanentDelete(dir));
            }
        } catch { /* user root may not exist */ }
        installed.clear();
        writeSession();
        window.dispatchEvent(new CustomEvent('apps-changed'));
    }

    // ---- update ----

    async function update(id, opts = {}) {
        // An update is a reinstall of the same app, in the same folder and
        // with the same scope: the new package is downloaded and the folder
        // it already lives in is replaced.
        const rec = installed.get(id);
        if (!rec) throw new Error('App is not installed: ' + id);
        const scope = rec.scope; // preserve original scope
        const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;

        if (scope === 'system') {
            await requireElevation(id, `"${labelFor(id)}" will be updated for all users on this device. Allow it to make changes to your device?`);
        }

        onProgress && onProgress(0.02, 'Connecting');
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            throw new Error("You're offline — connect to the internet to download updates from the Store.");
        }
        let res;
        try {
            res = await fetch(pkgUrl(id), { cache: 'no-store' });
        } catch (e) {
            throw new Error("Couldn't reach the Store — check your internet connection and try again.");
        }
        if (!res.ok) throw new Error('Package download failed (' + res.status + ')');
        const bytes = new Uint8Array(await res.arrayBuffer());
        onProgress && onProgress(0.35, 'Unpacking');

        return installArchive(bytes, {
            ...opts,
            scope,
            path: rec.path,
            storeId: id,
            allowReplace: true,
            onProgress
        });
    }

    // A folder that belongs to the OS core (a builtin app) is part of the
    // system: it may not be removed, and it is re-created at every boot.
    function isBuiltinFolder(folderPath) {
        if (!Array.isArray(folderPath) || !folderPath.length) return false;
        try {
            const node = sh(() => FileSystem.getNode(folderPath));
            return !!(node && node.builtin === true);
        } catch (e) {
            return false;
        }
    }

    // ---- boot ----

    // A cancelled/crashed install can leave a staging folder behind; it is
    // never referenced once the window is gone, so clear it at boot.
    function cleanStaging() {
        try {
            if (!sh(() => FileSystem.isFolder(STAGING_ROOT))) return;
            for (const child of sh(() => FileSystem.getChildren(STAGING_ROOT))) {
                sh(() => FileSystem.permanentDelete([...STAGING_ROOT, child.name]));
            }
        } catch (e) { /* staging is best-effort */ }
    }

    // Re-reads the folders on disk. The app catalog is built from them, so
    // this is called whenever the filesystem changed.
    function rescan() {
        scan();
        writeSession();
    }

    async function init() {
        if (inited) return;
        inited = true;

        // Ensure the package roots exist so File Explorer shows them.
        if (!sh(() => FileSystem.itemExists(SYSTEM_ROOT.slice(0, 2)))) {
            ensureDir(SYSTEM_ROOT);
        }
        ensureDir(userRoot());
        cleanStaging();

        scan();
        writeSession();
    }

    // Foreground session changed: rescan this profile's package root (the
    // installed set is per-user) and re-point the service worker's session
    // file. Then let AppLoader rebuild its installed catalog.
    function activate() {
        scan();
        writeSession();
        try { window.dispatchEvent(new CustomEvent('apps-changed')); } catch (e) { /* noop */ }
    }

    return {
        init, activate, rescan, install, uninstall, update, clearAll,
        inspectArchive, installArchive,
        getInstalled, isInstalled, getRecord, scopeOf,
        manifests,
        vfsActive, writeSession, pkgUrl,
        SYSTEM_ROOT, userRoot
    };
})();

export default Packages;
