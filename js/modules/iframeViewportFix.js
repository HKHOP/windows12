// iOS / iPadOS Safari iframe letterboxing workaround.
//
// Bug: on iPhone/iPad Safari every iframe ends up letterboxed — the embedded
// page renders in the top-left at a stale or intrinsic (300x150) size and the
// rest of the frame shows its background, i.e. big white gaps at the right
// and bottom. WebKit sizes an iframe's INNER document viewport from the
// element's layout size but then fails to keep it in sync when CSS resizes
// the element afterwards — and this shell resizes iframes constantly (flex
// tracks, window drag-resize/maximize, the page-level `zoom` in main.css).
// Chrome/Firefox desktop and Android Chrome don't have the bug.
//
// Workaround (the only one that reliably sticks on WebKit): give each iframe
// explicit pixel `width`/`height` ATTRIBUTES and keep them synced to the
// element's real CSS box. Attribute updates force WebKit to lay out the
// inner viewport at the correct size. Where CSS still controls the element
// box the attributes are inert, so nothing changes on engines without the
// bug — and the module only activates on Apple touch devices anyway.
//
// Sizing detail: clientWidth/clientHeight (pre-zoom CSS px) are used, not
// getBoundingClientRect() — inside a `zoom`ed subtree the rect is post-zoom
// on WebKit and would re-introduce a scale-factor mismatch.

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

    const tracked = new WeakSet();
    let resizeObserver = null;

    function sync(frame) {
        if (frame.getAttribute('data-framefix') === 'off') return;
        const w = frame.clientWidth;
        const h = frame.clientHeight;
        // display:none tabs / mid-removal frames: nothing to sync yet. A
        // ResizeObserver tick fires again once they get a real box.
        if (!w || !h) return;
        // Same-value sets are skipped so the attribute mutation only happens
        // when the size actually changed (WebKit relayouts on the mutation).
        if (frame.getAttribute('width') !== String(w)) frame.setAttribute('width', w);
        if (frame.getAttribute('height') !== String(h)) frame.setAttribute('height', h);
    }

    function track(frame) {
        if (!isAppleTouch || !resizeObserver) return;
        if (!tracked.has(frame)) {
            tracked.add(frame);
            try { resizeObserver.observe(frame); } catch (e) { /* detached */ }
        }
        // observe() delivers an initial size entry, but sync directly too so
        // a frame that was resized between MutationObserver batches isn't
        // left letterboxed until the next tick.
        sync(frame);
    }

    function scan(root) {
        if (root.nodeType !== Node.ELEMENT_NODE) return;
        if (root.tagName === 'IFRAME') track(root);
        if (root.querySelectorAll) root.querySelectorAll('iframe').forEach(track);
    }

    function init() {
        if (!isAppleTouch) return false;

        resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) sync(entry.target);
        });

        const root = document.body || document.documentElement;
        scan(root);

        // Windows (and their iframes) are appended after boot — catch every
        // subtree as it lands.
        const mo = new MutationObserver((mutations) => {
            for (const m of mutations) {
                for (const node of m.addedNodes) scan(node);
            }
        });
        mo.observe(root, { childList: true, subtree: true });

        // Rotation / Safari toolbar collapse occasionally resize frames
        // without a ResizeObserver delivery on some WebKit builds.
        const resyncAll = () => document.querySelectorAll('iframe').forEach(sync);
        window.addEventListener('orientationchange', () => setTimeout(resyncAll, 250));
        window.addEventListener('resize', () => setTimeout(resyncAll, 250));
        if (window.visualViewport && window.visualViewport.addEventListener) {
            window.visualViewport.addEventListener('resize', resyncAll);
        }

        return true;
    }

    return { init, sync, get active() { return isAppleTouch; } };
})();

export default IframeViewportFix;
