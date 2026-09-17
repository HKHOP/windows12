// Windows 12 SDK — Keyboard.
//
// The central shortcut registry. Declare combos instead of wiring your own
// keydown listeners:
//
//   Keyboard.register('CTRL+SHIFT+P', () => { ... });
//   Keyboard.register('WIN+V', toggle, { system: true });
//
// Combo notation: MOD+...+KEY (case-insensitive). Modifiers: CTRL (or
// CONTROL), SHIFT, ALT, WIN (or META/SUPER/CMD/COMMAND). The key matches
// event.key case-insensitively; aliases: ESC, DEL, INS, PGUP, PGDN,
// UP/DOWN/LEFT/RIGHT, SPACE, RETURN, PRTSC. F1–F12 and names like ENTER,
// TAB, DELETE, PRINTSCREEN work verbatim. Matching is exact: 'CTRL+S'
// does NOT fire on Ctrl+Shift+S.
//
// Dispatch order: system handlers first, then the rest in registration
// order. Return false from a callback to pass the combo through to the
// next matching handler (layered Escape-to-close); anything else consumes
// it. Reserved system combos (PRINTSCREEN, WIN+V, ALT+F4, layered ESCAPE)
// always win — do not re-register them.
import InternalKeyboard from '../modules/keyboard.js';
import { ErrorCodes, SDKError, requireString, requireFunction, requireOptions } from './errors.js';

// Live physical-key state for isDown(). Separate from the registry: purely
// observational, maintained by two lightweight global listeners.
const downKeys = new Set();
let tracking = false;

function trackEvent(e, isDown) {
    const mods = { CTRL: !!e.ctrlKey, SHIFT: !!e.shiftKey, ALT: !!e.altKey, WIN: !!e.metaKey };
    for (const [name, on] of Object.entries(mods)) {
        if (on) downKeys.add(name);
        else if (!isDown) downKeys.delete(name);
    }
    const key = String(e.key ?? '').toUpperCase();
    if (!key) return;
    if (isDown) downKeys.add(key === ' ' ? 'SPACE' : key);
    else downKeys.delete(key === ' ' ? 'SPACE' : key);
    // Modifier keys report e.key as Control/Shift/Alt/Meta — mirror them.
    const mirror = { CONTROL: 'CTRL', META: 'WIN', ' ': 'SPACE', ESCAPE: 'ESC' };
    if (mirror[key]) {
        if (isDown) downKeys.add(mirror[key]);
        else downKeys.delete(mirror[key]);
    }
}

function ensureTracking() {
    if (tracking) return;
    tracking = true;
    document.addEventListener('keydown', (e) => trackEvent(e, true));
    document.addEventListener('keyup', (e) => trackEvent(e, false));
    window.addEventListener('blur', () => downKeys.clear());
}

/**
 * Register a shortcut. Returns an unregister function (with .id) that also
 * works with unregister().
 * @param {string} combo e.g. 'CTRL+S'
 * @param {Function} callback return false to pass through
 * @param {object} [options] { scope, owner, allowInInputs, preventDefault, stopPropagation, system, description }
 * @returns {Function} unregister function
 * @throws {SDKError} INVALID_ARGS on bad combo/callback
 */
function register(combo, callback, options) {
    requireString(combo, 'combo');
    requireFunction(callback, 'callback');
    const opts = requireOptions(options, 'options');
    if (opts.scope !== undefined && opts.scope !== null && !(opts.scope instanceof HTMLElement)) {
        throw new SDKError(ErrorCodes.INVALID_ARGS, 'options.scope must be an HTMLElement (usually your window root) or omitted for global.');
    }
    try {
        return InternalKeyboard.register(combo, callback, opts);
    } catch (err) {
        if (err instanceof SDKError) throw err;
        throw new SDKError(ErrorCodes.INVALID_ARGS, err && err.message ? err.message : `Invalid combo "${combo}".`);
    }
}

/**
 * Remove one registration (id string or the function register() returned).
 * @param {string|Function} id
 * @returns {boolean}
 */
function unregister(id) {
    if (typeof id !== 'string' && typeof id !== 'function') {
        throw new SDKError(ErrorCodes.INVALID_ARGS, 'unregister() needs the id string or unregister function from register().');
    }
    return InternalKeyboard.unregister(id);
}

/**
 * Remove every registration tagged with an owner (usually an app id).
 * @param {string} owner
 * @returns {number} removed count
 */
function unregisterAll(owner) {
    requireString(owner, 'owner');
    return InternalKeyboard.unregisterAll(owner);
}

/**
 * Introspection for debugging (powers a future Settings > Shortcuts page).
 * @returns {Array<{id,combo,system,owner,description,scoped}>}
 */
function list() {
    return InternalKeyboard.list();
}

/**
 * Is a key currently held down? Names like 'CTRL', 'SHIFT', 'ALT', 'WIN',
 * 'A', 'F5', 'ESC'. Best-effort physical state (cleared on window blur).
 * @param {string} name
 * @returns {boolean}
 */
function isDown(name) {
    requireString(name, 'name');
    ensureTracking();
    const key = name.trim().toUpperCase();
    return downKeys.has(key) || downKeys.has({ ESCAPE: 'ESC' }[key]);
}

export const Keyboard = {
    register,
    unregister,
    unregisterAll,
    list,
    isDown
};

export default Keyboard;
