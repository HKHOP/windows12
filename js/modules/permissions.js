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
//   microphone    getUserMedia audio ("Use your microphone")
//   camera        getUserMedia video ("Use your camera")
//
// Trust model (honest): undeclared capabilities fail open at the generic
// level (legacy back-compat), but declared permissions are enforced —
// notifications at the Notifications choke point, and filesystem via
// FSGuard: an app may always touch its own AppData folders, while anything
// outside them requires the 'filesystem' permission (revocable in
// Settings > Apps). Apps that don't declare it get a one-time runtime
// consent dialog instead (see requestFsAccess).
import AppLoader from './appLoader.js';
import FileSystem from './fileSystem.js';
import Popup from './popup.js';
import UIIcons from './uiIcons.js';

const Permissions = (() => {
    const DATA_DIR = ['/', 'system', 'programs data', 'permissions'];
    const GRANTS_PATH = [...DATA_DIR, 'grants.json'];

    const GLOBE_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z"/></svg>';
    const MIC_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke-linecap="round"/></svg>';
    const CAMERA_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="6" width="13" height="12" rx="2"/><path d="M15 10l7-3v10l-7-3" stroke-linejoin="round"/></svg>';

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
        },
        microphone: {
            label: 'Use your microphone',
            description: 'Record audio and voice memos',
            icon: () => MIC_SVG
        },
        camera: {
            label: 'Use your camera',
            description: 'Take pictures and scan codes',
            icon: () => CAMERA_SVG
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
        // Grant writes can be triggered from an app context (runtime consent,
        // revocations) — they are OS-owned state, so shield them from the
        // filesystem guard. window._FSGuard avoids a static import cycle.
        const guard = window._FSGuard;
        const run = guard ? guard.asShell(() => { try { _writeGrants(grants); } catch { /* session-only */ } })
                          : () => { try { _writeGrants(grants); } catch { /* session-only */ } };
        run();
    }

    function _writeGrants(grants) {
        ensureDir();
        const json = JSON.stringify(grants);
        if (FileSystem.itemExists(GRANTS_PATH)) FileSystem.writeFile(GRANTS_PATH, json);
        else FileSystem.createFile(DATA_DIR, 'grants.json', json, 'json');
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

    // Builtins and store apps behave the same here: declared permissions
    // are granted unless explicitly revoked (missing record means
    // consent-at-install or grandfathered pre-permissions install).
    // Undeclared permissions fail open (legacy).
    function isGranted(appId, perm) {
        if (!isKnown(perm)) return true;
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

    // ---------- runtime filesystem consent (FSGuard) ----------

    // "Always allow" grant for apps that never declared 'filesystem' —
    // stored alongside the normal grants under a dedicated key so it can't
    // collide with install-consent semantics.
    function setFsAlways(appId, val) {
        const uuid = uuidOf(appId);
        if (!uuid) return false;
        const all = readGrants();
        if (!all[uuid] || typeof all[uuid] !== 'object') all[uuid] = {};
        all[uuid].fsAlways = !!val;
        writeGrants(all);
        return true;
    }

    // Consent dialog when an app without the 'filesystem' permission touches
    // a path outside its own data. Resolves 'session' | 'always' | 'deny'.
    function requestFsAccess(appId, path) {
        const man = manifestOf(appId);
        const appName = man ? (man.name || appId) : appId;
        const full = Array.isArray(path) ? path.join('/') : String(path || '');
        const short = full.length > 64 ? '…' + full.slice(-63) : full;
        const body = `
            <div class="popup-message">
                <b>${appName}</b> is trying to access files outside its own app data:<br><br>
                <span style="font-family:monospace;font-size:12px;color:#9ecbff;word-break:break-all;">/${short}</span><br><br>
                Allow access?
            </div>`;
        return Popup.custom('File access request', body, [
            { label: 'Deny', value: 'deny' },
            { label: 'Allow once', value: 'session' },
            { label: 'Always allow', value: 'always', primary: true }
        ], { width: 460, height: 280 });
    }

    return {
        getCatalog, isKnown, iconFor, getDeclared, isBuiltin, manifestOf,
        getGrants, isGranted, setGranted, grantAll, clearGrants,
        setFsAlways, requestFsAccess,
        requestInstallConsent
    };
})();

export default Permissions;
