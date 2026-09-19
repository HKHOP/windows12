// Windows 12 SDK — Events.
//
// The ONLY shared event surface: real window CustomEvents the OS already
// fires. No second bus is created. Supported names:
//
//   'app-installed' / 'app-uninstalled'  ← 'apps-changed' (no payload: re-query Apps)
//   'background-apps-changed'            ← detail { running: [...] }
//   'app-crashed'                        ← detail { appId }
//   'virtual-desktop-changed'            ← detail { activeId }
//   'window-closed'                      ← detail { appId, id }
//   'window-minimized'                   ← detail { appId, id }
//   'window-restored'                    ← detail { appId, id }
//   'window-focus-changed'               ← detail { appId, id }
//
// Deliberately absent: window-created and settings/theme change. Those
// internals are single-slot callbacks (setOnWindowCreated,
// SystemConfig.onChange) — sharing them would clobber the shell's own
// handlers. Window close/minimize/restore/focus ARE available because the
// window manager broadcasts them as DOM events; prefer the friendlier
// wrappers on WindowManager (onClosed/onMinimizeState/onFocusChanged).
import { ErrorCodes, SDKError, requireString, requireFunction } from './errors.js';

const SUPPORTED = {
    'app-installed': 'apps-changed',
    'app-uninstalled': 'apps-changed',
    'background-apps-changed': 'background-apps-changed',
    'app-crashed': 'app-crashed',
    'virtual-desktop-changed': 'virtual-desktop-changed',
    'window-closed': 'window-closed',
    'window-minimized': 'window-minimized',
    'window-restored': 'window-restored',
    'window-focus-changed': 'window-focus-changed'
};

/**
 * Supported event names.
 * @returns {string[]}
 */
function names() {
    return Object.keys(SUPPORTED);
}

const bindings = new Map();
let seq = 0;

/**
 * Subscribe. The handler receives the DOM CustomEvent (detail carries the
 * documented payload, if any).
 * @param {string} name one of Events.names()
 * @param {Function} handler (event) => void
 * @returns {Function} unsubscribe function (also usable with off())
 */
function on(name, handler) {
    requireString(name, 'name');
    requireFunction(handler, 'handler');
    const domEvent = SUPPORTED[name];
    if (!domEvent) {
        throw new SDKError(ErrorCodes.INVALID_ARGS, `Unknown event "${name}". Supported: ${Object.keys(SUPPORTED).join(', ')}.`);
    }
    const id = `evt-${++seq}`;
    const wrapped = (e) => {
        try {
            handler(e);
        } catch (err) {
            console.error(`[Windows12 SDK] event handler for "${name}" threw`, err);
        }
    };
    bindings.set(id, { domEvent, wrapped });
    window.addEventListener(domEvent, wrapped);
    const offFn = () => off(id);
    offFn.bindingId = id;
    return offFn;
}

/**
 * Unsubscribe via the function on() returned, or a binding id.
 * @param {Function|string} ref
 * @returns {boolean} true when something was removed
 */
function off(ref) {
    const id = typeof ref === 'function' ? ref.bindingId : ref;
    if (typeof id !== 'string') return false;
    const b = bindings.get(id);
    if (!b) return false;
    window.removeEventListener(b.domEvent, b.wrapped);
    bindings.delete(id);
    return true;
}

export const Events = {
    on,
    off,
    names,
    supported: names
};

export default Events;
