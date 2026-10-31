const Scaling = (() => {
    const BASE_WIDTH = 1920;
    const BASE_HEIGHT = 1080;
    const MIN_SCALE = 0.45;
    const MAX_SCALE = 1;
    const FIXED_MIN = 0.5;
    const FIXED_MAX = 2;

    let currentScale = 1;
    let appleScale = 1;
    let onScaleChange = null;

    function isIPadTouch() {
        try {
            const ua = navigator.userAgent;
            if (/iPad/.test(ua)) return true;
            if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;
            return false;
        } catch (e) {
            return false;
        }
    }

    function computeAdaptiveScale() {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const minDim = Math.min(vw, vh);
        const baseMin = Math.min(BASE_WIDTH, BASE_HEIGHT);
        const raw = minDim / baseMin;
        return Math.max(MIN_SCALE, Math.min(MAX_SCALE, raw));
    }

    function getMode() {
        try {
            if (window.SystemConfig) {
                return window.SystemConfig.get('scaling') || 'auto';
            }
        } catch (e) {}
        return 'auto';
    }

    function computeScale() {
        if (window._isAppleTouch) return 1;
        const mode = getMode();
        if (mode === 'auto') {
            return computeAdaptiveScale();
        }
        const pct = parseInt(mode, 10);
        if (!isNaN(pct)) {
            return Math.max(FIXED_MIN, Math.min(FIXED_MAX, pct / 100));
        }
        return computeAdaptiveScale();
    }

    function apply() {
        currentScale = computeScale();
        // Apple touch: keep body zoom 1 to avoid Safari-distorted iframe inner
        // viewports; apply the intended scale via a CSS transform instead so
        // embedded pages still lay out correctly and the CSS `transform` path
        // handles the visual scaling without changing iframe viewport units.
        if (window._isAppleTouch) {
            appleScale = isIPadTouch() ? 0.8 : 0.75;
            document.documentElement.style.removeProperty('--res-scale'); // not used
            document.documentElement.style.setProperty('--scale', currentScale);
            document.documentElement.style.setProperty('--apple-scale', appleScale);
            if (document.body) document.body.setAttribute('data-apple-scale', '');
        } else {
            appleScale = currentScale;
            document.documentElement.style.removeProperty('--apple-scale');
            if (document.body) document.body.removeAttribute('data-apple-scale');
            document.documentElement.style.setProperty('--scale', currentScale);
        }
        if (onScaleChange) onScaleChange(getScale());
    }

    function getScale() {
        return window._isAppleTouch ? appleScale : currentScale;
    }

    // Effective CSS zoom applied to <body> (adaptive scale * display
    // resolution scale). JS-positioned overlays that are children of <body>
    // must divide viewport coordinates (clientX/innerWidth) by this before
    // writing left/top, because `position: fixed` lengths are zoomed too.
    // Overlays on documentElement (touch cursor/keyboard) are unaffected.
    function getUiZoom() {
        try {
            const z = parseFloat(getComputedStyle(document.body).zoom);
            if (Number.isFinite(z) && z > 0 && !window._isAppleTouch) return z;
        } catch (e) { /* no DOM */ }
        if (window._isAppleTouch) {
            try {
                const r = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--apple-scale')) || appleScale;
                const res = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--res-scale')) || 1;
                return r * res;
            } catch (e) { return appleScale; }
        }
        try {
            const rootStyle = getComputedStyle(document.documentElement);
            const s = parseFloat(rootStyle.getPropertyValue('--scale')) || 1;
            const r = parseFloat(rootStyle.getPropertyValue('--res-scale')) || 1;
            return s * r;
        } catch (e) {
            return 1;
        }
    }

    function setMode(mode) {
        try {
            if (window.SystemConfig) {
                window.SystemConfig.set('scaling', mode);
            }
        } catch (e) {}
        apply();
    }

    function setOnScaleChange(cb) {
        onScaleChange = cb;
    }

    function init() {
        apply();
        window.addEventListener('resize', apply);
    }

    return { init, apply, getScale, getUiZoom, setMode, getMode, setOnScaleChange };
})();

export default Scaling;
