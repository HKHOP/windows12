// Windows 12 SDK — Background execution.
//
// Headless operation for apps that declare it (manifest "background":
// true, the "background" permission, or "service": true). Going
// background closes your windows through close handlers — a veto aborts.
// Your main.js onBackground/onForeground/onShutdown hooks (see
// Lifecycle) do the actual work; this namespace only moves you between
// states. Autostart toggles live in Task Manager > Startup.
import InternalBackground from '../modules/backgroundApps.js';
import { requireString } from './errors.js';

/**
 * Can this app ever run headless (manifest capability)?
 * @param {string} appId
 * @returns {boolean}
 */
function canRun(appId) {
    requireString(appId, 'appId');
    return InternalBackground.canRunBackground(appId);
}

/**
 * Is this id a windowless-only service?
 * @param {string} appId
 * @returns {boolean}
 */
function isService(appId) {
    requireString(appId, 'appId');
    return InternalBackground.isService(appId);
}

/**
 * Is this app headless right now?
 * @param {string} appId
 * @returns {boolean}
 */
function isBackground(appId) {
    requireString(appId, 'appId');
    return InternalBackground.isBackground(appId);
}

/**
 * All currently headless app ids.
 * @returns {string[]}
 */
function running() {
    return InternalBackground.getBackgroundApps();
}

/**
 * Close your windows (through close handlers) and run headless.
 * @param {string} appId
 * @returns {Promise<boolean>} false when the manifest forbids it or a close vetoed
 */
function goBackground(appId) {
    requireString(appId, 'appId');
    return InternalBackground.requestBackground(appId);
}

/**
 * Stop headless mode and open a window. Never works for services.
 * @param {string} appId
 * @returns {boolean}
 */
function bringToForeground(appId) {
    requireString(appId, 'appId');
    return InternalBackground.bringToForeground(appId);
}

/**
 * Start headless without ever opening a window.
 * @param {string} appId
 * @returns {Promise<boolean>}
 */
function startService(appId) {
    requireString(appId, 'appId');
    return InternalBackground.startService(appId);
}

/**
 * Stop headless execution.
 * @param {string} appId
 * @returns {Promise<boolean>}
 */
function stopService(appId) {
    requireString(appId, 'appId');
    return InternalBackground.stopService(appId);
}

export const Background = {
    canRun,
    canRunBackground: canRun,
    isService,
    isBackground,
    running,
    getBackgroundApps: running,
    goBackground,
    requestBackground: goBackground,
    bringToForeground,
    startService,
    stopService
};

export default Background;
