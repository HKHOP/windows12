import FileSystem from './fileSystem.js';

const WindowState = (() => {
    const STATE_PATH = ['/', 'system', 'programs data'];
    const STATE_FILE = 'windowState.json';
    const SAVE_DELAY = 300;
    let saveTimeout = null;
    let state = {};

    function init() {
        loadState();
    }

    function loadState() {
        try {
            const fullPath = [...STATE_PATH, STATE_FILE];
            if (FileSystem.itemExists(fullPath)) {
                const raw = FileSystem.readFile(fullPath);
                state = JSON.parse(raw || '{}');
            } else {
                state = {};
            }
        } catch (e) {
            state = {};
        }
    }

    function saveState() {
        try {
            const json = JSON.stringify(state, null, 2);
            const fullPath = [...STATE_PATH, STATE_FILE];
            if (FileSystem.itemExists(fullPath)) {
                FileSystem.writeFile(fullPath, json);
            } else {
                if (!FileSystem.itemExists(STATE_PATH)) {
                    FileSystem.createFolder(['/', 'system'], 'programs data');
                }
                FileSystem.createFile(STATE_PATH, STATE_FILE, json, 'json');
            }
        } catch (e) {}
    }

    function scheduleSave() {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveState, SAVE_DELAY);
    }

    function saveWindowState(appId, bounds) {
        if (!appId || !bounds) return;
        state[appId] = {
            x: Math.round(bounds.x),
            y: Math.round(bounds.y),
            width: Math.round(bounds.width),
            height: Math.round(bounds.height),
            maximized: bounds.maximized || false,
            timestamp: Date.now()
        };
        scheduleSave();
    }

    function getWindowState(appId) {
        return state[appId] || null;
    }

    function clearWindowState(appId) {
        if (state[appId]) {
            delete state[appId];
            scheduleSave();
        }
    }

    function getAllStates() {
        return { ...state };
    }

    return { init, saveWindowState, getWindowState, clearWindowState, getAllStates };
})();

export default WindowState;
