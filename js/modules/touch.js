const Touch = (() => {
    const LONG_PRESS_MS = 500;
    const MOVE_THRESHOLD = 10;

    let indicator = null;
    let touchData = null;

    function createIndicator() {
        const el = document.createElement('div');
        el.id = 'touch-indicator';
        el.style.cssText = 'position:fixed;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,0.25);border:2px solid rgba(255,255,255,0.5);pointer-events:none;z-index:999999;transform:translate(-50%,-50%) scale(0);transition:transform 0.15s ease-out, opacity 0.3s ease-out;opacity:0;display:none;';
        document.body.appendChild(el);
        return el;
    }

    function showIndicator(x, y) {
        if (!indicator) indicator = createIndicator();
        indicator.style.display = 'block';
        indicator.style.left = x + 'px';
        indicator.style.top = y + 'px';
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
        if (indicator) indicator.style.pointerEvents = 'none';
        const el = document.elementFromPoint(x, y);
        if (indicator) indicator.style.pointerEvents = '';
        return el;
    }

    function synthesizeMouse(type, target, x, y, button) {
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

    function handleTouchStart(e) {
        if (e.touches.length > 1) return;
        const t = e.touches[0];
        const x = t.clientX;
        const y = t.clientY;
        const target = getTarget(x, y);

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
        e.preventDefault();
    }

    function handleTouchMove(e) {
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

        indicator.style.left = t.clientX + 'px';
        indicator.style.top = t.clientY + 'px';

        synthesizeMouse('mousemove', touchData.target, t.clientX, t.clientY, 0);
        e.preventDefault();
    }

    function handleTouchEnd(e) {
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
        e.preventDefault();
    }

    function handleTouchCancel() {
        if (!touchData) return;
        if (touchData.timer) clearTimeout(touchData.timer);
        hideIndicator();
        touchData = null;
    }

    function init() {
        document.addEventListener('touchstart', handleTouchStart, { passive: false });
        document.addEventListener('touchmove', handleTouchMove, { passive: false });
        document.addEventListener('touchend', handleTouchEnd, { passive: false });
        document.addEventListener('touchcancel', handleTouchCancel, { passive: false });
    }

    return { init };
})();

export default Touch;
