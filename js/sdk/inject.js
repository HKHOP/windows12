// Windows 12 SDK — Inject.
//
// Synthetic input for trusted automation: dispatching keyboard/pointer
// events as if the user performed them. This is what powers remote
// control (the Remote Desktop host replays the controller's keystrokes)
// and any future macro/automation feature.
//
//   Inject.key({ key: 'a', code: 'KeyA' });            // keydown+keyup
//   Inject.key({ type: 'keydown', key: 'Escape' });    // one event only
//   Inject.type('hello');                               // into the focused text field
//   Inject.pointer(canvas, { x: 10, y: 20, type: 'click' });
//
// Honest limitation: browsers do not run default actions for synthetic
// events, so "typing" into a text field is performed by editing the
// field's value directly (then firing a real 'input' event) — apps that
// listen for keydown/keyup still receive those too. Nothing here can
// reach the page outside the OS document or defeat user-gesture checks.
import { ErrorCodes, SDKError } from './errors.js';

const MODIFIERS = ['ctrlKey', 'shiftKey', 'altKey', 'metaKey'];

/** Is the element an editable text target? */
function isEditable(el) {
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === 'textarea') return true;
    if (tag === 'input') {
        const type = (el.getAttribute('type') || 'text').toLowerCase();
        // Only text-like inputs accept inserted characters.
        return !['button', 'checkbox', 'radio', 'file', 'submit', 'reset', 'image', 'range', 'color', 'hidden'].includes(type);
    }
    if (el.isContentEditable) return true;
    return false;
}

/** Focused editable element, or null. */
function focusedEditable() {
    const el = document.activeElement;
    return isEditable(el) ? el : null;
}

/**
 * Visual (viewport) px per layout px for an element — the OS scales the
 * desktop with CSS zoom, so element-local layout coordinates must be
 * scaled into client space the same way window dragging does.
 */
function elementZoom(el) {
    try {
        const rect = el.getBoundingClientRect();
        const layout = el.offsetWidth || 0;
        if (layout > 0 && rect.width > 0) return rect.width / layout;
    } catch { /* fall through */ }
    return 1;
}

