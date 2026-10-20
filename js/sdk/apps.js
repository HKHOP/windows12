// Windows 12 SDK — Apps.
//
// Discover, launch and manage applications. Two safety rules are built in:
// installs always pass through permission consent, and uninstalls always
// ask the user first — no app can silently add or remove software.
import { Taskbar, AppMetadata } from '../modules/taskbar.js';
import AppLoader from '../modules/appLoader.js';
import InternalPermissions from '../modules/permissions.js';
import InternalDialogs from '../modules/popup.js';
import { ErrorCodes, SDKError, requireString } from './errors.js';

/**
 * Manifest copy for an app id (or null when unknown).
 * @param {string} id
 * @returns {object|null}
 */
function get(id) {
    requireString(id, 'id');
    const man = AppLoader.getManifest(id);
    return man ? { ...man } : null;
}

/**
 * Display metadata (name + icon SVG).
 * @param {string} id
 * @returns {{name, icon}}
 */
function getMetadata(id) {
    requireString(id, 'id');
    return AppMetadata.get(id);
}

/**
 * Every known manifest (builtins + store apps), each with the folder it
 * lives in (null when it is not on disk yet).
 * @returns {object[]}
 */
function getAll() {
    return AppLoader.getAll()
        .filter(e => e.manifest)
        .map(e => ({ ...e.manifest, folderPath: e.folderPath }));
}

/**
 * @param {string} id
 * @returns {boolean}
 */
function isInstalled(id) {
    requireString(id, 'id');
    return AppLoader.isInstalled(id);
}

/**
 * Open or focus an app (taskbar semantics: toggles a focused window).
 * Services can never be launched.
 *
 * An app IS a folder, so the folder is the handle: pass the app's folder
 * (a path array) to launch exactly that copy. An app id from the catalog
 * is accepted too and is resolved to its folder.
 * @param {string[]|string} target the app's folder, or an app id
 * @param {object} [options] forwarded (e.g. Settings pages)
 * @returns {Promise<boolean>} false when the app is unknown or a service
 * @throws {SDKError} NOT_FOUND when the app does not exist
 */
function launch(target, options) {
    if (Array.isArray(target)) {
        const man = AppLoader.manifestForFolder(target);
        if (!man) {
            throw new SDKError(ErrorCodes.NOT_FOUND, 'There is no app in that folder.');
        }
        return AppLoader.launch(target, options || {});
    }
    requireString(target, 'target');
    if (!AppLoader.getManifest(target)) {
        throw new SDKError(ErrorCodes.NOT_FOUND, `App "${target}" does not exist.`);
    }
    return Taskbar.openApp(target, options || {});
}

/**
 * The folder an app lives in, or null when it is not on disk.
 * @param {string} id
 * @returns {string[]|null}
 */
function folderFor(id) {
    requireString(id, 'id');
    return AppLoader.folderFor(id);
}

/**
 * Install a Store app after permission consent. Resolves false when the
 * user declines or the install cannot proceed.
 * @param {string} idOrUuid
 * @param {{scope?: 'user'|'system'}} [options] 'system' installs for all
 *        users (writes to /Program Files) and raises a UAC prompt
 * @returns {Promise<boolean>}
 */
async function install(idOrUuid, options) {
    requireString(idOrUuid, 'idOrUuid');
    const man = AppLoader.getManifest(idOrUuid) || AppLoader.getByUuid(idOrUuid);
    if (!man) {
        throw new SDKError(ErrorCodes.NOT_FOUND, `App "${idOrUuid}" does not exist.`);
    }
    if (man.distribution !== 'store') {
        throw new SDKError(ErrorCodes.INVALID_ARGS, `"${man.id}" is built-in and cannot be installed.`);
    }
    const ok = await InternalPermissions.requestInstallConsent(man.id);
    if (!ok) return false;
    const scope = options && options.scope === 'system' ? 'system' : 'user';
    try {
        return await AppLoader.install({ type: 'store', id: man.id }, { scope });
    } catch (err) {
        if (err && err.elevationDenied) return false;
        throw err;
    }
}
/**
 * Uninstall a Store app. Always confirms with the user first and wipes
 * the app's stored permission grants. System-wide installs need
 * administrator approval (UAC); declining resolves false.
 * @param {string} idOrUuid
 * @returns {Promise<boolean>} true when uninstalled
 */
async function uninstall(idOrUuid) {
    requireString(idOrUuid, 'idOrUuid');
    const man = AppLoader.getManifest(idOrUuid) || AppLoader.getByUuid(idOrUuid);
    if (!man) {
        throw new SDKError(ErrorCodes.NOT_FOUND, `App "${idOrUuid}" does not exist.`);
    }
    if (man.distribution !== 'store') {
        throw new SDKError(ErrorCodes.INVALID_ARGS, `Built-in app "${man.id}" cannot be uninstalled.`);
    }
    const ok = await InternalDialogs.confirm('Uninstall app', `Uninstall ${man.name || man.id}? Its stored data stays on disk.`);
    if (!ok) return false;
    try {
        await AppLoader.uninstall(man.id);
    } catch (err) {
        if (err && err.elevationDenied) return false;
        throw err;
    }
    try {
        InternalPermissions.clearGrants(man.id);
    } catch { /* grants already gone */ }
    return true;
}

/**
 * Manifest-declared permission ids for an app.
 * @param {string} id
 * @returns {string[]}
 */
function getPermissions(id) {
    requireString(id, 'id');
    return InternalPermissions.getDeclared(id);
}

/**
 * Grant check for one permission (builtins and undeclared always true).
 * @param {string} id
 * @param {string} perm
 * @returns {boolean}
 */
function hasPermission(id, perm) {
    requireString(id, 'id');
    requireString(perm, 'perm');
    return InternalPermissions.isGranted(id, perm);
}

export const Apps = {
    get,
    getManifest: get,
    getMetadata,
    getAll,
    isInstalled,
    launch,
    open: launch,
    folderFor,
    install,
    uninstall,
    getPermissions,
    hasPermission
};

export default Apps;
