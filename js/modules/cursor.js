// Cursor API — controls the mouse pointer for BOTH the real (hardware) mouse
// and the virtual touchpad cursor.
//
// Auto mode (default): the real mouse uses each element's native CSS cursor,
// and the virtual cursor mirrors whatever is under it (arrow on plain areas,
// pointing hand on links / buttons / file items, I-beam on text, ...).
//
// Custom mode via set(): forces one cursor everywhere for both mice.
// Apps: import Cursor from '../../modules/cursor.js';

const Cursor = (() => {
    const SHAPES = {
        arrow: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M5 3l14 7-6.5 1.5L9 18 5 3z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
        hand: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M9.5 3.8a1.2 1.2 0 012.4 0v5.4l.5-.5a1.2 1.2 0 011.7 0l.3.3V7.2a1.2 1.2 0 012.4 0v2.5l.4-.3a1.2 1.2 0 011.7.4l.2.5v4c0 3.5-2.5 6.4-6 6.9-2.9.4-5.1-1-6.5-3.3l-2.6-4.3a1.2 1.2 0 012-1.3l1.8 2.2V3.8z" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/></svg>`,
        text: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M11 4h2v16h-2V4zM7 4h10v2.4H7V4zM7 17.6h10V20H7v-2.4z" fill="#fff" stroke="#111" stroke-width="1" stroke-linejoin="round"/></svg>`,
        wait: `<div class="vc-spinner"></div>`,
        cross: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="6.5" stroke="#fff" stroke-width="1.6"/><circle cx="12" cy="12" r="6.5" stroke="#111" stroke-width="0.6"/><path d="M12 1v6M12 17v6M1 12h6M17 12h6" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>`,
        move: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 2v20M2 12h20M12 2l-3 3m3-3l3 3M12 22l-3-3m3 3l3-3M2 12l3-3m-3 3l3 3M22 12l-3-3m3 3l-3 3" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 2v20M2 12h20" stroke="#111" stroke-width="0.6" stroke-linecap="round"/></svg>`,
        ban: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="#fff" stroke-width="1.8"/><circle cx="12" cy="12" r="8.5" stroke="#111" stroke-width="0.7"/><path d="M6 6l12 12" stroke="#e81123" stroke-width="2" stroke-linecap="round"/></svg>`,
        none: ``
    };

    // CSS cursor keyword -> virtual shape.
    const KEYWORD_SHAPES = {
        'default': 'arrow',
        'arrow': 'arrow',
        'pointer': 'hand',
        'text': 'text',
        'vertical-text': 'text',
        'wait': 'wait',
        'progress': 'wait',
        'crosshair': 'cross',
        'move': 'move',
        'all-scroll': 'move',
        'not-allowed': 'ban',
        'no-drop': 'ban',
        'grab': 'hand',
        'grabbing': 'hand',
        'none': 'none'
    };

    // Allowed chars in a custom CSS cursor value (keywords, url("...") x y, fallbacks).
    const SAFE_VALUE = /^[a-zA-Z0-9\s,()\-_."'/:#%.]+$/;

    let custom = null;          // null = auto, otherwise the CSS cursor string
    let currentShape = 'arrow';
    let pendingSync = null;     // {x, y} waiting for rAF
    let syncScheduled = false;
    let styleEl = null;

    function getCursorEl() {
        return document.getElementById('virtual-cursor');
    }

    function setVirtualShape(shape) {
        if (!SHAPES[shape]) shape = 'arrow';
        if (shape === currentShape) {
            // Still ensure content exists (element may have been recreated).
            const el = getCursorEl();
            if (el && !el.dataset.shape) applyShape(el, shape);
            return;
        }
        currentShape = shape;
        const el = getCursorEl();
        if (el) applyShape(el, shape);
    }

    function applyShape(el, shape) {
        el.innerHTML = SHAPES[shape];
        el.dataset.shape = shape;
    }

    function shapeForValue(value) {
        if (!value) return 'arrow';
        const first = value.split(',')[0].trim().toLowerCase();
        if (KEYWORD_SHAPES[first]) return KEYWORD_SHAPES[first];
        // url(...) with keyword fallback — use the fallback.
        const parts = value.split(',');
        const last = parts[parts.length - 1].trim().toLowerCase();
        if (KEYWORD_SHAPES[last]) return KEYWORD_SHAPES[last];
        return 'arrow';
    }

    // Walk up from the deepest element: 'auto' inherits, so the first
    // non-auto cursor found is what the real mouse shows.
    function detectAt(x, y) {
        let el = null;
        try {
            el = document.elementFromPoint(x, y);
        } catch (e) {
            return 'arrow';
        }
        let depth = 0;
        while (el && el !== document.documentElement && depth < 8) {
            let cursor = '';
            try {
                cursor = getComputedStyle(el).cursor || '';
            } catch (e) {
                break;
            }
            if (cursor && cursor !== 'auto') return shapeForValue(cursor);
            el = el.parentElement;
            depth++;
        }
        return 'arrow';
    }

    function doSync(x, y) {
        if (custom) {
            setVirtualShape(shapeForValue(custom));
        } else {
            setVirtualShape(detectAt(x, y));
        }
    }

    // Throttled entry point — call on every mouse/virtual-cursor move.
    function syncToPosition(x, y) {
        pendingSync = { x, y };
        if (syncScheduled) return;
        syncScheduled = true;
        requestAnimationFrame(() => {
            syncScheduled = false;
            if (pendingSync) {
                doSync(pendingSync.x, pendingSync.y);
                pendingSync = null;
            }
        });
    }

    function refreshVirtual() {
        const el = getCursorEl();
        if (el && el.dataset.shape !== currentShape) applyShape(el, currentShape);
    }

    function ensureStyleEl() {
        if (styleEl) return styleEl;
        styleEl = document.getElementById('os-cursor-override');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'os-cursor-override';
            document.head.appendChild(styleEl);
        }
        return styleEl;
    }

    // Force one cursor for the REAL mouse everywhere (incl. elements with
    // inline cursor styles) via an !important override stylesheet.
    function applyCustomToReal() {
        const el = ensureStyleEl();
        el.textContent = `html.os-cursor-override, html.os-cursor-override *, html.os-cursor-override *::before, html.os-cursor-override *::after { cursor: ${custom} !important; }`;
        document.documentElement.classList.add('os-cursor-override');
    }

    function clearCustomFromReal() {
        document.documentElement.classList.remove('os-cursor-override');
        if (styleEl) styleEl.textContent = '';
    }

    // Set one cursor for BOTH mice. Accepts a CSS cursor keyword
    // ('pointer', 'wait', 'text', 'crosshair', 'move', 'not-allowed', ...),
    // 'default'/'auto' (same as reset), or a full CSS cursor value such as
    // 'url("data:image/svg+xml,...") 4 4, pointer'. Returns true on success.
    function set(cursor) {
        if (typeof cursor !== 'string') return false;
        const value = cursor.trim();
        if (!value) return false;
        if (value.toLowerCase() === 'auto') {
            reset();
            return true;
        }
        if (value.length > 500 || !SAFE_VALUE.test(value)) return false;
        custom = value;
        applyCustomToReal();
        setVirtualShape(shapeForValue(custom));
        return true;
    }

    function reset() {
        custom = null;
        clearCustomFromReal();
        setVirtualShape('arrow');
    }

    function get() {
        return custom || 'auto';
    }

    function isCustom() {
        return custom !== null;
    }

    function getShape() {
        return currentShape;
    }

    return { set, reset, get, isCustom, getShape, syncToPosition, refreshVirtual };
})();

window._Cursor = Cursor;

export default Cursor;
