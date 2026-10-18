// BackgroundApps — headless app execution ("background apps" + "services").
//
// A "background app" is a normal launchable app that keeps working with no
// window open. A "service" (`"service": true` in manifest.json) is
// background-only: it never appears in Start / Search / taskbar and can only
// be uninstalled from Settings or the Store. Both kinds must declare the
// capability in their manifest (`"background": true`, implied by "service").
//
// App contract (all optional, may be async): export from main.js
//   onBackground() — entered headless mode (boot, request, service start).
//                    Start timers/listeners here; open no windows.
//   onForeground() — about to return to a window (before launch).
//   onShutdown()   — headless execution is stopping (stop, uninstall).
//
// Apps: import BackgroundApps from '../../modules/backgroundApps.js';
//   await BackgroundApps.requestBackground('myApp');   // hide windows, run on
//   BackgroundApps.bringToForeground('myApp');         // back to a window
//
// Autostart state is PER-USER (each account revives its own background apps),
// matching concurrent sessions: switching profiles swaps in that profile's
// set without stopping the other one. Which profile owns a running app is
// tracked so a headless app is only ever started once (its module is a
// singleton in this realm).

import AppLoader from './appLoader.js';
import WindowManager from './windowManager.js';
import FileSystem from './fileSystem.js';
import { Taskbar } from './taskbar.js';
import Users from './users.js';

