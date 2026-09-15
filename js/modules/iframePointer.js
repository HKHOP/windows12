// IframePointer — lets the virtual touchpad cursor interact with pages
// rendered inside <iframe> elements (Browser tabs, local HTML previews).
//
// Why this exists: the virtual cursor synthesizes MouseEvent/PointerEvent and
// dispatches them on `document.elementFromPoint(x, y)`. When that element is
// an <iframe>, the events only travel through the OUTER document — the page
// inside never receives them (a real hardware mouse works because the OS
// routes it into the frame's own browsing context). So taps/clicks/scrolls
// at the virtual cursor silently died over any iframe.
//
// What this does: when the point lands on a SAME-ORIGIN frame (local HTML
// previews via srcdoc, same-origin sites), events are re-dispatched inside
// the frame's document on its own elementFromPoint, with coordinates
// translated into the frame's viewport. Cross-origin frames stay
// inaccessible (browser security) — callers get { kind: 'blocked' } so they
// can fall back (focus + "tap the page directly" hint).

const IframePointer = (() => {
    function isIframe(el) {
        return !!el && el.tagName === 'IFRAME';
    }

    // Returns the frame's document, or null when cross-origin / not loaded.
    function frameDoc(iframe) {
        try {
            const doc = iframe.contentDocument;
            if (!doc) return null;
            // Touch the document to force a SecurityError on opaque origins
            // in browsers that hand back a restricted object instead of null.
            void doc.documentElement;
            return doc;
        } catch (e) {
            return null;
        }
    }

    function frameWin(iframe) {
        try {
            return iframe.contentWindow || null;
        } catch (e) {
            return null;
        }
    }

    // Outer client coords -> inner viewport coords. Accounts for any CSS
    // scaling of the frame (e.g. page zoom / OS scaling layers).
    function toInnerPoint(iframe, x, y) {
        const rect = iframe.getBoundingClientRect();
        const win = frameWin(iframe);
        let sx = 1;
        let sy = 1;
        if (win && rect.width > 0 && rect.height > 0) {
            try {
                if (win.innerWidth > 0) sx = win.innerWidth / rect.width;
                if (win.innerHeight > 0) sy = win.innerHeight / rect.height;
            } catch (e) { /* cross-origin: keep 1 */ }
        }
        return { x: (x - rect.left) * sx, y: (y - rect.top) * sy };
    }

    // Route an outer point to its real target. Returns:
    //  { kind:'document', target, doc, win, x, y }  — dispatch inside a frame
    //  { kind:'outer', target }                     — normal outer dispatch
    //  { kind:'blocked', iframe }                   — cross-origin frame
    function routePoint(x, y) {
        let el = null;
        try {
            el = document.elementFromPoint(x, y);
        } catch (e) {
            return { kind: 'outer', target: null };
        }
        if (!el) return { kind: 'outer', target: null };

        if (!isIframe(el)) {
            // The point may sit on overlay UI stacked above a frame — only
            // treat it as a frame hit when the iframe itself is on top.
            return { kind: 'outer', target: el };
        }

        const doc = frameDoc(el);
        const win = frameWin(el);
        if (!doc || !win) return { kind: 'blocked', iframe: el };

        const p = toInnerPoint(el, x, y);
        let inner = null;
        try {
            inner = doc.elementFromPoint(p.x, p.y);
        } catch (e) {
            return { kind: 'blocked', iframe: el };
        }
        if (inner && isIframe(inner)) {
            // Nested frame: recurse one level with translated coords.
            // Note: inner.getBoundingClientRect() is relative to the OUTER
            // frame's viewport — the same space `p` lives in — so this is
            // a straight translation, no outer-rect math needed.
            const nestedDoc = frameDoc(inner);
            const nestedWin = frameWin(inner);
            if (!nestedDoc || !nestedWin) return { kind: 'blocked', iframe: inner };
            const rect = inner.getBoundingClientRect();
            let sx = 1;
            let sy = 1;
            try {
                if (nestedWin.innerWidth > 0 && rect.width > 0) sx = nestedWin.innerWidth / rect.width;
                if (nestedWin.innerHeight > 0 && rect.height > 0) sy = nestedWin.innerHeight / rect.height;
            } catch (e) {}
            const np = { x: (p.x - rect.left) * sx, y: (p.y - rect.top) * sy };
            let nestedTarget = null;
            try {
                nestedTarget = nestedDoc.elementFromPoint(np.x, np.y);
            } catch (e) {
                return { kind: 'blocked', iframe: inner };
            }
            return { kind: 'document', target: nestedTarget, doc: nestedDoc, win: nestedWin, x: np.x, y: np.y };
        }
        return { kind: 'document', target: inner, doc, win, x: p.x, y: p.y };
    }

    function makeEvent(win, type, x, y, opts) {
        opts = opts || {};
        const button = opts.button || 0;
        const buttons = typeof opts.buttons === 'number' ? opts.buttons : (type === 'mouseup' ? 0 : (button === 2 ? 2 : 1));
        const base = {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            screenX: opts.screenX || 0,
            screenY: opts.screenY || 0,
            button,
            buttons,
            view: win
        };
        if (type === 'wheel') {
            try {
                return new win.WheelEvent('wheel', { ...base, deltaX: opts.deltaX || 0, deltaY: opts.deltaY || 0 });
            } catch (e) {
                return null;
            }
        }
        if (type === 'contextmenu') {
            try {
                return new win.MouseEvent('contextmenu', base);
            } catch (e) {
                return null;
            }
        }
        if (type === 'pointermove' || type === 'pointerdown' || type === 'pointerup') {
            try {
                return new win.PointerEvent(type, { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true });
            } catch (e) {
                return null; // caller falls back to the mouse event alone
            }
        }
        try {
            return new win.MouseEvent(type, base);
        } catch (e) {
            return null;
        }
    }

    function dispatchOn(route, type, opts) {
        opts = opts || {};
        if (route.kind === 'document') {
            const target = route.target;
            if (!target) return null;
            const win = route.win;
            // Mirror real-mouse ordering: pointer event first, then the
            // compatibility mouse event.
            if (type === 'mousemove' || type === 'mousedown' || type === 'mouseup') {
                const pointerType = type === 'mousemove' ? 'pointermove' : (type === 'mousedown' ? 'pointerdown' : 'pointerup');
                const pev = makeEvent(win, pointerType, route.x, route.y, { ...opts, screenX: opts.screenX, screenY: opts.screenY });
                if (pev) {
                    try {
                        target.dispatchEvent(pev);
                    } catch (e) {}
                }
            }
            const ev = makeEvent(win, type, route.x, route.y, { ...opts, screenX: opts.screenX, screenY: opts.screenY });
            if (!ev) return null;
            try {
                target.dispatchEvent(ev);
            } catch (e) {}
            return target;
        }
        if (route.kind === 'outer') {
            if (!route.target) return null;
            if (type === 'mousemove' || type === 'mousedown' || type === 'mouseup') {
                const pointerType = type === 'mousemove' ? 'pointermove' : (type === 'mousedown' ? 'pointerdown' : 'pointerup');
                const pev = makeEvent(window, pointerType, opts.outerX, opts.outerY, { ...opts, screenX: opts.outerX, screenY: opts.outerY });
                if (pev) {
                    try {
                        route.target.dispatchEvent(pev);
                    } catch (e) {}
                }
            }
            const ev = makeEvent(window, type, opts.outerX, opts.outerY, { ...opts, screenX: opts.outerX, screenY: opts.outerY });
            if (!ev) return null;
            try {
                route.target.dispatchEvent(ev);
            } catch (e) {}
            return route.target;
        }
        return null;
    }

    // Dispatch a mouse/pointer interaction at outer client (x, y), piercing
    // same-origin frames. `outerX/outerY` default to x/y.
    function dispatch(type, x, y, opts) {
        opts = { ...(opts || {}), outerX: (opts && opts.outerX != null) ? opts.outerX : x, outerY: (opts && opts.outerY != null) ? opts.outerY : y };
        const route = routePoint(x, y);
        const target = dispatchOn(route, type, opts);
        return { route, target };
    }

    function focusTarget(info) {
        const target = info && info.target;
        if (!target) return;
        try {
            const editable = target.closest ? target.closest('input, textarea, select, [contenteditable]') : null;
            const el = editable || (typeof target.focus === 'function' ? target : null);
            if (el && typeof el.focus === 'function') {
                try {
                    el.focus({ preventScroll: true });
                } catch (e) {
                    el.focus();
                }
            }
        } catch (e) { /* noop */ }
    }

    function focusBlocked(iframe) {
        try {
            if (iframe && iframe.contentWindow && typeof iframe.contentWindow.focus === 'function') {
                iframe.contentWindow.focus();
            }
        } catch (e) { /* cross-origin focus may throw in some browsers */ }
        try {
            if (iframe && typeof iframe.focus === 'function') iframe.focus({ preventScroll: true });
        } catch (e) {
            try {
                iframe.focus();
            } catch (e2) {}
        }
    }

    // Read the effective CSS cursor under a point, piercing same-origin
    // frames. Returns a cursor keyword string, or null when outer handling
    // should apply (including cross-origin frames).
    function cursorValueAt(x, y) {
        let el = null;
        try {
            el = document.elementFromPoint(x, y);
        } catch (e) {
            return null;
        }
        if (!el || !isIframe(el)) return null;
        const doc = frameDoc(el);
        const win = frameWin(el);
        if (!doc || !win) return null;
        const p = toInnerPoint(el, x, y);
        let inner = null;
        try {
            inner = doc.elementFromPoint(p.x, p.y);
        } catch (e) {
            return null;
        }
        let depth = 0;
        let node = inner;
        while (node && node !== doc.documentElement && depth < 8) {
            let cursor = '';
            try {
                cursor = win.getComputedStyle(node).cursor || '';
            } catch (e) {
                break;
            }
            if (cursor && cursor !== 'auto') return cursor;
            node = node.parentElement;
            depth++;
        }
        return null;
    }

    // True when outer client (x, y) sits over any visible iframe.
    function pointOverIframe(x, y) {
        let el = null;
        try {
            el = document.elementFromPoint(x, y);
        } catch (e) {
            return false;
        }
        return isIframe(el);
    }

    return { routePoint, dispatch, focusTarget, focusBlocked, cursorValueAt, pointOverIframe, isIframe };
})();

export default IframePointer;
