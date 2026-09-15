// Cursor API — controls the mouse pointer for BOTH the real (hardware) mouse
// and the virtual touchpad cursor.
//
// Auto mode (default): the real mouse uses each element's native CSS cursor,
// and the virtual cursor mirrors whatever is under it (arrow on plain areas,
// pointing hand on links / buttons / file items, I-beam on text, ...).
//
// Custom mode via set(): forces one cursor everywhere for both mice.
// Themes via setTheme()/setSize(): recolors + rescales both mice while
// keeping per-context shapes (arrow / hand / I-beam). Persisted through
// SystemConfig (`cursorTheme`, `cursorSize`).
//
// Apps: import Cursor from '../../modules/cursor.js';

const Cursor = (() => {
    // ---------- Themes ----------
    const THEMES = {
        default:  { name: 'Arctic White',  desc: 'Classic white pointer', fill: '#ffffff', stroke: '#111111', accent: '#0078D4' },
        midnight: { name: 'Midnight Black', desc: 'High-contrast dark pointer', fill: '#1b1b1b', stroke: '#ffffff', accent: '#9ecfff' },
        ocean:    { name: 'Ocean Blue',    desc: 'Cool blue pointer',      fill: '#38a8ff', stroke: '#06283f', accent: '#38a8ff' },
        forest:   { name: 'Forest Green',  desc: 'Fresh green pointer',    fill: '#3ddc84', stroke: '#06351d', accent: '#3ddc84' },
        sunset:   { name: 'Sunset Orange', desc: 'Warm orange pointer',    fill: '#ff9f2e', stroke: '#4a2400', accent: '#ff9f2e' },
        royal:    { name: 'Royal Purple',  desc: 'Bold purple pointer',    fill: '#b07cff', stroke: '#2a0a5e', accent: '#b07cff' },
        crimson:  { name: 'Crimson Red',   desc: 'Striking red pointer',   fill: '#ff5b5b', stroke: '#4a0505', accent: '#ff5b5b' },
        pink:     { name: 'Bubblegum Pink', desc: 'Playful pink pointer',  fill: '#ff7ad9', stroke: '#4d0a38', accent: '#ff7ad9' },
        gold:     { name: 'Golden',        desc: 'Shiny gold pointer',     fill: '#ffd93b', stroke: '#4a3800', accent: '#ffd93b' }
    };

    const SIZES = {
        'normal':      { name: 'Normal',      scale: 1,   px: 22 },
        'large':       { name: 'Large',       scale: 1.5, px: 32 },
        'extra-large': { name: 'Extra large', scale: 2,   px: 44 }
    };

    const DEFAULT_THEME = 'default';
    const DEFAULT_SIZE = 'normal';

    // ---------- Themed shape builders (virtual cursor) ----------
    function arrowSvg(t, px) {
        return `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="none"><path d="M5 3l14 7-6.5 1.5L9 18 5 3z" fill="${t.fill}" stroke="${t.stroke}" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
    }

    function handSvg(t, px) {
        return `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="none"><path d="M9.5 3.8a1.2 1.2 0 012.4 0v5.4l.5-.5a1.2 1.2 0 011.7 0l.3.3V7.2a1.2 1.2 0 012.4 0v2.5l.4-.3a1.2 1.2 0 011.7.4l.2.5v4c0 3.5-2.5 6.4-6 6.9-2.9.4-5.1-1-6.5-3.3l-2.6-4.3a1.2 1.2 0 012-1.3l1.8 2.2V3.8z" fill="${t.fill}" stroke="${t.stroke}" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
    }

    function textSvg(t, px) {
        return `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="none"><path d="M11 4h2v16h-2V4zM7 4h10v2.4H7V4zM7 17.6h10V20H7v-2.4z" fill="${t.fill}" stroke="${t.stroke}" stroke-width="1" stroke-linejoin="round"/></svg>`;
    }

    function crossSvg(t, px) {
        return `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="6.5" stroke="${t.fill}" stroke-width="1.6"/><circle cx="12" cy="12" r="6.5" stroke="${t.stroke}" stroke-width="0.6"/><path d="M12 1v6M12 17v6M1 12h6M17 12h6" stroke="${t.fill}" stroke-width="1.6" stroke-linecap="round"/></svg>`;
    }

    function moveSvg(t, px) {
        return `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="none"><path d="M12 2v20M2 12h20M12 2l-3 3m3-3l3 3M12 22l-3-3m3 3l3-3M2 12l3-3m-3 3l3 3M22 12l-3-3m3 3l-3 3" stroke="${t.fill}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 2v20M2 12h20" stroke="${t.stroke}" stroke-width="0.6" stroke-linecap="round"/></svg>`;
    }

    function banSvg(t, px) {
        return `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="${t.fill}" stroke-width="1.8"/><circle cx="12" cy="12" r="8.5" stroke="${t.stroke}" stroke-width="0.7"/><path d="M6 6l12 12" stroke="#e81123" stroke-width="2" stroke-linecap="round"/></svg>`;
    }

    function spinnerHtml(t, px) {
        const s = Math.max(14, Math.round(px * 0.8));
        return `<div class="vc-spinner" style="width:${s}px;height:${s}px;border-top-color:${t.accent};"></div>`;
    }

    function themedShape(shape, themeId, sizeId) {
        const t = THEMES[themeId] || THEMES[DEFAULT_THEME];
        const px = (SIZES[sizeId] || SIZES[DEFAULT_SIZE]).px;
        switch (shape) {
            case 'hand': return handSvg(t, px);
            case 'text': return textSvg(t, px);
            case 'wait': return spinnerHtml(t, px);
            case 'cross': return crossSvg(t, px);
            case 'move': return moveSvg(t, px);
            case 'ban': return banSvg(t, px);
            case 'none': return ``;
            case 'arrow':
            default: return arrowSvg(t, px);
        }
    }

    // Legacy static shapes (default theme, normal size) — kept so any
    // external code referencing them keeps working.
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
    let currentTheme = DEFAULT_THEME;
    let currentSize = DEFAULT_SIZE;
    let pendingSync = null;     // {x, y} waiting for rAF
    let syncScheduled = false;
    let styleEl = null;
    let themeStyleEl = null;

    function getCursorEl() {
        return document.getElementById('virtual-cursor');
    }

    function setVirtualShape(shape) {
        if (!SHAPES[shape] && shape !== 'none') shape = 'arrow';
        if (!(shape in SHAPES)) shape = 'arrow';
        if (shape === currentShape) {
            // Still ensure content exists (element may have been recreated)
            // or the theme/size changed under us.
            const el = getCursorEl();
            if (el && (!el.dataset.shape || el.dataset.theme !== currentTheme || el.dataset.size !== currentSize)) {
                applyShape(el, shape);
            }
            return;
        }
        currentShape = shape;
        const el = getCursorEl();
        if (el) applyShape(el, shape);
    }

    function applyShape(el, shape) {
        el.innerHTML = themedShape(shape, currentTheme, currentSize);
        el.dataset.shape = shape;
        el.dataset.theme = currentTheme;
        el.dataset.size = currentSize;
        const px = (SIZES[currentSize] || SIZES[DEFAULT_SIZE]).px;
        el.style.width = px + 'px';
        el.style.height = px + 'px';
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
        if (!el) return;
        if (el.dataset.shape !== currentShape || el.dataset.theme !== currentTheme || el.dataset.size !== currentSize) {
            applyShape(el, currentShape);
        }
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

    function ensureThemeStyleEl() {
        if (themeStyleEl) return themeStyleEl;
        themeStyleEl = document.getElementById('os-cursor-theme');
        if (!themeStyleEl) {
            themeStyleEl = document.createElement('style');
            themeStyleEl.id = 'os-cursor-theme';
            document.head.appendChild(themeStyleEl);
        }
        return themeStyleEl;
    }

    // Force one cursor for the REAL mouse everywhere (incl. elements with
    // inline cursor styles) via an !important override stylesheet.
    function applyCustomToReal() {
        const el = ensureStyleEl();
        el.textContent = `html.os-cursor-override.os-cursor-override, html.os-cursor-override.os-cursor-override *, html.os-cursor-override.os-cursor-override *::before, html.os-cursor-override.os-cursor-override *::after { cursor: ${custom} !important; }`;
        document.documentElement.classList.add('os-cursor-override');
    }

    function clearCustomFromReal() {
        document.documentElement.classList.remove('os-cursor-override');
        if (styleEl) styleEl.textContent = '';
    }

    // ---------- Theme -> real mouse (data-URL SVG cursors) ----------
    function svgUrl(svg) {
        return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    }

    // Standalone SVG docs for the real mouse (needs xmlns + explicit size).
    function realArrowSvg(t, px) {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24"><path d="M5 3l14 7-6.5 1.5L9 18 5 3z" fill="${t.fill}" stroke="${t.stroke}" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
    }

    function realHandSvg(t, px) {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24"><path d="M9.5 3.8a1.2 1.2 0 012.4 0v5.4l.5-.5a1.2 1.2 0 011.7 0l.3.3V7.2a1.2 1.2 0 012.4 0v2.5l.4-.3a1.2 1.2 0 011.7.4l.2.5v4c0 3.5-2.5 6.4-6 6.9-2.9.4-5.1-1-6.5-3.3l-2.6-4.3a1.2 1.2 0 012-1.3l1.8 2.2V3.8z" fill="${t.fill}" stroke="${t.stroke}" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
    }

    function realTextSvg(t, px) {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24"><path d="M11 4h2v16h-2V4zM7 4h10v2.4H7V4zM7 17.6h10V20H7v-2.4z" fill="${t.fill}" stroke="${t.stroke}" stroke-width="1" stroke-linejoin="round"/></svg>`;
    }

    // Interactive elements that should show the pointing hand even though
    // their `cursor: pointer` may come from inline styles or app CSS.
    const HAND_SELECTORS = [
        'a[href]', 'button', 'select', 'summary', '[role="button"]',
        'input[type="checkbox"]', 'input[type="radio"]', 'input[type="range"]', 'input[type="color"]',
        '.desktop-icon', '.fe-content .fe-item', '.drive-item', '.fe-sidebar-item',
        '.settings-nav-item', '.system-sub-card', '.theme-option', '.accent-option',
        '.bg-option', '.cursor-theme-option', '.cursor-size-option',
        '.taskbar-btn', '.app-item', '.start-menu-all-btn', '.ctx-item',
        '.notif-action-btn', '.search-result-item'
    ];

    const TEXT_SELECTORS = [
        'input[type="text"]', 'input:not([type])', 'input[type="password"]',
        'input[type="email"]', 'input[type="number"]', 'input[type="search"]',
        'input[type="url"]', 'input[type="tel"]', 'textarea',
        '[contenteditable="true"]', '[contenteditable=""]'
    ];

    function applyThemeToReal() {
        const t = THEMES[currentTheme] || THEMES[DEFAULT_THEME];
        const px = (SIZES[currentSize] || SIZES[DEFAULT_SIZE]).px;
        const scale = px / 22;
        const ax = Math.max(1, Math.round(5 * scale));
        const ay = Math.max(1, Math.round(3 * scale));
        const hx = Math.max(1, Math.round(10 * scale));
        const hy = Math.max(1, Math.round(5 * scale));
        const tx = Math.max(1, Math.round(px / 2));
        const ty = Math.max(1, Math.round(px / 2));

        const arrow = `${svgUrl(realArrowSvg(t, px))} ${ax} ${ay}, default`;
        const hand = `${svgUrl(realHandSvg(t, px))} ${hx} ${hy}, pointer`;
        const text = `${svgUrl(realTextSvg(t, px))} ${tx} ${ty}, text`;

        const root = `html[data-cursor-theme="${currentTheme}"]:not(.os-cursor-override)`;
        const handSel = HAND_SELECTORS.map(s => `${root} ${s}:not(.resize-handle)`).join(',\n');
        const textSel = TEXT_SELECTORS.map(s => `${root} ${s}:not(.resize-handle)`).join(',\n');

        const el = ensureThemeStyleEl();
        el.textContent =
            `${root},\n` +
            `${root} *:not(.resize-handle),\n` +
            `${root} *:not(.resize-handle)::before,\n` +
            `${root} *:not(.resize-handle)::after { cursor: ${arrow} !important; }\n` +
            `${handSel} { cursor: ${hand} !important; }\n` +
            `${textSel} { cursor: ${text} !important; }`;

        const doc = document.documentElement;
        doc.setAttribute('data-cursor-theme', currentTheme);
        doc.setAttribute('data-cursor-size', currentSize);
        doc.style.setProperty('--cursor-scale', String((SIZES[currentSize] || SIZES[DEFAULT_SIZE]).scale));
    }

    function getThemes() {
        return Object.entries(THEMES).map(([id, t]) => ({ id, ...t }));
    }

    function getSizes() {
        return Object.entries(SIZES).map(([id, s]) => ({ id, ...s }));
    }

    function getTheme() {
        return currentTheme;
    }

    function getSize() {
        return currentSize;
    }

    // Switch the color theme for both mice. Returns true on success.
    function setTheme(id) {
        if (typeof id !== 'string' || !THEMES[id]) return false;
        currentTheme = id;
        applyThemeToReal();
        // Re-render the virtual cursor with the new colors.
        const el = getCursorEl();
        if (el) applyShape(el, currentShape);
        else refreshVirtual();
        return true;
    }

    // Switch the cursor size for both mice. Returns true on success.
    function setSize(id) {
        if (typeof id !== 'string' || !SIZES[id]) return false;
        currentSize = id;
        applyThemeToReal();
        const el = getCursorEl();
        if (el) applyShape(el, currentShape);
        else refreshVirtual();
        return true;
    }

    // Apply persisted config values (called by SystemConfig + boot).
    function applyFromConfig(theme, size) {
        let ok = true;
        if (typeof theme === 'string' && THEMES[theme]) currentTheme = theme;
        else if (theme != null) ok = false;
        if (typeof size === 'string' && SIZES[size]) currentSize = size;
        else if (size != null) ok = false;
        applyThemeToReal();
        refreshVirtual();
        return ok;
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

    return { set, reset, get, isCustom, getShape, syncToPosition, refreshVirtual, setTheme, getTheme, setSize, getSize, getThemes, getSizes, applyFromConfig };
})();

window._Cursor = Cursor;

export default Cursor;
