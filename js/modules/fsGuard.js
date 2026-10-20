// FSGuard — filesystem access policy for the multi-user AppData model.
//
// Rule: an app may always access its OWN data folders (the current user's
// /users/<id>/AppData/<appId>/ and its global /system/programs data/<appId>/).
// Everything else outside those roots requires the manifest-declared
// 'filesystem' permission; an app that touches nothing outside its own data
// needs no permission at all. Apps that don't declare it get a one-time
// runtime consent dialog (allow once / always / deny).
//
// Caller attribution (shared JS context, honest approximation):
//   1. the nearest `js/apps/<id>/` frame on the call stack (covers sync
//      calls and timer callbacks), then
//   2. the focus-tracked active app (covers promise continuations), then
//   3. no app — shell context, always allowed.
// OS modules that write shared state while an app happens to be focused
// wrap their writes in asShell() so they are not attributed to the app.
//
// Zones under /system (per-user OS data, permission grants, recycle bin)
// are OS-only: app access there is denied without a prompt.
import Permissions from './permissions.js';
import FileSystem from './fileSystem.js';
import Registry from './registry.js';
import { folderFromUrl } from './siteBase.js';

const FSGuard = (() => {
    let activeApp = null;        // focus-tracked fallback attribution
    let suspendDepth = 0;        // shell-critical writes
    let prompting = false;       // one consent dialog at a time
    const sessionAllowed = new Map(); // appId -> Set of allowed dir path strings

    const OS_ONLY_PREFIXES = [
        'system/users',
        'system/programs data/permissions',
        'system/programs data/display',
        'system/programs data/fileAssociations',
        'system/registry',
        'system/$Recycle.Bin',
        'system/config.json',
        'system/desktop-layout.json'
    ];

    // Paths that live outside any app's own data and that only an
    // administrator may modify. Reads stay allowed (File Explorer can browse
    // them); writes raise a UAC prompt and, once granted, are allowed for the
    // rest of the session for that app.
    const PROTECTED_WRITE_PREFIXES = ['Program Files'];
    const elevatedApps = new Set();
    const pendingElevation = new Set();

    // The OS core itself (\Windows) is a read-only mirror of the files the
    // service worker installed in OPFS. Nothing may modify it — not even an
    // elevated app: editing the operating system from inside itself is not
    // a thing the OS allows. Reads stay allowed, so File Explorer can show
    // the files. The roots live in fileSystem.js, which owns the filesystem.
    function isReadOnlyPath(path) {
        try { return FileSystem.isReadOnly(path); } catch (e) { return false; }
    }

    function setActiveApp(appId) {
        activeApp = appId || null;
    }

    function getActiveApp() {
        return activeApp;
    }

    // Wrap a shell-owned write so the guard ignores it even when an app
    // window has focus (SystemConfig, pins, activity, ...).
    function asShell(fn) {
        return (...args) => {
            suspendDepth++;
            try {
                return fn(...args);
            } finally {
                suspendDepth--;
            }
        };
    }

    // Nearest app module on the stack: the app's own code, which is served
    // from '/js/apps/<folder>/…'. The folder tells us the app (the registry
    // knows which app lives in a folder of its own choosing).
    function stackApp() {
        let stack;
        try { stack = new Error().stack; } catch { return null; }
        if (!stack) return null;
        const m = stack.match(/js[\/\\]apps[\/\\]([^"')\s]+)[\/\\]/);
        if (!m) return null;
        const folder = folderFromUrl('/js/apps/' + m[1] + '/');
        if (!folder || !folder.length) return null;
        try {
            const id = Registry.appIdForFolder(folder);
            if (id) return id;
        } catch (e) { /* the registry is optional */ }
        return folder[folder.length - 1];
    }

    function currentApp() {
        if (suspendDepth > 0) return null;
        return stackApp() || activeApp;
    }

    function isApp(appId) {
        try { return !!Permissions.manifestOf(appId); } catch { return false; }
    }

    function pathStr(path) {
        if (Array.isArray(path)) return path.filter(s => s !== '/' && s !== '').join('/');
        return String(path || '').replace(/^\//, '');
    }

    function isUnder(target, root) {
        return target === root || target.startsWith(root + '/');
    }

    function ownRoots(appId) {
        const Users = window._Users;
        const roots = ['system/programs data/' + appId];
        if (Users && Users.getCurrent()) roots.push(pathStr(Users.appData(appId)));
        return roots;
    }

    function sessionAllowedFor(appId, target) {
        const dirs = sessionAllowed.get(appId);
        if (!dirs) return false;
        for (const dir of dirs) {
            if (isUnder(target, dir)) return true;
        }
        return false;
    }

    // Session allowance covers the file's folder (and below) so reading a
    // handful of files in one directory doesn't nag per file.
    function allowSession(appId, path) {
        const target = pathStr(path);
        if (!target) return;
        const dir = target.split('/').slice(0, -1).join('/');
        if (!dir) return;
        if (!sessionAllowed.has(appId)) sessionAllowed.set(appId, new Set());
        sessionAllowed.get(appId).add(dir);
    }

    function resetSession() {
        sessionAllowed.clear();
        elevatedApps.clear();
        pendingElevation.clear();
        prompting = false;
        activeApp = null;
    }

    function deny(appId, target, prompt = true) {
        try {
            window.dispatchEvent(new CustomEvent('fs-access-denied', { detail: { appId, path: target } }));
        } catch { /* non-fatal */ }
        if (prompt && !prompting) {
            prompting = true;
            Promise.resolve(Permissions.requestFsAccess(appId, target)).then(choice => {
                prompting = false;
                if (choice === 'always') {
                    Permissions.setFsAlways(appId, true);
                } else if (choice === 'session') {
                    allowSession(appId, target);
                }
            }).catch(() => { prompting = false; });
        }
        return false;
    }

    // The access checker injected into FileSystem via setAccessChecker().
    // Returns true to allow the operation, false to deny (the FS call then
    // fails with its usual null/false return).
    function check(path) {
        if (suspendDepth > 0) return true;
        const appId = currentApp();
        if (!appId || !isApp(appId)) return true; // shell or non-app caller

        const target = pathStr(path);
        if (!target) return true; // root-level listing

        for (const zone of OS_ONLY_PREFIXES) {
            if (isUnder(target, zone)) return false; // OS-only, no prompt
        }
        for (const root of ownRoots(appId)) {
            if (isUnder(target, root)) return true;
        }

        if (Permissions.getDeclared(appId).includes('filesystem')) {
            // Declared: honored unless the user revoked it (builtins and
            // store apps behave the same here). A revoked permission is a
            // firm no — no consent dialog.
            if (Permissions.isGranted(appId, 'filesystem')) return true;
            return deny(appId, target, false);
        }

        // Undeclared: runtime consent, remembered for the session or always.
        if (sessionAllowedFor(appId, target)) return true;
        const grants = Permissions.getGrants(appId);
        if (grants.fsAlways === true) return true;
        return deny(appId, target);
    }

    function appLabel(appId) {
        try {
            const m = Permissions.manifestOf(appId);
            return (m && m.name) || appId;
        } catch { return appId; }
    }

    function requestWriteElevation(appId, target) {
        const uac = window._UAC;
        if (!uac || pendingElevation.has(appId)) return;
        pendingElevation.add(appId);
        const zone = target.split('/')[0];
        Promise.resolve(uac.request({
            name: appLabel(appId),
            message: `"${appLabel(appId)}" is trying to change files in the protected system folder "\\${zone}". Allow this app to make changes to your device?`
        })).then(ok => {
            pendingElevation.delete(appId);
            if (ok) elevatedApps.add(appId);
            try { window.dispatchEvent(new CustomEvent('fs-write-elevation', { detail: { appId, granted: !!ok } })); } catch { /* noop */ }
        }).catch(() => pendingElevation.delete(appId));
    }

    // Write-side policy injected into FileSystem via setWriteChecker().
    // Same rules as check(), plus a per-app session elevation for protected
    // zones. A denied write returns false; if the user later approves the
    // UAC prompt, a retry in the same session succeeds.
    function checkWrite(path) {
        if (suspendDepth > 0) return true; // shell-owned work (asShell)

        // The OS core is read-only for everyone — apps, shell code and
        // scripts alike. Only the core mirror itself (which runs as
        // shell-owned work) may touch it. This is checked before the read
        // policy so no consent dialog is raised for a path that can never
        // be written.
        const target = pathStr(path);
        if (target && isReadOnlyPath(path)) {
            const appId = currentApp();
            try {
                window.dispatchEvent(new CustomEvent('fs-write-readonly', { detail: { appId, path: target } }));
            } catch { /* non-fatal */ }
            return false;
        }

        const appId = currentApp();
        if (!appId || !isApp(appId)) return true;

        if (!check(path)) return false;

        let isProtected = false;
        for (const zone of PROTECTED_WRITE_PREFIXES) {
            if (isUnder(target, zone)) { isProtected = true; break; }
        }
        if (!isProtected) return true;
        if (elevatedApps.has(appId)) return true;

        try { window.dispatchEvent(new CustomEvent('fs-write-protected', { detail: { appId, path: target } })); } catch { /* noop */ }
        requestWriteElevation(appId, target);
        return false;
    }

    return {
        setActiveApp, getActiveApp, asShell, check, checkWrite,
        allowSession, resetSession
    };
})();

export default FSGuard;
