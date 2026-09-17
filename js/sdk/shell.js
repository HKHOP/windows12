// Windows 12 SDK — Shell.
//
// Shell chrome: icons, context menus, file opening and activity tracking.
// Pure reuse of the OS icon library, menu, association and recency
// systems — nothing is reimplemented here.
import AppIcons from '../modules/appIcons.js';
import UIIcons from '../modules/uiIcons.js';
import InternalMenu from '../modules/contextMenu.js';
import InternalAssociations from '../modules/fileAssociations.js';
import InternalActivity from '../modules/userActivity.js';
import { ErrorCodes, SDKError, requireString, requireOptions } from './errors.js';

function needPath(path, name) {
    if (!Array.isArray(path) || path.length === 0) {
        throw new SDKError(ErrorCodes.INVALID_ARGS, `${name} must be a path array like ['/', 'users', 'default'].`);
    }
    return path;
}

const icons = {
    /**
     * App tile icon SVG by app id.
     * @param {string} id
     * @returns {string} SVG string (empty when unknown)
     */
    app(id) {
        requireString(id, 'id');
        return AppIcons.get(id) || '';
    },
    /**
     * Outline action glyph for menus/buttons (inherits currentColor).
     * @param {string} name e.g. 'open', 'copy', 'delete', 'pin'
     * @param {number} [size] default 16
     * @returns {string} SVG string
     */
    action(name, size) {
        requireString(name, 'name');
        return UIIcons.action(name, size === undefined ? 16 : size);
    },
    /**
     * Colored document icon for a file extension.
     * @param {string} ext
     * @param {string} [fileName]
     * @param {number} [size] default 32
     * @returns {string} SVG string
     */
    file(ext, fileName, size) {
        requireString(ext, 'ext');
        return UIIcons.file(ext, fileName, size === undefined ? 32 : size);
    },
    /**
     * Colored Fluent-style folder icon.
     * @param {string} name
     * @param {number} [size] default 32
     * @returns {string} SVG string
     */
    folder(name, size) {
        requireString(name, 'name');
        return UIIcons.folder(name, size === undefined ? 32 : size);
    },
    /**
     * Compact sidebar place icon.
     * @param {string} name e.g. 'Documents', 'Recycle Bin'
     * @param {number} [size] default 16
     * @returns {string} SVG string
     */
    sidebar(name, size) {
        requireString(name, 'name');
        return UIIcons.sidebar(name, size === undefined ? 16 : size);
    },
    /**
     * Settings-style outline glyph.
     * @param {string} name e.g. 'notifications', 'multitasking', 'power'
     * @param {number} [size] default 20
     * @returns {string} SVG string
     */
    setting(name, size) {
        requireString(name, 'name');
        return UIIcons.setting(name, size === undefined ? 20 : size);
    }
};

/**
 * Show a context menu. Items: { label, icon?, shortcut?, action?, disabled? } or 'separator'.
 * @param {number} x clientX
 * @param {number} y clientY
 * @param {Array} items
 */
function contextMenu(x, y, items) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new SDKError(ErrorCodes.INVALID_ARGS, 'contextMenu() needs numeric x and y (usually e.clientX / e.clientY).');
    }
    if (!Array.isArray(items)) {
        throw new SDKError(ErrorCodes.INVALID_ARGS, 'contextMenu() needs an items array.');
    }
    InternalMenu.show(x, y, items);
}

const files = {
    /**
     * Open a file with its resolved default app. Returns false when nothing
     * claims the type.
     * @param {string[]} path
     * @param {Function} [onOpened] (appId) => void, for recency tracking
     * @returns {boolean}
     */
    open(path, onOpened) {
        needPath(path, 'path');
        return InternalAssociations.openDefault(path, onOpened);
    },
    /**
     * Full "How do you want to open this?" dialog (recommended badges,
     * More apps, Always-use persistence).
     * @param {string[]} path
     * @param {Function} [onOpened]
     */
    openWith(path, onOpened) {
        needPath(path, 'path');
        InternalAssociations.openWithDialog(path, onOpened);
    },
    /**
     * Open with one specific capable app id.
     * @param {string[]} path
     * @param {string} appId
     * @param {Function} [onOpened]
     * @returns {boolean}
     */
    openWithApp(path, appId, onOpened) {
        needPath(path, 'path');
        requireString(appId, 'appId');
        return InternalAssociations.openWith(path, appId, onOpened);
    }
};

const activity = {
    /**
     * Record a file open (feeds Start > Recommended).
     * @param {string[]} path
     * @param {string} name
     */
    trackFileOpen(path, name) {
        needPath(path, 'path');
        requireString(name, 'name');
        InternalActivity.trackFileOpen(path, name);
    },
    /**
     * Record an app open (feeds Start > Recommended).
     * @param {string} appId
     */
    trackAppOpen(appId) {
        requireString(appId, 'appId');
        InternalActivity.trackAppOpen(appId);
    },
    /**
     * Recent items for Start > Recommended (up to 6).
     * @returns {Array}
     */
    recommended() {
        return InternalActivity.getRecommended();
    }
};

export const Shell = {
    icons,
    contextMenu,
    showContextMenu: contextMenu,
    files,
    openFile: files.open,
    openWith: files.openWith,
    activity
};

export default Shell;
