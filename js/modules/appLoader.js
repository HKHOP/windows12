// Windows 12 app loader.
//
// AN APP IS A FOLDER.
//
// The folder holds a manifest.json plus the app's code, and the folder path
// is the app's handle: it is what you launch, what a .lnk points at, and
// what the URL shows (/fs/Program%20Files/notepad/main.js). There is no
// separate "installed app" concept - an app that was dropped into Program
// Files by hand runs exactly like one the Store installed, because both are
// just a folder with a manifest.
//
// The catalog (the shipped registry + the folders on disk) maps the manifest
// id to its folder, so the shell can still talk about "notepad" while the
// code always runs from the app's own folder.
//
// Catalog vs. module:
//   manifests (registry + the manifests of folders on disk)  -> Start,
//       Search, Store, pins, associations, permissions - always known.
//   loaded modules (this file's `loaded` map + AppRegistry)  -> created on
//       demand by ensureLoaded()/launch().
import { AppRegistry, AppMetadata } from './taskbar.js';
import FileAssociations from './fileAssociations.js';
import AppIcons from './appIcons.js';
import { APP_MANIFESTS } from '../apps/registry.js';
import Packages from './packages.js';
import Registry from './registry.js';
import FileSystem from './fileSystem.js';
import { fileUrl } from './siteBase.js';

