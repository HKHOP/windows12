// Windows 12 SDK — Permissions.
//
// Read-only visibility into the manifest permission system, plus guard
// helpers. Grants are user-owned: installs ask consent, Settings > Apps
// revokes. The SDK never silently grants — require() throws instead of
// bypassing, so missing capability fails loud and early.
import InternalPermissions from '../modules/permissions.js';
import { ErrorCodes, SDKError, requireString } from './errors.js';

/**
 * The five known permission ids.
 * @returns {string[]}
 */
function known() {
    return Object.keys(InternalPermissions.getCatalog());
}

/**
 * Manifest-declared permissions for an app.
 * @param {string} appId
 * @returns {string[]}
 */
function getDeclared(appId) {
    requireString(appId, 'appId');
    return InternalPermissions.getDeclared(appId);
}

/**
 * Grant check: builtins and undeclared capabilities are always true;
 * declared ones are true unless the user revoked them.
 * @param {string} appId
 * @param {string} perm
 * @returns {boolean}
 */
function has(appId, perm) {
    requireString(appId, 'appId');
    requireString(perm, 'perm');
    return InternalPermissions.isGranted(appId, perm);
}

/**
 * Throw PERMISSION_DENIED unless the app holds the permission.
 * @param {string} appId
 * @param {string} perm
 * @throws {SDKError} PERMISSION_DENIED
 */
function require(appId, perm) {
    if (!has(appId, perm)) {
        throw new SDKError(ErrorCodes.PERMISSION_DENIED,
            `"${appId}" needs the "${perm}" permission. Declare it in manifest.json and handle the user revoking it.`);
    }
    return true;
}

/**
 * Install-time consent dialog for an app's declared permissions.
 * Resolves false when the user declines (or nothing is declared → true).
 * @param {string} appId
 * @returns {Promise<boolean>}
 */
function request(appId) {
    requireString(appId, 'appId');
    return InternalPermissions.requestInstallConsent(appId);
}

/**
 * Catalog metadata { id: { label, description } } for consent UI.
 * @returns {object}
 */
function catalog() {
    return InternalPermissions.getCatalog();
}

/**
 * 16px SVG icon for a permission id (consent/settings rows).
 * @param {string} perm
 * @returns {string}
 */
function iconFor(perm) {
    requireString(perm, 'perm');
    return InternalPermissions.iconFor(perm);
}

export const Permissions = {
    known,
    getDeclared,
    has,
    require,
    request,
    requestInstallConsent: request,
    catalog,
    getCatalog: catalog,
    iconFor
};

export default Permissions;
