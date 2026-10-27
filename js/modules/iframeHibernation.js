// IframeHibernation — release the embedded documents of hidden windows.
//
// iPhone/iPad Safari runs the whole page in ONE WebContent process with a
// hard memory ceiling. When a page reaches it, iOS does not crash politely:
// the process is killed (jetsam) and Safari silently reloads the tab — the
// operating system appears to restart by itself, straight back to the boot
// screen and the sign-in picker, in the middle of a game.
//
// The OS used to feed that limit. Hiding a window (minimize, another virtual
// desktop, a background session) only sets `display: none`, so the frame kept
// its document, its wasm heap and its WebGL context alive; closing a game
// releases it, minimizing it never did. Open a few embedded games, minimize
// each, and several engines are resident at once for nothing.
//
// On Apple touch devices a frame of a window the OS is not showing is
// therefore *parked*: the element is detached (which destroys its browsing
// context and frees the engine) and put back — same parent, same position,
// same src — as soon as the window is on screen again. The frame reloads, the
// way a discarded mobile browser tab does. Windows that are visible keep
// running exactly as before, and desktop/Android are untouched: this module
// does nothing unless the shell reports an Apple touch device.
import IframeViewportFix from './iframeViewportFix.js';

const IframeHibernation = (() => {
    const WINDOW_SELECTOR = '.app-window';

    const frames = new Set();  // every frame this module knows about
    const parked = new Map();  // frame -> { parent, next, win }
    let enabled = false;
    let scheduled = false;

    function isAppleTouchDevice() {
        // The same detection iframeViewportFix uses (it also publishes the
        // flag for scaling/systemConfig, including iPadOS desktop-mode Safari,
        // which reports a Mac user agent but keeps multi-touch).
        if (typeof window !== 'undefined' && window._isAppleTouch) return true;
        try {
            const ua = navigator.userAgent;
            if (/iPhone|iPod|iPad/.test(ua)) return true;
            return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
        } catch (e) {
            return false;
        }
    }

    function ownerWindow(frame) {
        try {
            return frame && frame.closest ? frame.closest(WINDOW_SELECTOR) : null;
        } catch (e) {
            return null;
        }
    }

    // A window the OS is not showing has no layout box at all (it is
    // display:none, whether it was minimized, left on another virtual desktop
    // or belongs to a background session).
    function isShown(win) {
        if (!win || typeof win.getClientRects !== 'function') return true;
        try {
            return win.getClientRects().length > 0;
        } catch (e) {
            return true;
        }
    }

    function park(frame) {
        const parent = frame.parentElement;
        if (!parent) return;
        parked.set(frame, { parent, next: frame.nextSibling, win: ownerWindow(frame) });
        frame.remove();
    }

    function wake(frame) {
        const slot = parked.get(frame);
        if (!slot) return;
        parked.delete(frame);
        const parent = slot.parent;
        if (!parent || !parent.isConnected) {
            frames.delete(frame);
            return;
        }
        const next = slot.next;
        if (next && next.parentNode === parent) parent.insertBefore(frame, next);
        else parent.appendChild(frame);
        // The frame is back in the document: let the iOS letterbox fixer size
        // it before it starts painting.
        try { IframeViewportFix.sync(frame); } catch (e) { /* not tracked yet */ }
    }

    function sync() {
        if (!enabled) return;
        for (const frame of Array.from(frames)) {
            const slot = parked.get(frame);
            if (slot) {
                // The window (or its slot) is gone: drop the element for good.
                if (!slot.parent || !slot.parent.isConnected || !slot.win || !slot.win.isConnected) {
                    parked.delete(frame);
                    frames.delete(frame);
                    continue;
                }
                if (isShown(slot.win)) wake(frame);
                continue;
            }
            if (!frame.isConnected) { frames.delete(frame); continue; }
            const win = ownerWindow(frame);
            // Frames outside a window belong to the shell: never touch them.
            if (!win || isShown(win)) continue;
            park(frame);
        }
    }

    // Cheap for callers: one rAF-coalesced pass, no matter how many windows
    // were created, minimized or restored in this turn.
    function schedule() {
        if (!enabled || scheduled) return;
        scheduled = true;
        const run = () => { scheduled = false; sync(); };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
        else setTimeout(run, 0);
    }

    function collect(node) {
        if (!node || node.nodeType !== 1) return;
        if (node.tagName === 'IFRAME') frames.add(node);
        if (!node.querySelectorAll) return;
        node.querySelectorAll('iframe').forEach((frame) => frames.add(frame));
    }

    function init() {
        // iPhone/iPad only: desktop and Android have a per-tab renderer and a
        // much larger budget, and reloading their games on restore would be a
        // regression, not a fix.
        enabled = isAppleTouchDevice();
        if (!enabled) return false;

        const root = document.body || document.documentElement;
        if (!root) return false;
        collect(root);

        if (typeof MutationObserver === 'function') {
            const observer = new MutationObserver((mutations) => {
                for (const m of mutations) {
                    for (const node of m.addedNodes) collect(node);
                }
                schedule();
            });
            observer.observe(root, { childList: true, subtree: true });
        }

        // The window manager reports every window state change through its
        // own event; applyVisibility() calls schedule() as well, so desktop
        // and session switches are covered even without a focus change.
        window.addEventListener('window-minimized', schedule);
        window.addEventListener('window-restored', schedule);
        // A closed window takes its parked frames with it; drop them from the
        // bookkeeping instead of keeping the detached elements alive.
        window.addEventListener('window-closed', schedule);

        schedule();
        return true;
    }

    return { init, schedule, sync, get active() { return enabled; } };
})();

export default IframeHibernation;
