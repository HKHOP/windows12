import WindowState from './windowState.js';

const WindowManager = (() => {
    let windows = new Map();
    let zCounter = 100;
    let container;
    let onFocusChanged = null;
    let onWindowCreated = null;
    let onWindowClosed = null;
    let onWindowMinimized = null;
    let onDragStateChanged = null;
    let onResizeStateChanged = null;
    let onBoundsChanged = null;
    let snapIndicator = null;
    let scale = 1;
    const closeHandlers = new Map();
    // Per-window close interceptors (unlike closeHandlers these veto one
    // window only, e.g. a single dirty document).
    const windowCloseHooks = new Map();
    // Virtual-desktops hook: { getActiveId() }. Set by VirtualDesktops at
    // boot; kept behind a provider (not an import) so neither module
    // depends on the other at load time.
    let desktopProvider = null;

    // Additive lifecycle broadcast as real DOM events so the SDK (and any
    // number of listeners) can observe without competing for the
    // single-slot setOn* callbacks the shell owns. Names: 'window-closed',
    // 'window-minimized', 'window-restored', 'window-focus-changed'.
    function fireWindowEvent(name, detail) {
        try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch (e) { /* listener env without window */ }
    }

    function setScale(s) { scale = s; }
    function getScale() { return scale; }

    function setDesktopProvider(p) { desktopProvider = p; }

    function init() {
        container = document.getElementById('windows-container');
        createSnapIndicator();
        WindowState.init();
    }

    function createSnapIndicator() {
        snapIndicator = document.createElement('div');
        snapIndicator.id = 'snap-indicator';
        snapIndicator.style.cssText = 'position:fixed;display:none;border:2px solid var(--accent-color);background:rgba(0,120,212,0.15);border-radius:8px;z-index:99999;pointer-events:none;transition:all 0.15s ease-out;';
        // Outside the zoomed <body> so position:fixed maps 1:1 to viewport
        // pixels (same reason the touch overlays live on documentElement).
        document.documentElement.appendChild(snapIndicator);
    }

    // Visual (viewport) px per container layout px. The OS scales <body> via
    // CSS zoom, so mouse client deltas must be divided by this before being
    // applied to style/offset geometry (which lives in layout px).
    function effectiveZoom() {
        try {
            if (container && container.clientWidth > 0) {
                const rect = container.getBoundingClientRect();
                if (rect.width > 0) return rect.width / container.clientWidth;
            }
        } catch (e) { /* fall through */ }
        return scale || 1;
    }

    function showSnapIndicator(x, y, w, h) {
        if (!snapIndicator) return;
        // Snap geometry is container layout px; the indicator is fixed in
        // viewport space — map across using the live desktop rect + zoom.
        let vx = x, vy = y, vw = w, vh = h;
        try {
            if (container) {
                const z = effectiveZoom();
                const r = container.getBoundingClientRect();
                vx = r.left + x * z;
                vy = r.top + y * z;
                vw = w * z;
                vh = h * z;
            }
        } catch (e) { /* fall back to raw values */ }
        snapIndicator.style.display = 'block';
        snapIndicator.style.left = vx + 'px';
        snapIndicator.style.top = vy + 'px';
        snapIndicator.style.width = vw + 'px';
        snapIndicator.style.height = vh + 'px';
    }

    function hideSnapIndicator() {
        if (snapIndicator) snapIndicator.style.display = 'none';
    }

    // Usable desktop origin/size in WINDOW geometry space: windows live
    // inside #windows-container, which the CSS already shrinks/offsets for
    // the taskbar edge (margins on #desktop), so the origin is always (0,0)
    // and only the usable width/height matter here. Viewport (mouse client)
    // coordinates are converted into this space before comparison.
    function getDesktopArea() {
        const s = scale;
        const pos = (document.documentElement.dataset.taskbar) || 'bottom';
        const tb = 48;
        if (container) {
            try {
                const w = container.clientWidth;
                const h = container.clientHeight;
                if (w > 0 && h > 0) return { ox: 0, oy: 0, w, h };
            } catch (e) { /* fall through to viewport math */ }
        }
        const w = window.innerWidth / s - ((pos === 'left' || pos === 'right') ? tb : 0);
        const h = window.innerHeight / s - ((pos === 'top' || pos === 'bottom') ? tb : 0);
        return { ox: 0, oy: 0, w, h };
    }

    // Centered fallback geometry for the current viewport, used when no
    // trustworthy restore bounds exist (e.g. pre-v2 maximized saves).
    // Container-relative (origin 0,0 — the desktop's top-left corner).
    function defaultRestoreBounds() {
        const area = getDesktopArea();
        const width = Math.min(700, area.w);
        const height = Math.min(500, area.h);
        return {
            left: Math.max(0, (area.w - width) / 2),
            top: Math.max(0, (area.h - height) / 2),
            width,
            height
        };
    }

    // Fits saved normal bounds into the live viewport so a window saved on a
    // bigger screen never restores off-screen or oversized. Sanitizes NaN.
    // Bounds are container-relative (origin 0,0 — see getDesktopArea).
    function clampRestoreBounds(saved) {
        const area = getDesktopArea();
        const w = Number.isFinite(saved.width) ? saved.width : 700;
        const h = Number.isFinite(saved.height) ? saved.height : 500;
        const width = Math.max(Math.min(w, area.w), Math.min(200, area.w));
        const height = Math.max(Math.min(h, area.h), Math.min(150, area.h));
        const x0 = Number.isFinite(saved.x) ? saved.x : 0;
        const y0 = Number.isFinite(saved.y) ? saved.y : 0;
        return {
            x: Math.min(Math.max(x0, 0), Math.max(area.w - width, 0)),
            y: Math.min(Math.max(y0, 0), Math.max(area.h - height, 0)),
            width,
            height
        };
    }

    // Single choke point for persistence. A maximized window fills whatever
    // viewport exists at restore time, so what gets saved is always the
    // restorable (pre-maximize) geometry + the maximized flag — never the
    // maximized pixel rect, which would freeze a stale viewport size.
    function persistState(data) {
        if (!data || !data.saveState) return;
        if (data.isMaximized) {
            const b = data.prevBounds || defaultRestoreBounds();
            WindowState.saveWindowState(data.appId, {
                x: Number.isFinite(b.left) ? b.left : (b.x ?? 0),
                y: Number.isFinite(b.top) ? b.top : (b.y ?? 0),
                width: b.width,
                height: b.height,
                maximized: true,
                v: 2
            });
        } else {
            // Container-relative geometry (offset*/client space), matching how
            // bounds are restored via style left/top — never viewport rects,
            // which include the taskbar offset and body zoom.
            WindowState.saveWindowState(data.appId, {
                x: data.element.offsetLeft,
                y: data.element.offsetTop,
                width: data.element.offsetWidth,
                height: data.element.offsetHeight,
                maximized: false,
                v: 2
            });
        }
    }

    // Snap edges are tested in container layout px: the pointer's viewport
    // position is mapped into #windows-container space (subtracting the live
    // desktop rect, dividing out body zoom) so every taskbar edge and scale
    // behaves the same. Returned x/y/width/height are container-space, ready
    // to apply as window style geometry — (0,0) is the desktop's top-left
    // corner no matter which edge the taskbar sits on.
    function getSnapZone(clientX, clientY) {
        const threshold = 20;
        const { w, h } = getDesktopArea();
        let lx = clientX;
        let ly = clientY;
        try {
            if (container) {
                const z = effectiveZoom();
                const r = container.getBoundingClientRect();
                lx = (clientX - r.left) / z;
                ly = (clientY - r.top) / z;
            } else {
                const s = scale || 1;
                lx = clientX / s;
                ly = clientY / s;
            }
        } catch (e) { /* fall back to raw client coords */ }
        const left = lx <= threshold;
        const right = lx >= w - threshold;
        const top = ly <= threshold;

        if (top && left) return { zone: 'top-left', x: 0, y: 0, width: w / 2, height: h / 2 };
        if (top && right) return { zone: 'top-right', x: w / 2, y: 0, width: w / 2, height: h / 2 };
        if (top) return { zone: 'top', x: 0, y: 0, width: w, height: h };
        if (left) return { zone: 'left', x: 0, y: 0, width: w / 2, height: h };
        if (right) return { zone: 'right', x: w / 2, y: 0, width: w / 2, height: h };

        return null;
    }

    function setOnFocusChanged(cb) {
        onFocusChanged = cb;
    }

    function setOnWindowCreated(cb) {
        onWindowCreated = cb;
    }

    function setOnWindowClosed(cb) {
        onWindowClosed = cb;
    }

    function setOnWindowMinimized(cb) {
        onWindowMinimized = cb;
    }

    function setOnDragStateChanged(cb) {
        onDragStateChanged = cb;
    }

    function setOnResizeStateChanged(cb) {
        onResizeStateChanged = cb;
    }

    function setOnBoundsChanged(cb) {
        onBoundsChanged = cb;
    }

    function fireBoundsChanged(id) {
        if (onBoundsChanged) {
            try { onBoundsChanged(id, getBounds(id)); } catch (e) { /* listener must not break WM */ }
        }
    }

    function setCloseHandler(appId, handler) {
        closeHandlers.set(appId, handler);
    }

    function removeCloseHandler(appId) {
        closeHandlers.delete(appId);
    }

    async function requestClose(id) {
        const data = windows.get(id);
        if (!data) return false;

        // Per-window hooks first (any veto aborts this window only), then
        // the app-level close handler.
        const hooks = windowCloseHooks.get(id);
        if (hooks) {
            for (const hook of [...hooks]) {
                const allowed = await hook(data);
                if (allowed === false) return false;
            }
        }
        const handler = closeHandlers.get(data.appId);
        if (handler) {
            const allowed = await handler(data);
            if (allowed === false) return false;
        }

        closeWindow(id);
        return true;
    }

    function addWindowCloseHook(id, cb) {
        if (!windows.has(id)) return null;
        if (!windowCloseHooks.has(id)) windowCloseHooks.set(id, new Set());
        const hooks = windowCloseHooks.get(id);
        hooks.add(cb);
        return () => hooks.delete(cb);
    }

    function removeWindowCloseHook(id, cb) {
        const hooks = windowCloseHooks.get(id);
        if (hooks) hooks.delete(cb);
    }

    function closeAllWindows(appId) {
        const toClose = [];
        windows.forEach((data, id) => {
            if (data.appId === appId) toClose.push(id);
        });
        toClose.forEach(id => closeWindow(id));
    }

    async function requestCloseAllWindows(appId) {
        const toClose = [];
        windows.forEach((data, id) => {
            if (data.appId === appId) toClose.push(id);
        });
        for (const id of toClose) {
            await requestClose(id);
        }
    }

    function createWindow(appId, title, icon, content, options = {}) {
        const id = `window-${appId}-${Date.now()}`;
        const s = scale;
        const defaults = {
            width: 700,
            height: 500,
            minWidth: 400,
            minHeight: 300,
            saveState: true
        };
        const opts = { ...defaults, ...options };
        const resizable = opts.resizable !== false;
        const minWidth = Number.isFinite(opts.minWidth) ? opts.minWidth : defaults.minWidth;
        const minHeight = Number.isFinite(opts.minHeight) ? opts.minHeight : defaults.minHeight;

        let x, y, width, height, isMaximized = false;
        let restoreBounds = null;
        const savedState = opts.saveState ? WindowState.getWindowState(appId) : null;

        if (savedState) {
            isMaximized = savedState.maximized || false;
            if (isMaximized) {
                // The maximized fill comes from the live viewport below; stale
                // saved pixels are never applied. Seed the pre-maximize
                // geometry so un-maximize always has somewhere valid to go.
                if (savedState.v === 2) {
                    const c = clampRestoreBounds(savedState);
                    restoreBounds = { left: c.x, top: c.y, width: c.width, height: c.height };
                } else {
                    restoreBounds = defaultRestoreBounds();
                }
                const area = getDesktopArea();
                x = 0; y = 0; width = area.w; height = area.h;
            } else {
                const c = clampRestoreBounds(savedState);
                x = c.x; y = c.y; width = c.width; height = c.height;
            }
        } else {
            const area = getDesktopArea();
            x = Math.max(0, (area.w - opts.width) / 2 + Math.random() * 60 - 30);
            y = Math.max(0, (area.h - opts.height) / 2 + Math.random() * 40 - 20);
            width = opts.width;
            height = opts.height;
        }

        const win = document.createElement('div');
        win.className = 'app-window';
        win.id = id;
        win.style.cssText = `left:${x}px;top:${y}px;width:${width}px;height:${height}px;z-index:${++zCounter}`;

        win.innerHTML = `
            <div class="resize-handle top"></div>
            <div class="resize-handle bottom"></div>
            <div class="resize-handle left"></div>
            <div class="resize-handle right"></div>
            <div class="resize-handle top-left"></div>
            <div class="resize-handle top-right"></div>
            <div class="resize-handle bottom-left"></div>
            <div class="resize-handle bottom-right"></div>
            <div class="window-header">
                <div class="window-title-area">
                    <div class="window-icon">${icon}</div>
                    <span class="window-title">${title}</span>
                </div>
                <div class="window-controls">
                    <button class="minimize-btn" title="Minimize">
                        <svg viewBox="0 0 10 10"><line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" stroke-width="1"/></svg>
                    </button>
                    <button class="maximize-btn" title="Maximize">
                        <svg viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1"/></svg>
                    </button>
                    <button class="close-btn" title="Close">
                        <svg viewBox="0 0 10 10"><line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" stroke-width="1.2"/><line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" stroke-width="1.2"/></svg>
                    </button>
                </div>
            </div>
            <div class="window-body">${content}</div>
        `;

        container.appendChild(win);

        const windowData = {
            id,
            appId,
            title,
            icon,
            element: win,
            isMaximized: isMaximized,
            prevBounds: restoreBounds,
            saveState: opts.saveState,
            // Virtual desktop membership + minimize state. New windows open
            // on the currently active desktop, visible.
            desktopId: (opts.desktopId
                || (desktopProvider && typeof desktopProvider.getActiveId === 'function' && desktopProvider.getActiveId())
                || 'desktop-1'),
            minimized: false,
            // Geometry contracts for the SDK: resizable windows show the 8
            // edge/corner handles (CSS hides them under .locked); dragging
            // and resizing flags are live during pointer gestures.
            resizable,
            minWidth,
            minHeight,
            dragging: false,
            resizing: false
        };

        if (!resizable) win.classList.add('locked');

        if (isMaximized) {
            win.classList.add('maximized');
            // Fill the live viewport; the seeded prevBounds above is what a
            // later un-maximize restores.
            win.style.left = '0';
            win.style.top = '0';
            win.style.width = '100%';
            win.style.height = '100%';
        }

        windows.set(id, windowData);
        setupDrag(win, windowData);
        setupResize(win, windowData);
        setupControls(win, windowData);

        win.addEventListener('mousedown', () => focusWindow(id));

        focusWindow(id);
        if (onWindowCreated) onWindowCreated(appId, windowData);

        return windowData;
    }

    function focusWindow(id) {
        const data = windows.get(id);
        if (!data) return;
        data.element.style.zIndex = ++zCounter;
        windows.forEach((v) => {
            v.element.classList.remove('focused');
        });
        data.element.classList.add('focused');
        if (onFocusChanged) onFocusChanged(data.appId);
        fireWindowEvent('window-focus-changed', { appId: data.appId, id });
    }

    function setupDrag(win, data) {
        const header = win.querySelector('.window-header');
        let isDragging = false;
        let startX, startY, startLeft, startTop;
        let currentSnap = null;

        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('.window-controls')) return;
            if (data.isMaximized) {
                const area = getDesktopArea();
                const z = effectiveZoom();
                let lx = e.clientX;
                let ly = e.clientY;
                try {
                    if (container) {
                        const r = container.getBoundingClientRect();
                        lx = (e.clientX - r.left) / z;
                        ly = (e.clientY - r.top) / z;
                    }
                } catch (err) { /* fall back to raw client coords */ }
                const ratio = area.w > 0 ? Math.min(Math.max(lx / area.w, 0), 1) : (e.clientX / window.innerWidth);
                data.prevBounds = null;
                data.isMaximized = false;
                win.classList.remove('maximized');
                const newW = 700;
                const newH = 500;
                win.style.width = newW + 'px';
                win.style.height = newH + 'px';
                win.style.left = (lx - newW * ratio) + 'px';
                win.style.top = Math.max(0, ly - 18) + 'px';
            }

            isDragging = true;
            data.dragging = true;
            if (onDragStateChanged) { try { onDragStateChanged(data.id, true); } catch (err) { /* ignore */ } }
            startX = e.clientX;
            startY = e.clientY;
            startLeft = win.offsetLeft;
            startTop = win.offsetTop;
            header.classList.add('dragging');
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            // Client deltas are viewport px — scale into container layout px.
            const z = effectiveZoom() || 1;
            const dx = (e.clientX - startX) / z;
            const dy = (e.clientY - startY) / z;
            win.style.left = `${startLeft + dx}px`;
            win.style.top = `${Math.max(0, startTop + dy)}px`;

            const snap = getSnapZone(e.clientX, e.clientY);
            if (snap) {
                currentSnap = snap;
                showSnapIndicator(snap.x, snap.y, snap.width, snap.height);
            } else {
                currentSnap = null;
                hideSnapIndicator();
            }
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                data.dragging = false;
                if (onDragStateChanged) { try { onDragStateChanged(data.id, false); } catch (err) { /* ignore */ } }
                header.classList.remove('dragging');

                if (currentSnap) {
                    if (!data.prevBounds) {
                        data.prevBounds = {
                            left: startLeft,
                            top: startTop,
                            width: win.offsetWidth,
                            height: win.offsetHeight
                        };
                    }
                    win.style.left = currentSnap.x + 'px';
                    win.style.top = currentSnap.y + 'px';
                    win.style.width = currentSnap.width + 'px';
                    win.style.height = currentSnap.height + 'px';
                    if (currentSnap.zone === 'top') {
                        win.classList.add('maximized');
                        data.isMaximized = true;
                    }
                    currentSnap = null;
                }
                hideSnapIndicator();

                persistState(data);
                fireBoundsChanged(data.id);
            }
        });

        header.addEventListener('dblclick', (e) => {
            if (e.target.closest('.window-controls')) return;
            toggleMaximize(data);
        });
    }

    function setupResize(win, data) {
        const handles = win.querySelectorAll('.resize-handle');
        let isResizing = false;
        let currentHandle;
        let startX, startY, startW, startH, startL, startT;

        handles.forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                if (data.isMaximized || data.resizable === false) return;
                isResizing = true;
                data.resizing = true;
                if (onResizeStateChanged) { try { onResizeStateChanged(data.id, true); } catch (err) { /* ignore */ } }
                currentHandle = handle;
                startX = e.clientX;
                startY = e.clientY;
                startW = win.offsetWidth;
                startH = win.offsetHeight;
                startL = win.offsetLeft;
                startT = win.offsetTop;
                e.preventDefault();
                e.stopPropagation();
            });
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            // Client deltas are viewport px — scale into container layout px.
            const z = effectiveZoom() || 1;
            const dx = (e.clientX - startX) / z;
            const dy = (e.clientY - startY) / z;
            const classList = currentHandle.classList;
            const minW = data.minWidth;
            const minH = data.minHeight;

            let newW = startW, newH = startH, newL = startL, newT = startT;

            if (classList.contains('right') || classList.contains('top-right') || classList.contains('bottom-right')) {
                newW = Math.max(minW, startW + dx);
            }
            if (classList.contains('bottom') || classList.contains('bottom-left') || classList.contains('bottom-right')) {
                newH = Math.max(minH, startH + dy);
            }
            if (classList.contains('left') || classList.contains('top-left') || classList.contains('bottom-left')) {
                newW = Math.max(minW, startW - dx);
                newL = startL + (startW - newW);
            }
            if (classList.contains('top') || classList.contains('top-left') || classList.contains('top-right')) {
                newH = Math.max(minH, startH - dy);
                newT = startT + (startH - newH);
            }

            win.style.width = `${newW}px`;
            win.style.height = `${newH}px`;
            win.style.left = `${newL}px`;
            win.style.top = `${Math.max(0, newT)}px`;
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                data.resizing = false;
                if (onResizeStateChanged) { try { onResizeStateChanged(data.id, false); } catch (err) { /* ignore */ } }
                persistState(data);
                fireBoundsChanged(data.id);
            }
            currentHandle = null;
        });
    }

    function setupControls(win, data) {
        win.querySelector('.minimize-btn').addEventListener('click', () => {
            setMinimized(data.id, true);
            if (onWindowMinimized) onWindowMinimized(data.appId);
        });

        win.querySelector('.maximize-btn').addEventListener('click', () => {
            toggleMaximize(data);
        });

        win.querySelector('.close-btn').addEventListener('click', () => {
            requestClose(data.id);
        });
    }

    function toggleMaximize(data) {
        const win = data.element;
        if (data.isMaximized) {
            win.classList.remove('maximized');
            const b = data.prevBounds || defaultRestoreBounds();
            data.prevBounds = b;
            win.style.left = `${b.left}px`;
            win.style.top = `${b.top}px`;
            win.style.width = `${b.width}px`;
            win.style.height = `${b.height}px`;
            data.isMaximized = false;
        } else {
            data.prevBounds = {
                left: win.offsetLeft,
                top: win.offsetTop,
                width: win.offsetWidth,
                height: win.offsetHeight
            };
            win.classList.add('maximized');
            win.style.left = '0';
            win.style.top = '0';
            win.style.width = '100%';
            win.style.height = '100%';
            data.isMaximized = true;
        }

        persistState(data);
        fireBoundsChanged(data.id);
    }

    function closeWindow(id) {
        const data = windows.get(id);
        if (!data) return;

        persistState(data);

        data.element.remove();
        const appId = data.appId;
        windows.delete(id);
        windowCloseHooks.delete(id);
        if (onWindowClosed) onWindowClosed(appId, id);
        fireWindowEvent('window-closed', { appId, id });
        if (onFocusChanged) {
            const remaining = getWindowsByApp(appId);
            if (remaining.length === 0) onFocusChanged(null);
        }
        fireWindowEvent('window-focus-changed', { appId: getFocused() ? getFocused().appId : null, id });
    }

    function getWindowsByApp(appId) {
        const result = [];
        windows.forEach((data) => {
            if (data.appId === appId) result.push(data);
        });
        return result;
    }

    function minimizeAll() {
        windows.forEach((data) => {
            setMinimized(data.id, true);
        });
    }

    // Single choke point for minimize state so virtual desktops can tell
    // "minimized" apart from "on another desktop" (both hide the element).
    function setMinimized(id, minimized) {
        const data = windows.get(id);
        if (!data) return false;
        const was = !!data.minimized;
        data.minimized = !!minimized;
        data.element.style.display = data.minimized ? 'none' : 'flex';
        if (was !== data.minimized) {
            fireWindowEvent(data.minimized ? 'window-minimized' : 'window-restored', { appId: data.appId, id });
        }
        return true;
    }

    function isMinimized(id) {
        const data = windows.get(id);
        return !!(data && data.minimized);
    }

    function _getWindow(id) {
        return windows.get(id);
    }

    // ---------- geometry + state contracts (SDK surface) ----------

    // Current box in container layout px, plus live state flags.
    // Maximized windows report the live desktop fill.
    function getBounds(id) {
        const data = windows.get(id);
        if (!data) return null;
        const el = data.element;
        return {
            x: el.offsetLeft || 0,
            y: el.offsetTop || 0,
            width: el.offsetWidth || 0,
            height: el.offsetHeight || 0,
            maximized: !!data.isMaximized,
            minimized: !!data.minimized
        };
    }

    function applyBounds(data, bounds) {
        const el = data.element;
        const minW = data.minWidth || 200;
        const minH = data.minHeight || 150;
        if (Number.isFinite(bounds.width)) el.style.width = Math.max(minW, bounds.width) + 'px';
        if (Number.isFinite(bounds.height)) el.style.height = Math.max(minH, bounds.height) + 'px';
        if (Number.isFinite(bounds.x)) el.style.left = Math.max(0, bounds.x) + 'px';
        if (Number.isFinite(bounds.y)) el.style.top = Math.max(0, bounds.y) + 'px';
    }

    // Programmatic move/resize. Un-maximizes first so the box you set is
    // the box you get; persists + notifies like a manual gesture.
    function setBounds(id, bounds) {
        const data = windows.get(id);
        if (!data || !bounds) return false;
        if (data.isMaximized) toggleMaximize(data);
        applyBounds(data, bounds);
        persistState(data);
        fireBoundsChanged(id);
        return true;
    }

    function center(id) {
        const data = windows.get(id);
        if (!data) return false;
        const area = getDesktopArea();
        const w = data.element.offsetWidth || data.minWidth || 400;
        const h = data.element.offsetHeight || data.minHeight || 300;
        return setBounds(id, {
            x: Math.max(0, (area.w - w) / 2),
            y: Math.max(0, (area.h - h) / 2)
        });
    }

    function setResizable(id, resizable) {
        const data = windows.get(id);
        if (!data) return false;
        data.resizable = resizable !== false;
        if (data.element.classList) data.element.classList.toggle('locked', !data.resizable);
        return true;
    }

    function isResizable(id) {
        const data = windows.get(id);
        return !!(data && data.resizable !== false);
    }

    function isDragging(id) {
        const data = windows.get(id);
        return !!(data && data.dragging);
    }

    function isResizing(id) {
        const data = windows.get(id);
        return !!(data && data.resizing);
    }

    function isMaximized(id) {
        const data = windows.get(id);
        return !!(data && data.isMaximized);
    }

    function setMaximized(id, maximized) {
        const data = windows.get(id);
        if (!data) return false;
        if (!!maximized === !!data.isMaximized) return true;
        toggleMaximize(data);
        return true;
    }

    function isFocused(id) {
        const data = windows.get(id);
        return !!(data && data.element.classList && data.element.classList.contains('focused'));
    }

    function getFocused() {
        let top = null;
        let topZ = -Infinity;
        windows.forEach((data) => {
            if (data.element.classList && data.element.classList.contains('focused')) {
                const z = parseInt(data.element.style.zIndex, 10);
                if (Number.isFinite(z) ? z >= topZ : true) { top = data; topZ = z; }
            }
        });
        return top;
    }

    function setTitle(id, title) {
        const data = windows.get(id);
        if (!data || typeof title !== 'string') return false;
        data.title = title;
        const el = data.element.querySelector && data.element.querySelector('.window-title');
        if (el) el.textContent = title;
        return true;
    }

    function setMinSize(id, minWidth, minHeight) {
        const data = windows.get(id);
        if (!data) return false;
        if (Number.isFinite(minWidth) && minWidth > 0) data.minWidth = minWidth;
        if (Number.isFinite(minHeight) && minHeight > 0) data.minHeight = minHeight;
        return true;
    }

    function getAllWindows() {
        return Array.from(windows.values());
    }

    return { init, setScale, getScale, getDesktopArea, setDesktopProvider, setMinimized, isMinimized, setOnFocusChanged, setOnWindowCreated, setOnWindowClosed, setOnWindowMinimized, setOnDragStateChanged, setOnResizeStateChanged, setOnBoundsChanged, setCloseHandler, removeCloseHandler, addWindowCloseHook, removeWindowCloseHook, requestClose, closeAllWindows, requestCloseAllWindows, createWindow, focusWindow, closeWindow, getWindowsByApp, getAllWindows, getFocused, minimizeAll, toggleMaximize, setMaximized, isMaximized, isFocused, getBounds, setBounds, center, setResizable, isResizable, isDragging, isResizing, setTitle, setMinSize, _getWindow };
})();

export default WindowManager;