const AppLoader = (() => {
    // Built lazily (not at module scope): the registry <-> app module import
    // cycle means APP_MANIFESTS may be uninitialized during evaluation.
    let byId = {};
    let byUuid = {};
    let catalogReady = false;

    // The catalog: id -> { id, name, manifest, folderPath }
    let catalog = new Map();

    // folder key -> app module namespace (default export)
    const loaded = new Map();
    // folder key -> Promise<app>
    const loading = new Map();

    function shell(fn) {
        const g = window._FSGuard;
        return g ? g.asShell(fn)() : fn();
    }

    // The key of a folder: its path, normalized.
    function folderKey(folderPath) {
        return (Array.isArray(folderPath) ? folderPath : [])
            .filter(p => p !== '/' && p !== '')
            .join('/');
    }

    function normalizeFolder(folderPath) {
        if (!Array.isArray(folderPath)) return null;
        const parts = folderPath.filter(p => p !== '/' && p !== '');
        if (!parts.length) return null;
        if (parts.some(p => p === '.' || p === '..')) return null;
        return parts;
    }

    // The manifest of a folder, read straight from the virtual filesystem.
    // This is what makes every app folder - installed, dropped in by hand or
    // still being developed - behave the same.
    function manifestForFolder(folderPath) {
        const parts = normalizeFolder(folderPath);
        if (!parts) return null;
        if (!shell(() => FileSystem.isFolder(parts))) return null;
        let raw = null;
        try { raw = shell(() => FileSystem.readFile([...parts, 'manifest.json'])); } catch { raw = null; }
        if (typeof raw !== 'string' || raw.length > 64 * 1024) return null;
        let manifest;
        try { manifest = JSON.parse(raw); } catch { return null; }
        if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return null;
        if (typeof manifest.id !== 'string' || !manifest.id) return null;
        if (typeof manifest.name !== 'string' || !manifest.name.trim()) return null;
        const entry = String(manifest.entry || 'main.js').replace(/\\/g, '/').split('/').filter(Boolean);
        if (!entry.length || entry.some(p => p === '.' || p === '..')) return null;
        if (!/\.m?js$/i.test(entry[entry.length - 1])) return null;
        manifest.entry = entry.join('/');
        return manifest;
    }

    // The URL of a file inside an app folder. The path is visible on purpose:
    // it says exactly where the app runs from.
    function appFileUrl(folderPath, relative) {
        return fileUrl(folderPath, relative);
    }
    // A stamp that changes whenever the app's code changes, so the browser
    // re-imports the module instead of serving a cached one.
    function stampFor(folderPath, manifest) {
        let stamp = String((manifest && manifest.version) || '0');
        try {
            const children = shell(() => FileSystem.getChildren(normalizeFolder(folderPath))) || [];
            const entry = String((manifest && manifest.entry) || 'main.js').split('/')[0];
            const manifestFile = children.find(c => c.name === 'manifest.json');
            const entryFile = children.find(c => c.name === entry);
            stamp += '-' + (manifestFile && manifestFile.modified ? manifestFile.modified : 0)
                + '-' + (entryFile && entryFile.modified ? entryFile.modified : 0);
        } catch { /* keep the version-only stamp */ }
        return stamp;
    }

    function ensureMaps() {
        if (catalogReady) return;
        catalogReady = true;
        byId = {};
        byUuid = {};
        for (const m of APP_MANIFESTS) {
            byId[m.id] = m;
            byUuid[String(m.uuid || '').toLowerCase()] = m;
        }
    }

    // Rebuilds the catalog: the shipped registry plus every app the registry
    // knows about. An app is in the catalog when it is registered in the
    // Windows registry - which is true for the builtins (materialized at
    // boot) and for every installed app, whatever folder it lives in.
    function refreshInstalled() {
        ensureMaps();
        const next = new Map();
        for (const m of APP_MANIFESTS) {
            next.set(m.id, { id: m.id, name: m.name, manifest: m, folderPath: null });
        }
        let registered = [];
        try { registered = Registry.registeredApps(); } catch (e) { registered = []; }
        for (const rec of registered) {
            if (!rec || !rec.id) continue;
            const existing = next.get(rec.id);
            const manifest = (existing && existing.manifest) || null;
            next.set(rec.id, {
                id: rec.id,
                name: rec.name || (manifest && manifest.name) || rec.id,
                manifest: manifest,
                folderPath: rec.path ? rec.path.split('\\').filter(Boolean) : null
            });
        }
        // Apps that were dropped into a folder by hand are not registered and
        // therefore not in the catalog: you start them from their folder.
        catalog = next;
        refreshIcons();
    }

    // Icons come from the app folder. An app that is not installed has no
    // folder yet, so its icon is fetched from the shipped bundle. An app
    // that ships no icon at all gets the universal one (see appIcons.js).
    function refreshIcons() {
        const map = {};
        for (const entry of catalog.values()) {
            const man = entry.manifest;
            if (!man) continue;
            const icon = man.icon || 'assets/icon.svg';
            if (man.hasIcon || man._hasIcon) {
                map[entry.id] = { icon, folder: entry.folderPath };
            }
        }
        AppIcons.setPackagedIcons(map);
    }

    // ---- catalog queries ----

    function getManifest(id) {
        ensureMaps();
        const entry = catalog.get(id);
        if (entry && entry.manifest) return entry.manifest;
        return byId[id] || null;
    }

    function getByUuid(uuid) {
        ensureMaps();
        return byUuid[String(uuid || '').toLowerCase()] || null;
    }

    function getAll() {
        ensureMaps();
        return [...catalog.values()].map(e => ({
            id: e.id, name: e.name, manifest: e.manifest, folderPath: e.folderPath
        }));
    }

    function getBuiltins() {
        ensureMaps();
        return APP_MANIFESTS.filter(m => m.distribution === 'builtin');
    }

    function getStoreApps() {
        ensureMaps();
        return APP_MANIFESTS.filter(m => m.distribution === 'store');
    }

    // The folder an app lives in, or null when it is not on disk.
    function folderFor(id) {
        ensureMaps();
        const entry = catalog.get(id);
        return entry && entry.folderPath ? entry.folderPath : null;
    }

    function getModule(folderPath) {
        return loaded.get(folderKey(folderPath)) || null;
    }

    function isLoaded(folderPath) {
        return loaded.has(folderKey(folderPath));
    }

    function isInstalled(id) {
        const man = getManifest(id);
        if (man && man.distribution === 'builtin') return true;
        return !!folderFor(id);
    }

    function getInstalledIds() {
        ensureMaps();
        const out = [];
        for (const entry of catalog.values()) {
            if (entry.folderPath) out.push(entry.id);
        }
        return out;
    }

    function isService(id) {
        const man = getManifest(id);
        return !!man && man.service === true;
    }

    function canRunBackground(id) {
        const man = getManifest(id);
        return !!man && (man.background === true || man.service === true);
    }

    // An app can be launched when it is on disk and is not a service.
    function isLaunchable(id) {
        const man = getManifest(id);
        if (!man) return false;
        if (man.service === true) return false;
        return !!folderFor(id);
    }

    // ---- loading ----

    // Imports the app module of a folder. The module is fetched from the
    // folder's own URL, so the code that runs is the code that is on disk.
    function ensureLoaded(folderPath, manifest) {
        const parts = normalizeFolder(folderPath);
        if (!parts) return Promise.reject(new Error('Not an app folder'));
        const key = folderKey(parts);
        const man = manifest || manifestForFolder(parts);
        if (!man) return Promise.reject(new Error('No manifest.json in ' + key));

        const stamp = stampFor(parts, man);
        const existing = loaded.get(key);
        if (existing && existing.stamp === stamp) return Promise.resolve(existing.app);
        if (loading.has(key)) return loading.get(key);

        const p = (async () => {
            const url = new URL(fileUrl(parts, man.entry || 'main.js'));
            url.searchParams.set('w12', encodeURIComponent(stamp));
            const mod = await import(url.href);
            const app = mod && (mod.default || mod);
            loaded.set(key, { app, stamp, id: man.id });
            AppRegistry.register(man.id, app);
            wireAssociations(man.id, app, man);
            return app;
        })();

        loading.set(key, p);
        return p.finally(() => loading.delete(key));
    }

    // Launches the app in a folder. THIS is the one way to start an app.
    async function launch(folderPath, options) {
        const parts = normalizeFolder(folderPath);
        if (!parts) return false;
        const man = manifestForFolder(parts);
        if (!man) return false;
        if (man.service === true) return false;
        const app = await ensureLoaded(parts, man);
        if (!app || typeof app.launch !== 'function') return false;
        // Apps declare launch() inconsistently: most take (options = {}) -
        // the shell forwards options for Settings pages etc. - but the file
        // handlers take a path/script/document as the FIRST argument
        // (photos, notepad, markdownStudio, archiver, powershell, ...). Never
        // hand one of those a bare {}: it gets read as that path and throws
        // (notepad died with "segments is not iterable"). Only forward a
        // non-empty options object; otherwise call with no arguments so each
        // app's own default applies.
        const hasOptions = options && typeof options === 'object' && Object.keys(options).length > 0;
        if (hasOptions) await app.launch(options);
        else await app.launch();
        return true;
    }

    // Loads the app of a catalog entry. A lookup in the catalog, not a
    // second way to run an app: the app still runs from its own folder.
    function ensureLoadedById(id) {
        const folder = folderFor(id);
        if (!folder) return Promise.reject(new Error('Unknown app: ' + id));
        return ensureLoaded(folder);
    }

    // Launches a catalog app by its manifest id. This is a lookup in the
    // catalog, not a second way to run an app: the app still runs from its
    // own folder.
    async function launchById(id, options) {
        const folder = folderFor(id);
        if (!folder) return false;
        return launch(folder, options);
    }

    // ---- file associations ----

    function wireAssociations(id, app, man) {
        if (man && man.associations.length > 0 && app && typeof app.open === 'function') {
            FileAssociations.register(id, man.associations, app.open);
        }
    }

    // Lazy: the handler loads the app on first open.
    function wireAllAssociations() {
        ensureMaps();
        for (const entry of catalog.values()) {
            const m = entry.manifest;
            if (!m || !m.associations || m.associations.length === 0) continue;
            // Only apps that are on disk get a handler: an app that is not
            // installed must not silently run from the shipped bundle.
            if (!entry.folderPath) continue;
            const id = entry.id;
            FileAssociations.register(id, m.associations, (path, content) => {
                ensureLoaded(entry.folderPath, m).then(app => {
                    if (app && typeof app.open === 'function') app.open(path, content);
                }).catch(() => { /* the crash monitor reports load failures */ });
            });
        }
    }

    // ---- install / update / uninstall ----

    async function install(source, opts = {}) {
        const result = await Packages.install(source, opts);
        refreshInstalled();
        return result;
    }

    async function update(idOrUuid, opts = {}) {
        const man = resolveManifest(idOrUuid);
        if (!man) return false;
        await Packages.update(man.id, opts);
        dropModule(man.id);
        refreshInstalled();
        return true;
    }

    async function uninstall(idOrUuid) {
        const man = resolveManifest(idOrUuid);
        if (!man) return false;
        await Packages.uninstall(man.id);
        dropModule(man.id);
        try { FileAssociations.unregister(man.id); } catch (e) { /* no handlers */ }
        refreshInstalled();
        return true;
    }

    // Forgets the loaded module of an app, so the next launch picks up the
    // new code.
    function dropModule(id) {
        const folder = folderFor(id);
        const key = folder ? folderKey(folder) : null;
        if (key) loaded.delete(key);
        try { AppRegistry.unregister(id); } catch (e) { /* not registered */ }
    }

    function init() {
        // The folders on disk are the catalog: read them again, in case the
        // OS core materialized the builtin apps after the last scan.
        try { Packages.rescan(); } catch (e) { /* packages not ready yet */ }
        refreshInstalled();
        AppMetadata.setNames(Object.fromEntries([...catalog.values()].map(e => [e.id, e.name])));
        wireAllAssociations();

        window.addEventListener('apps-changed', (e) => {
            const detail = e && e.detail;
            if (detail && detail.installed) {
                dropModule(detail.installed);
            }
            // The folders on disk may have changed (an app was installed, or
            // the OS core just materialized the builtin apps), so the catalog
            // is rebuilt from them.
            try { Packages.rescan(); } catch (e) { /* packages not ready yet */ }
            refreshInstalled();
            AppMetadata.setNames(Object.fromEntries([...catalog.values()].map(e => [e.id, e.name])));
            wireAllAssociations();
        });
    }

    return {
        init, install, uninstall, update,
        getManifest, getByUuid, getAll, getBuiltins, getStoreApps,
        getModule, isLoaded, ensureLoaded, ensureLoadedById, launch, launchById,
        manifestForFolder, fileUrl, folderFor,
        isInstalled, getInstalledIds, isLaunchable,
        isService, canRunBackground,
        refreshInstalled
    };
})();

function resolveManifest(idOrUuid) {
    return AppLoader.getManifest(idOrUuid) || AppLoader.getByUuid(idOrUuid);
}

export default AppLoader;
