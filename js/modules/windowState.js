import FileSystem from './fileSystem.js';
import Users from './users.js';

// WindowState — per-user window geometry/history (saved by WindowManager).
//
// Each account keeps its own window layout, so concurrent sessions never
// overwrite each other's geometry. The active profile is whichever session is
// in the foreground; a write can also target an explicit owner (used when a
// background session's window closes during sign-out).
const WindowState = (() => {
    const FILE = 'windowState.json';
    const SAVE_DELAY = 300;
    let saveTimeout = null;
    // userId -> state object (loaded lazily from that profile's OS data).
    const cache = new Map();
    let activeUserId = null;

    function statePath(userId) {
        return Users.userDataFor(userId, [FILE]);
    }

    function resolveId(userId) {
        if (userId) return userId;
        if (activeUserId) return activeUserId;
        const cur = Users.getCurrent();
        return cur ? cur.id : 'default';
    }

    function stateFor(userId) {
        const id = resolveId(userId);
        let s = cache.get(id);
        if (!s) {
            s = load(id);
            cache.set(id, s);
        }
        return s;
    }

    // Shell-owned FS access (shield from fsGuard app attribution).
    function asShell(fn) {
        return (...args) => {
            const g = window._FSGuard;
            if (g) return g.asShell(fn)(...args);
            return fn(...args);
        };
    }

    const readFileSafe = asShell(function readFileSafe(path) {
        try {
            if (FileSystem.itemExists(path)) return FileSystem.readFile(path);
        } catch (e) { /* unreadable */ }
        return null;
    });

    function load(userId) {
        try {
            const raw = readFileSafe(statePath(userId));
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') return parsed;
            }
        } catch (e) { /* fresh */ }
        return {};
    }

    const writeFileSafe = asShell(function writeFileSafe(userId, json) {
        try {
            const path = statePath(userId);
            if (FileSystem.itemExists(path)) {
                FileSystem.writeFile(path, json);
            } else {
                const parent = path.slice(0, -1);
                for (let i = 1; i <= parent.length; i++) {
                    const partial = parent.slice(0, i);
                    if (!FileSystem.itemExists(partial)) {
                        FileSystem.createFolder(parent.slice(0, i - 1), parent[i - 1]);
                    }
                }
                FileSystem.createFile(parent, FILE, json, 'json');
            }
        } catch (e) { /* keep in-memory only */ }
    });

    function scheduleSave() {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            saveTimeout = null;
            const id = resolveId(null);
            try { writeFileSafe(id, JSON.stringify(stateFor(id), null, 2)); } catch (e) { /* noop */ }
        }, SAVE_DELAY);
    }

    function init() {
        activeUserId = resolveId(null);
        stateFor(activeUserId);
    }

    // Foreground session changed: subsequent reads/writes default to it.
    function activate(userId) {
        activeUserId = resolveId(userId);
        stateFor(activeUserId);
    }

    function saveWindowState(appId, bounds, userId) {
        if (!appId || !bounds) return;
        const state = stateFor(userId);
        state[appId] = {
            x: Math.round(bounds.x),
            y: Math.round(bounds.y),
            width: Math.round(bounds.width),
            height: Math.round(bounds.height),
            maximized: bounds.maximized || false,
            // v2: x/y/width/height are ALWAYS the restorable (un-maximized)
            // bounds; maximized windows fill the live viewport at restore.
            ...(bounds.v ? { v: bounds.v } : {}),
            timestamp: Date.now()
        };
        scheduleSave();
    }

    function getWindowState(appId, userId) {
        return stateFor(userId)[appId] || null;
    }

    function clearWindowState(appId, userId) {
        const state = stateFor(userId);
        if (state[appId]) {
            delete state[appId];
            scheduleSave();
        }
    }

    function getAllStates(userId) {
        return { ...stateFor(userId) };
    }

    return { init, activate, saveWindowState, getWindowState, clearWindowState, getAllStates };
})();

export default WindowState;
