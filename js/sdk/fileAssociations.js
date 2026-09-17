// Windows 12 SDK — FileAssociations.
//
// Declare which file types your app opens (also declare them in
// manifest.json "associations" so the OS wires them at boot), query open
// candidates, and read/write the user's "Always use this app" defaults.
import InternalAssociations from '../modules/fileAssociations.js';
import { ErrorCodes, SDKError, requireString, requireFunction } from './errors.js';

/**
 * Register extensions handled by your app. Prefer the manifest — use this
 * only for dynamic (runtime-decided) handling.
 * @param {string} appId
 * @param {string[]} extensions without dots, e.g. ['md', 'markdown']
 * @param {Function} openFn (path, content) => void
 */
function register(appId, extensions, openFn) {
    requireString(appId, 'appId');
    if (!Array.isArray(extensions) || extensions.length === 0 || !extensions.every(e => typeof e === 'string')) {
        throw new SDKError(ErrorCodes.INVALID_ARGS, 'extensions must be a non-empty string array.');
    }
    requireFunction(openFn, 'openFn');
    InternalAssociations.register(appId, extensions, openFn);
}

/**
 * Remove all registrations for an app.
 * @param {string} appId
 */
function unregister(appId) {
    requireString(appId, 'appId');
    InternalAssociations.unregister(appId);
}

/**
 * Ordered open candidates for an extension (manifest handler first).
 * @param {string} extension without dot
 * @returns {Array<{appId,kind,openFn}>}
 */
function getCandidates(extension) {
    requireString(extension, 'extension');
    return InternalAssociations.getCandidates(extension);
}

/**
 * Every app id that can open anything.
 * @returns {string[]}
 */
function getAllCapable() {
    return InternalAssociations.getAllCapable();
}

/**
 * The user's persisted default app for an extension (absent when revoked
 * or the app is gone).
 * @param {string} extension
 * @returns {string|null} app id
 */
function getDefault(extension) {
    requireString(extension, 'extension');
    return InternalAssociations.getDefault(extension);
}

/**
 * Persist an "Always use this app" choice (must be a real candidate).
 * @param {string} extension
 * @param {string} appId
 * @returns {boolean}
 */
function setDefault(extension, appId) {
    requireString(extension, 'extension');
    requireString(appId, 'appId');
    return InternalAssociations.setDefault(extension, appId);
}

/**
 * Forget the stored default for an extension.
 * @param {string} extension
 * @returns {boolean}
 */
function clearDefault(extension) {
    requireString(extension, 'extension');
    return InternalAssociations.clearDefault(extension);
}

/**
 * All registered extensions.
 * @returns {string[]}
 */
function getSupportedExtensions() {
    return InternalAssociations.getSupportedExtensions();
}

export const FileAssociations = {
    register,
    unregister,
    getCandidates,
    getAllCapable,
    getDefault,
    setDefault,
    clearDefault,
    getSupportedExtensions
};

export default FileAssociations;
