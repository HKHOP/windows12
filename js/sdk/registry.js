// Windows 12 SDK — Registry.
//
// The registry is the machine's settings database, Windows style: hives
// (HKLM, HKCU, HKCR, HKU, HKCC), keys and values.
//
//     Registry.get('HKLM\\Software\\Windows 12\\Apps\\notepad', 'Path')
//     Registry.set('HKCU\\Software\\MyApp', 'Theme', 'REG_SZ', 'dark')
//
// An app may always use its own key, HKCU\Software\<its id>. Any other key
// needs the 'registry' permission.
import InternalRegistry from '../modules/registry.js';
import { ErrorCodes, SDKError, requireString } from './errors.js';

function needPath(path, name) {
    requireString(path, name);
    if (!InternalRegistry.parsePath(path)) {
        throw new SDKError(ErrorCodes.INVALID_ARGS, `${name} must be a registry path like 'HKLM\\Software\\Windows 12'.`);
    }
    return path;
}

/**
 * The hives: [{ name, short, label }].
 * @returns {Array<{name: string, short: string, label: string}>}
 */
function hives() {
    return InternalRegistry.hives();
}

/**
 * The value kinds: { REG_SZ: 'String', … }.
 * @returns {object}
 */
function kinds() {
    return InternalRegistry.kinds();
}

/**
 * Everything about a key: its values, its subkeys and its timestamps.
 * @param {string} path
 * @returns {object|null} null when the key does not exist
 */
function key(path) {
    needPath(path, 'path');
    return InternalRegistry.keyInfo(path);
}

/**
 * The subkey names of a key.
 * @param {string} path
 * @returns {string[]}
 */
function keys(path) {
    needPath(path, 'path');
    return InternalRegistry.keys(path);
}

/**
 * The values of a key: [{ name, kind, data, modified }].
 * @param {string} path
 * @returns {object[]}
 */
function values(path) {
    needPath(path, 'path');
    return InternalRegistry.values(path);
}

/**
 * One value.
 * @param {string} path
 * @param {string} [name] the value name ('(Default)' when omitted)
 * @returns {object|null}
 */
function get(path, name) {
    needPath(path, 'path');
    return InternalRegistry.get(path, name);
}

/**
 * A value as a string.
 * @param {string} path
 * @param {string} [name]
 * @param {string} [fallback]
 * @returns {string|null}
 */
function getString(path, name, fallback) {
    needPath(path, 'path');
    return InternalRegistry.getString(path, name, fallback);
}

/**
 * Writes a value, creating the key if needed.
 * @param {string} path
 * @param {string} name the value name ('(Default)' when omitted)
 * @param {string} kind REG_SZ, REG_EXPAND_SZ, REG_MULTI_SZ, REG_DWORD, REG_QWORD, REG_BINARY
 * @param {any} data
 * @returns {boolean} false when the app may not write there
 */
function set(path, name, kind, data) {
    needPath(path, 'path');
    requireString(name, 'name');
    requireString(kind, 'kind');
    return InternalRegistry.set(path, name, kind, data);
}

/**
 * Creates a key (and every missing parent).
 * @param {string} path
 * @returns {boolean}
 */
function createKey(path) {
    needPath(path, 'path');
    return InternalRegistry.createKey(path);
}

/**
 * Deletes a key and everything under it.
 * @param {string} path
 * @returns {boolean}
 */
function deleteKey(path) {
    needPath(path, 'path');
    return InternalRegistry.deleteKey(path);
}

/**
 * Deletes one value.
 * @param {string} path
 * @param {string} name
 * @returns {boolean}
 */
function deleteValue(path, name) {
    needPath(path, 'path');
    requireString(name, 'name');
    return InternalRegistry.deleteValue(path, name);
}

/**
 * Renames a key.
 * @param {string} path
 * @param {string} newName
 * @returns {boolean}
 */
function renameKey(path, newName) {
    needPath(path, 'path');
    requireString(newName, 'newName');
    return InternalRegistry.renameKey(path, newName);
}

/**
 * Renames a value.
 * @param {string} path
 * @param {string} name
 * @param {string} newName
 * @returns {boolean}
 */
function renameValue(path, name, newName) {
    needPath(path, 'path');
    requireString(name, 'name');
    requireString(newName, 'newName');
    return InternalRegistry.renameValue(path, name, newName);
}

/**
 * A key as a .reg file (Windows text format).
 * @param {string} path
 * @returns {string|null}
 */
function exportKey(path) {
    needPath(path, 'path');
    return InternalRegistry.exportKey(path);
}

/**
 * Imports a .reg file.
 * @param {string} text
 * @returns {boolean} true when something changed
 */
function importKey(text) {
    requireString(text, 'text');
    return InternalRegistry.importReg(text);
}

/**
 * Searches keys and values.
 * @param {string} term
 * @returns {Array<{path: string, name: string|null, kind: string, data: any}>}
 */
function search(term) {
    requireString(term, 'term');
    return InternalRegistry.search(term);
}

/**
 * The apps registered on this machine.
 * @returns {Array<{id: string, path: string, version: string, name: string, scope: string, user: string|null}>}
 */
function apps() {
    return InternalRegistry.registeredApps();
}

/**
 * The path a key is shown with, the way regedit does it.
 * @param {string} path
 * @returns {string}
 */
function displayPath(path) {
    needPath(path, 'path');
    return InternalRegistry.displayPath(path);
}

// The registry as an app sees it: the same namespace, plus the app's own key
// (HKCU\Software\<its id>), which it may always use.
export function bindRegistry(appId) {
    const own = 'HKCU\\Software\\' + appId;
    return {
        ...Registry,
        ownKey: () => own,
        own: () => InternalRegistry.keyInfo(own)
    };
}

export const Registry = {
    hives,
    kinds,
    key,
    keys,
    values,
    get,
    getString,
    set,
    createKey,
    deleteKey,
    deleteValue,
    renameKey,
    renameValue,
    exportKey,
    importKey,
    import: importKey,
    search,
    apps,
    displayPath
};

export default Registry;