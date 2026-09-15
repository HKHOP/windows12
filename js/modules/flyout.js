// Shared show/hide helper for taskbar flyouts (Start menu, Search panel).
// Hiding plays a CSS close animation: the element gets a `closing` class
// (styled per-flyout in CSS, ~150ms) and `hidden` is applied when it ends.
// Dependency-free so taskbar/startMenu/search can all use it without cycles.
const Flyout = (() => {
    const CLOSE_MS = 160;
    const timers = new WeakMap();

    function show(el, closingClass = 'closing') {
        if (!el) return;
        const t = timers.get(el);
        if (t) {
            clearTimeout(t);
            timers.delete(el);
        }
        el.classList.remove(closingClass);
        el.classList.remove('hidden');
    }

    function hide(el, closingClass = 'closing') {
        if (!el) return;
        if (el.classList.contains('hidden')) return;
        if (el.classList.contains(closingClass)) return;
        el.classList.add(closingClass);
        const t = setTimeout(() => {
            timers.delete(el);
            el.classList.add('hidden');
            el.classList.remove(closingClass);
        }, CLOSE_MS);
        timers.set(el, t);
    }

    // Clicking mid-close reopens instead of swallowing the click.
    function toggle(el, closingClass = 'closing') {
        if (!el) return;
        if (el.classList.contains('hidden') || el.classList.contains(closingClass)) show(el, closingClass);
        else hide(el, closingClass);
    }

    function isOpen(el) {
        return !!el && !el.classList.contains('hidden');
    }

    return { show, hide, toggle, isOpen, CLOSE_MS };
})();

export default Flyout;
