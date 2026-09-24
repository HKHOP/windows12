// iOS / iPadOS Safari iframe letterboxing workaround (zoom compensation).
//
// Symptom: on iPhone/iPad Safari every iframe renders its page small in the
// top-left with big white gaps at the right and bottom. Desktop and Android
// are unaffected.
//
// Root cause: the shell scales its whole UI with `body { zoom: calc(...) }`
// (css/main.css). WebKit's `zoom` shrinks an iframe's INNER document
// viewport by the accumulated zoom factor while the element box keeps its
// CSS size — the embedded page lays out at visual-pixel dimensions instead
// of layout pixels, so it only fills `zoom` of the frame and the rest shows
// the page background. Percentage/flex CSS on the iframe can't fix this
// because the units themselves are wrong; neither can width/height
// attributes (they get multiplied by the same zoom).
//
// Fix: for every iframe on Apple touch devices, cancel the body zoom INSIDE
// the frame subtree — set `zoom: 1/Z` directly on the iframe (Z = body zoom)
// and pin its box to `allottedSize * Z` device pixels. The element's layout
// box comes out exactly as before (so flex containers and siblings are
// untouched), the visual size is unchanged, and the inner document is laid
// out in a coordinate system with a net zoom of 1 — the one case every
// WebKit code path sizes correctly. With net zoom 1 the inner viewport, the
// element box and the rendered pixels are all the same number.
//
// Everything is self-correcting: sizes are re-derived from the frame's own
// allotted box (measured with the compensation temporarily removed) on every
// ResizeObserver tick, so window drag-resize, maximize, tab switching and
// orientation changes all resync. Desktop/Android never run this module.

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
    let bodyZoom = 1;

    function probeZoom() {
        const probe = document.createElement('div');
        probe.style.cssText = 'position:absolute;top:0;left:0;width:100px;height:100px;visibility:hidden;pointer-events:none;';
        document.body.appendChild(probe);
        const visual = probe.getBoundingClientRect().width;
        probe.remove();
        return visual > 0 ? visual / 100 : 1;
    }

    function refreshZoom() {
        let z = parseFloat(getComputedStyle(document.body).zoom);
        if (!isFinite(z) || z <= 0) z = probeZoom();
        if (isFinite(z) && z > 0) bodyZoom = z;
    }

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

        // 2. Re-pin with zoom compensation. `scale` is an extra page-zoom
        //    factor an app may have requested (Browser app zoom levels).
        const scale = userScale.get(frame) || 1;
        const pw = Math.round(w * bodyZoom * scale);
        const ph = Math.round(h * bodyZoom * scale);
        const s = frame.style;
        s.flex = 'none';
        s.width = pw + 'px';
        s.height = ph + 'px';
        s.minWidth = '0';
        s.minHeight = '0';
        // Own-zoom cancels the body zoom (and only the body zoom) so the
        // frame subtree lays out at net zoom 1.
        s.zoom = bodyZoom !== 1 ? String(1 / bodyZoom) : '';
        frame.setAttribute('width', pw);
        frame.setAttribute('height', ph);
        o.setAttrs = true;
    }

    function sync(frame) {
        if (frame.getAttribute('data-framefix') === 'off') return;
        if (!frame.isConnected) return;
        refreshZoom();
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

        refreshZoom();
        resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) sync(entry.target);
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
        // alter the body zoom; resync everything (rAF-debounced).
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
