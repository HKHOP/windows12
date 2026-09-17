// Windows 12 SDK — Settings.
//
// Read user settings freely. Writes go through the same validated path as
// the Settings app. Sensitive keys are NOT specially gated by the OS
// today, so treat set() as a user-trust operation: change only what your
// app owns or what the user explicitly asked to change, and prefer
// app-local storage (createApp().files.settings) for your own prefs.
import InternalConfig from '../modules/systemConfig.js';
import { Taskbar } from '../modules/taskbar.js';
import { ErrorCodes, SDKError, requireString } from './errors.js';

/** Keys no third-party app should touch (documented, not force-blocked — the OS has no kernel boundary). */
const SENSITIVE_KEYS = ['displayResolution', 'displayOrientation', 'scaling'];

/**
 * Read one setting.
 * @param {string} key
 * @returns {any}
 */
function get(key) {
    requireString(key, 'key');
    return InternalConfig.get(key);
}

/**
 * Read all settings as a plain object.
 * @returns {object}
 */
function getAll() {
    return InternalConfig.getAll();
}

/**
 * Write one setting (applies + persists immediately).
 * @param {string} key
 * @param {any} value
 * @throws {SDKError} PERMISSION_DENIED for sensitive display keys
 */
function set(key, value) {
    requireString(key, 'key');
    if (SENSITIVE_KEYS.includes(key)) {
        throw new SDKError(ErrorCodes.PERMISSION_DENIED,
            `Setting "${key}" is privileged. Send the user to Settings instead (Settings.openPage('system')).`);
    }
    InternalConfig.set(key, value);
}

/**
 * Open the Settings app.
 */
function open() {
    Taskbar.openApp('settings');
}

/**
 * Open Settings on a page, e.g. openPage('personalization').
 * @param {string} page
 * @param {string} [subPage]
 */
function openPage(page, subPage) {
    requireString(page, 'page');
    Taskbar.openApp('settings', subPage ? { page, subPage } : { page });
}

export const Settings = {
    get,
    getAll,
    set,
    open,
    openPage
};

export default Settings;
