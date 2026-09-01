const Scaling = (() => {
    const BASE_WIDTH = 1920;
    const BASE_HEIGHT = 1080;
    const MIN_SCALE = 0.45;
    const MAX_SCALE = 1;
    const FIXED_MIN = 0.5;
    const FIXED_MAX = 2;

    let currentScale = 1;
    let onScaleChange = null;

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
        document.documentElement.style.setProperty('--scale', currentScale);
        if (onScaleChange) onScaleChange(currentScale);
    }

    function getScale() {
        return currentScale;
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

    return { init, apply, getScale, setMode, getMode, setOnScaleChange };
})();

export default Scaling;
