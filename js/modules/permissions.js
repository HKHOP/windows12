// Permissions — declarative app capabilities + user grants.
//
// A store manifest may declare:
//
//   "permissions": ["filesystem", "notifications", "network"]
//
// The Store shows these on the app page ("Permissions: Access your files,
// …"), install asks for consent, and Settings > Apps lets the user revoke
// them later. Grants persist per manifest uuid, so reinstalls keep choices
// (uninstall wipes them).
//
// Catalog:
//   filesystem    FileSystem / blobStore read+write ("Access your files")
//   notifications Notifications toasts + panel entries ("Send notifications")
//   network       fetch() and remote iframe embeds ("Access the internet")
//   clipboard     navigator.clipboard read/write ("Read your clipboard")
//   background    headless execution via BackgroundApps ("Run in background").
//                 Declaring it equals the "background": true flag —
//                 build-registry materializes either into manifest.background.
//
// Trust model (honest): builtins are first-party and always granted.
// Undeclared capabilities fail open (legacy back-compat). Only a DECLARED
// permission can be revoked into an actual block — currently enforced at
// the Notifications choke point; filesystem/network/clipboard are
// consent + display until app code runs behind a sandbox.
import AppLoader from './appLoader.js';
import FileSystem from './fileSystem.js';
import Popup from './popup.js';
import UIIcons from './uiIcons.js';

const Permissions = (() => {
    const DATA_DIR = ['/', 'system', 'programs data', 'permissions'];
    const GRANTS_PATH = [...DATA_DIR, 'grants.json'];

    const GLOBE_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z"/></svg>';

    const CATALOG = {
        filesystem: {
            label: 'Access your files',
            description: 'Read and write files in your virtual filesystem',
            icon: () => UIIcons.action('save', 16)
        },
        notifications: {
            label: 'Send notifications',
            description: 'Show toasts and Action Center entries',
            icon: () => UIIcons.setting('notifications', 16)
        },
        network: {
            label: 'Access the internet',
            description: 'Fetch remote data and embed online content',
            icon: () => GLOBE_SVG
        },
        clipboard: {
            label: 'Read your clipboard',
            description: 'Read text and images you copy',
            icon: () => UIIcons.action('paste', 16)
        },
        background: {
            label: 'Run in background',
            description: 'Keep running headless with no window open',
            icon: () => UIIcons.setting('power', 16)
        }
    };

    function getCatalog() {
        return Object.fromEntries(Object.entries(CATALOG).map(([id, p]) => [id, { label: p.label, description: p.description }]));
    }

    function isKnown(perm) {
        return Object.prototype.hasOwnProperty.call(CATALOG, perm);
    }

    function iconFor(perm) {
        try {
            return CATALOG[perm] ? CATALOG[perm].icon() : '';
        } catch { return ''; }
    }

    function manifestOf(appId) {
        try {
            return AppLoader.getManifest(appId);
        } catch { return null; }
    }

    function getDeclared(appId) {
        const man = manifestOf(appId);
        if (!man || !Array.isArray(man.permissions)) return [];
        return [...new Set(man.permissions.filter(isKnown))];
    }

    function isBuiltin(appId) {
        const man = manifestOf(appId);
        return !!man && man.distribution === 'builtin';
    }

    // ---------- grants store (keyed by manifest uuid) ----------

    function ensureDir() {
        for (let i = 1; i <= DATA_DIR.length; i++) {
            const partial = DATA_DIR.slice(0, i);
            if (!FileSystem.itemExists(partial)) {
                FileSystem.createFolder(DATA_DIR.slice(0, i - 1), DATA_DIR[i - 1]);
            }
        }
    }

    function readGrants() {
        try {
            const raw = FileSystem.readFile(GRANTS_PATH);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') return parsed;
            }
        } catch { /* corrupt -> fresh */ }
        return {};
    }

    function writeGrants(grants) {
        try {
            ensureDir();
            const json = JSON.stringify(grants);
            if (FileSystem.itemExists(GRANTS_PATH)) FileSystem.writeFile(GRANTS_PATH, json);
            else FileSystem.createFile(DATA_DIR, 'grants.json', json, 'json');
        } catch { /* session-only */ }
    }

    function uuidOf(appId) {
        const man = manifestOf(appId);
        return man ? man.uuid : null;
    }

    function getGrants(appId) {
        const uuid = uuidOf(appId);
        if (!uuid) return {};
        const all = readGrants();
        return (all[uuid] && typeof all[uuid] === 'object') ? { ...all[uuid] } : {};
    }

    // Builtins: always granted. Undeclared: fail open (legacy).
    // Declared: granted unless explicitly revoked (missing record means
    // consent-at-install or grandfathered pre-permissions install).
    function isGranted(appId, perm) {
        if (!isKnown(perm)) return true;
        if (isBuiltin(appId)) return true;
        if (!getDeclared(appId).includes(perm)) return true;
        return getGrants(appId)[perm] !== false;
    }

    function setGranted(appId, perm, granted) {
        if (!isKnown(perm)) return false;
        const uuid = uuidOf(appId);
        if (!uuid) return false;
        const all = readGrants();
        if (!all[uuid] || typeof all[uuid] !== 'object') all[uuid] = {};
        all[uuid][perm] = !!granted;
        writeGrants(all);
        return true;
    }

    function grantAll(appId) {
        for (const perm of getDeclared(appId)) setGranted(appId, perm, true);
    }

    function clearGrants(appId) {
        const uuid = uuidOf(appId);
        if (!uuid) return false;
        const all = readGrants();
        if (all[uuid]) {
            delete all[uuid];
            writeGrants(all);
            return true;
        }
        return false;
    }

    // ---------- install-time consent ----------

    function consentHtml(appName, perms) {
        const rows = perms.map(p => {
            const meta = CATALOG[p];
            return `<div style="display:flex;gap:10px;align-items:flex-start;padding:7px 0;">
                <span style="width:16px;height:16px;display:inline-flex;flex-shrink:0;margin-top:1px;">${meta.icon()}</span>
                <span><span style="font-weight:600;">${meta.label}</span><br>
                <span style="font-size:12px;color:#888;">${meta.description}</span></span>
            </div>`;
        }).join('');
        return `<div style="font-size:13px;margin-bottom:6px;"><b>${appName}</b> will be able to:</div>${rows}`;
    }

    // Resolves true when the app may be installed. Apps with no declared
    // permissions skip the prompt entirely.
    function requestInstallConsent(appId) {
        const man = manifestOf(appId);
        const perms = getDeclared(appId);
        if (!man || perms.length === 0) return Promise.resolve(true);
        return Popup.confirm('App permissions', consentHtml(man.name || appId, perms)).then(ok => {
            if (ok) grantAll(appId);
            return !!ok;
        });
    }

    return {
        getCatalog, isKnown, iconFor, getDeclared, isBuiltin,
        getGrants, isGranted, setGranted, grantAll, clearGrants,
        requestInstallConsent
    };
})();

export default Permissions;
