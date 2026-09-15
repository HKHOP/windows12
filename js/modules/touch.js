import Scaling from './scaling.js';
import SystemConfig from './systemConfig.js';
import Cursor from './cursor.js';

const Touch = (() => {
    const LONG_PRESS_MS = 500;
    const MOVE_THRESHOLD = 10;
    const TAP_MAX_MS = 350;
    const DOUBLE_TAP_MAX_MS = 350;
    const DOUBLE_TAP_MAX_DIST = 28;

    let indicator = null;
    let touchData = null;

    // ---------- Virtual touchpad state ----------
    let cursorEl = null;
    let hintEl = null;
    let hintTimer = null;
    let cursorX = Math.floor(window.innerWidth / 2);
    let cursorY = Math.floor(window.innerHeight / 2);
    let pad = null;
    let lastTap = { time: 0, x: 0, y: 0 };

    function getScale() {
        const scale = Scaling.getScale() || 1;
        const resScale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--res-scale')) || 1;
        return scale * resScale;
    }

    function isTouchpadEnabled() {
        try {
            return !!SystemConfig.get('virtualTouchpadEnabled');
        } catch (e) {
            return false;
        }
    }

    function getSensitivity() {
        try {
            const v = parseFloat(SystemConfig.get('touchpadSensitivity'));
            if (isNaN(v)) return 1.6;
            return Math.min(4, Math.max(0.4, v));
        } catch (e) {
            return 1.6;
        }
    }

    // ---------- Direct-touch indicator (unchanged behavior) ----------
    function createIndicator() {
        const el = document.createElement('div');
        el.id = 'touch-indicator';
        el.style.cssText = 'position:fixed;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,0.25);border:2px solid rgba(255,255,255,0.5);pointer-events:none;z-index:999999;transform:translate(-50%,-50%) scale(0);transition:transform 0.15s ease-out, opacity 0.3s ease-out;opacity:0;display:none;';
        document.body.appendChild(el);
        return el;
    }

    function showIndicator(x, y) {
        if (!indicator) indicator = createIndicator();
        const scale = getScale();
        const scaledX = x / scale;
        const scaledY = y / scale;
        indicator.style.display = 'block';
        indicator.style.left = scaledX + 'px';
        indicator.style.top = scaledY + 'px';
        indicator.style.opacity = '1';
        indicator.style.transform = 'translate(-50%,-50%) scale(1)';
    }

    function pulseIndicator() {
        if (!indicator) return;
        indicator.style.transform = 'translate(-50%,-50%) scale(1.4)';
        indicator.style.opacity = '0.6';
        setTimeout(() => {
            if (indicator) {
                indicator.style.transform = 'translate(-50%,-50%) scale(0)';
                indicator.style.opacity = '0';
                setTimeout(() => {
                    if (indicator) indicator.style.display = 'none';
                }, 300);
            }
        }, 100);
    }

    function hideIndicator() {
        if (!indicator) return;
        indicator.style.transform = 'translate(-50%,-50%) scale(0)';
        indicator.style.opacity = '0';
        setTimeout(() => {
            if (indicator) indicator.style.display = 'none';
        }, 300);
    }

    function getTarget(x, y) {
        const el = document.elementFromPoint(x, y);
        return el;
    }

    function synthesizeMouse(type, target, x, y, button) {
        if (!target) return;
        const ev = new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            screenX: x,
            screenY: y,
            button: button || 0,
            buttons: type === 'mouseup' ? 0 : (button === 2 ? 2 : 1),
            view: window
        });
        target.dispatchEvent(ev);
    }

    function requestFullscreen() {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            const docEl = document.documentElement;
            if (docEl.requestFullscreen) {
                docEl.requestFullscreen().catch(() => {});
            } else if (docEl.webkitRequestFullscreen) {
                docEl.webkitRequestFullscreen();
            }
        }
    }

    // ---------- Virtual touchpad cursor ----------
    function ensureCursor() {
        if (cursorEl) return cursorEl;
        const el = document.createElement('div');
        el.id = 'virtual-cursor';
        el.setAttribute('aria-hidden', 'true');
        el.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M5 3l14 7-6.5 1.5L9 18 5 3z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
        document.body.appendChild(el);
        cursorEl = el;
        positionCursorEl();
        Cursor.refreshVirtual();
        return el;
    }

    function positionCursorEl() {
        if (!cursorEl) return;
        const scale = getScale() || 1;
        cursorEl.style.left = (cursorX / scale) + 'px';
        cursorEl.style.top = (cursorY / scale) + 'px';
        // Mirror the native cursor under the virtual one (hand on links, ...).
        Cursor.syncToPosition(cursorX, cursorY);
    }

    function clampCursor() {
        cursorX = Math.min(window.innerWidth - 2, Math.max(0, cursorX));
        cursorY = Math.min(window.innerHeight - 2, Math.max(0, cursorY));
    }

    function moveCursorBy(dx, dy) {
        const s = getSensitivity();
        cursorX += dx * s;
        cursorY += dy * s;
        clampCursor();
        positionCursorEl();
    }

    function setCursorPos(x, y) {
        cursorX = x;
        cursorY = y;
        clampCursor();
        positionCursorEl();
    }

    function pulseCursor(kind) {
        if (!cursorEl) return;
        cursorEl.classList.remove('virtual-cursor-click', 'virtual-cursor-right');
        void cursorEl.offsetWidth;
        cursorEl.classList.add(kind === 'right' ? 'virtual-cursor-right' : 'virtual-cursor-click');
        setTimeout(() => {
            if (cursorEl) cursorEl.classList.remove('virtual-cursor-click', 'virtual-cursor-right');
        }, 220);
    }

    function showHint(text) {
        try {
            if (!hintEl) {
                hintEl = document.createElement('div');
                hintEl.id = 'virtual-touchpad-hint';
                document.body.appendChild(hintEl);
            }
            hintEl.textContent = text;
            hintEl.classList.add('visible');
            if (hintTimer) clearTimeout(hintTimer);
            hintTimer = setTimeout(() => {
                if (hintEl) hintEl.classList.remove('visible');
            }, 4000);
        } catch (e) { /* noop */ }
    }

    function refreshTouchpad(showHintOnEnable) {
        ensureCursor();
        const enabled = isTouchpadEnabled();
        if (enabled) {
            clampCursor();
            positionCursorEl();
            cursorEl.classList.add('visible');
            if (showHintOnEnable) {
                showHint('Touchpad mode: swipe to move • tap = click • double-tap-hold + drag to hold/drag • 2-finger tap = right-click');
            }
        } else {
            cursorEl.classList.remove('visible');
            if (hintEl) hintEl.classList.remove('visible');
            pad = null;
        }
        return enabled;
    }

    function targetAtCursor() {
        return getTarget(cursorX, cursorY);
    }

    function dispatchPointerAt(target, type, button, buttons) {
        if (!target) return;
        let ev = null;
        try {
            ev = new PointerEvent(type, {
                bubbles: true,
                cancelable: true,
                clientX: cursorX,
                clientY: cursorY,
                screenX: cursorX,
                screenY: cursorY,
                button: button || 0,
                buttons: typeof buttons === 'number' ? buttons : 0,
                pointerId: 1,
                pointerType: 'mouse',
                isPrimary: true,
                view: window
            });
        } catch (err) {
            try {
                ev = new MouseEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    clientX: cursorX,
                    clientY: cursorY,
                    button: button || 0,
                    view: window
                });
            } catch (e2) { return; }
        }
        target.dispatchEvent(ev);
    }

    function dispatchAtCursor(type, button, extra) {
        const target = targetAtCursor();
        if (!target) return null;
        const buttons = type === 'mouseup' ? 0 : (button === 2 ? 2 : 1);
        const resolvedButtons = extra && typeof extra.buttons === 'number' ? extra.buttons : buttons;
        let ev;
        if (type === 'wheel') {
            ev = new WheelEvent('wheel', {
                bubbles: true,
                cancelable: true,
                clientX: cursorX,
                clientY: cursorY,
                deltaX: (extra && extra.deltaX) || 0,
                deltaY: (extra && extra.deltaY) || 0,
                view: window
            });
        } else if (type === 'contextmenu') {
            ev = new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                clientX: cursorX,
                clientY: cursorY,
                screenX: cursorX,
                screenY: cursorY,
                button: 2,
                buttons: 0,
                view: window
            });
        } else {
            // Mirror real-mouse ordering: pointer event first, then the
            // compatibility mouse event, so pointer-based apps (canvas draw,
            // drag/resize handles) follow the virtual cursor too.
            if (type === 'mousemove') {
                dispatchPointerAt(target, 'pointermove', button || 0, resolvedButtons);
            } else if (type === 'mousedown') {
                dispatchPointerAt(target, 'pointerdown', button || 0, resolvedButtons);
            } else if (type === 'mouseup') {
                dispatchPointerAt(target, 'pointerup', button || 0, 0);
            }
            ev = new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                clientX: cursorX,
                clientY: cursorY,
                screenX: cursorX,
                screenY: cursorY,
                button: button || 0,
                buttons: extra && typeof extra.buttons === 'number' ? extra.buttons : buttons,
                view: window
            });
        }
        target.dispatchEvent(ev);
        return target;
    }

    function focusIfEditable(target) {
        if (!target) return;
        try {
            const editable = target.closest('input, textarea, select, [contenteditable]');
            if (editable && typeof editable.focus === 'function') {
                editable.focus({ preventScroll: true });
            }
        } catch (e) { /* noop */ }
    }

    function leftClick() {
        dispatchAtCursor('mousemove', 0, { buttons: 0 });
        dispatchAtCursor('mousedown', 0);
        const target = dispatchAtCursor('mouseup', 0);
        dispatchAtCursor('click', 0);
        focusIfEditable(target);
        pulseCursor('left');
    }

    function doubleClick() {
        dispatchAtCursor('mousemove', 0, { buttons: 0 });
        dispatchAtCursor('mousedown', 0);
        dispatchAtCursor('mouseup', 0);
        const target = dispatchAtCursor('click', 0);
        dispatchAtCursor('mousedown', 0);
        dispatchAtCursor('mouseup', 0);
        dispatchAtCursor('click', 0);
        dispatchAtCursor('dblclick', 0);
        focusIfEditable(target);
        pulseCursor('left');
    }

    function rightClick() {
        dispatchAtCursor('mousemove', 2, { buttons: 0 });
        dispatchAtCursor('mousedown', 2);
        dispatchAtCursor('mouseup', 2);
        dispatchAtCursor('contextmenu', 2);
        pulseCursor('right');
    }

    function hoverMove(buttons) {
        dispatchAtCursor('mousemove', 0, { buttons: typeof buttons === 'number' ? buttons : 0 });
    }

    // ---------- Touchpad gesture handling ----------
    function padTouchStart(e) {
        const now = Date.now();
        if (e.touches.length === 2) {
            // Switch to / start two-finger gesture (right-click or scroll).
            if (pad && pad.longPressTimer) {
                clearTimeout(pad.longPressTimer);
                pad.longPressTimer = null;
            }
            // If we were mid single-finger drag, release it first.
            if (pad && pad.dragging) {
                dispatchAtCursor('mouseup', 0);
                pad.dragging = false;
                lastTap = { time: 0, x: 0, y: 0 };
            }
            const a = e.touches[0];
            const b = e.touches[1];
            pad = {
                mode: 'two',
                startX: (a.clientX + b.clientX) / 2,
                startY: (a.clientY + b.clientY) / 2,
                lastX: (a.clientX + b.clientX) / 2,
                lastY: (a.clientY + b.clientY) / 2,
                moved: false,
                startTime: now,
                longPressTimer: null,
                longPressFired: false,
                dragging: false,
                pendingDoubleDrag: false
            };
            if (e.cancelable) e.preventDefault();
            return true;
        }
        if (e.touches.length !== 1) return true;

        const t = e.touches[0];
        // Double-tap-hold detection is time + *cursor* based, NOT finger-position
        // based: in touchpad mode the whole screen is a relative trackpad, so the
        // finger can land anywhere. Only reject when the cursor itself moved
        // (e.g. a swipe happened) between the two taps.
        const sinceLastTap = now - lastTap.time;
        const cursorDistToLastTap = Math.hypot(cursorX - lastTap.x, cursorY - lastTap.y);
        const pendingDoubleDrag = sinceLastTap < DOUBLE_TAP_MAX_MS && cursorDistToLastTap < DOUBLE_TAP_MAX_DIST;

        pad = {
            mode: 'one',
            id: t.identifier,
            startX: t.clientX,
            startY: t.clientY,
            lastX: t.clientX,
            lastY: t.clientY,
            moved: false,
            startTime: now,
            longPressTimer: null,
            longPressFired: false,
            dragging: false,
            pendingDoubleDrag
        };

        if (pendingDoubleDrag) {
            // Second tap of a double-tap: hold the left button down immediately.
            // This makes both "hold click" (no move) and "drag" (move) work, and
            // it must suppress the long-press right-click timer.
            pad.dragging = true;
            pad.pendingDoubleDrag = false;
            dispatchAtCursor('mousemove', 0, { buttons: 0 });
            dispatchAtCursor('mousedown', 0);
            pulseCursor('left');
        } else {
            pad.longPressTimer = setTimeout(() => {
                if (!pad || pad.mode !== 'one' || pad.moved || pad.dragging) return;
                pad.longPressFired = true;
                rightClick();
            }, LONG_PRESS_MS);
        }

        if (e.cancelable) e.preventDefault();
        return true;
    }

    function padTouchMove(e) {
        if (!pad) return true;
        if (pad.mode === 'two') {
            if (e.touches.length < 2) return true;
            const a = e.touches[0];
            const b = e.touches[1];
            const cx = (a.clientX + b.clientX) / 2;
            const cy = (a.clientY + b.clientY) / 2;
            const dx = cx - pad.lastX;
            const dy = cy - pad.lastY;
            pad.lastX = cx;
            pad.lastY = cy;
            const totalDx = cx - pad.startX;
            const totalDy = cy - pad.startY;
            if (!pad.moved && Math.hypot(totalDx, totalDy) > MOVE_THRESHOLD) {
                pad.moved = true;
            }
            if (pad.moved) {
                // Two-finger swipe = scroll under the virtual cursor.
                dispatchAtCursor('wheel', 0, { deltaX: -dx * 2, deltaY: -dy * 2 });
            }
            if (e.cancelable) e.preventDefault();
            return true;
        }

        // One-finger: relative cursor movement.
        if (e.touches.length !== 1) return true;
        const t = e.touches[0];
        const dx = t.clientX - pad.lastX;
        const dy = t.clientY - pad.lastY;
        pad.lastX = t.clientX;
        pad.lastY = t.clientY;

        const totalDx = t.clientX - pad.startX;
        const totalDy = t.clientY - pad.startY;
        if (!pad.moved && Math.hypot(totalDx, totalDy) > MOVE_THRESHOLD) {
            pad.moved = true;
            if (pad.longPressTimer) {
                clearTimeout(pad.longPressTimer);
                pad.longPressTimer = null;
            }
        }

        if (pad.moved) {
            // Normal swipe, or an active hold-drag: move with button state.
            moveCursorBy(dx, dy);
            hoverMove(pad.dragging ? 1 : 0);
        }
        if (e.cancelable) e.preventDefault();
        return true;
    }

    function padTouchEnd(e) {
        if (!pad) return true;
        const now = Date.now();

        if (pad.mode === 'two') {
            // Still one finger down -> keep waiting for full release, no click yet.
            if (e.touches.length > 0) {
                if (e.cancelable) e.preventDefault();
                return true;
            }
            if (!pad.moved && !pad.longPressFired) {
                rightClick();
            }
            pad = null;
            if (e.cancelable) e.preventDefault();
            return true;
        }

        // One finger released (or cancelled down to zero touches).
        if (e.touches.length > 0) return true;

        if (pad.longPressTimer) {
            clearTimeout(pad.longPressTimer);
            pad.longPressTimer = null;
        }

        const duration = now - pad.startTime;

        if (pad.longPressFired) {
            pad = null;
            lastTap = { time: 0, x: 0, y: 0 };
        } else if (pad.dragging) {
            // Double-tap-hold release. mousedown was sent at touchstart.
            if (pad.moved) {
                // Dragged: drop (also ends window drags, selections, sliders).
                dispatchAtCursor('mouseup', 0);
                pulseCursor('left');
            } else if (duration < DOUBLE_TAP_MAX_MS) {
                // Quick second-tap release: finish a double-click.
                // (First tap already sent click; this completes click + dblclick.)
                dispatchAtCursor('mouseup', 0);
                const target = dispatchAtCursor('click', 0);
                dispatchAtCursor('dblclick', 0);
                focusIfEditable(target);
                pulseCursor('left');
            } else {
                // Held without moving (hold-click): release with a click so
                // buttons / press-and-hold targets still activate.
                dispatchAtCursor('mouseup', 0);
                const target = dispatchAtCursor('click', 0);
                focusIfEditable(target);
                pulseCursor('left');
            }
            pad = null;
            lastTap = { time: 0, x: 0, y: 0 };
        } else if (!pad.moved && duration < 2000) {
            // Tap.
            const sinceLastTap = now - lastTap.time;
            const distToLastTap = Math.hypot(cursorX - lastTap.x, cursorY - lastTap.y);
            if (sinceLastTap < DOUBLE_TAP_MAX_MS && distToLastTap < DOUBLE_TAP_MAX_DIST) {
                doubleClick();
                lastTap = { time: 0, x: 0, y: 0 };
            } else {
                // Short tap = left click. A second quick tap upgrades it to double-click.
                void TAP_MAX_MS;
                leftClick();
                lastTap = { time: now, x: cursorX, y: cursorY };
            }
            pad = null;
        } else {
            // Pure swipe (cursor already moved via hover events).
            pad = null;
        }

        if (e.cancelable) e.preventDefault();
        return true;
    }

    // While touchpad mode is on, the finger is a relative trackpad — never a
    // direct pointer. Swallow native touch-position events in the capture phase
    // (before they reach app handlers like Paint's canvas touch drawing), so
    // apps only ever see the synthesized mouse/pointer events at the virtual
    // cursor. Real-mouse pointer events (pointerType 'mouse') always pass.
    function suppressTouchPointer(e) {
        if (!isTouchpadEnabled()) return;
        // Only swallow explicit touch pointers. Real mouse ('mouse'), pen
        // ('pen') and our own synthesized virtual-cursor events ('mouse')
        // always pass through untouched.
        try {
            if (!e || e.pointerType !== 'touch') return;
        } catch (err) { return; }
        try { e.stopPropagation(); } catch (err) {}
        if (e.cancelable) {
            try { e.preventDefault(); } catch (err) {}
        }
    }

    function swallowTouch(e) {
        if (e.cancelable) {
            try { e.preventDefault(); } catch (err) {}
        }
        try { e.stopPropagation(); } catch (err) {}
    }

    // ---------- Direct-touch handling (touchpad OFF) ----------
    function handleTouchStart(e) {
        requestFullscreen();
        if (isTouchpadEnabled()) {
            padTouchStart(e);
            swallowTouch(e);
            return;
        }
        if (e.touches.length > 1) return;
        const t = e.touches[0];
        const x = t.clientX;
        const y = t.clientY;
        const target = getTarget(x, y);

        if (!target) return;

        if (target.closest('input, textarea, select, button, [contenteditable], canvas')) {
            return;
        }

        touchData = { x, y, target, longPressTriggered: false, moved: false };

        showIndicator(x, y);

        touchData.timer = setTimeout(() => {
            if (!touchData || touchData.moved) return;
            touchData.longPressTriggered = true;
            pulseIndicator();
            const ctxMenu = window._modules && window._modules.ContextMenu;
            if (ctxMenu) {
                ctxMenu.show(x, y, [
                    { label: 'Open', icon: '📂', action: () => synthesizeMouse('dblclick', target, x, y) },
                    'separator',
                    { label: 'Cut', icon: '✂', disabled: true },
                    { label: 'Copy', icon: '📋', disabled: true },
                    { label: 'Paste', icon: '📄', disabled: true },
                    'separator',
                    { label: 'Select all', icon: '☐', disabled: true }
                ]);
            }
        }, LONG_PRESS_MS);

        synthesizeMouse('mousedown', target, x, y, 0);

        if (target.closest('.window-header') || target.closest('.desktop-icon') || target.closest('.resize-handle') || target.closest('#taskbar')) {
            e.preventDefault();
        }
    }

    function handleTouchMove(e) {
        if (isTouchpadEnabled()) {
            padTouchMove(e);
            swallowTouch(e);
            return;
        }
        if (!touchData || e.touches.length > 1) return;
        const t = e.touches[0];
        const dx = t.clientX - touchData.x;
        const dy = t.clientY - touchData.y;

        if (!touchData.moved && Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD) {
            touchData.moved = true;
            if (touchData.timer) {
                clearTimeout(touchData.timer);
                touchData.timer = null;
            }
        }

        const scale = getScale();
        if (indicator) {
            indicator.style.left = (t.clientX / scale) + 'px';
            indicator.style.top = (t.clientY / scale) + 'px';
        }

        synthesizeMouse('mousemove', touchData.target, t.clientX, t.clientY, 0);

        if (touchData.target && (touchData.target.closest('.window-header') || touchData.target.closest('.desktop-icon') || touchData.target.closest('.resize-handle') || touchData.target.closest('#taskbar'))) {
            e.preventDefault();
        }
    }

    function handleTouchEnd(e) {
        if (isTouchpadEnabled()) {
            padTouchEnd(e);
            swallowTouch(e);
            return;
        }
        if (!touchData) return;

        if (touchData.timer) {
            clearTimeout(touchData.timer);
            touchData.timer = null;
        }

        const { x, y, target, longPressTriggered, moved } = touchData;

        synthesizeMouse('mouseup', target, x, y, 0);

        if (!longPressTriggered && !moved) {
            synthesizeMouse('click', target, x, y, 0);
            pulseIndicator();
        } else {
            hideIndicator();
        }

        touchData = null;
        if (e.cancelable) {
            e.preventDefault();
        }
    }

    function handleTouchCancel(e) {
        if (isTouchpadEnabled()) {
            if (pad && pad.longPressTimer) clearTimeout(pad.longPressTimer);
            if (pad && pad.dragging) {
                dispatchAtCursor('mouseup', 0);
                lastTap = { time: 0, x: 0, y: 0 };
            }
            pad = null;
            if (e) swallowTouch(e);
            return;
        }
        if (!touchData) return;
        if (touchData.timer) clearTimeout(touchData.timer);
        hideIndicator();
        touchData = null;
    }

    function syncCursorWithMouse(e) {
        if (!isTouchpadEnabled()) return;
        if (pad && pad.mode) return;
        if (typeof e.clientX !== 'number') return;
        cursorX = e.clientX;
        cursorY = e.clientY;
        clampCursor();
        positionCursorEl();
    }

    function init() {
        ensureCursor();
        refreshTouchpad(false);
        // Capture phase: in touchpad mode we must swallow finger-position
        // events before they reach app (target-phase) handlers.
        document.addEventListener('touchstart', handleTouchStart, { passive: false, capture: true });
        document.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
        document.addEventListener('touchend', handleTouchEnd, { passive: false, capture: true });
        document.addEventListener('touchcancel', handleTouchCancel, { passive: false, capture: true });
        document.addEventListener('pointerdown', suppressTouchPointer, { passive: false, capture: true });
        document.addEventListener('pointermove', suppressTouchPointer, { passive: false, capture: true });
        document.addEventListener('pointerup', suppressTouchPointer, { passive: false, capture: true });
        document.addEventListener('pointercancel', suppressTouchPointer, { passive: false, capture: true });
        document.addEventListener('mousemove', syncCursorWithMouse, { passive: true });
        window.addEventListener('resize', () => {
            clampCursor();
            positionCursorEl();
        });
    }

    function getCursor() {
        return { x: cursorX, y: cursorY };
    }

    return { init, refreshTouchpad, isTouchpadEnabled, getCursor };
})();

export default Touch;
