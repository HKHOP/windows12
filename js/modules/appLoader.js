import { AppRegistry, AppMetadata } from './taskbar.js';
import FileAssociations from './fileAssociations.js';
import AppIcons from './appIcons.js';
import { APP_MANIFESTS } from '../apps/registry.js';
import Packages from './packages.js';
import FileSystem from './fileSystem.js';

// AppLoader — the app catalog + lazy module loader.
//
// Builtins ship with the OS; store apps are installed as *packages* into the
// virtual filesystem (see packages.js) and executed from disk through the
// service worker. Either way the app module is imported only on first launch,
// so the shell never evaluates 50+ apps at boot.
//
// Catalog vs. module:
//   manifests (APP_MANIFESTS / installed package manifests)  -> Start, Search,
//       Store, pins, associations, permissions — always known.
//   loaded modules (this file's `loaded` map + AppRegistry)  -> created on
//       demand by ensureLoaded()/launch().

function resolveManifest(idOrUuid) {
    return AppLoader.getManifest(idOrUuid) || AppLoader.getByUuid(idOrUuid);
}

const AppLoader = (() => {
    // Built lazily (not at module scope): the registry <-> app module import
    // cycle means APP_MANIFESTS may be uninitialized during evaluation.
    let byId = {};
    let byUuid = {};
    let catalogReady = false;

    const loaded = new Map();  // id -> app module namespace (default export)
    const loading = new Map(); // id -> Promise<app>
    let installedIds = new Set();

    // Portable app bundles (any folder with a valid manifest) run from a
    // synthetic id so the service worker can serve them at /js/apps/<id>/…
    // and relative imports (../../modules/…) keep resolving.
    const PORTABLE_PREFIX = '__w12p_';
    const portableManifests = new Map(); // synthetic id -> manifest
    const portableLoaded = new Map();    // synthetic id -> { app, stamp }
    const portableLoading = new Map();   // synthetic id -> Promise<app>

    function shell(fn) {
        const g = window._FSGuard;
        return g ? g.asShell(fn)() : fn();
    }

    function portableId(folderPath) {
        const raw = (Array.isArray(folderPath) ? folderPath : []).filter(p => p !== '/').join('/');
        const encoded = btoa(encodeURIComponent(raw))
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
        return PORTABLE_PREFIX + encoded;
    }

    function portableStamp(folderPath, manifest) {
        let stamp = String(manifest.version || '0');
        try {
            const children = shell(() => FileSystem.getChildren(folderPath)) || [];
            const entry = String(manifest.entry || 'main.js').split('/')[0];
            const manifestFile = children.find(c => c.name === 'manifest.json');
            const entryFile = children.find(c => c.name === entry);
            stamp += '-' + (manifestFile && manifestFile.modified ? manifestFile.modified : 0)
                + '-' + (entryFile && entryFile.modified ? entryFile.modified : 0);
        } catch { /* keep version-only stamp */ }
        return stamp;
    }

    function ensureMaps() {
        if (catalogReady) return;
        byId = {};
        byUuid = {};
        APP_MANIFESTS.forEach(m => {
            byId[m.id] = m;
            byUuid[String(m.uuid || '').toLowerCase()] = m;
        });
        catalogReady = true;
    }

    // Re-read installed packages (folder presence is the install record) and
    // merge package manifests that aren't part of the shipped catalog. The
    // map is rebuilt from the registry every time so a sideloaded app update
    // refreshes its name/version, and an uninstalled package disappears
    // instead of leaving a stale catalog entry behind.
    function refreshInstalled() {
        ensureMaps();
        byId = {};
        byUuid = {};
        APP_MANIFESTS.forEach(m => {
            byId[m.id] = m;
            byUuid[String(m.uuid || '').toLowerCase()] = m;
        });
        const next = new Set();
        try {
            Packages.getInstalled().forEach(r => {
                if (!byId[r.id] && r.manifest) {
                    byId[r.id] = r.manifest;
                    byUuid[String(r.manifest.uuid || '').toLowerCase()] = r.manifest;
                }
                next.add(r.id);
            });
        } catch (e) { /* packages not ready yet — keep previous set */ }
        installedIds = next;
        refreshIcons();
    }

    function getManifest(id) {
        ensureMaps();
        return byId[id] || portableManifests.get(id) || null;
    }

    // Icons come from the package folder. Registry apps know their icon from
    // the build; installed packages report it through the manifest scan.
    function refreshIcons() {
        const map = {};
        for (const man of Object.values(byId)) {
            const icon = man.icon || 'assets/icon.svg';
            if (man.hasIcon || man._hasIcon) map[man.id] = icon;
        }
        AppIcons.setPackagedIcons(map);
    }

    function getByUuid(uuid) {
        ensureMaps();
        return byUuid[String(uuid || '').toLowerCase()] || null;
    }

    function getAll() {
        ensureMaps();
        return Object.values(byId).map(m => ({ ...m }));
    }

    function getBuiltins() {
        return APP_MANIFESTS.filter(m => m.distribution === 'builtin');
    }

    function getStoreApps() {
        return APP_MANIFESTS.filter(m => m.distribution === 'store');
    }

    // Already-loaded module (sync). Returns null until ensureLoaded() ran.
    function getModule(id) {
        return loaded.get(id) || null;
    }

    function isLoaded(id) {
        return loaded.has(id);
    }

    // ---- install state ----

    function isInstalled(id) {
        const man = getManifest(id);
        if (man && man.distribution === 'builtin') return true;
        return installedIds.has(id);
    }

    function getInstalledIds() {
        return [...installedIds];
    }

    // Background execution capability (see js/modules/backgroundApps.js).
    // "service" apps additionally never appear in any launcher.
    function isService(id) {
        const man = getManifest(id);
        return !!man && man.service === true;
    }

    function canRunBackground(id) {
        const man = getManifest(id);
        return !!man && (man.background === true || man.service === true);
    }

    // Launchable = builtin (non-service) or an installed store app.
    function isLaunchable(id) {
        const man = getManifest(id);
        if (!man) return false;
        if (man.service === true) return false;
        if (man.distribution === 'builtin') return true;
        return installedIds.has(id);
    }

    // ---- lazy module loading ----

    function entryUrl(man) {
        return new URL(`../apps/${man.id}/${man.entry || 'main.js'}`, import.meta.url);
    }

    function ensureLoaded(id) {
        if (loaded.has(id)) return Promise.resolve(loaded.get(id));
        if (loading.has(id)) return loading.get(id);

        const man = getManifest(id);
        if (!man) return Promise.reject(new Error('Unknown app: ' + id));

        const p = (async () => {
            const url = entryUrl(man);
            // Installed store packages run from the virtual filesystem, served
            // by the service worker at the canonical app URL. The version query
            // busts the module cache on update; the worker strips it. When the
            // worker isn't controlling (or OPFS is unavailable) the request
            // falls through to the shipped bundle and still resolves.
            if (man.distribution === 'store') {
                url.searchParams.set('w12pkg', String(man.version || '0'));
            }
            const mod = await import(url.href);
            const app = mod && (mod.default || mod);
            loaded.set(id, app);
            AppRegistry.register(id, app);
            wireAssociations(id, app, man);
            return app;
        })();

        loading.set(id, p);
        return p.finally(() => loading.delete(id));
    }

    // Open/focus through the taskbar shell (keeps toggle + virtual-desktop
    // semantics). Returns Promise<boolean>.
    async function launch(id, options) {
        if (!isLaunchable(id)) return false;
        const app = await ensureLoaded(id);
        if (!app || typeof app.launch !== 'function') return false;
        // Apps declare launch() inconsistently: most take (options = {}) —
        // the shell forwards options for Settings pages etc. — but the file
        // handlers take a path/script/document as the FIRST argument
        // (photos, notepad, markdownStudio, archiver, powershell, …). Never
        // hand one of those a bare {}: it gets read as that path and throws
        // (notepad died with "segments is not iterable"). Only forward a
        // non-empty options object; otherwise call with no arguments so each
        // app's own default applies.
        const hasOptions = options && typeof options === 'object' && Object.keys(options).length > 0;
        if (hasOptions) await app.launch(options);
        else await app.launch();
        return true;
    }

    // ---- portable app bundles ----

    function ensurePortableLoaded(folderPath, manifest) {
        const id = portableId(folderPath);
        const stamp = portableStamp(folderPath, manifest);
        const existing = portableLoaded.get(id);
        if (existing && existing.stamp === stamp) return Promise.resolve(existing.app);
        if (portableLoading.has(id)) return portableLoading.get(id);

        const p = (async () => {
            const man = {
                ...manifest,
                id,
                entry: manifest.entry || 'main.js',
                distribution: 'portable'
            };
            portableManifests.set(id, man);
            const url = entryUrl(man);
            url.searchParams.set('w12pkg', encodeURIComponent(stamp));
            const mod = await import(url.href);
            const app = mod && (mod.default || mod);
            portableLoaded.set(id, { app, stamp });
            return app;
        })();

        portableLoading.set(id, p);
        return p.finally(() => portableLoading.delete(id));
    }

    async function launchFromFolder(folderPath, manifest, options) {
        if (!manifest || !Array.isArray(folderPath) || folderPath.length === 0) return false;
        if (typeof navigator !== 'undefined' && navigator.serviceWorker && !navigator.serviceWorker.controller) {
            throw new Error('Portable apps need the virtual filesystem service worker. Reload the desktop and try again.');
        }
        const app = await ensurePortableLoaded(folderPath, manifest);
        if (!app || typeof app.launch !== 'function') return false;
        const hasOptions = options && typeof options === 'object' && Object.keys(options).length > 0;
        if (hasOptions) await app.launch(options);
        else await app.launch();
        return true;
    }

    // ---- file associations (lazy: handler loads the app on first open) ----

    function wireAssociations(id, app, man) {
        if (man && man.associations.length > 0 && app && typeof app.open === 'function') {
            FileAssociations.register(id, man.associations, app.open);
        }
    }

    function wireAllAssociations() {
        ensureMaps();
        for (const m of Object.values(byId)) {
            if (!m.associations || m.associations.length === 0) continue;
            // Only apps that can actually open a file get a handler: an
            // uninstalled store app must not silently run from the shipped
            // bundle. Installing one fires 'apps-changed' and we re-wire.
            if (!isLaunchable(m.id)) continue;
            const id = m.id;
            FileAssociations.register(id, m.associations, (path, content) => {
                ensureLoaded(id).then(app => {
                    if (app && typeof app.open === 'function') app.open(path, content);
                }).catch(() => { /* the crash monitor reports load failures */ });
            });
        }
    }

    // ---- install / uninstall (delegates to the package service) ----

    async function install(idOrUuid, opts = {}) {
        const man = resolveManifest(idOrUuid);
        if (!man || man.distribution !== 'store') return false;
        await Packages.install(man.id, opts);
        refreshInstalled();
        return true;
    }

    async function update(idOrUuid, opts = {}) {
        const man = resolveManifest(idOrUuid);
        if (!man || man.distribution !== 'store') return false;
        await Packages.update(man.id, opts);
        // Drop the cached module so the next launch imports the new code
        // (the package URL only busts the cache when the version query
        // changes, which isn't guaranteed for every update).
        loaded.delete(man.id);
        try { AppRegistry.unregister(man.id); } catch (e) { /* not registered */ }
        refreshInstalled();
        return true;
    }

    async function uninstall(idOrUuid) {
        const man = resolveManifest(idOrUuid);
        if (!man || man.distribution !== 'store') return false;
        await Packages.uninstall(man.id);
        loaded.delete(man.id);
        try { AppRegistry.unregister(man.id); } catch (e) { /* not registered */ }
        try { FileAssociations.unregister(man.id); } catch (e) { /* no handlers */ }
        refreshInstalled();
        return true;
    }

    // ---- boot ----

    async function init() {
        ensureMaps();
        refreshInstalled();
        AppMetadata.setNames(Object.fromEntries(Object.values(byId).map(m => [m.id, m.name])));
        wireAllAssociations();

        window.addEventListener('apps-changed', (e) => {
            const detail = e && e.detail;
            if (detail && detail.installed) {
                // A package update replaces the code on disk; drop the cached
                // module so the next launch imports the new entry file.
                loaded.delete(detail.installed);
                loading.delete(detail.installed);
                try { AppRegistry.unregister(detail.installed); } catch (err) { /* not registered */ }
            }
            refreshInstalled();
            AppMetadata.setNames(Object.fromEntries(Object.values(byId).map(m => [m.id, m.name])));
            wireAllAssociations();
        });
    }

    return {
        init, install, uninstall, update,
        getManifest, getByUuid, getAll, getBuiltins, getStoreApps,
        getModule, isLoaded, ensureLoaded, launch,
        portableId, launchFromFolder,
        isInstalled, getInstalledIds, isLaunchable,
        isService, canRunBackground
    };
})();

export default AppLoader;
