// Windows 12 SDK — WindowManager.
//
// Stable facade over the internal window manager. Adds an object-based
// create() alongside the classic positional createWindow(), plus window
// lifecycle helpers. Windows are positioned, dragged, resized, snapped,
// minimized, maximized and persisted by the OS — the SDK only declares them.
import InternalWindows from '../modules/windowManager.js';
import { ErrorCodes, assert, requireString, requireOptions, requireFunction } from './errors.js';

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
 * @property {boolean} [resizable] show resize handles (default true)
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
            resizable: opts.resizable,
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
 * @param {string} id
 * @returns {boolean} true when the window is currently maximized
 */
function isMaximized(id) {
    requireString(id, 'id');
    return InternalWindows.isMaximized(id);
}

/**
 * Maximize a window (no-op when already maximized).
 * @param {string} id
 * @returns {boolean} false when the window does not exist
 */
function maximize(id) {
    requireString(id, 'id');
    return InternalWindows.setMaximized(id, true);
}

/**
 * Restore a maximized window to its pre-maximize bounds.
 * @param {string} id
 * @returns {boolean} false when the window does not exist
 */
function unmaximize(id) {
    requireString(id, 'id');
    return InternalWindows.setMaximized(id, false);
}

/**
 * @param {string} id
 * @returns {boolean} true when the window currently has focus
 */
function isFocused(id) {
    requireString(id, 'id');
    return InternalWindows.isFocused(id);
}

/**
 * The currently focused window, if any.
 * @returns {object|null} window handle or null
 */
function getFocused() {
    return InternalWindows.getFocused();
}

/**
 * Current box in desktop px, plus live state flags.
 * @param {string} id
 * @returns {{x:number,y:number,width:number,height:number,maximized:boolean,minimized:boolean}|null} null when missing
 */
function getBounds(id) {
    requireString(id, 'id');
    return InternalWindows.getBounds(id);
}

/**
 * Move/resize a window. Un-maximizes first so the box you set is the
 * box you get; persists + notifies like a manual gesture.
 * @param {string} id
 * @param {object} bounds any subset of { x, y, width, height }
 * @returns {boolean} false when the window does not exist
 */
function setBounds(id, bounds) {
    requireString(id, 'id');
    const b = requireOptions(bounds, 'bounds');
    for (const k of ['x', 'y', 'width', 'height']) {
        if (b[k] !== undefined) assert(Number.isFinite(b[k]), ErrorCodes.INVALID_ARGS, `bounds.${k} must be a finite number.`);
    }
    return InternalWindows.setBounds(id, b);
}

/**
 * @param {string} id
 * @returns {{x:number,y:number}|null}
 */
function getPosition(id) {
    const b = getBounds(id);
    return b ? { x: b.x, y: b.y } : null;
}

/**
 * Move a window without resizing it.
 * @param {string} id
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
function setPosition(id, x, y) {
    assert(Number.isFinite(x) && Number.isFinite(y), ErrorCodes.INVALID_ARGS, 'x and y must be finite numbers.');
    return setBounds(id, { x, y });
}

/**
 * @param {string} id
 * @returns {{width:number,height:number}|null}
 */
function getSize(id) {
    const b = getBounds(id);
    return b ? { width: b.width, height: b.height } : null;
}

/**
 * Resize a window without moving it.
 * @param {string} id
 * @param {number} width
 * @param {number} height
 * @returns {boolean}
 */
function setSize(id, width, height) {
    assert(Number.isFinite(width) && Number.isFinite(height), ErrorCodes.INVALID_ARGS, 'width and height must be finite numbers.');
    return setBounds(id, { width, height });
}

/**
 * Center a window in the usable desktop area.
 * @param {string} id
 * @returns {boolean}
 */
function center(id) {
    requireString(id, 'id');
    return InternalWindows.center(id);
}

/**
 * Usable desktop origin/size in window geometry px.
 * @returns {{ox:number,oy:number,w:number,h:number}}
 */
function getDesktopArea() {
    return InternalWindows.getDesktopArea();
}

/**
 * @param {string} id
 * @returns {boolean} true when the user can resize the window
 */
