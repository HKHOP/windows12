// Windows 12 SDK — WindowManager.
//
// Stable facade over the internal window manager. Adds an object-based
// create() alongside the classic positional createWindow(), plus window
// lifecycle helpers. Windows are positioned, dragged, resized, snapped,
// minimized, maximized and persisted by the OS — the SDK only declares them.
import InternalWindows from '../modules/windowManager.js';
import { requireString, requireOptions } from './errors.js';

/**
 * @typedef {object} CreateWindowOptions
 * @property {string} appId owning app id (required)
 * @property {string} [title] window title
 * @property {string} [icon] SVG string for the title bar
 * @property {string} [content] HTML string for the window body
 * @property {number} [width] initial width in px
 * @property {number} [height] initial height in px
 * @property {number} [minWidth]
 * @property {number} [minHeight]
 * @property {boolean} [saveState] persist position/size (default true)
 */

/**
 * Create a window from an options object (preferred SDK style).
 * @param {CreateWindowOptions} options
 * @returns {object} window handle: { id, appId, title, element, ... }
 * @throws {SDKError} INVALID_ARGS when appId is missing
 */
function create(options) {
    const opts = requireOptions(options, 'options');
    requireString(opts.appId, 'options.appId');
    return InternalWindows.createWindow(
        opts.appId,
        opts.title || opts.appId,
        opts.icon || '',
        opts.content || '',
        {
            width: opts.width,
            height: opts.height,
            minWidth: opts.minWidth,
            minHeight: opts.minHeight,
            saveState: opts.saveState
        }
    );
}

/**
 * Classic positional creation (same contract as the internal API).
 * @param {string} appId
 * @param {string} title
 * @param {string} icon SVG string
 * @param {string} content HTML string
 * @param {object} [options] { width, height, minWidth, minHeight, saveState }
 * @returns {object} window handle
 */
function createWindow(appId, title, icon, content, options) {
    requireString(appId, 'appId');
    return InternalWindows.createWindow(appId, title, icon, content, options);
}

/**
 * Look up an open window by id.
 * @param {string} id window id (e.g. "window-myApp-1694000000000")
 * @returns {object|null}
 */
function get(id) {
    requireString(id, 'id');
    return InternalWindows._getWindow(id) || null;
}

/**
 * Bring a window to the front.
 * @param {string} id
 * @returns {boolean} false when the window does not exist
 */
function focus(id) {
    const w = get(id);
    if (!w) return false;
    InternalWindows.focusWindow(id);
    return true;
}

/**
 * Minimize a window.
 * @param {string} id
 * @returns {boolean}
 */
function minimize(id) {
    requireString(id, 'id');
    return InternalWindows.setMinimized(id, true);
}

/**
 * Restore (un-minimize) a window.
 * @param {string} id
 * @returns {boolean}
 */
function restore(id) {
    requireString(id, 'id');
    return InternalWindows.setMinimized(id, false);
}

/**
 * @param {string} id
 * @returns {boolean} true when the window is currently minimized
 */
function isMinimized(id) {
    requireString(id, 'id');
    return InternalWindows.isMinimized(id);
}

/**
 * Toggle maximized state.
 * @param {string} id
 * @returns {boolean} false when the window does not exist
 */
function toggleMaximize(id) {
    const w = get(id);
    if (!w) return false;
    InternalWindows.toggleMaximize(w);
    return true;
}

/**
 * Close a window immediately (no close-handler check).
 * @param {string} id
 */
function close(id) {
    requireString(id, 'id');
    InternalWindows.closeWindow(id);
}

/**
 * Attempt to close, running the app's close handler first (may veto on
 * unsaved changes).
 * @param {string} id
 * @returns {Promise<boolean>} true when the window was closed
 */
function requestClose(id) {
    requireString(id, 'id');
    return InternalWindows.requestClose(id);
}

/**
 * Close every window of an app immediately.
 * @param {string} appId
 */
function closeAll(appId) {
    requireString(appId, 'appId');
    InternalWindows.closeAllWindows(appId);
}

/**
 * Close every window of an app through close handlers.
 * @param {string} appId
 * @returns {Promise<void>}
 */
function requestCloseAll(appId) {
    requireString(appId, 'appId');
    return InternalWindows.requestCloseAllWindows(appId);
}

/**
 * All open windows of one app.
 * @param {string} appId
 * @returns {object[]}
 */
function getByApp(appId) {
    requireString(appId, 'appId');
    return InternalWindows.getWindowsByApp(appId);
}

/**
 * Every open window in the OS.
 * @returns {object[]}
 */
function getAll() {
    return InternalWindows.getAllWindows();
}

export const WindowManager = {
    create,
    createWindow,
    get,
    focus,
    minimize,
    restore,
    isMinimized,
    toggleMaximize,
    close,
    requestClose,
    closeAll,
    requestCloseAll,
    getByApp,
    getAllWindows: getAll,
    getAll
};

export default WindowManager;
