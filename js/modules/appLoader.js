import { AppRegistry, AppMetadata } from './taskbar.js';
import FileAssociations from './fileAssociations.js';
import { APP_MODULES, APP_MANIFESTS } from '../apps/registry.js';

// Resolves an id or uuid to a manifest, or null.
function resolveManifest(idOrUuid) {
    return AppLoader.getManifest(idOrUuid) || AppLoader.getByUuid(idOrUuid);
}

const AppLoader = (() => {
    // Built lazily (not at module scope): the registry <-> app module import
    // cycle means APP_MANIFESTS may be uninitialized during evaluation.
    let byId = null;
    let byUuid = {};

    function ensureMaps() {
        if (byId) return;
        byId = {};
        byUuid = {};
        APP_MANIFESTS.forEach(m => {
            byId[m.id] = m;
            byUuid[(m.uuid || '').toLowerCase()] = m;
        });
    }

    const STORE_KEY = 'installed_apps';
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    function getManifest(id) {
        ensureMaps();
        return byId[id] || null;
    }

    function getByUuid(uuid) {
        ensureMaps();
        return byUuid[String(uuid || '').toLowerCase()] || null;
    }

    function getAll() {
        return APP_MANIFESTS.map(m => ({ ...m }));
    }

    function getBuiltins() {
        return APP_MANIFESTS.filter(m => m.distribution === 'builtin');
    }

    function getStoreApps() {
        return APP_MANIFESTS.filter(m => m.distribution === 'store');
    }

    function getModule(id) {
        const mod = APP_MODULES[id];
        if (!mod) return null;
        return mod.default || mod;
    }

    function registerApp(id) {
        ensureMaps();
        const app = getModule(id);
        const man = byId[id];
        if (!app || !man) return false;
        AppRegistry.register(id, app);
        wireAssociations(id, app, man);
        return true;
    }

    // File handlers are wired for every manifest (not just installed apps),
    // matching the pre-migration behavior where module import registered them.
    function wireAllAssociations() {
        ensureMaps();
        APP_MANIFESTS.forEach(m => {
            if (m.associations.length > 0) wireAssociations(m.id, getModule(m.id), m);
        });
    }

    function wireAssociations(id, app, man) {
        if (app && man && man.associations.length > 0 && typeof app.open === 'function') {
            FileAssociations.register(id, man.associations, app.open);
        }
    }

    function readStored() {
        try {
            const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
            return Array.isArray(raw) ? raw : [];
        } catch (e) {
            return [];
        }
    }

    function writeStored(uuids) {
        localStorage.setItem(STORE_KEY, JSON.stringify(uuids));
    }

    // Legacy lists stored app ids; current lists store uuids. Migrate once.
    function migrateIfNeeded() {
        ensureMaps();
        const stored = readStored();
        if (stored.length === 0) return;
        const needsMigration = stored.some(v => !UUID_RE.test(String(v)));
        if (!needsMigration) return;
        const uuids = [];
        stored.forEach(v => {
            const man = byId[v] || byUuid[String(v).toLowerCase()];
            if (man && man.distribution === 'store' && !uuids.includes(man.uuid)) {
                uuids.push(man.uuid);
            }
        });
        writeStored(uuids);
    }

    function getInstalledUuids() {
        return readStored().filter(v => UUID_RE.test(String(v)));
    }

    function getInstalledIds() {
        const ids = [];
        getInstalledUuids().forEach(u => {
            const man = byUuid[u.toLowerCase()];
            if (man && !ids.includes(man.id)) ids.push(man.id);
        });
        return ids;
    }

    function init() {
        migrateIfNeeded();
        AppMetadata.setNames(Object.fromEntries(APP_MANIFESTS.map(m => [m.id, m.name])));
        getBuiltins().forEach(m => registerApp(m.id));
        getInstalledIds().forEach(id => registerApp(id));
        wireAllAssociations();
    }

    function install(idOrUuid) {
        const man = resolveManifest(idOrUuid);
        if (!man || man.distribution !== 'store') return false;
        const uuids = getInstalledUuids();
        if (!uuids.includes(man.uuid)) {
            uuids.push(man.uuid);
            writeStored(uuids);
        }
        registerApp(man.id);
        window.dispatchEvent(new CustomEvent('apps-changed'));
        return true;
    }

    function uninstall(idOrUuid) {
        const man = resolveManifest(idOrUuid);
        if (!man) return false;
        writeStored(getInstalledUuids().filter(u => u.toLowerCase() !== man.uuid.toLowerCase()));
        window.dispatchEvent(new CustomEvent('apps-changed'));
        return true;
    }

    return {
        init, install, uninstall,
        getManifest, getByUuid, getAll, getBuiltins, getStoreApps,
        getModule, registerApp, getInstalledUuids, getInstalledIds
    };
})();

export default AppLoader;
