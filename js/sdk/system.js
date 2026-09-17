// Windows 12 SDK — System.
//
// Read-only OS facts plus the two user-visible appearance settings. Window
// metrics, scaling and taskbar internals stay internal.
import WindowsUpdate from '../modules/windowsUpdate.js';
import InternalConfig from '../modules/systemConfig.js';
import { ErrorCodes, SDKError, requireString } from './errors.js';

/**
 * OS identity + build info.
 * @returns {{name, version, build}}
 */
function info() {
    let version = '12.0.4000';
    try {
        version = WindowsUpdate.getCurrentVersion() || version;
    } catch { /* version module unavailable */ }
    return {
        name: 'Windows 12',
        version,
        build: String(version).replace(/\./g, '')
    };
}

/**
 * Current UI theme.
 * @returns {'dark'|'light'}
 */
function theme() {
    return InternalConfig.get('darkMode') === false ? 'light' : 'dark';
}

/**
 * Switch UI theme. This is a visible user setting — only call it from a
 * user action (e.g. your app's own theme toggle).
 * @param {'dark'|'light'} mode
 */
function setTheme(mode) {
    if (mode !== 'dark' && mode !== 'light') {
        throw new SDKError(ErrorCodes.INVALID_ARGS, 'mode must be "dark" or "light".');
    }
    InternalConfig.set('darkMode', mode === 'dark');
}

/**
 * Current accent color hex.
 * @returns {string}
 */
function accent() {
    return InternalConfig.get('accentColor');
}

/**
 * Set the OS accent color (visible user setting — user action only).
 * @param {string} color CSS color string
 */
function setAccent(color) {
    requireString(color, 'color');
    InternalConfig.set('accentColor', color);
}

export const System = {
    info,
    version: info,
    theme,
    setTheme,
    accent,
    setAccent
};

export default System;
