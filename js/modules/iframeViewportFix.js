// iOS / iPadOS Safari iframe sizing workaround.
//
// Two WebKit quirks meet here; only the first one is still worked around.
//
// 1. An iframe's inner document viewport was sized from its layout box but
//    stopped tracking CSS-driven resizes afterwards (flex tracking, window
//    drag-resize, maximize, tab switching). Every embedded page ended up
//    letterboxed with white gaps at the right and bottom. Re-asserting the
//    frame's pixel box (CSS width/height plus the width/height ATTRIBUTES,
//    which is what forces WebKit to relayout the inner viewport) from its
//    real allotted box fixes that; this module does it on every size change.
//
// 2. `body { zoom }` — how the shell scales — used to be ignored by an
//    iframe, so a scaled shell showed embedded pages at the wrong size. The
//    shell counter-zoomed each frame (zoom: 1/Z on a Z-times box), but that
//    overshot the frame in WebKit, so the shell briefly rendered at zoom 1 on
//    Apple touch devices instead. WebKit now propagates the parent frame's
//    zoom (webkit.org/b/301148, fixed 2025-10) the way Chromium and Firefox
//    already did, so the shell scales normally there and NO counter-zoom is
//    applied: a zoomed frame lays its document out at its own CSS box size
//    and the engine renders it at the accumulated zoom.
//
// Everything is self-correcting: sizes are re-derived from the frame's own
// allotted box (measured with this module's inline sizing temporarily
// removed) on every ResizeObserver tick, so window drag-resize, maximize, tab
// switching and orientation changes all resync. Desktop/Android never run
// this module.

const IframeViewportFix = (() => {
    const isAppleTouch = (() => {
        try {
            const ua = navigator.userAgent;
            if (/iPhone|iPod|iPad/.test(ua)) return true;
            // iPadOS 13+ masquerades as desktop Safari but keeps multi-touch.
            return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
        } catch (e) {
            return false;
        }
    })();

    // Inline properties this module owns while a frame is pinned. Original
    // values are snapshotted once (per frame) and restored for measuring, so
    // app-owned properties (transform, src, sandbox, class...) are never
    // touched.
    const PINNED = ['flex', 'width', 'height', 'minWidth', 'minHeight', 'zoom'];

    const originals = new WeakMap();   // frame -> { <pinned inline values>, setAttrs }
    const userScale = new WeakMap();   // frame -> extra page-zoom factor (browser app)
    const tracked = new WeakSet();
    let resizeObserver = null;

    // Also exported as window._isAppleTouch for the rest of the shell
    // (iframe hibernation is Apple-touch only). Set at module-evaluation
    // time, before boot applies the shell's scaling.
    if (isAppleTouch) window._isAppleTouch = true;

    function snapshot(frame) {
        let o = originals.get(frame);
        if (!o) {
            o = { setAttrs: false };
            for (const p of PINNED) o[p] = frame.style[p];
            originals.set(frame, o);
        }
        return o;
    }

    function pin(frame) {
        const o = snapshot(frame);
        // 1. Restore the app's original sizing so flex/percentages resolve
        //    the frame's allotted box (reading clientWidth forces layout
        //    with the restored styles).
        for (const p of PINNED) frame.style[p] = o[p] || '';
        if (o.setAttrs) {
            frame.removeAttribute('width');
            frame.removeAttribute('height');
            o.setAttrs = false;
        }
        const w = frame.clientWidth;
        const h = frame.clientHeight;
        // display:none tabs / mid-removal frames: nothing to pin yet. A
        // ResizeObserver tick fires again once they get a real box.
        if (!w || !h) return;

        // 2. Re-pin to the allotted box. `scale` is an extra page-zoom factor
        //    an app may have requested (Browser app zoom levels): the inner
        //    viewport is laid out `scale` times larger and the app scales it
        //    back with transform. No zoom counter-zoom is applied here — the
        //    shell's body zoom is propagated into the frame by WebKit itself.
        const scale = userScale.get(frame) || 1;
        const pw = Math.round(w * scale);
        const ph = Math.round(h * scale);
        const s = frame.style;
        s.flex = 'none';
        s.width = pw + 'px';
        s.height = ph + 'px';
        s.minWidth = '0';
        s.minHeight = '0';
        frame.setAttribute('width', pw);
        frame.setAttribute('height', ph);
        o.setAttrs = true;
    }

    function sync(frame) {
        // Only real frames are pinned. The ResizeObserver also watches each
        // frame's PARENT, so a resize tick can arrive with a plain <div> —
        // pinning that would freeze the app's own layout (flex:none + a fixed
        // pixel size) and the frame would stop following its window.
        if (!frame || frame.tagName !== 'IFRAME') return;
        if (frame.getAttribute('data-framefix') === 'off') return;
        if (!frame.isConnected) return;
        pin(frame);
    }

    function track(frame) {
        if (!isAppleTouch || !resizeObserver) return;
        if (!tracked.has(frame)) {
            tracked.add(frame);
            try { resizeObserver.observe(frame); } catch (e) { /* detached */ }
            const parent = frame.parentElement;
            if (parent) {
                try { resizeObserver.observe(parent); } catch (e) { /* detached */ }
            }
        }
        sync(frame);
    }

    function scan(root) {
        if (root.nodeType !== Node.ELEMENT_NODE) return;
        if (root.tagName === 'IFRAME') track(root);
        if (root.querySelectorAll) root.querySelectorAll('iframe').forEach(track);
    }

    // Extra per-frame zoom factor (e.g. Browser app page zoom). factor 1 =
    // none. The frame's inner viewport is laid out `factor` times larger and
    // the app is expected to visually scale it back with transform: scale().
    function rescale(frame, factor) {
        if (!isAppleTouch || !frame) return;
        const f = isFinite(factor) && factor > 0 ? factor : 1;
        userScale.set(frame, f);
        sync(frame);
    }

    function init() {
        if (!isAppleTouch) return false;

        resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const target = entry.target;
                if (target.tagName === 'IFRAME') {
                    sync(target);
                } else if (target.querySelectorAll) {
                    // A watched PARENT changed size: its frames are pinned to a
                    // pixel box and do not follow it on their own, so they have
                    // to be re-measured here.
                    target.querySelectorAll('iframe').forEach(sync);
                }
            }
        });

        const root = document.body || document.documentElement;
        scan(root);

        // Windows (and their iframes) are appended after boot — catch every
        // subtree as it lands. Also watch for iframes being MOVED (reparent),
        // to re-observe the new parent.
        const mo = new MutationObserver((mutations) => {
            for (const m of mutations) {
                for (const node of m.addedNodes) scan(node);
            }
        });
        mo.observe(root, { childList: true, subtree: true });

        // Rotation, Safari toolbar collapse and Settings scaling changes all
        // re-render the frames; resync everything (rAF-debounced).
        const resyncAll = () => requestAnimationFrame(() => {
            document.querySelectorAll('iframe').forEach(sync);
        });
        window.addEventListener('orientationchange', resyncAll);
        window.addEventListener('resize', resyncAll);
        if (window.visualViewport && window.visualViewport.addEventListener) {
            window.visualViewport.addEventListener('resize', resyncAll);
        }

        return true;
    }

    return { init, sync, rescale, get active() { return isAppleTouch; } };
})();

export default IframeViewportFix;
