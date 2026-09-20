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

const FSGuard = (() => {
    let activeApp = null;        // focus-tracked fallback attribution
    let suspendDepth = 0;        // shell-critical writes
    let prompting = false;       // one consent dialog at a time
    const sessionAllowed = new Map(); // appId -> Set of allowed dir path strings

    const OS_ONLY_PREFIXES = [
        'system/users',
        'system/programs data/permissions',
        'system/$Recycle.Bin',
        'system/config.json',
        'system/desktop-layout.json'
    ];

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

    // Nearest app module on the stack: innermost `js/apps/<id>/` frame.
    function stackApp() {
        let stack;
        try { stack = new Error().stack; } catch { return null; }
        if (!stack) return null;
        const m = stack.match(/js[\/\\]apps[\/\\]([A-Za-z0-9]+)[\/\\]/);
        return m ? m[1] : null;
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

    return {
        setActiveApp, getActiveApp, asShell, check,
        allowSession, resetSession
    };
})();

export default FSGuard;
