import Scaling from './scaling.js';

const Touch = (() => {
    const LONG_PRESS_MS = 500;
    const MOVE_THRESHOLD = 10;

    let indicator = null;
    let touchData = null;

    function getScale() {
        const scale = Scaling.getScale() || 1;
        const resScale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--res-scale')) || 1;
        return scale * resScale;
    }

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
        if (indicator) indicator.style.pointerEvents = 'none';
        const el = document.elementFromPoint(x, y);
        if (indicator) indicator.style.pointerEvents = '';
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

    function handleTouchStart(e) {
        requestFullscreen();
        if (e.touches.length > 1) return;
        const t = e.touches[0];
        const x = t.clientX;
        const y = t.clientY;
        const target = getTarget(x, y);

        if (!target) return;

        if (target.closest('input, textarea, select, button, [contenteditable]')) {
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
