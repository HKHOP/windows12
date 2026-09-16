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
// State persists in the FileSystem, so headless apps resume at boot:
// builtin services always auto-start, plus whatever was backgrounded.

import AppLoader from './appLoader.js';
import WindowManager from './windowManager.js';
import FileSystem from './fileSystem.js';
import { Taskbar } from './taskbar.js';

const BackgroundApps = (() => {
    const STATE_DIR = ['/', 'system', 'programs data'];
    const STATE_NAME = 'backgroundApps.json';

    // App ids currently running headless (no windows).
    let running = new Set();

    function statePath() {
        return [...STATE_DIR, STATE_NAME];
    }

    function ensureDir() {
        try {
            for (let i = 1; i <= STATE_DIR.length; i++) {
                const partial = STATE_DIR.slice(0, i);
                if (!FileSystem.itemExists(partial)) {
                    FileSystem.createFolder(STATE_DIR.slice(0, i - 1), STATE_DIR[i - 1]);
                }
            }
        } catch (e) { /* storage unavailable — run session-only */ }
    }

    function loadPersisted() {
        try {
            const raw = FileSystem.readFile(statePath());
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed.background) ? parsed.background.filter(id => typeof id === 'string') : [];
        } catch (e) {
            return [];
        }
    }

    function persist() {
        try {
            ensureDir();
            const json = JSON.stringify({ background: [...running] });
            if (FileSystem.itemExists(statePath())) {
                FileSystem.writeFile(statePath(), json);
            } else {
                FileSystem.createFile(STATE_DIR, STATE_NAME, json, 'json');
            }
        } catch (e) { /* session-only */ }
    }

    function emit() {
        try {
            window.dispatchEvent(new CustomEvent('background-apps-changed', {
                detail: { running: [...running] }
            }));
        } catch (e) { /* noop */ }
    }

    function isAvailable(id) {
        const man = AppLoader.getManifest(id);
        if (!man) return false;
        if (man.distribution === 'builtin') return true;
        try {
            return AppLoader.getInstalledIds().includes(id);
        } catch (e) {
            return false;
        }
    }

    async function callLifecycle(id, method) {
        try {
            const mod = AppLoader.getModule(id);
            if (mod && typeof mod[method] === 'function') {
                await mod[method]();
            }
        } catch (e) { /* a broken hook must never take the OS down */ }
    }

    // Mark headless + notify. Assumes capability/availability were checked.
    async function enterBackground(id) {
        await callLifecycle(id, 'onBackground');
        running.add(id);
        persist();
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
        return running.has(id);
    }

    function getBackgroundApps() {
        return [...running];
    }

    // ---- Transitions ----

    // Foreground app (or fresh start) -> headless. Closes the app's windows
    // through their close handlers first; a veto (unsaved changes) aborts.
    async function requestBackground(id) {
        if (typeof id !== 'string' || !id) return false;
        if (!canRunBackground(id) || !isAvailable(id)) return false;
        if (running.has(id)) return true;
        const wins = WindowManager.getWindowsByApp(id);
        for (const w of wins) {
            let closed = false;
            try {
                closed = await WindowManager.requestClose(w.id);
            } catch (e) {
                closed = false;
            }
            if (closed === false) return false;
        }
        return enterBackground(id);
    }

    // Headless -> window. Services can never foreground (return false).
    function bringToForeground(id, options = {}) {
        if (typeof id !== 'string' || !id) return false;
        if (isService(id)) return false;
        if (!isAvailable(id)) return false;
        if (running.has(id)) {
            running.delete(id);
            persist();
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
        if (running.has(id)) return true;
        try {
            if (WindowManager.getWindowsByApp(id).length > 0) return false;
        } catch (e) { /* fall through */ }
        return enterBackground(id);
    }

    // Stop headless execution. Windows (if any somehow exist) are untouched.
    async function stopService(id) {
        if (typeof id !== 'string' || !id) return false;
        if (!running.has(id)) return false;
        await callLifecycle(id, 'onShutdown');
        running.delete(id);
        persist();
        emit();
        return true;
    }

    // Drop headless entries that are no longer installed/capable (uninstall).
    async function reconcile() {
        let changed = false;
        for (const id of [...running]) {
            if (!canRunBackground(id) || !isAvailable(id)) {
                await callLifecycle(id, 'onShutdown');
                running.delete(id);
                changed = true;
            }
        }
        if (changed) {
            persist();
            emit();
        }
        return changed;
    }

    // Boot: revive persisted headless apps + always start builtin services.
    async function init() {
        const wanted = new Set();
        for (const id of loadPersisted()) {
            if (canRunBackground(id) && isAvailable(id)) wanted.add(id);
        }
        try {
            for (const m of AppLoader.getBuiltins()) {
                if (m.service === true) wanted.add(m.id);
            }
        } catch (e) { /* manifests unreadable — start nothing */ }
        for (const id of wanted) {
            try {
                if (!running.has(id) && WindowManager.getWindowsByApp(id).length === 0) {
                    await callLifecycle(id, 'onBackground');
                    running.add(id);
                }
            } catch (e) { /* one broken app must not block the rest */ }
        }
        persist();
        emit();
        try {
            window.addEventListener('apps-changed', () => { reconcile(); });
        } catch (e) { /* noop */ }
    }

    return {
        init,
        canRunBackground, isService, isBackground, getBackgroundApps,
        requestBackground, bringToForeground, startService, stopService
    };
})();

export default BackgroundApps;
