// Console / touch-like platform detection shared by the shell.
//
// The PlayStation 4 ships an older WebKit browser controlled with a gamepad.
// It does not produce reliable mouse movement, so the OS must behave like a
// direct-touch (mobile) device: taps are direct clicks, hover-dependent UI is
// avoided, and touch-friendly hit targets apply. PS5's browser identifies as
// "PlayStation 5" and benefits from the same treatment.
const Platform = (() => {
    function ua() {
        try { return (typeof navigator !== 'undefined' && navigator.userAgent) || ''; }
        catch (e) { return ''; }
    }

    const isPS4 = (() => {
        try { return /PlayStation 4|PLAYSTATION 4/i.test(ua()); }
        catch (e) { return false; }
    })();

    const isPS5 = (() => {
        try { return /PlayStation 5|PLAYSTATION 5/i.test(ua()); }
        catch (e) { return false; }
    })();

    // Any PlayStation console browser (PS4/PS5). These need direct-click /
    // touch-like UI because the pointer does not behave like a desktop mouse.
    const isPlayStation = isPS4 || isPS5;

    // A console-style browser that should get the mobile/touch interaction
    // model even when it does not advertise touch hardware. Extend this list
    // if other console browsers need the same workaround.
    const isConsoleTouch = isPlayStation;

    // Treat as a touch/coarse-pointer environment for UI decisions (large hit
    // targets, tap-to-open file listings, touch keyboard defaults, etc.). This
    // is ORed with real touch/coarse-pointer detection at each call site so
    // genuine touch devices are never excluded.
    function isTouchLike() {
        if (isConsoleTouch) return true;
        try {
            if (typeof window !== 'undefined' && window.matchMedia
                && window.matchMedia('(pointer: coarse)').matches) return true;
        } catch (e) { /* noop */ }
        try {
            if (typeof window !== 'undefined' && ('ontouchstart' in window)) return true;
        } catch (e) { /* noop */ }
        try {
            if (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) return true;
        } catch (e) { /* noop */ }
        return false;
    }

    // Expose for non-module consumers and for early bootstrap/CSS hooks.
    try {
        if (typeof window !== 'undefined') {
            window._isPS4 = isPS4;
            window._isPS5 = isPS5;
            window._isPlayStation = isPlayStation;
            window._isConsoleTouch = isConsoleTouch;
            window._Platform = { isPS4, isPS5, isPlayStation, isConsoleTouch, isTouchLike };
        }
    } catch (e) { /* noop */ }

    // Mark the document so CSS can apply coarse/touch-friendly rules even when
    // the browser does not report `(pointer: coarse)`.
    try {
        if (isConsoleTouch && typeof document !== 'undefined' && document.documentElement) {
            document.documentElement.classList.add('ps4');
            document.documentElement.classList.add('console-touch');
        }
    } catch (e) { /* noop */ }

    return { isPS4, isPS5, isPlayStation, isConsoleTouch, isTouchLike, ua };
})();

export default Platform;
