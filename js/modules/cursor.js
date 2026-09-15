// Cursor API — controls the mouse pointer for BOTH the real (hardware) mouse
// and the virtual touchpad cursor.
//
// Auto mode (default): the real mouse uses each element's native CSS cursor,
// and the virtual cursor mirrors whatever is under it (arrow on plain areas,
// pointing hand on links / buttons / file items, I-beam on text, ...).
//
// Custom mode via set(): forces one cursor everywhere for both mice.
// Themes via setTheme()/setSize()/setStyle(): recolor, rescale and restyle
// both mice while keeping per-context shapes (arrow / hand / I-beam).
// Persisted through SystemConfig (`cursorTheme`, `cursorSize`, `cursorStyle`).
//
// Apps: import Cursor from '../../modules/cursor.js';

import IframePointer from './iframePointer.js';

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
    const DEFAULT_STYLE = 'modern';

    const STYLES = {
        modern:  { name: 'Modern Arrow',  desc: 'The default Spark pointer' },
        classic: { name: 'Classic',       desc: 'Windows-style arrow with notched tail' },
        hands:   { name: 'Hands',         desc: 'A pointing hand for the pointer' }
    };

    // ---------- Themed shape builders (virtual cursor) ----------
    function arrowSvg(t, px) {
        return `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="none"><path d="M5 3l14 7-6.5 1.5L9 18 5 3z" fill="${t.fill}" stroke="${t.stroke}" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
    }

    // Side-profile pointing hand (Windows-concept style): tall index finger,
    // curled-finger mass right, thumb branching left, tapered wrist.
    // Fingertip at (10.7,2.5) — see HOTSPOTS.
    const HAND_PATH = 'M10.7 2.5C11.6 2.5 12.1 3.1 12.1 4L12.1 8.8C13.8 8 15.6 8.8 15.9 10.6C17.2 11.2 17.6 12.8 17 14.2C16.8 15.8 16.2 17.2 15.6 18.4L15.3 20.1C15.2 20.8 14.7 21.2 14 21.2L10.4 21.2C9.7 21.2 9.3 20.8 9.3 20.1L9.1 17.6L5.2 15.6C4.4 15.2 4.2 14.2 4.9 13.7L8.9 11.4C9.1 11 9.2 10.5 9.3 10L9.3 4C9.3 3.1 9.8 2.5 10.7 2.5Z';
    const CUFF_RECT = 'x="9" y="17.8" width="6.6" height="3.6" rx="1.1"';

    // Blue segmented tail ring (busy cursor, concept style). Spun via the
    // .vc-busy-ring CSS animation (see main.css).
    function busyRingSvg(t, px) {
        return `<svg class="vc-busy-ring" width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" style="transform-box:fill-box;transform-origin:center;"><path d="M12 5 A7 7 0 0 1 18.1 15.5" stroke="${t.accent}" stroke-width="2.4" stroke-linecap="round"/><path d="M16.5 17.4 A7 7 0 0 1 7.5 17.4" stroke="${t.accent}" stroke-width="2.4" stroke-linecap="round" opacity="0.55"/><path d="M5.9 15.5 A7 7 0 0 1 5.9 8.5" stroke="${t.accent}" stroke-width="2.4" stroke-linecap="round" opacity="0.3"/></svg>`;
    }

    // Unavailable: red ring + slash (concept style).
    function conceptBanSvg(px) {
        return `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="#e81123" stroke-width="2"/><path d="M6.5 17.5 L17.5 6.5" stroke="#e81123" stroke-width="2" stroke-linecap="round"/></svg>`;
    }

    function handSvg(t, px) {
        return `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="none"><path d="${HAND_PATH}" fill="${t.fill}" stroke="${t.stroke}" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
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

    // Windows-authentic arrow: straight left edge with the classic notched
    // tail (tip at 6.5,3.5 in viewBox units).
    function classicArrowSvg(t, px) {
        return `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="none"><path d="M6.5 3.5 L6.5 16.5 L10.3 13 L12.3 17.6 L14.7 16.5 L12.7 12 L17.3 12 Z" fill="${t.fill}" stroke="${t.stroke}" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
    }

    // Pointing glove with a cuff (classic Windows link hand). Fingertip at
    // the same point as the plain hand so hotspots stay shared.
    function cuffHandSvg(t, px) {
        return `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="none"><path d="${HAND_PATH}" fill="${t.fill}" stroke="${t.stroke}" stroke-width="1.3" stroke-linejoin="round"/><rect ${CUFF_RECT} fill="${t.accent}" stroke="${t.stroke}" stroke-width="1.1"/></svg>`;
    }

    // Classic hourglass (Classic pack's busy cursor).
    function hourglassSvg(t, px) {
        return `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="none"><path d="M7 3.5h10M7 20.5h10M8.5 3.5c0 5 1.2 6.8 3.5 8.5-2.3 1.7-3.5 3.5-3.5 8.5M15.5 3.5c0 5-1.2 6.8-3.5 8.5 2.3 1.7 3.5 3.5 3.5 8.5" stroke="${t.fill}" stroke-width="1.7" stroke-linecap="round"/><path d="M7 3.5h10M7 20.5h10" stroke="${t.stroke}" stroke-width="0.7" stroke-linecap="round"/></svg>`;
    }

    // Open palm (Hands pack's move cursor).
    function palmSvg(t, px) {
        return `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="none"><path d="M8.5 12.5V6.8a1.4 1.4 0 012.8 0v3.7V5.2a1.4 1.4 0 012.8 0v5.3V6a1.4 1.4 0 012.8 0v6.6c0 4.2-2.6 7.4-6.2 7.4-2.6 0-4.3-1.4-5.7-4L3.6 13a1.4 1.4 0 012.4-1.4l2.5 3.1v-2.2z" fill="${t.fill}" stroke="${t.stroke}" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
    }

    function themedShape(shape, themeId, sizeId, styleId) {
        const t = THEMES[themeId] || THEMES[DEFAULT_THEME];
        const px = (SIZES[sizeId] || SIZES[DEFAULT_SIZE]).px;
        const style = STYLES[styleId] ? styleId : DEFAULT_STYLE;
        if (style === 'classic') {
            switch (shape) {
                case 'hand': return cuffHandSvg(t, px);
                case 'wait': return hourglassSvg(t, px);
                case 'text': return textSvg(t, px);
                case 'cross': return crossSvg(t, px);
                case 'move': return moveSvg(t, px);
                case 'ban': return conceptBanSvg(px);
                case 'none': return ``;
                case 'arrow':
                default: return classicArrowSvg(t, px);
            }
        }
        if (style === 'hands') {
            switch (shape) {
                case 'hand': return cuffHandSvg(t, px);
                case 'text': return textSvg(t, px);
                case 'wait': return busyRingSvg(t, px);
                case 'cross': return crossSvg(t, px);
                case 'move': return palmSvg(t, px);
                case 'ban': return conceptBanSvg(px);
                case 'none': return ``;
                case 'arrow':
                default: return handSvg(t, px);
            }
        }
        switch (shape) {
            case 'hand': return handSvg(t, px);
            case 'text': return textSvg(t, px);
            case 'wait': return busyRingSvg(t, px);
            case 'cross': return crossSvg(t, px);
            case 'move': return moveSvg(t, px);
            case 'ban': return conceptBanSvg(px);
            case 'none': return ``;
            case 'arrow':
            default: return arrowSvg(t, px);
        }
    }

    // Hotspot (click point) of each virtual-cursor shape, in 24x24 viewBox
    // units matching the SVGs above, per pointer style. The touch layer
    // anchors this exact point on its logic coordinates, so shape detection
    // and clicks land precisely where the tip points — no offset.
    const HOTSPOTS = {
        modern: {
            arrow: { x: 5, y: 3 },
            hand: { x: 10.7, y: 2.5 },
            text: { x: 12, y: 12 },
            wait: { x: 12, y: 12 },
            cross: { x: 12, y: 12 },
            move: { x: 12, y: 12 },
            ban: { x: 12, y: 12 },
            none: { x: 0, y: 0 }
        },
        classic: {
            arrow: { x: 6.5, y: 3.5 },
            hand: { x: 10.7, y: 2.5 },
            text: { x: 12, y: 12 },
            wait: { x: 12, y: 12 },
            cross: { x: 12, y: 12 },
            move: { x: 12, y: 12 },
            ban: { x: 12, y: 12 },
            none: { x: 0, y: 0 }
        },
        hands: {
            arrow: { x: 10.7, y: 2.5 },
            hand: { x: 10.7, y: 2.5 },
            text: { x: 12, y: 12 },
            wait: { x: 12, y: 12 },
            cross: { x: 12, y: 12 },
            move: { x: 12, y: 12 },
            ban: { x: 12, y: 12 },
            none: { x: 0, y: 0 }
        }
    };

    // Rendered-pixel hotspot for the current style + shape + size.
    function getHotspot() {
        const pack = HOTSPOTS[currentStyle] || HOTSPOTS[DEFAULT_STYLE];
        const h = pack[currentShape] || pack.arrow;
        const px = (SIZES[currentSize] || SIZES[DEFAULT_SIZE]).px;
        return { x: h.x / 24 * px, y: h.y / 24 * px };
    }

    // Legacy static shapes (default theme, normal size) — kept so any
    // external code referencing them keeps working.
    const SHAPES = {
        arrow: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M5 3l14 7-6.5 1.5L9 18 5 3z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
        hand: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M10.7 2.5C11.6 2.5 12.1 3.1 12.1 4L12.1 8.8C13.8 8 15.6 8.8 15.9 10.6C17.2 11.2 17.6 12.8 17 14.2C16.8 15.8 16.2 17.2 15.6 18.4L15.3 20.1C15.2 20.8 14.7 21.2 14 21.2L10.4 21.2C9.7 21.2 9.3 20.8 9.3 20.1L9.1 17.6L5.2 15.6C4.4 15.2 4.2 14.2 4.9 13.7L8.9 11.4C9.1 11 9.2 10.5 9.3 10L9.3 4C9.3 3.1 9.8 2.5 10.7 2.5Z" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/></svg>`,
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
    let currentStyle = DEFAULT_STYLE;
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
            // or the theme/size/style changed under us.
            const el = getCursorEl();
            if (el && (!el.dataset.shape || el.dataset.theme !== currentTheme || el.dataset.size !== currentSize || el.dataset.style !== currentStyle)) {
                applyShape(el, shape);
            }
            return;
        }
        currentShape = shape;
        const el = getCursorEl();
        if (el) applyShape(el, shape);
    }

    function applyShape(el, shape) {
        el.innerHTML = themedShape(shape, currentTheme, currentSize, currentStyle);
        el.dataset.shape = shape;
        el.dataset.theme = currentTheme;
        el.dataset.size = currentSize;
        el.dataset.style = currentStyle;
        const px = (SIZES[currentSize] || SIZES[DEFAULT_SIZE]).px;
        el.style.width = px + 'px';
        el.style.height = px + 'px';
        // The box size changed, so the tip offset changed too — tell the
        // touch layer to re-anchor the hotspot immediately.
        try {
            window.dispatchEvent(new CustomEvent('vc-reshape'));
        } catch (e) { /* noop */ }
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
        // Same-origin pages inside iframes expose their own cursor styles —
        // mirror those (hand over links, I-beam over text) for the virtual
        // cursor. Cross-origin frames fall through to the outer lookup.
        try {
            const inner = IframePointer.cursorValueAt(x, y);
            if (inner) return shapeForValue(inner);
        } catch (e) { /* fall through to outer detection */ }
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
        if (el.dataset.shape !== currentShape || el.dataset.theme !== currentTheme || el.dataset.size !== currentSize || el.dataset.style !== currentStyle) {
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

    function realClassicArrowSvg(t, px) {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24"><path d="M6.5 3.5 L6.5 16.5 L10.3 13 L12.3 17.6 L14.7 16.5 L12.7 12 L17.3 12 Z" fill="${t.fill}" stroke="${t.stroke}" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
    }

    function realCuffHandSvg(t, px) {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24"><path d="${HAND_PATH}" fill="${t.fill}" stroke="${t.stroke}" stroke-width="1.3" stroke-linejoin="round"/><rect ${CUFF_RECT} fill="${t.accent}" stroke="${t.stroke}" stroke-width="1.1"/></svg>`;
    }

    function realHandSvg(t, px) {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24"><path d="${HAND_PATH}" fill="${t.fill}" stroke="${t.stroke}" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
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
        '.bg-option', '.cursor-theme-option', '.cursor-size-option', '.cursor-style-option',
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
        // Hotspot per style: modern arrow tip (5,3); classic arrow tip
        // (6.5,3.5); pointing-hand fingertip (10.7,3.8); I-beam center.
        let arrowSvg = realArrowSvg(t, px);
        let ax = 5;
        let ay = 3;
        let handSvg = realHandSvg(t, px);
        if (currentStyle === 'classic') {
            arrowSvg = realClassicArrowSvg(t, px);
            ax = 6.5;
            ay = 3.5;
            handSvg = realCuffHandSvg(t, px);
        } else if (currentStyle === 'hands') {
            arrowSvg = realHandSvg(t, px);
            ax = 10.7;
            ay = 3.8;
            handSvg = realCuffHandSvg(t, px);
        }
        const axPx = Math.max(1, Math.round(ax * scale));
        const ayPx = Math.max(1, Math.round(ay * scale));
        const hx = Math.max(1, Math.round(10.7 * scale));
        const hy = Math.max(1, Math.round(2.5 * scale));
        const tx = Math.max(1, Math.round(px / 2));
        const ty = Math.max(1, Math.round(px / 2));

        const arrow = `${svgUrl(arrowSvg)} ${axPx} ${ayPx}, default`;
        const hand = `${svgUrl(handSvg)} ${hx} ${hy}, pointer`;
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
        doc.setAttribute('data-cursor-style', currentStyle);
        doc.style.setProperty('--cursor-scale', String((SIZES[currentSize] || SIZES[DEFAULT_SIZE]).scale));
    }

    function getThemes() {
        return Object.entries(THEMES).map(([id, t]) => ({ id, ...t }));
    }

    function getSizes() {
        return Object.entries(SIZES).map(([id, s]) => ({ id, ...s }));
    }

    // Pointer-style packs, each with a preview arrow (default theme, 26px)
    // for settings UI cards.
    function getStyles() {
        const t = THEMES[DEFAULT_THEME];
        const previews = {
            modern: arrowSvg(t, 26),
            classic: classicArrowSvg(t, 26),
            hands: handSvg(t, 26)
        };
        return Object.entries(STYLES).map(([id, s]) => ({ id, ...s, preview: previews[id] }));
    }

    function getStyle() {
        return currentStyle;
    }

    // Switch the pointer style pack for both mice. Returns true on success.
    function setStyle(id) {
        if (typeof id !== 'string' || !STYLES[id]) return false;
        currentStyle = id;
        applyThemeToReal();
        // Re-render the virtual cursor with the new artwork + hotspot.
        const el = getCursorEl();
        if (el) applyShape(el, currentShape);
        else refreshVirtual();
        return true;
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
    function applyFromConfig(theme, size, style) {
        let ok = true;
        if (typeof theme === 'string' && THEMES[theme]) currentTheme = theme;
        else if (theme != null) ok = false;
        if (typeof size === 'string' && SIZES[size]) currentSize = size;
        else if (size != null) ok = false;
        if (typeof style === 'string' && STYLES[style]) currentStyle = style;
        else if (style != null) ok = false;
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

    return { set, reset, get, isCustom, getShape, getHotspot, syncToPosition, refreshVirtual, setTheme, getTheme, setSize, getSize, getThemes, getSizes, getStyle, setStyle, getStyles, applyFromConfig };
})();

window._Cursor = Cursor;

export default Cursor;