const BackgroundApps = (() => {
    function statePath(userId) {
        return Users.userDataFor(userId, ['backgroundApps.json']);
    }

    // Shell-owned FS access (shield from fsGuard app attribution).
    function asShell(fn) {
        return (...args) => {
            const g = window._FSGuard;
            if (g) return g.asShell(fn)(...args);
            return fn(...args);
        };
    }

    // Per-user autostart state, loaded lazily: userId -> { running, disabled }.
    const byUser = new Map();
    // App id -> owning profile id (first profile that started it headless).
    const owner = new Map();
    let activeUserId = null;

    function uid(userId) {
        if (userId) return userId;
        if (activeUserId) return activeUserId;
        const u = Users.getCurrent();
        return u ? u.id : 'default';
    }

    function ensureDir(userId) {
        try {
            const path = Users.userDataFor(userId, []);
            for (let i = 1; i <= path.length; i++) {
                const partial = path.slice(0, i);
                if (!FileSystem.itemExists(partial)) {
                    FileSystem.createFolder(path.slice(0, i - 1), path[i - 1]);
                }
            }
        } catch (e) { /* storage unavailable — run session-only */ }
    }

    const loadPersisted = asShell(function loadPersisted(userId) {
        const empty = { running: new Set(), disabled: new Set() };
        try {
            const raw = FileSystem.readFile(statePath(userId));
            if (!raw) return empty;
            const parsed = JSON.parse(raw);
            const strSet = (v) => new Set(Array.isArray(v) ? v.filter(id => typeof id === 'string') : []);
            return { running: strSet(parsed.background), disabled: strSet(parsed.disabled) };
        } catch (e) {
            return empty;
        }
    });

    const persistFor = asShell(function persistFor(userId, running, disabled) {
        try {
            ensureDir(userId);
            const json = JSON.stringify({ background: [...running], disabled: [...disabled] });
            const path = statePath(userId);
            if (FileSystem.itemExists(path)) FileSystem.writeFile(path, json);
            else FileSystem.createFile(path.slice(0, -1), 'backgroundApps.json', json, 'json');
        } catch (e) { /* session-only */ }
    });

    function stateOf(userId) {
        const id = uid(userId);
        let s = byUser.get(id);
        if (!s) {
            s = loadPersisted(id);
            byUser.set(id, s);
        }
        return s;
    }

    function persist(userId) {
        const id = uid(userId);
        const s = stateOf(id);
        persistFor(id, s.running, s.disabled);
    }

    function emit() {
        try {
            window.dispatchEvent(new CustomEvent('background-apps-changed', {
                detail: { running: [...stateOf(activeUserId).running] }
            }));
        } catch (e) { /* noop */ }
    }

    function isAvailable(id) {
        const man = AppLoader.getManifest(id);
        if (!man) return false;
        if (man.distribution === 'builtin') return true;
        try {
            return AppLoader.isInstalled(id);
        } catch (e) {
            return false;
        }
    }

    async function callLifecycle(id, method) {
        try {
            // Modules load lazily; background apps/services are the exception
            // that needs the code at boot (they run without a window).
            const mod = await AppLoader.ensureLoaded(id);
            if (mod && typeof mod[method] === 'function') {
                await mod[method]();
            }
        } catch (e) { /* a broken hook must never take the OS down */ }
    }

    // Is the app running headless for any profile?
    function isRunning(id) {
        const o = owner.get(id);
        if (o && stateOf(o).running.has(id)) return true;
        for (const s of byUser.values()) if (s.running.has(id)) return true;
        return false;
    }

    // Mark headless + notify. Assumes capability/availability were checked.
    async function enterBackground(id, userId) {
        const u = uid(userId);
        await callLifecycle(id, 'onBackground');
        stateOf(u).running.add(id);
        owner.set(id, u);
        persist(u);
        emit();
        return true;
    }

    // ---- Queries (also re-exported for launcher surfaces) ----

    function canRunBackground(id) {
        return AppLoader.canRunBackground(id);
    }

    function isService(id) {
        return AppLoader.isService(id);
    }

    function isBackground(id) {
        const o = owner.get(id);
        if (o) return stateOf(o).running.has(id);
        return stateOf(activeUserId).running.has(id);
    }

    function getBackgroundApps() {
        return [...stateOf(activeUserId).running];
    }

    // ---- Boot (Task Manager > Startup) control ----

    function isAutostartEnabled(id) {
        return !stateOf(activeUserId).disabled.has(id);
    }

    // Disabling stops a running headless app immediately and excludes it
    // from boot; enabling un-excludes it and starts it now when possible.
    async function setAutostartEnabled(id, enabled) {
        if (typeof id !== 'string' || !id) return false;
        if (!canRunBackground(id)) return false;
        const s = stateOf(activeUserId);
        if (enabled) {
            if (s.disabled.has(id)) {
                s.disabled.delete(id);
                persist(activeUserId);
            }
            if (!isRunning(id) && isAvailable(id)) {
                let hasWindows = false;
                try {
                    hasWindows = WindowManager.getWindowsForUser(activeUserId).some(w => w.appId === id);
                } catch (e) { /* fall through */ }
                if (!hasWindows) await enterBackground(id, activeUserId);
                else emit();
            }
            return true;
        }
        s.disabled.add(id);
        if (isBackground(id)) {
            await callLifecycle(id, 'onShutdown');
            const o = owner.get(id);
            if (o) { stateOf(o).running.delete(id); persist(o); owner.delete(id); }
        }
        persist(activeUserId);
        emit();
        return true;
    }

    // Every background-capable, available app: the Startup tab rows.
    function getStartupEntries() {
        let manifests = [];
        try {
            manifests = AppLoader.getAll();
        } catch (e) {
            return [];
        }
        const s = stateOf(activeUserId);
        return manifests
            .filter(m => (m.background === true || m.service === true) && isAvailable(m.id))
            .map(m => ({
                id: m.id,
                name: m.name || m.id,
                service: m.service === true,
                running: s.running.has(m.id) || isBackground(m.id),
                enabled: !s.disabled.has(m.id)
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    // ---- Transitions ----

    // Foreground app (or fresh start) -> headless. Closes the app's windows
    // through their close handlers first; a veto (unsaved changes) aborts.
    async function requestBackground(id) {
        if (typeof id !== 'string' || !id) return false;
        if (!canRunBackground(id) || !isAvailable(id)) return false;
        if (isRunning(id)) return true;
        const wins = WindowManager.getWindowsForUser(activeUserId).filter(w => w.appId === id);
        for (const w of wins) {
            let closed = false;
            try {
                closed = await WindowManager.requestClose(w.id);
            } catch (e) {
                closed = false;
            }
            if (closed === false) return false;
        }
        return enterBackground(id, activeUserId);
    }

    // Headless -> window. Services can never foreground (return false).
    function bringToForeground(id, options = {}) {
        if (typeof id !== 'string' || !id) return false;
        if (isService(id)) return false;
        if (!isAvailable(id)) return false;
        if (isBackground(id)) {
            const o = owner.get(id) || activeUserId;
            stateOf(o).running.delete(id);
            owner.delete(id);
            persist(o);
            emit();
            callLifecycle(id, 'onForeground');
        }
        try {
            Taskbar.openApp(id, options);
        } catch (e) {
            return false;
        }
        return true;
    }

    // Headless start without ever opening a window (boot, services, manual).
    // Refuses when the app currently has windows (it is foreground).
    async function startService(id) {
        if (typeof id !== 'string' || !id) return false;
        if (!canRunBackground(id) || !isAvailable(id)) return false;
        if (isRunning(id)) return true;
        try {
            if (WindowManager.getWindowsForUser(activeUserId).some(w => w.appId === id)) return false;
        } catch (e) { /* fall through */ }
        return enterBackground(id, activeUserId);
    }

    // Stop headless execution. Windows (if any somehow exist) are untouched.
    async function stopService(id) {
        if (typeof id !== 'string' || !id) return false;
        if (!isBackground(id)) return false;
        await callLifecycle(id, 'onShutdown');
        const o = owner.get(id) || activeUserId;
        stateOf(o).running.delete(id);
        owner.delete(id);
        persist(o);
        emit();
        return true;
    }

    // Drop headless entries that are no longer installed/capable (uninstall)
    // or were disabled for boot while running. Every profile is checked.
    async function reconcile() {
        let changed = false;
        for (const [id, o] of [...owner]) {
            const s = stateOf(o);
            if (!canRunBackground(id) || !isAvailable(id) || s.disabled.has(id)) {
                await callLifecycle(id, 'onShutdown');
                s.running.delete(id);
                owner.delete(id);
                persist(o);
                changed = true;
            }
        }
        if (changed) emit();
        return changed;
    }

    // Foreground session changed: revive that profile's headless apps (and
    // always-on services) without disturbing the other profiles'.
    async function activate(userId) {
        activeUserId = uid(userId);
        const s = stateOf(activeUserId);
        const wanted = new Set();
        for (const id of s.running) {
            if (canRunBackground(id) && isAvailable(id) && !s.disabled.has(id)) wanted.add(id);
        }
        try {
            for (const m of AppLoader.getBuiltins()) {
                if (m.service === true && !s.disabled.has(m.id)) wanted.add(m.id);
            }
        } catch (e) { /* manifests unreadable — start nothing */ }
        for (const id of wanted) {
            if (isRunning(id)) continue;
            try {
                const hasWindows = WindowManager.getWindowsForUser(activeUserId).some(w => w.appId === id);
                if (!hasWindows) await enterBackground(id, activeUserId);
            } catch (e) { /* one broken app must not block the rest */ }
        }
        persist(activeUserId);
        emit();
    }

    // A session is ending (sign-out): stop every headless app THAT PROFILE
    // owns. The other profiles' headless apps keep running. Returns once the
    // shutdown hooks settle.
    async function stopUser(userId) {
        const id = uid(userId);
        const s = stateOf(id);
        for (const appId of [...s.running]) {
            if (owner.get(appId) === id) {
                await callLifecycle(appId, 'onShutdown');
                owner.delete(appId);
            }
        }
        s.running.clear();
        persist(id);
        emit();
    }

    // Boot: wiring once, then activate the current profile.
    async function init() {
        try {
            window.addEventListener('apps-changed', () => { reconcile(); });
        } catch (e) { /* noop */ }
        await activate();
    }

    return {
        init, activate, stopUser,
        canRunBackground, isService, isBackground, getBackgroundApps,
        requestBackground, bringToForeground, startService, stopService,
        isAutostartEnabled, setAutostartEnabled, getStartupEntries
    };
})();

export default BackgroundApps;
