// Windows 12 SDK — System tray.
//
// Apps that can run in the background (manifest "background": true, the
// "background" permission, or "service": true) may register icons in the
// taskbar notification area. An icon can have click / double-click /
// right-click handlers, a context menu, a tooltip and a live icon + badge,
// and it keeps working while the app runs headless with no window open.
//
//   const icon = app.tray.register({
//       id: 'status',
//       icon: '<svg …>',                 // inline SVG / URL / { app, action, setting }
//       tooltip: 'My App',
//       badge: 3,
//       onClick: () => openSomething(),
//       menu: [{ label: 'Quit', action: () => app.tray.remove('status') }]
//   });
//   icon.setIcon(nextSvg).setTooltip('Busy').setBadge(0);
//   icon.remove();
//
// The tray requires background capability — otherwise an icon could not
// survive the app closing its window, which is the whole point. Missing
// capability throws PERMISSION_DENIED.
import InternalTray from '../modules/tray.js';
import { ErrorCodes, SDKError, requireFunction, requireOptions, requireString } from './errors.js';

function assertCapability(appId) {
    if (!InternalTray.canUse(appId)) {
        throw new SDKError(ErrorCodes.PERMISSION_DENIED,
            `"${appId}" needs background access to use tray icons. Add "background": true to its manifest.json (or the "background" permission).`);
    }
}

function validateSpec(spec) {
    const s = requireOptions(spec, 'spec');
    if (s.id !== undefined && s.id !== null) requireString(s.id, 'spec.id');
    if (s.icon !== undefined && s.icon !== null && typeof s.icon !== 'string' && typeof s.icon !== 'object') {
        throw new SDKError(ErrorCodes.INVALID_ARGS,
            'spec.icon must be an SVG string, a URL string, or an icon descriptor ({ svg, app, action, setting, url }).');
    }
    for (const key of ['onClick', 'onDoubleClick', 'onContextMenu']) {
        if (s[key] !== undefined && s[key] !== null) requireFunction(s[key], `spec.${key}`);
    }
    if (s.menu !== undefined && s.menu !== null && typeof s.menu !== 'function' && !Array.isArray(s.menu)) {
        throw new SDKError(ErrorCodes.INVALID_ARGS, 'spec.menu must be an array of items or a function returning one.');
    }
    return s;
}

/**
 * Whether an app may register tray icons (background capability).
 * @param {string} appId
 * @returns {boolean}
 */
function canUse(appId) {
    requireString(appId, 'appId');
    return InternalTray.canUse(appId);
}

/**
 * Register a tray icon.
 * @param {string} appId
 * @param {object} [spec] { id, icon, tooltip, badge, visible, menu, onClick, onDoubleClick, onContextMenu }
 * @returns {object} handle: { id, appId, element, setIcon, setTooltip, setBadge, setVisible, setMenu, onClick, onDoubleClick, onContextMenu, update, remove }
 * @throws {SDKError} PERMISSION_DENIED when the app cannot run in the background
 */
function register(appId, spec) {
    requireString(appId, 'appId');
    assertCapability(appId);
    const s = validateSpec(spec);
    const handle = InternalTray.register(appId, s);
    if (!handle) {
        throw new SDKError(ErrorCodes.UNSUPPORTED, 'The system tray is not available.');
    }
    return handle;
}

/**
 * Register several icons at once.
 * @param {string} appId
 * @param {object[]} specs
 * @returns {object[]} handles
 */
function registerMany(appId, specs) {
    requireString(appId, 'appId');
    if (!Array.isArray(specs)) {
        throw new SDKError(ErrorCodes.INVALID_ARGS, 'specs must be an array of icon specs.');
    }
    return specs.map((spec) => register(appId, spec));
}

/**
 * Live-update an icon (icon / tooltip / badge / visibility / handlers / menu).
 * @param {string} appId
 * @param {string} iconId
 * @param {object} patch
 * @returns {object} handle
 * @throws {SDKError} NOT_FOUND when that icon is not registered
 */
function update(appId, iconId, patch) {
    requireString(appId, 'appId');
    requireString(iconId, 'iconId');
    assertCapability(appId);
    const handle = InternalTray.update(appId, iconId, requireOptions(patch, 'patch'));
    if (!handle) {
        throw new SDKError(ErrorCodes.NOT_FOUND, `No tray icon "${iconId}" is registered by "${appId}".`);
    }
    return handle;
}

/**
 * Remove one icon.
 * @param {string} appId
 * @param {string} iconId
 * @returns {boolean}
 */
function remove(appId, iconId) {
    requireString(appId, 'appId');
    requireString(iconId, 'iconId');
    return InternalTray.remove(appId, iconId);
}

/**
 * Remove every icon registered by the app.
 * @param {string} appId
 * @returns {number} how many were removed
 */
function removeAll(appId) {
    requireString(appId, 'appId');
    return InternalTray.removeAll(appId);
}

/**
 * @param {string} appId
 * @param {string} iconId
 * @returns {object|null} handle or null
 */
function get(appId, iconId) {
    requireString(appId, 'appId');
    requireString(iconId, 'iconId');
    return InternalTray.get(appId, iconId);
}

/**
 * @param {string} appId
 * @returns {object[]} handles
 */
function list(appId) {
    requireString(appId, 'appId');
    return InternalTray.list(appId);
}

export const Tray = {
    canUse,
    register,
    registerMany,
    update,
    remove,
    removeAll,
    get,
    list
};

export default Tray;