/** Insert text into an editable element at the caret, firing 'input'. */
function insertText(el, text) {
    if (el.isContentEditable) {
        // execCommand is the one API that inserts at the caret in
        // contenteditable AND fires a real input event; deprecated but
        // universally supported.
        let ok = false;
        try { ok = document.execCommand('insertText', false, text); } catch { ok = false; }
        if (ok) return true;
        try {
            const sel = document.getSelection();
            if (sel && sel.rangeCount) {
                const range = sel.getRangeAt(0);
                range.deleteContents();
                range.insertNode(document.createTextNode(text));
                range.collapse(false);
                el.dispatchEvent(new Event('input', { bubbles: true }));
                return true;
            }
        } catch { /* fall through */ }
        return false;
    }
    const hasSelection = typeof el.selectionStart === 'number';
    let start = el.value.length;
    let end = el.value.length;
    if (hasSelection) {
        start = el.selectionStart;
        end = el.selectionEnd;
    }
    el.value = el.value.slice(0, start) + text + el.value.slice(end);
    const caret = start + text.length;
    if (hasSelection) {
        try { el.setSelectionRange(caret, caret); } catch { /* noop */ }
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
}

/** Delete backwards one character (or the selection) in an editable element. */
function backspace(el) {
    if (el.isContentEditable) {
        let ok = false;
        try { ok = document.execCommand('delete'); } catch { ok = false; }
        if (ok) return true;
        try {
            const sel = document.getSelection();
            if (sel && sel.rangeCount) {
                const range = sel.getRangeAt(0);
                range.deleteContents();
                el.dispatchEvent(new Event('input', { bubbles: true }));
                return true;
            }
        } catch { /* fall through */ }
        return false;
    }
    const hasSelection = typeof el.selectionStart === 'number';
    if (!hasSelection) {
        el.value = el.value.slice(0, -1);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (start === end) {
        if (start === 0) return true;
        el.value = el.value.slice(0, start - 1) + el.value.slice(end);
        try { el.setSelectionRange(start - 1, start - 1); } catch { /* noop */ }
    } else {
        el.value = el.value.slice(0, start) + el.value.slice(end);
        try { el.setSelectionRange(start, start); } catch { /* noop */ }
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
}

/**
 * Dispatch a synthetic keyboard event (keydown+keyup by default). For an
 * editable target the editing side effect is applied first — synthetic
 * browser events carry no default action of their own.
 * @param {object} opts { type?: 'press'|'keydown'|'keyup', key, code?,
 *                        keyCode?, ctrlKey?, shiftKey?, altKey?, metaKey? }
 * @returns {boolean} false when a listener canceled the keydown
 * @throws {SDKError} INVALID_ARGS
 */
function key(opts) {
    if (!opts || typeof opts !== 'object') {
        throw new SDKError(ErrorCodes.INVALID_ARGS, 'key() needs an options object ({ key, ... }).');
    }
    const keyValue = opts.key !== undefined ? String(opts.key) : '';
    if (!keyValue && !opts.code) {
        throw new SDKError(ErrorCodes.INVALID_ARGS, 'key() needs at least key or code.');
    }
    const type = opts.type === 'keydown' || opts.type === 'keyup' ? opts.type : 'press';
    const code = opts.code !== undefined ? String(opts.code) : '';
    const keyCode = Number.isFinite(opts.keyCode) ? opts.keyCode
        : (keyValue.length === 1 ? keyValue.toUpperCase().charCodeAt(0) : 0);
    const mods = {};
    for (const m of MODIFIERS) mods[m] = !!opts[m];

    const target = document.activeElement || document.body;
    const editable = isEditable(target);

    // Editing side effects (keydown phase only).
    let editOk = true;
    if (editable && type !== 'keyup') {
        const isRepeat = false;
        if (keyValue === 'Backspace') editOk = backspace(target);
        else if (keyValue === 'Enter' && target.tagName
            && target.tagName.toLowerCase() === 'textarea') editOk = insertText(target, '\n');
        else if (keyValue.length === 1 && !mods.ctrlKey && !mods.metaKey && !mods.altKey && !isRepeat) {
            editOk = insertText(target, keyValue);
        }
    }

    const init = {
        key: keyValue || code,
        code: code || '',
        keyCode,
        which: keyCode,
        bubbles: true,
        cancelable: true,
        composed: true,
        ...mods
    };
    let notCanceled = true;
    if (type !== 'keyup') {
        notCanceled = target.dispatchEvent(new KeyboardEvent('keydown', init));
    }
    if (type !== 'keydown') {
        target.dispatchEvent(new KeyboardEvent('keyup', init));
    }
    return notCanceled && editOk;
}

/**
 * Insert text into the focused editable element (or synthesize key
 * events on the document when nothing editable holds focus).
 * @param {string} text text to insert
 * @returns {boolean} true when delivered into an editable target
 * @throws {SDKError} INVALID_ARGS
 */
function type(text) {
    if (typeof text !== 'string') {
        throw new SDKError(ErrorCodes.INVALID_ARGS, 'text must be a string.');
    }
    const target = focusedEditable();
    if (target) {
        // One 'input' for the whole string (what a paste looks like);
        // per-character key events would spam app listeners for no gain.
        return insertText(target, text);
    }
    for (const ch of text) {
        key({ key: ch });
    }
    return false;
}

/**
 * Dispatch a synthetic pointer/mouse event at element-local layout
 * coordinates (converted to client space through the live CSS zoom).
 * @param {HTMLElement} element target element
 * @param {object} opts { x=0, y=0, type?: 'click'|'down'|'up'|'move'|'dblclick',
 *                        button?=0, buttons?, ctrlKey?, shiftKey?, altKey?, metaKey? }
 * @returns {boolean} false when a listener canceled the event
 * @throws {SDKError} INVALID_ARGS
 */
function pointer(element, opts) {
    if (!element || typeof element.dispatchEvent !== 'function') {
        throw new SDKError(ErrorCodes.INVALID_ARGS, 'pointer() needs an HTMLElement.');
    }
    const o = opts || {};
    const x = Number.isFinite(o.x) ? o.x : 0;
    const y = Number.isFinite(o.y) ? o.y : 0;
    const kind = o.type === 'down' || o.type === 'up' || o.type === 'move' || o.type === 'dblclick' ? o.type : 'click';
    const button = Number.isFinite(o.button) ? o.button : 0;

    const zoom = elementZoom(element);
    let rect;
    try { rect = element.getBoundingClientRect(); } catch { rect = null; }
    const clientX = rect ? rect.left + x * zoom : x;
    const clientY = rect ? rect.top + y * zoom : y;

    const init = {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX,
        clientY,
        screenX: clientX,
        screenY: clientY,
        button,
        buttons: o.buttons !== undefined ? o.buttons : (kind === 'down' || kind === 'click' ? 1 : 0),
        detail: kind === 'dblclick' ? 2 : 1,
        ctrlKey: !!o.ctrlKey,
        shiftKey: !!o.shiftKey,
        altKey: !!o.altKey,
        metaKey: !!o.metaKey,
        view: window
    };

    // PointerEvent first (what the window manager listens to), MouseEvent
    // as the compatibility shadow — real input produces both.
    let notCanceled = true;
    const types = kind === 'click' ? ['pointerdown', 'pointerup', 'click']
        : kind === 'dblclick' ? ['pointerdown', 'pointerup', 'click', 'dblclick']
            : kind === 'down' ? ['pointerdown', 'mousedown']
                : kind === 'up' ? ['pointerup', 'mouseup'] : ['pointermove', 'mousemove'];
    for (const t of types) {
        let ev;
        try { ev = new PointerEvent(t, { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true }); }
        catch { ev = new MouseEvent(t, init); }
        if (!element.dispatchEvent(ev)) notCanceled = false;
    }
    return notCanceled;
}

export const Inject = { key, type, pointer };
export default Inject;
