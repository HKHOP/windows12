// VirtualKeyboard — custom on-screen touch keyboard (OSK).
//
// Replaces the native iOS/Android keyboard inside Windows 12: when enabled
// (Settings > System > Touch keyboard, auto-on for touch devices), focusing
// a text field suppresses the native keyboard (readonly + inputmode=none)
// and docks this keyboard above the taskbar instead. Desktops can opt in
// too, and the tray button summons it at any time.
//
// Typing is honest input: every press dispatches real bubbling
// KeyboardEvents (keydown/keyup with .key set, so the central Keyboard
// registry and games see touch input) and then performs the edit with
// setRangeText + an InputEvent, so apps observe identical input events.
// keydown defaultPrevented by a handler vetoes the insertion.
//
// API: init/show/hide/toggle/isOpen/refresh/getLayouts/isEnabled.
import SystemConfig from './systemConfig.js';
import Sounds from './sounds.js';

const VirtualKeyboard = (() => {
    const TRAY_ID = 'touch-kbd-tray-btn';
    const KB_ID = 'touch-keyboard';

    // Key: { l: label, a: action, v: value, f: flex-grow }
    // Actions: char | space | enter | backspace | shift | view | hide | left | right | esc
    const LAYOUTS = {
        abc: [
            ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
            ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
            [{ l: '⇧', a: 'shift', f: 1.6 }, 'z', 'x', 'c', 'v', 'b', 'n', 'm', { l: '⌫', a: 'backspace', f: 1.6 }],
            [{ l: '?123', a: 'view', v: '123', f: 1.6 }, ',', { l: 'space', a: 'space', f: 5 }, '.', { l: '⏎', a: 'enter', f: 1.8 }]
        ],
        123: [
            ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
            ['-', '/', ':', ';', '(', ')', '$', '&', '@'],
            [{ l: '#+=', a: 'view', v: 'sym', f: 1.6 }, '.', ',', '?', '!', "'", { l: '⌫', a: 'backspace', f: 1.6 }],
            [{ l: 'ABC', a: 'view', v: 'abc', f: 1.6 }, { l: '←', a: 'left', f: 1.2 }, { l: 'space', a: 'space', f: 4 }, { l: '→', a: 'right', f: 1.2 }, { l: '⏎', a: 'enter', f: 1.8 }]
        ],
        sym: [
            ['[', ']', '{', '}', '#', '%', '^', '*', '+', '='],
            ['_', '\\', '|', '~', '<', '>', '€', '£', '¥'],
            [{ l: '123', a: 'view', v: '123', f: 1.6 }, '.', ',', '?', '!', "'", { l: '⌫', a: 'backspace', f: 1.6 }],
            [{ l: 'ABC', a: 'view', v: 'abc', f: 1.6 }, { l: 'esc', a: 'esc', f: 1.4 }, { l: 'space', a: 'space', f: 4.4 }, { l: '⏎', a: 'enter', f: 1.8 }]
        ]
    };

    const KBD_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6" stroke-linecap="round"/></svg>';

    const NO_TEXT_TYPES = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'color', 'range', 'image', 'hidden']);

    let kbEl = null;
    let rowsEl = null;
    let trayBtn = null;
    let view = 'abc';
    let shift = false;       // one-shot
    let capsLock = false;
    let open = false;
    let autoShown = false;
    let target = null;
    let lastShiftTap = 0;
    const suppressed = new Set();

    function isEnabled() {
        try { return !!SystemConfig.get('touchKeyboardEnabled'); } catch (e) { return false; }
    }
    function autoShow() {
        try { return !!SystemConfig.get('touchKeyboardAutoShow'); } catch (e) { return true; }
    }
    function trayVisible() {
        try { return isEnabled() && !!SystemConfig.get('touchKeyboardTrayButton'); } catch (e) { return false; }
    }

    function isEditableTarget(el) {
        if (!el || el.disabled) return false;
        if (el.isContentEditable) return true;
        const tag = (el.tagName || '').toLowerCase();
        if (tag === 'textarea') return true;
        if (tag === 'input') {
            const t = (el.type || 'text').toLowerCase();
            return !NO_TEXT_TYPES.has(t);
        }
        return false;
    }

    function click() {
        try { Sounds.click(); } catch (e) { /* audio unavailable */ }
    }

    // ---------- native keyboard suppression ----------

    function suppressNative(el) {
        if (!el || suppressed.has(el)) return;
        try {
            if (el.tagName && /^(INPUT|TEXTAREA)$/i.test(el.tagName)) {
                if (!el.readOnly) { el.readOnly = true; el.dataset.vkRo = '1'; }
                if (el.inputMode !== 'none') { el.dataset.vkIm = el.inputMode || ''; el.inputMode = 'none'; }
            } else if (el.isContentEditable) {
                el.dataset.vkIm = el.inputMode || '';
                el.inputMode = 'none';
            } else {
                return;
            }
            suppressed.add(el);
        } catch (e) { /* ignore */ }
    }

    function restoreNative(el) {
        if (!el || !suppressed.has(el)) return;
        suppressed.delete(el);
        try {
            if (el.dataset.vkRo) { el.readOnly = false; delete el.dataset.vkRo; }
            if (el.dataset.vkIm !== undefined) {
                if ('inputMode' in el) el.inputMode = el.dataset.vkIm;
                delete el.dataset.vkIm;
            }
        } catch (e) { /* element may be detached */ }
    }

    // ---------- honest key events + edits ----------

    function fireKey(type, key, code) {
        if (!target) return false;
        try {
            const ev = new KeyboardEvent(type, {
                key, code: code || key, bubbles: true, cancelable: true
            });
            return !target.dispatchEvent(ev);
        } catch (e) {
            return false;
        }
    }

    function isTextField() {
        return !!target && target.tagName && /^(INPUT|TEXTAREA)$/i.test(target.tagName);
    }

    function insertText(str) {
        if (!target) return;
        if (isTextField()) {
            try {
                const start = target.selectionStart ?? target.value.length;
                const end = target.selectionEnd ?? start;
                target.setRangeText(str, start, end, 'end');
                target.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: str, bubbles: true, cancelable: true }));
            } catch (e) { /* detached */ }
        } else if (target.isContentEditable) {
            target.focus();
            try {
                if (!document.execCommand('insertText', false, str)) insertIntoEditable(str);
            } catch (e) { insertIntoEditable(str); }
            target.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: str, bubbles: true, cancelable: true }));
        }
    }

    function insertIntoEditable(str) {
        try {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return;
            const range = sel.getRangeAt(0);
            range.deleteContents();
            range.insertNode(document.createTextNode(str));
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        } catch (e) { /* ignore */ }
    }

    function deleteBackward() {
        if (!target) return;
        if (isTextField()) {
            try {
                let start = target.selectionStart ?? 0;
                let end = target.selectionEnd ?? 0;
                if (start === end && start > 0) start--;
                if (start !== end) {
                    target.setRangeText('', start, end, 'start');
                    target.dispatchEvent(new InputEvent('input', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true }));
                }
            } catch (e) { /* detached */ }
        } else if (target.isContentEditable) {
            target.focus();
            try { document.execCommand('delete'); } catch (e) { /* ignore */ }
            target.dispatchEvent(new InputEvent('input', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true }));
        }
    }

    function moveCaret(dir) {
        if (!target) return;
        if (isTextField()) {
            try {
                const pos = (target.selectionStart ?? 0) + dir;
                const clamped = Math.max(0, Math.min(target.value.length, pos));
                target.setSelectionRange(clamped, clamped);
            } catch (e) { /* ignore */ }
        } else if (target.isContentEditable) {
            try {
                const sel = window.getSelection();
                if (!sel || sel.rangeCount === 0) return;
                const range = sel.getRangeAt(0);
                range.collapse(dir > 0 ? false : true);
                sel.removeAllRanges();
                sel.addRange(range);
                if (typeof sel.modify === 'function') {
                    try { sel.modify('move', dir > 0 ? 'forward' : 'backward', 'character'); } catch (e) { /* ignore */ }
                }
            } catch (e) { /* ignore */ }
        }
    }

    function pressEnter() {
        if (!target) return;
        if (isTextField() && target.tagName.toLowerCase() === 'textarea') {
            if (!fireKey('keydown', 'Enter')) insertText('\n');
            fireKey('keyup', 'Enter');
            return;
        }
        const vetoed = fireKey('keydown', 'Enter');
        fireKey('keyup', 'Enter');
        if (!vetoed && isTextField() && target.form) {
            try {
                if (typeof target.form.requestSubmit === 'function') target.form.requestSubmit();
                else target.form.submit();
            } catch (e) { /* ignore */ }
        }
    }

    function charFor(label) {
        const upper = shift || capsLock;
        return upper ? label.toUpperCase() : label.toLowerCase();
    }

    function pressKey(def) {
        click();
        if (!target) {
            // No field attached: only view/hide keys make sense.
            if (def.a === 'view') setView(def.v);
            else if (def.a === 'hide') hide();
            return;
        }
        switch (def.a) {
            case 'char': {
                const ch = charFor(def.v || def.l);
                if (!fireKey('keydown', ch)) insertText(ch);
                fireKey('keyup', ch);
                if (shift && !capsLock) { shift = false; paint(); }
                break;
            }
            case 'space':
                if (!fireKey('keydown', ' ')) insertText(' ');
                fireKey('keyup', ' ');
                if (shift && !capsLock) { shift = false; paint(); }
                break;
            case 'backspace':
                if (!fireKey('keydown', 'Backspace')) deleteBackward();
                fireKey('keyup', 'Backspace');
                break;
            case 'enter':
                pressEnter();
                break;
            case 'left':
                if (!fireKey('keydown', 'ArrowLeft')) moveCaret(-1);
                fireKey('keyup', 'ArrowLeft');
                break;
            case 'right':
                if (!fireKey('keydown', 'ArrowRight')) moveCaret(1);
                fireKey('keyup', 'ArrowRight');
                break;
            case 'esc':
                fireKey('keydown', 'Escape');
                fireKey('keyup', 'Escape');
                break;
            case 'shift': {
                const now = Date.now();
                if (shift && !capsLock && now - lastShiftTap < 350) { capsLock = true; shift = false; }
                else if (capsLock) { capsLock = false; shift = false; }
                else { shift = !shift; }
                lastShiftTap = now;
                paint();
                break;
            }
            case 'view':
                setView(def.v);
                break;
            case 'hide':
                hide();
                break;
        }
    }

    // ---------- rendering ----------

    function setView(v) {
        if (LAYOUTS[v]) { view = v; shift = false; paint(); }
    }

    function keyLabel(def) {
        if (typeof def === 'string') return charFor(def);
        if (def.a === 'shift') return capsLock ? '⬆' : '⇧';
        if (def.a === 'char') return charFor(def.v || def.l);
        return def.l;
    }

    function paint() {
        if (!rowsEl) return;
        rowsEl.innerHTML = '';
        for (const row of LAYOUTS[view]) {
            const rowEl = document.createElement('div');
            rowEl.className = 'tk-row';
            for (const k of row) {
                const def = typeof k === 'string' ? { l: k, a: 'char', v: k, f: 1 } : { f: 1, ...k };
                if (!def.v && def.a === 'char') def.v = def.l;
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'tk-key' + ((def.a !== 'char' && def.a !== 'space') ? ' tk-fn' : '')
                    + (def.a === 'enter' ? ' tk-enter' : '')
                    + (def.a === 'shift' && (shift || capsLock) ? ' tk-active' : '')
                    + (def.a === 'space' ? ' tk-space' : '');
                btn.style.flexGrow = def.f || 1;
                btn.textContent = keyLabel(def);
                btn.dataset.action = def.a;
                wireButton(btn, def);
                rowEl.appendChild(btn);
            }
            rowsEl.appendChild(rowEl);
        }
    }

    function wireButton(btn, def) {
        const repeatable = def.a === 'backspace' || def.a === 'space' || def.a === 'left' || def.a === 'right';
        let repeatTimer = null;
        let repeatInterval = null;
        const clear = () => {
            if (repeatTimer) { clearTimeout(repeatTimer); repeatTimer = null; }
            if (repeatInterval) { clearInterval(repeatInterval); repeatInterval = null; }
        };
        btn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            try { btn.setPointerCapture(e.pointerId); } catch (err) { /* mouse */ }
            btn.classList.add('tk-pressed');
            pressKey(def);
            if (repeatable && target) {
                repeatTimer = setTimeout(() => {
                    repeatInterval = setInterval(() => pressKey(def), 70);
                }, 450);
            }
        });
        const release = () => { btn.classList.remove('tk-pressed'); clear(); };
        btn.addEventListener('pointerup', release);
        btn.addEventListener('pointercancel', release);
        btn.addEventListener('lostpointercapture', release);
        // Keyboard access to the keyboard: real Enter/Space on a focused
        // tk-key must not double-fire via click after pointerup.
        btn.addEventListener('click', (e) => e.preventDefault());
    }

    function build() {
        kbEl = document.createElement('div');
        kbEl.id = KB_ID;
        kbEl.className = 'hidden';
        // Never steal focus from the text field being typed into.
        kbEl.addEventListener('mousedown', (e) => e.preventDefault());
        kbEl.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

        const bar = document.createElement('div');
        bar.className = 'tk-bar';
        const grip = document.createElement('div');
        grip.className = 'tk-grip';
        const hideBtn = document.createElement('button');
        hideBtn.type = 'button';
        hideBtn.className = 'tk-hide';
        hideBtn.title = 'Hide keyboard';
        hideBtn.textContent = '⌄';
        hideBtn.addEventListener('pointerdown', (e) => e.preventDefault());
        hideBtn.addEventListener('click', (e) => { e.preventDefault(); click(); hide(); });
        bar.appendChild(grip);
        bar.appendChild(hideBtn);

        rowsEl = document.createElement('div');
        rowsEl.className = 'tk-rows';
        kbEl.appendChild(bar);
        kbEl.appendChild(rowsEl);
        // Outside the zoomed <body> like the other touch overlays, so
        // position:fixed maps 1:1 to client pixels.
        document.documentElement.appendChild(kbEl);
        paint();
    }

    function buildTrayButton() {
        const tray = document.getElementById('taskbar-tray');
        const clock = document.getElementById('clock');
        if (!tray || document.getElementById(TRAY_ID)) {
            trayBtn = document.getElementById(TRAY_ID);
            return;
        }
        trayBtn = document.createElement('button');
        trayBtn.id = TRAY_ID;
        trayBtn.className = 'taskbar-btn';
        trayBtn.title = 'Touch keyboard';
        trayBtn.innerHTML = KBD_SVG;
        trayBtn.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
        try {
            if (clock && typeof tray.insertBefore === 'function') tray.insertBefore(trayBtn, clock);
            else tray.appendChild(trayBtn);
        } catch (e) {
            try { tray.appendChild(trayBtn); } catch (err) { /* tray unavailable */ }
        }
        refreshTray();
    }

    function refreshTray() {
        if (!trayBtn) return;
        trayBtn.style.display = trayVisible() ? 'flex' : 'none';
        trayBtn.classList.toggle('active', open);
    }

    function emit(openState) {
        try {
            window.dispatchEvent(new CustomEvent('touch-keyboard-visibility', { detail: { open: openState } }));
        } catch (e) { /* ignore */ }
    }

    // ---------- focus tracking ----------

    function attach(t) {
        target = t;
        suppressNative(t);
    }

    function onFocusIn(e) {
        const t = e.target;
        if (kbEl && (t === kbEl || kbEl.contains(t))) return;
        if (trayBtn && (t === trayBtn || trayBtn.contains(t))) return;
        if (!isEnabled()) return;
        if (isEditableTarget(t)) {
            attach(t);
            if (autoShow()) { autoShown = true; show(); }
        }
    }

    function onFocusOut(e) {
        const t = e.target;
        restoreNative(t);
        if (t === target) target = null;
        const next = e.relatedTarget;
        const nextEditable = next && kbEl && !kbEl.contains(next) && isEditableTarget(next);
        if (!nextEditable && autoShown) {
            autoShown = false;
            hide();
        }
    }

    // ---------- public API ----------

    function show() {
        if (!isEnabled() || !kbEl) return false;
        if (open) return true;
        open = true;
        kbEl.classList.remove('hidden');
        refreshTray();
        emit(true);
        return true;
    }

    function hide() {
        if (!kbEl || !open) return false;
        open = false;
        autoShown = false;
        kbEl.classList.add('hidden');
        refreshTray();
        emit(false);
        return true;
    }

    function toggle() {
        return open ? hide() : show();
    }

    function isOpen() {
        return open;
    }

    function refresh() {
        if (!isEnabled()) {
            if (target) { restoreNative(target); target = null; }
            hide();
        }
        refreshTray();
    }

    function getLayouts() {
        const out = {};
        for (const [name, rows] of Object.entries(LAYOUTS)) {
            out[name] = rows.map(row => row.map(k => {
                if (typeof k === 'string') return k;
                return k.l + (k.a && k.a !== 'char' ? `:${k.a}` : '');
            }));
        }
        return out;
    }

    function init() {
        if (kbEl) return;
        build();
        buildTrayButton();
        document.addEventListener('focusin', onFocusIn);
        document.addEventListener('focusout', onFocusOut);
        refresh();
    }

    return { init, show, hide, toggle, isOpen, refresh, getLayouts, isEnabled };
})();

export default VirtualKeyboard;
