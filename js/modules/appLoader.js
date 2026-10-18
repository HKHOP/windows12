import { AppRegistry, AppMetadata } from './taskbar.js';
import FileAssociations from './fileAssociations.js';
import { APP_MANIFESTS } from '../apps/registry.js';
import Packages from './packages.js';

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
    // merge any package manifests that aren't part of the shipped catalog.
    function refreshInstalled() {
        ensureMaps();
        const next = new Set();
        try {
            Packages.getInstalled().forEach(r => {
                if (!byId[r.id] && r.manifest) {
                    byId[r.id] = r.manifest;
                    byUuid[String(r.manifest.uuid || '').toLowerCase()] = r.manifest;
                }
                next.add(r.id);
            });
            Packages.getLegacy().forEach(id => next.add(id));
        } catch (e) { /* packages not ready yet — keep previous set */ }
        installedIds = next;
    }

    function getManifest(id) {
        ensureMaps();
        return byId[id] || null;
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

        window.addEventListener('apps-changed', () => {
            refreshInstalled();
            AppMetadata.setNames(Object.fromEntries(Object.values(byId).map(m => [m.id, m.name])));
            wireAllAssociations();
        });
    }

    return {
        init, install, uninstall,
        getManifest, getByUuid, getAll, getBuiltins, getStoreApps,
        getModule, isLoaded, ensureLoaded, launch,
        isInstalled, getInstalledIds, isLaunchable,
        isService, canRunBackground
    };
})();

export default AppLoader;
