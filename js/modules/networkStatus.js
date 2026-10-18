// NetworkStatus — device connectivity (navigator.onLine), the taskbar Wi-Fi
// indicator and a shared, clean "you're offline" surface.
//
// The OS itself is fully offline-capable: the service worker precaches the
// shell and builtins, and installed store apps run from the virtual
// filesystem. Being offline therefore only affects genuinely online features
// — the Store download step, Windows Update, the Browser, Weather and
// peer-to-peer pairing. Those consult this module first so they fail with a
// readable connection error instead of hanging or crashing.
//
//   NetworkStatus.isOnline()                   current state
//   const off = NetworkStatus.onChange(cb)     subscribe (returns unsubscribe)
//   await NetworkStatus.ensureOnline('Weather')→ false + a Popup when offline
//   NetworkStatus.showError('Weather')         the standard offline Popup
//
// Also paints the tray Wi-Fi icon and opens a small network flyout.
import Popup from './popup.js';
import Flyout from './flyout.js';

const NetworkStatus = (() => {
    const listeners = new Set();
    let online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
    let trayBtn = null;
    let bound = false;
    let flyout = null;
    let outsideHandler = null;
    let keyHandler = null;

    // Solid Wi-Fi glyphs (fill only). The red slash marks the offline state
    // and is a <line> so the tray's `svg path { fill }` rule can't recolor it.
    const SVG_ONLINE = '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">' +
        '<path d="M12 20.6a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z"/>' +
        '<path d="M6.1 12.9a8.6 8.6 0 0 1 11.8 0l-1.9 2a5.9 5.9 0 0 0-8 0l-1.9-2z"/>' +
        '<path d="M2.1 9a14.2 14.2 0 0 1 19.8 0l-1.9 2a11.4 11.4 0 0 0-16 0L2.1 9z"/>' +
        '</svg>';

    const SVG_OFFLINE = '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">' +
        '<path d="M12 20.6a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z"/>' +
        '<path d="M6.1 12.9a8.6 8.6 0 0 1 11.8 0l-1.9 2a5.9 5.9 0 0 0-8 0l-1.9-2z"/>' +
        '<path d="M2.1 9a14.2 14.2 0 0 1 19.8 0l-1.9 2a11.4 11.4 0 0 0-16 0L2.1 9z"/>' +
        '<line x1="3.6" y1="2.4" x2="20.4" y2="21.6" stroke="#e81123" stroke-width="1.9" stroke-linecap="round"/>' +
        '</svg>';

    function paint() {
        if (!trayBtn) trayBtn = document.getElementById('tray-network');
        if (!trayBtn) return;
        trayBtn.innerHTML = online ? SVG_ONLINE : SVG_OFFLINE;
        trayBtn.classList.toggle('network-offline', !online);
        const label = online ? 'Network — Connected' : 'Network — Not connected';
        trayBtn.title = label;
        trayBtn.setAttribute('aria-label', label);
        if (flyout) renderFlyout();
    }

    function emit() {
        for (const cb of [...listeners]) {
            try { cb(online); } catch (e) { console.error('[NetworkStatus] listener threw', e); }
        }
        try {
            window.dispatchEvent(new CustomEvent('network-changed', { detail: { online } }));
        } catch (e) { /* no window (non-DOM context) */ }
    }

    function setOnline(next) {
        next = !!next;
        if (next === online) { paint(); return; }
        online = next;
        paint();
        emit();
    }

    // ---- flyout ----

    function buildFlyout() {
        const el = document.createElement('div');
        el.id = 'network-flyout';
        el.className = 'hidden';
        el.innerHTML =
            '<div class="netf-head">Network</div>' +
            '<div class="netf-body">' +
                '<div class="netf-glyph"></div>' +
                '<div class="netf-meta">' +
                    '<div class="netf-title">Windows 12</div>' +
                    '<div class="netf-status"></div>' +
                '</div>' +
            '</div>' +
            '<div class="netf-note"></div>';
        document.body.appendChild(el);
        return el;
    }

    function renderFlyout() {
        if (!flyout) return;
        const glyph = flyout.querySelector('.netf-glyph');
        glyph.innerHTML = online ? SVG_ONLINE : SVG_OFFLINE;
        glyph.classList.toggle('offline', !online);
        flyout.querySelector('.netf-status').textContent = online ? 'Connected — internet access' : 'Not connected';
        flyout.querySelector('.netf-note').textContent = online
            ? 'You are online. The Store, updates and internet apps are available.'
            : "You're offline. Your files, settings and installed apps keep working — reconnect to use the Store, updates, Weather or the Browser.";
    }

    // Anchor the flyout to the Wi-Fi button for any taskbar edge.
    function position() {
        if (!flyout || !trayBtn) return;
        const r = trayBtn.getBoundingClientRect();
        const tb = (document.getElementById('taskbar') || trayBtn).getBoundingClientRect();
        const vw = window.innerWidth, vh = window.innerHeight, m = 8;
        const w = flyout.offsetWidth, h = flyout.offsetHeight;
        let left, top;
        if (tb.height >= tb.width) {
            // vertical taskbar (left / right)
            top = r.top + r.height / 2 - h / 2;
            left = tb.left > vw / 2 ? tb.left - w - m : tb.right + m;
        } else {
            // horizontal taskbar (top / bottom)
            left = r.left + r.width / 2 - w / 2;
            top = tb.top > vh / 2 ? tb.top - h - m : tb.bottom + m;
        }
        flyout.style.left = Math.max(m, Math.min(left, vw - w - m)) + 'px';
        flyout.style.top = Math.max(m, Math.min(top, vh - h - m)) + 'px';
    }

    function openFlyout() {
        if (!flyout) flyout = buildFlyout();
        renderFlyout();
        Flyout.show(flyout, 'closing');
        position();
        // Listen on the next tick so the opening click doesn't close it.
        setTimeout(() => {
            outsideHandler = (e) => {
                if (flyout.contains(e.target) || (trayBtn && trayBtn.contains(e.target))) return;
                closeFlyout();
            };
            keyHandler = (e) => { if (e.key === 'Escape') closeFlyout(); };
            document.addEventListener('mousedown', outsideHandler, true);
            document.addEventListener('keydown', keyHandler);
        }, 0);
    }

    function closeFlyout() {
        if (outsideHandler) document.removeEventListener('mousedown', outsideHandler, true);
        if (keyHandler) document.removeEventListener('keydown', keyHandler);
        outsideHandler = keyHandler = null;
        if (flyout) Flyout.hide(flyout, 'closing');
    }

    function toggleFlyout() {
        if (Flyout.isOpen(flyout)) closeFlyout();
        else openFlyout();
    }

    // ---- public API ----

    function isOnline() { return online; }

    function onChange(cb) {
        if (typeof cb !== 'function') return () => {};
        listeners.add(cb);
        return () => listeners.delete(cb);
    }

    function showError(feature) {
        Popup.error('No internet connection',
            "You're offline" + (feature ? `, so ${feature} can't reach the internet` : '') + '.\n\n' +
            'Your files and installed apps keep working — reconnect and try again.');
    }

    async function ensureOnline(feature) {
        if (online) return true;
        showError(feature);
        return false;
    }

    function init() {
        paint();
        window.addEventListener('online', () => setOnline(true));
        window.addEventListener('offline', () => setOnline(false));
        if (trayBtn && !bound) {
            bound = true;
            trayBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleFlyout(); });
        }
        window._NetworkStatus = NetworkStatus;
    }

    return { init, isOnline, onChange, ensureOnline, showError, openFlyout, closeFlyout, toggleFlyout };
})();

export default NetworkStatus;