function isResizable(id) {
    requireString(id, 'id');
    return InternalWindows.isResizable(id);
}

/**
 * Lock or unlock the 8 resize handles (CSS hides them under .locked).
 * @param {string} id
 * @param {boolean} resizable
 * @returns {boolean}
 */
function setResizable(id, resizable) {
    requireString(id, 'id');
    return InternalWindows.setResizable(id, resizable !== false);
}

/**
 * @param {string} id
 * @returns {boolean} true while the user is dragging the window
 */
function isDragging(id) {
    requireString(id, 'id');
    return InternalWindows.isDragging(id);
}

/**
 * @param {string} id
 * @returns {boolean} true while the user is resizing the window
 */
function isResizing(id) {
    requireString(id, 'id');
    return InternalWindows.isResizing(id);
}

// Multi-listener fan-out over the window manager's single-slot hooks.
const dragListeners = new Set();
const resizeListeners = new Set();
const boundsListeners = new Set();
let hooksInstalled = false;

function installHooks() {
    if (hooksInstalled) return;
    hooksInstalled = true;
    InternalWindows.setOnDragStateChanged((id, dragging) => {
        for (const cb of [...dragListeners]) { try { cb(id, dragging); } catch { /* ignore */ } }
    });
    InternalWindows.setOnResizeStateChanged((id, resizing) => {
        for (const cb of [...resizeListeners]) { try { cb(id, resizing); } catch { /* ignore */ } }
    });
    InternalWindows.setOnBoundsChanged((id, bounds) => {
        for (const cb of [...boundsListeners]) { try { cb(id, bounds); } catch { /* ignore */ } }
    });
}

/**
 * Fires (id, dragging) on drag start/end of any window.
 * @param {Function} callback
 * @returns {Function} unsubscribe
 */
function onDragState(callback) {
    requireFunction(callback, 'callback');
    installHooks();
    dragListeners.add(callback);
    return () => dragListeners.delete(callback);
}

/**
 * Fires (id, resizing) on resize start/end of any window.
 * @param {Function} callback
 * @returns {Function} unsubscribe
 */
function onResizeState(callback) {
    requireFunction(callback, 'callback');
    installHooks();
    resizeListeners.add(callback);
    return () => resizeListeners.delete(callback);
}

/**
 * Fires (id, bounds) after any committed move/resize/maximize/restore,
 * whether by gesture or by setBounds/center.
 * @param {Function} callback
 * @returns {Function} unsubscribe
 */
function onBoundsChanged(callback) {
    requireFunction(callback, 'callback');
    installHooks();
    boundsListeners.add(callback);
    return () => boundsListeners.delete(callback);
}

/**
 * Rename a window's title bar in place.
 * @param {string} id
 * @param {string} title
 * @returns {boolean}
 */
function setTitle(id, title) {
    requireString(id, 'id');
    requireString(title, 'title');
    return InternalWindows.setTitle(id, title);
}

/**
 * Change the minimum size enforced by the resize handles and setBounds.
 * @param {string} id
 * @param {number} minWidth
 * @param {number} minHeight
 * @returns {boolean}
 */
function setMinSize(id, minWidth, minHeight) {
    requireString(id, 'id');
    assert(Number.isFinite(minWidth) && Number.isFinite(minHeight), ErrorCodes.INVALID_ARGS, 'minWidth and minHeight must be finite numbers.');
    return InternalWindows.setMinSize(id, minWidth, minHeight);
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
    isFocused,
    getFocused,
    minimize,
    restore,
    isMinimized,
    toggleMaximize,
    maximize,
    unmaximize,
    isMaximized,
    getBounds,
    setBounds,
    getPosition,
    setPosition,
    getSize,
    setSize,
    center,
    getDesktopArea,
    isResizable,
    setResizable,
    isDragging,
    isResizing,
    onDragState,
    onResizeState,
    onBoundsChanged,
    setTitle,
    setMinSize,
    close,
    requestClose,
    closeAll,
    requestCloseAll,
    getByApp,
    getAllWindows: getAll,
    getAll
};

export default WindowManager;
