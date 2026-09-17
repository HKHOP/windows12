// Keyboard — central keyboard-shortcut registry for the OS.
//
// Instead of every app wiring its own document/element keydown listener
// (with inconsistent guards, focus checks, and conflicts), shortcuts are
// declared through one API:
//
//   Keyboard.register('CTRL+SHIFT+P', () => { ... });
//   Keyboard.register('WIN+V', () => Clipboard.toggle(), { system: true });
//   Keyboard.register('ALT+F4', () => closeWindow(), { system: true });
//   Keyboard.register('CTRL+S', () => save(), { scope: win.element, owner: 'myApp' });
//
// Combo syntax: MOD+...+KEY, e.g. 'CTRL+S', 'CTRL+SHIFT+V', 'ALT+F4',
// 'WIN+V', 'ESCAPE', 'PRINTSCREEN'. Modifiers (case-insensitive):
//   CTRL (or CONTROL), SHIFT, ALT, WIN (or META/SUPER/CMD/COMMAND).
// The key is matched case-insensitively against event.key, so 'CTRL+S'
// also fires with CapsLock on (unlike naive `e.key === 's'` checks).
// Useful aliases: ESC, DEL, INS, PGUP, PGDN, UP/DOWN/LEFT/RIGHT,
// SPACE, RETURN, PRTSC. F1..F12, ENTER, TAB, DELETE etc. work verbatim.
//
// Modifier matching is EXACT: 'CTRL+S' does not fire on Ctrl+Shift+S.
// That lets scoped and shifted variants coexist without overlap bugs.
//
// Dispatch: one document-level keydown listener fans out to matching
// handlers — `system` handlers first (registration order), then the rest.
// The first handler that does not explicitly pass through consumes the
// combo. A callback that returns `false` passes through to the next
// matching handler (layered Escape-to-close: menu, then panel, then app).
// Otherwise the combo is consumed: preventDefault runs (unless disabled)
// and no further handlers fire.
//
// Options (all optional):
//   scope            HTMLElement — fire only when the event target is inside
//                    this element (e.g. your window root). Omit for global.
//   owner            string — tag (usually appId) for bulk cleanup via
//                    unregisterAll(owner). Scoped elements are ALSO
//                    auto-unregistered once detached from the DOM.
//   allowInInputs    bool (default true) — set false to ignore combos typed
//                    in INPUT/TEXTAREA/SELECT/contenteditable.
//   preventDefault   bool (default true)
//   stopPropagation  bool (default false)
//   system           bool (default false) — system handlers dispatch first.
//   description      string — human label (used by a future shortcut viewer).
const Keyboard = (() => {
    const MOD_ALIASES = {
        CTRL: 'ctrl', CONTROL: 'ctrl',
        SHIFT: 'shift',
        ALT: 'alt',
        WIN: 'meta', META: 'meta', SUPER: 'meta', CMD: 'meta', COMMAND: 'meta'
    };

    const KEY_ALIASES = {
        ESC: 'ESCAPE', DEL: 'DELETE', INS: 'INSERT',
        PGUP: 'PAGEUP', PGDN: 'PAGEDOWN',
        PRTSC: 'PRINTSCREEN', PRTSCR: 'PRINTSCREEN', SYSRQ: 'PRINTSCREEN',
        UP: 'ARROWUP', DOWN: 'ARROWDOWN', LEFT: 'ARROWLEFT', RIGHT: 'ARROWRIGHT',
        SPACE: ' ', SPACEBAR: ' ', RETURN: 'ENTER'
    };

    let seq = 0;
    const handlers = [];
    let installed = false;

    function parseCombo(combo) {
        if (typeof combo !== 'string' || !combo.trim()) {
            throw new Error('Keyboard.register: combo must be a non-empty string');
        }
        const mods = { ctrl: false, shift: false, alt: false, meta: false };
        let key = null;
        for (const raw of combo.split('+')) {
            const part = raw.trim().toUpperCase();
            if (!part) continue;
            if (MOD_ALIASES[part]) {
                mods[MOD_ALIASES[part]] = true;
            } else {
                if (key !== null) {
                    throw new Error(`Keyboard.register: bad combo "${combo}" (two keys?)`);
                }
                key = KEY_ALIASES[part] || part;
            }
        }
        if (key === null) throw new Error(`Keyboard.register: bad combo "${combo}" (no key)`);
        return { mods, key };
    }

    function eventKey(e) {
        const k = String(e.key ?? '');
        if (k === ' ') return ' ';
        return k.toUpperCase();
    }

    function matches(e, h) {
        if (!!e.ctrlKey !== h.mods.ctrl) return false;
        if (!!e.shiftKey !== h.mods.shift) return false;
        if (!!e.altKey !== h.mods.alt) return false;
        if (!!e.metaKey !== h.mods.meta) return false;
        return eventKey(e) === h.key;
    }

    function inInput(e) {
        const t = e.target;
        if (!t || !t.tagName) return false;
        const tag = t.tagName.toUpperCase();
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
        return !!(t.isContentEditable);
    }

    function dispatch(e) {
        // System handlers first (stable), then the rest in registration order.
        for (let pass = 0; pass < 2; pass++) {
            for (let i = 0; i < handlers.length; i++) {
                const h = handlers[i];
                if (pass === 0 && !h.system) continue;
                if (pass === 1 && h.system) continue;
                if (h.scope) {
                    if (!h.scope.isConnected) {
                        handlers.splice(i, 1);
                        i--;
                        continue;
                    }
                    try {
                        if (!h.scope.contains(e.target)) continue;
                    } catch { continue; }
                }
                if (!h.allowInInputs && inInput(e)) continue;
                if (!matches(e, h)) continue;
                let ret;
                try {
                    ret = h.callback(e);
                } catch (err) {
                    console.error(`Keyboard: handler for "${h.combo}" threw`, err);
                }
                if (ret === false) continue; // pass through to next match
                if (h.preventDefault) e.preventDefault();
                if (h.stopPropagation) {
                    e.stopPropagation();
                    if (e.stopImmediatePropagation) {
                        try { e.stopImmediatePropagation(); } catch { /* noop */ }
                    }
                }
                return;
            }
        }
    }

    function ensureInstalled() {
        if (installed) return;
        installed = true;
        document.addEventListener('keydown', dispatch);
    }

    function register(combo, callback, opts = {}) {
        if (typeof callback !== 'function') {
            throw new Error('Keyboard.register: callback must be a function');
        }
        const { mods, key } = parseCombo(combo);
        const h = {
            id: `kbd-${++seq}`,
            combo,
            mods,
            key,
            callback,
            scope: opts.scope || null,
            owner: opts.owner || null,
            allowInInputs: opts.allowInInputs !== false,
            preventDefault: opts.preventDefault !== false,
            stopPropagation: !!opts.stopPropagation,
            system: !!opts.system,
            description: opts.description || ''
        };
        handlers.push(h);
        ensureInstalled();
        // Return an unregister function AND expose the id on it, so both
        // `const off = Keyboard.register(...); off()` and
        // `Keyboard.unregister(id)` styles work.
        const off = () => unregister(h.id);
        off.id = h.id;
        return off;
    }

    function unregister(id) {
        const target = typeof id === 'function' ? id.id : id;
        const i = handlers.findIndex(h => h.id === target);
        if (i === -1) return false;
        handlers.splice(i, 1);
        return true;
    }

    function unregisterAll(owner) {
        let n = 0;
        for (let i = handlers.length - 1; i >= 0; i--) {
            if (handlers[i].owner === owner) {
                handlers.splice(i, 1);
                n++;
            }
        }
        return n;
    }

    // Debug/introspection (powers a future Settings > Shortcuts page).
    function list() {
        return handlers.map(h => ({
            id: h.id,
            combo: h.combo,
            system: h.system,
            owner: h.owner,
            description: h.description,
            scoped: !!h.scope
        }));
    }

    return { register, unregister, unregisterAll, list };
})();

export default Keyboard;
