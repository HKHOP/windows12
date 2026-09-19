// Windows 12 SDK — PointerLock.
//
// Mouse-capture for games and canvas tools, with the OS integration apps
// can't do themselves: while a pointer is locked the OS virtual touchpad
// cursor is parked (hidden), and it is restored on unlock — so the virtual
// cursor can't drift over the window while the hardware mouse drives the
// camera.
//
//   const app = createApp({ id: 'myGame' });
//   canvas.addEventListener('mousedown', () => app.pointerLock.request(canvas));
//   app.pointerLock.onChange(({ locked }) => locked ? resume() : pause());
//
// Browsers enforce a short cooldown after Esc exits a lock; a too-fast
// re-request rejects with PERMISSION_DENIED (details.name ===
// 'SecurityError'). Catch it and show your pause screen — do not spin-retry.
import InternalWindows from '../modules/windowManager.js';
import InternalCursor from '../modules/cursor.js';
import { ErrorCodes, SDKError, requireFunction } from './errors.js';

const changeListeners = new Set();
let installed = false;
let parkedCursor = null; // previous Cursor override while a lock is active

function install() {
    if (installed) return;
    installed = true;
    document.addEventListener('pointerlockchange', () => {
        const el = document.pointerLockElement;
        if (el) {
            try {
                parkedCursor = InternalCursor.get();
                InternalCursor.set('none');
            } catch { parkedCursor = null; }
        } else if (parkedCursor !== null) {
            try {
                if (parkedCursor === 'auto') InternalCursor.reset();
                else InternalCursor.set(parkedCursor);
            } catch { /* cursor module unavailable */ }
            parkedCursor = null;
        }
        emit({ element: el || null, locked: !!el });
    });
    document.addEventListener('pointerlockerror', () => {
        emit({ element: null, locked: false, error: true });
    });
}

function emit(detail) {
    for (const cb of [...changeListeners]) {
        try { cb(detail); } catch (err) { console.error('[Windows12 SDK] pointerLock change handler threw', err); }
    }
}

function elementInAppWindow(element, appId) {
    try {
        return InternalWindows.getWindowsByApp(appId).some((w) => {
            try { return w.element === element || w.element.contains(element); } catch { return false; }
        });
    } catch { return false; }
}

/**
 * Request pointer lock on an element (usually your canvas). Must be called
 * from a user gesture (click/keydown). When appId is given, the element
 * must live inside one of that app's windows.
 * @param {Element} element
 * @param {string} [appId] owning app id (validated)
 * @returns {Promise<boolean>} true once locked
 * @throws {SDKError} INVALID_ARGS (bad element), NOT_FOUND (unknown appId
 *   window containment), PERMISSION_DENIED (foreign element or browser
 *   refusal, e.g. the re-lock cooldown), UNSUPPORTED (no pointer lock API)
 */
async function request(element, appId) {
    if (!element || typeof element !== 'object' || typeof element.requestPointerLock !== 'function') {
        throw new SDKError(ErrorCodes.INVALID_ARGS,
            'request() needs an Element that supports requestPointerLock() (usually a <canvas>).');
    }
    if (appId !== undefined && appId !== null) {
        if (typeof appId !== 'string') throw new SDKError(ErrorCodes.INVALID_ARGS, 'appId must be a string.');
        if (!elementInAppWindow(element, appId)) {
            throw new SDKError(ErrorCodes.PERMISSION_DENIED,
                `"${appId}" may only pointer-lock elements inside its own windows.`);
        }
    }
    if (typeof document === 'undefined' || !('pointerLockElement' in document)) {
        throw new SDKError(ErrorCodes.UNSUPPORTED, 'This device does not support pointer lock.');
    }
    install();
    try {
        const result = element.requestPointerLock();
        if (result && typeof result.then === 'function') await result;
        return true;
    } catch (e) {
        const name = (e && e.name) || 'UnknownError';
        if (name === 'SecurityError' || name === 'NotAllowedError') {
            throw new SDKError(ErrorCodes.PERMISSION_DENIED,
                `The browser refused pointer lock (${name}). This happens when the request is not inside a user gesture, or within the browser's re-lock cooldown right after Esc — show your pause screen and let the user click again.`, { name });
        }
        throw new SDKError(ErrorCodes.UNSUPPORTED, `Pointer lock failed (${name}).`, { name });
    }
}

/**
 * Release the lock, if any.
 * @returns {boolean} true when something was locked
 */
function exit() {
    if (typeof document === 'undefined' || !document.pointerLockElement) return false;
    try { document.exitPointerLock(); } catch { return false; }
    return true;
}

/**
 * @param {Element} [element] when given, true only if THAT element is locked
 * @returns {boolean}
 */
function isLocked(element) {
    if (typeof document === 'undefined') return false;
    const el = document.pointerLockElement;
    if (!el) return false;
    return element ? el === element : true;
}

/**
 * Fires ({ element, locked, error? }) on every lock/unlock (and on
 * pointerlockerror). Use this to pause/resume: losing the lock (Esc) means
 * the user wants your pause screen.
 * @param {Function} callback
 * @returns {Function} unsubscribe
 */
function onChange(callback) {
    requireFunction(callback, 'callback');
    install();
    changeListeners.add(callback);
    return () => changeListeners.delete(callback);
}

export const PointerLock = { request, exit, isLocked, onChange };
export default PointerLock;
