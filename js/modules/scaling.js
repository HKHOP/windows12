const Scaling = (() => {
    const BASE_WIDTH = 1920;
    const BASE_HEIGHT = 1080;
    const MIN_SCALE = 0.45;
    const MAX_SCALE = 1;

    function computeScale() {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const minDim = Math.min(vw, vh);
        const baseMin = Math.min(BASE_WIDTH, BASE_HEIGHT);
        const raw = minDim / baseMin;
        return Math.max(MIN_SCALE, Math.min(MAX_SCALE, raw));
    }

    function apply() {
        const scale = computeScale();
        document.documentElement.style.setProperty('--scale', scale);
    }

    function getScale() {
        return computeScale();
    }

    function init() {
        apply();
        window.addEventListener('resize', apply);
    }

    return { init, apply, getScale };
})();

export default Scaling;
