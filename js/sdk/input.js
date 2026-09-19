// Windows 12 SDK — Input.
//
// Raw key-state for games and canvas tools. This is deliberately NOT the
// shortcut registry (Keyboard.register is combo-based and consumes keys);
// games need "is W held right now?" plus edge events, scoped to their own
// window body so other apps (and the shell) are never fed keystrokes.
//
//   const app = createApp({ id: 'myGame' });
//   const keys = app.input.keyState(win.element, { prevent: ['Space', 'ArrowUp'] });
//   // in your frame loop:
//   if (keys.isDown('KeyW')) moveForward(dt);
//   keys.onKeyDown(({ code }) => { if (code.startsWith('Digit')) selectSlot(+code.slice(5)); });
//   // on window close:
//   keys.dispose();
//
// The controller needs keyboard focus on the element (give your window
// body tabindex="0" and focus() it on click). Key state clears itself when
// the browser window loses focus and when the element is removed from the
// DOM, so a closed window can never leave keys stuck down.
import { ErrorCodes, SDKError } from './errors.js';

/**
 * Create a key-state controller for one element.
 * @param {HTMLElement} element usually your window root (give it tabindex)
 * @param {object} [options] { prevent: string[]|true — event.code values to
 *   preventDefault() on keydown ('Space', 'ArrowUp', ... or true for all) }
 * @returns {{ isDown: (code: string) => boolean, clear: () => void,
 *             onKeyDown: (cb: Function) => Function, onKeyUp: (cb: Function) => Function,
 *             dispose: () => void, element: HTMLElement }}
 * @throws {SDKError} INVALID_ARGS
 */
function keyState(element, options) {
    if (!element || typeof element !== 'object' || typeof element.addEventListener !== 'function') {
        throw new SDKError(ErrorCodes.INVALID_ARGS, 'keyState() needs an HTMLElement (usually your window root).');
    }
    const opts = options || {};
    const preventAll = opts.prevent === true;
    const preventSet = Array.isArray(opts.prevent) ? new Set(opts.prevent) : null;

    const down = new Set();
    const keyDownCbs = new Set();
    const keyUpCbs = new Set();
    let disposed = false;

    function onKeyDown(e) {
        if (preventAll || (preventSet && preventSet.has(e.code))) e.preventDefault();
        down.add(e.code);
        for (const cb of [...keyDownCbs]) {
            try { cb({ code: e.code, event: e }); } catch (err) { console.error('[Windows12 SDK] keyState onKeyDown handler threw', err); }
        }
    }
    function onKeyUp(e) {
        down.delete(e.code);
        for (const cb of [...keyUpCbs]) {
            try { cb({ code: e.code, event: e }); } catch (err) { console.error('[Windows12 SDK] keyState onKeyUp handler threw', err); }
        }
    }
    function onBlur() {
        down.clear();
    }

    // Self-dispose when the element leaves the DOM (window closed) so
    // document-level listeners never leak.
    const observer = (typeof MutationObserver === 'function')
        ? new MutationObserver(() => {
            if (!element.isConnected) dispose();
        })
        : null;
    if (observer) {
        try { observer.observe(document.documentElement, { childList: true, subtree: true }); } catch { observer.disconnect(); }
    }

    element.addEventListener('keydown', onKeyDown);
    element.addEventListener('keyup', onKeyUp);
    if (typeof window !== 'undefined') window.addEventListener('blur', onBlur);

    function dispose() {
        if (disposed) return;
        disposed = true;
        element.removeEventListener('keydown', onKeyDown);
        element.removeEventListener('keyup', onKeyUp);
        if (typeof window !== 'undefined') window.removeEventListener('blur', onBlur);
        if (observer) observer.disconnect();
        down.clear();
        keyDownCbs.clear();
        keyUpCbs.clear();
    }

    return {
        /** Is the key (event.code, e.g. 'KeyW', 'Space') currently held? */
        isDown(code) {
            if (typeof code !== 'string') return false;
            return down.has(code);
        },
        /** Force-clear all held keys (e.g. when entering your pause menu). */
        clear() {
            down.clear();
        },
        /** Subscribe to raw keydowns: cb({ code, event }). Returns unsubscribe. */
        onKeyDown(cb) {
            if (typeof cb !== 'function') throw new SDKError(ErrorCodes.INVALID_ARGS, 'onKeyDown needs a function.');
            keyDownCbs.add(cb);
            return () => keyDownCbs.delete(cb);
        },
        /** Subscribe to raw keyups: cb({ code, event }). Returns unsubscribe. */
        onKeyUp(cb) {
            if (typeof cb !== 'function') throw new SDKError(ErrorCodes.INVALID_ARGS, 'onKeyUp needs a function.');
            keyUpCbs.add(cb);
            return () => keyUpCbs.delete(cb);
        },
        /** Remove every listener. Also called automatically when the element is detached. */
        dispose,
        element
    };
}

export const Input = { keyState };
export default Input;
