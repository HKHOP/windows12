// Windows 12 SDK — Notifications.
//
// Windows 11-style toasts + Action Center. All send methods return the
// notification id immediately; outcomes arrive via callbacks (nothing
// blocks). Per-app toggles, Focus Assist, tags, critical and silent
// delivery all behave exactly as the internal system — this is the same
// system, not a copy. Sends are permission-gated automatically: a store
// app that declares "notifications" and had it revoked is dropped.
import InternalNotifications from '../modules/notifications.js';
import { requireString, requireOptions } from './errors.js';

/**
 * Plain toast + panel entry.
 * @param {string} title
 * @param {string} message
 * @param {object} [options] { appId, sticky, critical, silent, tag, timeout, onDismiss }
 * @returns {string} notification id
 */
function info(title, message, options) {
    requireString(title, 'title');
    const opts = requireOptions(options, 'options');
    return InternalNotifications.info(title, String(message ?? ''), opts);
}

/**
 * Toast with buttons.
 * @param {string} title
 * @param {string} message
 * @param {object} [options] options.actions = [{ label, value?, primary? }], options.onAction(value, id)
 * @returns {string} notification id
 */
function action(title, message, options) {
    requireString(title, 'title');
    const opts = requireOptions(options, 'options');
    return InternalNotifications.action(title, String(message ?? ''), opts);
}

/**
 * Toast with input fields plus Submit/Cancel.
 * @param {string} title
 * @param {string} message
 * @param {object} [options] options.fields = [{ key, label, type?, value?, placeholder?, options? }], options.onSubmit(data, id)
 * @returns {string} notification id
 */
function form(title, message, options) {
    requireString(title, 'title');
    const opts = requireOptions(options, 'options');
    return InternalNotifications.forum(title, String(message ?? ''), opts);
}

/**
 * Dismiss one notification.
 * @param {string} id
 */
function dismiss(id) {
    requireString(id, 'id');
    InternalNotifications.dismiss(id);
}

/**
 * Dismiss every notification.
 */
function clearAll() {
    InternalNotifications.clearAll();
}

/**
 * Currently stored notifications.
 * @returns {Array}
 */
function getAll() {
    return InternalNotifications.getAll();
}

/**
 * Open the Action Center panel.
 */
function open() {
    InternalNotifications.open();
}

/**
 * Close the Action Center panel.
 */
function close() {
    InternalNotifications.close();
}

/**
 * Toggle the Action Center panel.
 */
function toggle() {
    InternalNotifications.toggle();
}

/**
 * Focus Assist: suppress toasts (critical still shows).
 * @param {boolean} enabled
 */
function setDoNotDisturb(enabled) {
    InternalNotifications.setDoNotDisturb(!!enabled);
}

/**
 * @returns {boolean}
 */
function isDoNotDisturb() {
    return InternalNotifications.isDoNotDisturb();
}

export const Notifications = {
    info,
    action,
    form,
    forum: form,
    dismiss,
    clearAll,
    clear: clearAll,
    getAll,
    open,
    close,
    toggle,
    setDoNotDisturb,
    isDoNotDisturb
};

export default Notifications;
