// Windows 12 SDK — Dialogs.
//
// Modal dialogs with normalized names. All methods return Promises — use
// await. Never use native alert()/confirm()/prompt().
import InternalPopup from '../modules/popup.js';
import { requireString, requireOptions } from './errors.js';

/**
 * Informational dialog with an OK button.
 * @param {string} title
 * @param {string} message
 * @returns {Promise<'ok'>}
 */
function alert(title, message) {
    requireString(title, 'title');
    return InternalPopup.info(title, String(message ?? ''));
}

/**
 * Warning dialog with an OK button.
 * @param {string} title
 * @param {string} message
 * @returns {Promise<'ok'>}
 */
function warn(title, message) {
    requireString(title, 'title');
    return InternalPopup.warn(title, String(message ?? ''));
}

/**
 * Error dialog (slightly wider) with an OK button.
 * @param {string} title
 * @param {string} message
 * @returns {Promise<'ok'>}
 */
function error(title, message) {
    requireString(title, 'title');
    return InternalPopup.error(title, String(message ?? ''));
}

/**
 * Cancel/OK confirmation.
 * @param {string} title
 * @param {string} message
 * @returns {Promise<boolean>} true for OK, false for Cancel
 */
function confirm(title, message) {
    requireString(title, 'title');
    return InternalPopup.confirm(title, String(message ?? ''));
}

/**
 * Single-line text input. Enter submits, Escape cancels.
 * @param {string} title
 * @param {string} message
 * @param {object} [options] { value, placeholder }
 * @returns {Promise<string|null>}
 */
function text(title, message, options) {
    requireString(title, 'title');
    const opts = requireOptions(options, 'options');
    return InternalPopup.textbox(title, String(message ?? ''), opts);
}

/**
 * Pick one item from a list.
 * @param {string} title
 * @param {string} message
 * @param {Array<string|{label}>} options
 * @returns {Promise<any|null>} the selected item, or null on cancel
 */
function select(title, message, options) {
    requireString(title, 'title');
    if (!Array.isArray(options) || options.length === 0) {
        return InternalPopup.pick(title, String(message ?? ''), []);
    }
    return InternalPopup.pick(title, String(message ?? ''), options);
}

/**
 * Multi-field form dialog.
 * @param {string} title
 * @param {Array<{key,label,type?,value?,placeholder?}>} fields
 * @returns {Promise<object|null>} { key: value } map, or null on cancel
 */
function form(title, fields) {
    requireString(title, 'title');
    if (!Array.isArray(fields)) {
        return InternalPopup.forum(title, []);
    }
    return InternalPopup.forum(title, fields);
}

export const Dialogs = {
    alert,
    info: alert,
    warn,
    error,
    confirm,
    text,
    textbox: text,
    select,
    pick: select,
    form,
    forum: form
};

export default Dialogs;
