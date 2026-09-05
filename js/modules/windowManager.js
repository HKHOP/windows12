import WindowState from './windowState.js';

const WindowManager = (() => {
    let windows = new Map();
    let zCounter = 100;
    let container;
    let onFocusChanged = null;
    let onWindowCreated = null;
    let onWindowClosed = null;
    let onWindowMinimized = null;
    let snapIndicator = null;
    let scale = 1;
    const closeHandlers = new Map();

    function setScale(s) { scale = s; }
    function getScale() { return scale; }

    function init() {
        container = document.getElementById('windows-container');
        createSnapIndicator();
        WindowState.init();
    }

    function createSnapIndicator() {
        snapIndicator = document.createElement('div');
        snapIndicator.id = 'snap-indicator';
        snapIndicator.style.cssText = 'position:fixed;display:none;border:2px solid var(--accent-color);background:rgba(0,120,212,0.15);border-radius:8px;z-index:99999;pointer-events:none;transition:all 0.15s ease-out;';
        document.body.appendChild(snapIndicator);
    }

    function showSnapIndicator(x, y, w, h) {
        if (!snapIndicator) return;
        snapIndicator.style.display = 'block';
        snapIndicator.style.left = x + 'px';
        snapIndicator.style.top = y + 'px';
        snapIndicator.style.width = w + 'px';
        snapIndicator.style.height = h + 'px';
    }

    function hideSnapIndicator() {
        if (snapIndicator) snapIndicator.style.display = 'none';
    }

    function getSnapZone(clientX, clientY) {
        const threshold = 20;
        const s = scale;
        const w = window.innerWidth / s;
        const h = window.innerHeight / s - 48;
        const left = clientX <= threshold;
        const right = clientX >= w - threshold;
        const top = clientY <= threshold;

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

    function setCloseHandler(appId, handler) {
        closeHandlers.set(appId, handler);
    }

    function removeCloseHandler(appId) {
        closeHandlers.delete(appId);
    }

    async function requestClose(id) {
        const data = windows.get(id);
        if (!data) return false;

        const handler = closeHandlers.get(data.appId);
        if (handler) {
            const allowed = await handler(data);
            if (allowed === false) return false;
        }

        closeWindow(id);
        return true;
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

        let x, y, width, height, isMaximized = false;
        const savedState = opts.saveState ? WindowState.getWindowState(appId) : null;

        if (savedState) {
            x = savedState.x;
            y = savedState.y;
            width = savedState.width;
            height = savedState.height;
            isMaximized = savedState.maximized || false;
        } else {
            x = Math.max(50, (window.innerWidth / s - opts.width) / 2 + Math.random() * 60 - 30);
            y = Math.max(30, (window.innerHeight / s - opts.height - 48) / 2 + Math.random() * 40 - 20);
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
            prevBounds: null,
            saveState: opts.saveState
        };

        if (isMaximized) {
            win.classList.add('maximized');
        }

        windows.set(id, windowData);
        setupDrag(win, windowData);
        setupResize(win, windowData, opts.minWidth, opts.minHeight);
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
    }

    function setupDrag(win, data) {
        const header = win.querySelector('.window-header');
        let isDragging = false;
        let startX, startY, startLeft, startTop;
        let currentSnap = null;

        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('.window-controls')) return;
            if (data.isMaximized) {
                const ratio = e.clientX / window.innerWidth;
                data.prevBounds = null;
                data.isMaximized = false;
                win.classList.remove('maximized');
                const newW = 700;
                const newH = 500;
                win.style.width = newW + 'px';
                win.style.height = newH + 'px';
                win.style.left = (e.clientX - newW * ratio) + 'px';
                win.style.top = Math.max(0, e.clientY - 18) + 'px';
            }

            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = win.offsetLeft;
            startTop = win.offsetTop;
            header.classList.add('dragging');
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
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

                if (data.saveState) {
                    const rect = win.getBoundingClientRect();
                    WindowState.saveWindowState(data.appId, {
                        x: rect.left,
                        y: rect.top,
                        width: rect.width,
                        height: rect.height,
                        maximized: data.isMaximized
                    });
                }
            }
        });

        header.addEventListener('dblclick', (e) => {
            if (e.target.closest('.window-controls')) return;
            toggleMaximize(data);
        });
    }

    function setupResize(win, data, minW, minH) {
        const handles = win.querySelectorAll('.resize-handle');
        let isResizing = false;
        let currentHandle;
        let startX, startY, startW, startH, startL, startT;

        handles.forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                if (data.isMaximized) return;
                isResizing = true;
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
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            const classList = currentHandle.classList;

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
            if (isResizing && data.saveState) {
                const rect = win.getBoundingClientRect();
                WindowState.saveWindowState(data.appId, {
                    x: rect.left,
                    y: rect.top,
                    width: rect.width,
                    height: rect.height,
                    maximized: data.isMaximized
                });
            }
            isResizing = false;
            currentHandle = null;
        });
    }

    function setupControls(win, data) {
        win.querySelector('.minimize-btn').addEventListener('click', () => {
            win.style.display = 'none';
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
            const b = data.prevBounds;
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

        if (data.saveState) {
            const rect = win.getBoundingClientRect();
            WindowState.saveWindowState(data.appId, {
                x: rect.left,
                y: rect.top,
                width: rect.width,
                height: rect.height,
                maximized: data.isMaximized
            });
        }
    }

    function closeWindow(id) {
        const data = windows.get(id);
        if (!data) return;

        if (data.saveState) {
            const rect = data.element.getBoundingClientRect();
            WindowState.saveWindowState(data.appId, {
                x: rect.left,
                y: rect.top,
                width: rect.width,
                height: rect.height,
                maximized: data.isMaximized
            });
        }

        data.element.remove();
        const appId = data.appId;
        windows.delete(id);
        if (onWindowClosed) onWindowClosed(appId, id);
        if (onFocusChanged) {
            const remaining = getWindowsByApp(appId);
            if (remaining.length === 0) onFocusChanged(null);
        }
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
            data.element.style.display = 'none';
        });
    }

    function _getWindow(id) {
        return windows.get(id);
    }

    function getAllWindows() {
        return Array.from(windows.values());
    }

    return { init, setScale, getScale, setOnFocusChanged, setOnWindowCreated, setOnWindowClosed, setOnWindowMinimized, setCloseHandler, removeCloseHandler, requestClose, closeAllWindows, requestCloseAllWindows, createWindow, focusWindow, closeWindow, getWindowsByApp, getAllWindows, minimizeAll, toggleMaximize, _getWindow };
})();

export default WindowManager;
