// Windows 12 SDK — Lifecycle.
//
// Window-close interception plus documentation of the manifest-declared
// background hooks. Supported states are exactly what the OS supports —
// nothing is invented here.
//
// Close: register ONE handler per app id. It runs before any of your
// windows closes; return false (or a Promise resolving false) to veto,
// e.g. on unsaved changes. Recovery Restart bypasses vetoes by design.
//
// Background (manifest "background": true, or the "background"
// permission): export any of these from main.js and the OS calls them —
///   onBackground()  entered headless mode: start timers/listeners, open NO windows
//   onForeground()  about to return to a window
//   onShutdown()    headless execution stopping: clear timers/listeners
// Headless state persists across boot; services (manifest "service": true)
// never open windows at all.
import InternalWindows from '../modules/windowManager.js';
import { requireString, requireFunction } from './errors.js';

/**
 * Register a close interceptor for your app id. Replaces any previous one.
 * @param {string} appId
 * @param {(windowData) => (boolean|void|Promise<boolean|void>)} handler return false to veto
 */
function onClose(appId, handler) {
    requireString(appId, 'appId');
    requireFunction(handler, 'handler');
    InternalWindows.setCloseHandler(appId, handler);
}

/**
 * Remove your app's close interceptor.
 * @param {string} appId
 */
function offClose(appId) {
    requireString(appId, 'appId');
    InternalWindows.removeCloseHandler(appId);
}

/**
 * Register a close interceptor for ONE window (runs before the app-level
 * onClose handler; any veto aborts just this window). Several hooks may
 * coexist — each is awaited, and any false vetoes the close.
 * @param {string} windowId
 * @param {(windowData) => (boolean|void|Promise<boolean|void>)} handler return false to veto
 * @returns {Function|null} unsubscribe (null when the window does not exist)
 */
function onWindowClose(windowId, handler) {
    requireString(windowId, 'windowId');
    requireFunction(handler, 'handler');
    return InternalWindows.addWindowCloseHook(windowId, handler);
}

/**
 * Remove a previously registered per-window close hook.
 * @param {string} windowId
 * @param {Function} handler
 */
function offWindowClose(windowId, handler) {
    requireString(windowId, 'windowId');
    requireFunction(handler, 'handler');
    InternalWindows.removeWindowCloseHook(windowId, handler);
}

export const Lifecycle = {
    onClose,
    offClose,
    onWindowClose,
    offWindowClose
};

export default Lifecycle;
