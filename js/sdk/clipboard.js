// Windows 12 SDK — Clipboard.
//
// Honest wrapper, no faked capabilities. The OS keeps a Win+V history of
// copies made inside it; the live system clipboard additionally needs the
// browser's permission and focus, so reads/writes reject cleanly instead
// of hanging when the browser says no.
import InternalClipboard from '../modules/clipboardManager.js';
import { ErrorCodes, SDKError } from './errors.js';

function permissionError(action) {
    return new SDKError(ErrorCodes.UNSUPPORTED,
        `Clipboard ${action} was blocked: the browser needs focus and clipboard permission. ` +
        'Open the Clipboard flyout (Win+V) and press Sync to grant it.');
}

/**
 * Copy text to the system clipboard (with legacy fallback).
 * @param {string} text
 * @returns {Promise<void>}
 * @throws {SDKError} UNSUPPORTED when the browser blocks access
 */
async function writeText(text) {
    if (typeof text !== 'string') {
        throw new SDKError(ErrorCodes.INVALID_ARGS, 'text must be a string.');
    }
    try {
        await navigator.clipboard.writeText(text);
        return;
    } catch { /* fall through to legacy path */ }
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
    } catch {
        throw permissionError('write');
    }
}

/**
 * Read text from the system clipboard.
 * @returns {Promise<string>}
 * @throws {SDKError} UNSUPPORTED when the browser blocks access
 */
async function readText() {
    try {
        if (!navigator.clipboard || !navigator.clipboard.readText) {
            throw new Error('no-api');
        }
        return await navigator.clipboard.readText();
    } catch {
        throw permissionError('read');
    }
}

/**
 * Import the live system clipboard into the OS history now.
 * @returns {Promise<void>}
 */
function sync() {
    return InternalClipboard.syncFromSystemClipboard();
}

/**
 * Open the Clipboard (Win+V) flyout.
 */
function show() {
    InternalClipboard.show();
}

/**
 * Close the Clipboard flyout.
 */
function hide() {
    InternalClipboard.hide();
}

/**
 * Toggle the Clipboard flyout.
 */
function toggle() {
    InternalClipboard.toggle();
}

/**
 * @returns {boolean} true while the flyout is open
 */
function isOpen() {
    return InternalClipboard.isOpen();
}

/**
 * A copy of the history (newest first). Items: { id, type, text?, mime?, pinned, time }.
 * Image payloads are intentionally withheld here — use the flyout to paste them.
 * @returns {Array}
 */
function getHistory() {
    return InternalClipboard.getHistory().map(item => ({
        id: item.id,
        type: item.type,
        text: item.type === 'text' ? item.text : undefined,
        mime: item.mime,
        pinned: !!item.pinned,
        time: item.time
    }));
}

/**
 * Delete all history. Pinned-item retention is handled by the manager.
 */
function clearHistory() {
    InternalClipboard.clearHistory();
}

export const Clipboard = {
    writeText,
    readText,
    sync,
    syncFromSystemClipboard: sync,
    show,
    hide,
    toggle,
    isOpen,
    getHistory,
    getHistoryItems: getHistory,
    clearHistory
};

export default Clipboard;
