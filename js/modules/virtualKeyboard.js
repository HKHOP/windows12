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
    // Custom geometry (null = docked default). Persisted to SystemConfig.
    let posX = null, posY = null, posW = null, posKeyH = null;
    let dragState = null;
    let resizeState = null;

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
                el.classList.add('vk-focused');
            } else if (el.isContentEditable) {
                el.dataset.vkIm = el.inputMode || '';
                el.inputMode = 'none';
                el.classList.add('vk-focused');
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
            el.classList.remove('vk-focused');
        } catch (e) { /* element may be detached */ }
    }

    // ---------- honest key events + edits ----------

    // Games have no text field: fall back to the focused element (or body)
    // so OSK presses still reach window-level game listeners as key events.
    function eventTarget() {
        if (target) return target;
        try {
            const a = document.activeElement;
            if (a && a !== document.body && !(kbEl && (a === kbEl || kbEl.contains(a)))) return a;
        } catch (e) { /* ignore */ }
        return document.body;
    }

    function fireKey(type, key) {
        const t = eventTarget();
        if (!t) return false;
        try {
            const ev = new KeyboardEvent(type, {
                key, code: key, bubbles: true, cancelable: true
            });
            return !t.dispatchEvent(ev);
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

    function charFor(label) {
        const upper = shift || capsLock;
        return upper ? label.toUpperCase() : label.toLowerCase();
    }

    function pressEnterDown() {
        if (isTextField() && target.tagName.toLowerCase() === 'textarea') {
            if (!fireKey('keydown', 'Enter')) insertText('\n');
            return;
        }
        if (!fireKey('keydown', 'Enter') && isTextField() && target.form) {
            try {
                if (typeof target.form.requestSubmit === 'function') target.form.requestSubmit();
                else target.form.submit();
            } catch (e) { /* ignore */ }
        }
    }

    function pressEnterUp() {
        fireKey('keyup', 'Enter');
    }

    // Pointer-down half: dispatches keydown, performs the edit once.
    // Returns the key name for keyup pairing (null when there is none).
    function downKey(def, isRepeat) {
        if (!isRepeat) click();
        switch (def.a) {
            case 'char': {
                const ch = charFor(def.v || def.l);
                if (!fireKey('keydown', ch) && isTextField()) insertText(ch);
                if (shift && !capsLock) { shift = false; paint(); }
                return ch;
            }
            case 'space':
                if (!fireKey('keydown', ' ')) { if (isTextField()) insertText(' '); }
                if (shift && !capsLock) { shift = false; paint(); }
                return ' ';
            case 'backspace':
                if (!fireKey('keydown', 'Backspace')) { if (isTextField()) deleteBackward(); }
                return 'Backspace';
            case 'enter':
                pressEnterDown();
                return null; // keyup is emitted inside pressEnterUp on release
            case 'left':
                if (!fireKey('keydown', 'ArrowLeft')) moveCaret(-1);
                return 'ArrowLeft';
            case 'right':
                if (!fireKey('keydown', 'ArrowRight')) moveCaret(1);
                return 'ArrowRight';
            case 'esc':
                fireKey('keydown', 'Escape');
                return 'Escape';
            case 'shift': {
                const now = Date.now();
                if (shift && !capsLock && now - lastShiftTap < 350) { capsLock = true; shift = false; }
                else if (capsLock) { capsLock = false; shift = false; }
                else { shift = !shift; }
                lastShiftTap = now;
                paint();
                return null;
            }
            case 'view':
                setView(def.v);
                return null;
            case 'hide':
                hide();
                return null;
            default:
                return null;
        }
    }

    // Pointer-up half: single keyup pairs the whole hold, so games see a
    // sustained press while held (physical-keyboard semantics).
    function upKey(def, paired) {
        if (def.a === 'enter') { pressEnterUp(); return; }
        if (paired) fireKey('keyup', paired);
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
        // Held keys repeat like a physical keyboard: repeated keydowns with
        // edits, one keyup on release — so games see sustained movement.
        const repeatable = def.a === 'backspace' || def.a === 'space' || def.a === 'left'
            || def.a === 'right' || def.a === 'char';
        let repeatTimer = null;
        let repeatInterval = null;
        let paired = null;
        let released = true;
        const clear = () => {
            if (repeatTimer) { clearTimeout(repeatTimer); repeatTimer = null; }
            if (repeatInterval) { clearInterval(repeatInterval); repeatInterval = null; }
        };
        btn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            try { btn.setPointerCapture(e.pointerId); } catch (err) { /* mouse */ }
            btn.classList.add('tk-pressed');
            released = false;
            paired = downKey(def, false);
            if (repeatable) {
                repeatTimer = setTimeout(() => {
                    repeatInterval = setInterval(() => { paired = downKey(def, true) || paired; }, 70);
                }, 450);
            }
        });
        const release = () => {
            if (released) return;
            released = true;
            btn.classList.remove('tk-pressed');
            clear();
            upKey(def, paired);
            paired = null;
        };
        btn.addEventListener('pointerup', release);
        btn.addEventListener('pointercancel', release);
        btn.addEventListener('lostpointercapture', release);
        // No-capture fallback (old mouse paths): sliding off releases.
        // With active capture this never fires spuriously.
        btn.addEventListener('pointerleave', release);
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
        bar.title = 'Drag to move • double-click to re-dock';
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
        wireDrag(bar);

        rowsEl = document.createElement('div');
        rowsEl.className = 'tk-rows';
        kbEl.appendChild(bar);
        kbEl.appendChild(rowsEl);

        const rz = document.createElement('div');
        rz.className = 'tk-resize';
        rz.title = 'Drag to resize';
        wireResize(rz);
        kbEl.appendChild(rz);
        // Outside the zoomed <body> like the other touch overlays, so
        // position:fixed maps 1:1 to client pixels.
        document.documentElement.appendChild(kbEl);
        applyBounds();
        paint();
    }

    // ---------- drag + resize (persisted) ----------

    function loadBounds() {
        try {
            const b = SystemConfig.get('touchKeyboardBounds');
            if (b && typeof b === 'object') return b;
        } catch (e) { /* ignore */ }
        return null;
    }

    function saveBounds() {
        try {
            const has = posX !== null || posY !== null || posW !== null || posKeyH !== null;
            SystemConfig.set('touchKeyboardBounds', has
                ? { x: posX, y: posY, w: posW, keyH: posKeyH }
                : null);
        } catch (e) { /* session-only */ }
    }

    function applyBounds() {
        if (!kbEl) return;
        const b = loadBounds();
        posX = (b && Number.isFinite(b.x)) ? b.x : null;
        posY = (b && Number.isFinite(b.y)) ? b.y : null;
        posW = (b && Number.isFinite(b.w)) ? b.w : null;
        posKeyH = (b && Number.isFinite(b.keyH)) ? b.keyH : null;
        if (posX !== null && posY !== null) {
            kbEl.style.transform = 'none';
            kbEl.style.left = posX + 'px';
            kbEl.style.top = posY + 'px';
            kbEl.style.bottom = 'auto';
        }
        if (posW !== null) kbEl.style.width = posW + 'px';
        if (posKeyH !== null) kbEl.style.setProperty('--tk-key-h', posKeyH + 'px');
    }

    function resetBounds() {
        posX = posY = posW = posKeyH = null;
        if (kbEl) {
            kbEl.style.transform = '';
            kbEl.style.left = '';
            kbEl.style.top = '';
            kbEl.style.bottom = '';
            kbEl.style.width = '';
            kbEl.style.removeProperty('--tk-key-h');
        }
        saveBounds();
    }

    function moveKb(clientX, clientY) {
        if (!kbEl || !dragState) return;
        const r = kbEl.getBoundingClientRect();
        const maxX = Math.max(0, window.innerWidth - 60);
        const maxY = Math.max(0, window.innerHeight - 60);
        posX = Math.min(Math.max(clientX - dragState.dx, -((r.width || 400) - 60)), maxX);
        posY = Math.min(Math.max(clientY - dragState.dy, 0), maxY);
        kbEl.style.transform = 'none';
        kbEl.style.left = posX + 'px';
        kbEl.style.top = posY + 'px';
        kbEl.style.bottom = 'auto';
    }

    function wireDrag(bar) {
        bar.addEventListener('pointerdown', (e) => {
            if (e.target.closest && e.target.closest('.tk-hide')) return;
            if (e.button !== undefined && e.button !== 0) return;
            try {
                const r = kbEl.getBoundingClientRect();
                dragState = { dx: e.clientX - r.left, dy: e.clientY - r.top };
                bar.setPointerCapture(e.pointerId);
            } catch (err) { dragState = null; }
        });
        bar.addEventListener('pointermove', (e) => {
            if (dragState) { e.preventDefault(); moveKb(e.clientX, e.clientY); }
        });
        const end = () => {
            if (dragState) { dragState = null; saveBounds(); }
        };
        bar.addEventListener('pointerup', end);
        bar.addEventListener('pointercancel', end);
        bar.addEventListener('dblclick', (e) => {
            e.preventDefault();
            click();
            resetBounds();
        });
    }

    function wireResize(rz) {
        rz.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
                const r = kbEl.getBoundingClientRect();
                const cs = getComputedStyle(kbEl).getPropertyValue('--tk-key-h');
                resizeState = {
                    startX: e.clientX, startY: e.clientY,
                    startW: r.width, startH: parseFloat(cs) || 52
                };
                rz.setPointerCapture(e.pointerId);
            } catch (err) { resizeState = null; }
        });
        rz.addEventListener('pointermove', (e) => {
            if (!resizeState) return;
            e.preventDefault();
            const maxW = Math.max(280, window.innerWidth - 16);
            posW = Math.min(Math.max(resizeState.startW + (e.clientX - resizeState.startX), 280), maxW);
            posKeyH = Math.min(Math.max(resizeState.startH + (e.clientY - resizeState.startY), 36), 76);
            kbEl.style.width = posW + 'px';
            kbEl.style.setProperty('--tk-key-h', posKeyH + 'px');
        });
        const end = () => {
            if (resizeState) { resizeState = null; saveBounds(); }
        };
        rz.addEventListener('pointerup', end);
        rz.addEventListener('pointercancel', end);
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
