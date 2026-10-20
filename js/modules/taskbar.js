import WindowManager from './windowManager.js';
import FileSystem from './fileSystem.js';
import AppIcons from './appIcons.js';
import UIIcons from './uiIcons.js';
import Flyout from './flyout.js';
import Search from './search.js';
import AppLoader from './appLoader.js';
import FileAssociations from './fileAssociations.js';
import SystemConfig from './systemConfig.js';
import Scaling from './scaling.js';
import Users from './users.js';

const AppRegistry = (() => {
    const apps = {};

    function register(id, app) {
        apps[id] = app;
    }

    function unregister(id) {
        delete apps[id];
    }

    function get(id) {
        return apps[id];
    }

    function getAll() {
        return { ...apps };
    }

    return { register, unregister, get, getAll };
})();

const AppMetadata = (() => {
    // Populated from app manifests at boot via setNames() (see appLoader.js).
    // Falls back to the raw id for anything not yet registered.
    let names = {};

    function setNames(map) {
        names = { ...map };
    }

    const fallbackIcon = `<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="2" fill="#666"/></svg>`;

    function get(id) {
        return {
            name: names[id] || id,
            icon: AppIcons.get(id) || fallbackIcon
        };
    }

    function getAll() {
        const result = {};
        for (const [id, name] of Object.entries(names)) {
            result[id] = { name, icon: AppIcons.get(id) || fallbackIcon };
        }
        return result;
    }

    return { get, getAll, setNames };
})();

const Taskbar = (() => {
    let runningApps = new Map();
    let clockInterval;
    let pinEntries = [];
    const LEGACY_PINS_PATH = ['/', 'system', 'programs data', 'taskbar', 'pins.json'];
    const DEFAULT_PINS = ['fileExplorer', 'notepad', 'calendar', 'settings'];

    // Switcher popup state
    let switcherPopup = null;
    let switcherHoverTimer = null;
    let currentSwitcherAppId = null;
    let peekEnabled = false;
    let outsideClickWired = false;

    // Tray overflow state
    let trayOverflowFlyout = null;
    let trayOverflowBtn = null;

    // Shell-owned FS access (shield from fsGuard app attribution).
    function asShell(fn) {
        return (...args) => {
            const g = window._FSGuard;
            if (g) return g.asShell(fn)(...args);
            return fn(...args);
        };
    }

    const ensureDir = asShell(function ensureDir(path) {
        for (let i = 1; i <= path.length - 1; i++) {
            const partial = path.slice(0, i);
            if (!FileSystem.itemExists(partial)) {
                const parent = path.slice(0, i - 1);
                FileSystem.createFolder(parent, path[i - 1]);
            }
        }
    });

    const readJson = asShell(function readJson(path, fallback) {
        try {
            const raw = FileSystem.readFile(path);
            if (raw) return JSON.parse(raw);
        } catch {}
        return fallback;
    });

    const writeJson = asShell(function writeJson(path, data) {
        ensureDir(path);
        const name = path[path.length - 1];
        const parent = path.slice(0, -1);
        const json = JSON.stringify(data);
        if (FileSystem.itemExists(path)) {
            FileSystem.writeFile(path, json);
        } else {
            FileSystem.createFile(parent, name, json, 'json');
        }
    });

    function taskbarDir() {
        const s = window._Shortcuts;
        return s ? s.taskbarDir() : Users.home(['AppData', 'Roaming', 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar']);
    }

    function pinMarkerPath() {
        return Users.userData(['taskbar', 'folder.json']);
    }

    function shortcutApi() { return window._Shortcuts || null; }
    function bundleApi() { return window._AppBundles || null; }

    function visibleChildren(dir) {
        try {
            return (asShell(FileSystem.getChildren)(dir) || []).filter(c => !String(c.name).startsWith('.'));
        } catch { return []; }
    }

    function init() {
        loadPinnedEntries();
        updateClock();
        clockInterval = setInterval(updateClock, 1000);
        // Open With dialog names/icons resolve through app metadata.
        FileAssociations.setAppInfoProvider((id) => {
            try {
                return AppMetadata.get(id);
            } catch (e) {
                return { name: id, icon: '' };
            }
        });
        renderTaskbarButtons();
        window.addEventListener('open-search', (e) => {
            Search.open(e.detail.query);
        });
        window.addEventListener('shortcuts-changed', () => {
            loadPinnedEntries();
            renderTaskbarButtons();
        });
    }

    // Per-user pins live as files in the TaskBar shell folder. The previous
    // machine-wide pins.json is migrated once per profile.
    function migrateLegacyPins() {
        const marker = readJson(pinMarkerPath(), null);
        if (marker && marker.initialized) return;
        const dir = taskbarDir();
        ensureDir(dir);
        if (visibleChildren(dir).length > 0) {
            writeJson(pinMarkerPath(), { initialized: true });
            return;
        }
        const s = shortcutApi();
        if (!s) return;
        writeJson(pinMarkerPath(), { initialized: true, migrated: true });
        const legacy = readJson(LEGACY_PINS_PATH, null);
        const ids = Array.isArray(legacy) && legacy.length ? legacy : DEFAULT_PINS;
        for (const id of ids) {
            try {
                if (!AppLoader.isLaunchable(id)) continue;
                s.createAppShortcut(id, 'taskbar', { create: true, source: { kind: 'user' } });
            } catch { /* skip an app that can no longer launch */ }
        }
    }

    function loadPinnedEntries() {
        const dir = taskbarDir();
        ensureDir(dir);
        migrateLegacyPins();
        const out = [];
        const seen = new Set();
        for (const child of visibleChildren(dir)) {
            const entry = buildPinEntry([...dir, child.name], child);
            if (!entry) continue;
            const key = entry.appId ? 'app:' + entry.appId : 'path:' + entry.path.join('/');
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(entry);
        }
        out.sort((a, b) => a.name.localeCompare(b.name));
        pinEntries = out;
    }

    function buildPinEntry(path, child) {
        const s = shortcutApi();
        const b = bundleApi();
        if (child.type === 'folder') {
            const man = b ? b.manifestForFolder(path) : null;
            if (man) {
                const icon = b.iconHtml(path, man, 20);
                return {
                    path, name: man.name || child.name, appId: man.id,
                    meta: { name: man.name || child.name, icon }, icon,
                    launch: () => b.launchFolder(path, man)
                };
            }
            const icon = UIIcons.folder(child.name, 20);
            return {
                path, name: child.name, appId: null,
                meta: { name: child.name, icon }, icon,
                launch: () => b ? b.openFolder(path) : AppLoader.launch('fileExplorer', { path })
            };
        }
        if (child.ext === 'lnk') {
            const data = s ? s.readSync(path) : null;
            if (data) {
                const appId = s.appIdForShortcut(data);
                const name = String(child.name).replace(/\.lnk$/i, '');
                const icon = s.iconHtml(data, 20, { arrow: false });
                return {
                    path, name, appId, data, icon,
                    meta: { name, icon },
                    targetLocation: s.locationFor(path, data),
                    launch: () => s.open(path)
                };
            }
        }
        const icon = UIIcons.file(child.ext, child.name, 20);
        return {
            path, name: child.name, appId: null,
            meta: { name: child.name, icon }, icon,
            launch: () => openFilePin(path)
        };
    }

    function openFilePin(path) {
        let opened = false;
        try { opened = FileAssociations.openDefault(path); } catch { opened = false; }
        if (opened) return true;
        AppLoader.ensureLoaded('notepad').then(app => {
            if (app && typeof app.launch === 'function') app.launch(path, path[path.length - 1]);
        }).catch(() => {});
        return true;
    }

    function isPinned(appId) {
        return pinEntries.some(entry => entry.appId === appId);
    }

    function pinApp(appId) {
        // Services are uninstall-only: never pinnable or launchable.
        try {
            if (AppLoader.isService(appId)) return;
        } catch (e) { /* manifest unreadable — fall through */ }
        if (isPinned(appId)) return;
        const s = shortcutApi();
        if (!s) return;
        s.createAppShortcut(appId, 'taskbar', { create: true, source: { kind: 'user' } });
        loadPinnedEntries();
        renderTaskbarButtons();
    }

    function unpinApp(appId) {
        const s = shortcutApi();
        if (!s) return;
        pinEntries.filter(entry => entry.appId === appId).forEach(entry => s.deleteShortcut(entry.path));
        loadPinnedEntries();
        renderTaskbarButtons();
    }

    function unpinPath(path) {
        const s = shortcutApi();
        if (!s) return;
        s.deleteShortcut(path);
        loadPinnedEntries();
        renderTaskbarButtons();
    }

    function pinEntry(sourcePath, options = {}) {
        const s = shortcutApi();
        if (!s) return null;
        const created = s.pinToTaskbar(sourcePath, options);
        loadPinnedEntries();
        renderTaskbarButtons();
        return created;
    }

    function isEntryPinned(path) {
        const key = (path || []).join('/');
        return pinEntries.some(entry => entry.path.join('/') === key);
    }

    function renderTaskbarButtons() {
        const center = document.getElementById('taskbar-center');
        center.innerHTML = '';

        // Close any open switcher when re-rendering
        hideSwitcher();

        const startBtn = document.createElement('button');
        startBtn.id = 'start-btn';
        startBtn.className = 'taskbar-btn';
        startBtn.title = 'Start';
        startBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="1" y="1" width="8.5" height="8.5" rx="1.5" fill="white"/><rect x="10.5" y="1" width="8.5" height="8.5" rx="1.5" fill="white"/><rect x="1" y="10.5" width="8.5" height="8.5" rx="1.5" fill="white"/><rect x="10.5" y="10.5" width="8.5" height="8.5" rx="1.5" fill="white"/></svg>`;
        center.appendChild(startBtn);
        setupStartButton();

        const searchBtn = document.createElement('button');
        searchBtn.className = 'taskbar-btn app-btn';
        searchBtn.dataset.app = 'search';
        searchBtn.title = 'Search';
        searchBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="7"/><line x1="15.5" y1="15.5" x2="21" y2="21"/></svg>`;
        searchBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            Search.toggle();
        });
        center.appendChild(searchBtn);

        const taskViewBtn = document.createElement('button');
        taskViewBtn.className = 'taskbar-btn';
        taskViewBtn.title = 'Task View (Win+Tab)';
        taskViewBtn.innerHTML = UIIcons.setting('multitasking', 18);
        taskViewBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const VD = (window._modules && window._modules.VirtualDesktops) || null;
            if (VD) VD.toggle();
        });
        center.appendChild(taskViewBtn);

        const separator = document.createElement('div');
        separator.className = 'taskbar-separator';
        center.appendChild(separator);

        // Determine grouping mode
        const groupingMode = SystemConfig.get('taskbarGrouping') || 'always';
        const shouldGroup = getShouldGroup(groupingMode);

        // Collect all apps that should appear on the taskbar
        const appEntries = collectAppEntries(shouldGroup);

        // Render pinned entries first
        appEntries.filter(e => e.isPinned).forEach(entry => {
            const btn = createAppButton(entry);
            center.appendChild(btn);
        });

        const runningSeparator = document.createElement('div');
        runningSeparator.className = 'taskbar-separator taskbar-running-separator';
        runningSeparator.style.display = 'none';
        center.appendChild(runningSeparator);

        // Render non-pinned running apps
        const nonPinned = appEntries.filter(e => !e.isPinned);
        if (nonPinned.length > 0) {
            runningSeparator.style.display = 'block';
            nonPinned.forEach(entry => {
                const btn = createAppButton(entry);
                center.appendChild(btn);
            });
        }

        updateRunningState();
        setupAppButtonEvents(shouldGroup);
        updateTrayOverflow();
    }

    // Collect all app entries for the taskbar based on grouping mode
    function collectAppEntries(shouldGroup) {
        const entries = [];
        const seen = new Set();

        // First, pinned entries (app shortcuts and arbitrary files/folders)
        pinEntries.forEach(pin => {
            if (pin.appId) {
                try {
                    if (AppLoader.isService(pin.appId)) return;
                } catch (e) { /* fall through */ }
                if (seen.has(pin.appId)) return;
                seen.add(pin.appId);
                entries.push({
                    appId: pin.appId, meta: pin.meta, icon: pin.icon,
                    windows: getWindowsForApp(pin.appId),
                    isPinned: true, pin, launch: pin.launch
                });
                return;
            }
            entries.push({
                appId: null, pinId: pin.path.join('/'), meta: pin.meta, icon: pin.icon,
                windows: [], isPinned: true, pin, launch: pin.launch
            });
        });

        // Then running apps on active desktop
        runningApps.forEach((windowIds, appId) => {
            if (appId === 'search') return;
            if (seen.has(appId)) return;
            const windows = getWindowsForApp(appId);
            if (windows.length === 0) return;
            seen.add(appId);
            const meta = AppMetadata.get(appId);
            entries.push({ appId, meta, windows, isPinned: false });
        });

        if (shouldGroup) {
            // Grouped: one entry per app (already the case above)
            return entries;
        } else {
            // Ungrouped: one entry per window
            const ungrouped = [];
            entries.forEach(entry => {
                if (entry.windows.length === 0) {
                    // Pinned but not running: keep its launcher button.
                    ungrouped.push({
                        appId: entry.appId,
                        pinId: entry.pinId,
                        windowId: null,
                        meta: entry.meta,
                        icon: entry.icon || entry.meta.icon,
                        windows: [],
                        isPinned: entry.isPinned,
                        pin: entry.pin,
                        launch: entry.launch,
                        isUngrouped: true
                    });
                    return;
                }
                entry.windows.forEach(win => {
                    ungrouped.push({
                        appId: entry.appId,
                        pinId: entry.pinId,
                        windowId: win.id,
                        meta: { ...entry.meta, name: win.title || entry.meta.name },
                        icon: win.icon || entry.meta.icon,
                        windows: [win],
                        isPinned: entry.isPinned,
                        pin: entry.pin,
                        launch: entry.launch,
                        isUngrouped: true
                    });
                });
            });
            return ungrouped;
        }
    }

    function getShouldGroup(mode) {
        if (mode === 'never') return false;
        if (mode === 'always') return true;
        // 'whenFull' - check if taskbar would overflow
        return checkTaskbarWouldOverflow();
    }

    function checkTaskbarWouldOverflow() {
        const center = document.getElementById('taskbar-center');
        if (!center) return false;

        // Estimate button count and available space
        const taskbar = document.getElementById('taskbar');
        if (!taskbar) return false;

        const tray = document.getElementById('taskbar-tray');
        const taskbarRect = taskbar.getBoundingClientRect();
        const trayRect = tray ? tray.getBoundingClientRect() : { width: 200 };

        // Available space for center section (roughly half the taskbar minus tray)
        const availableWidth = taskbarRect.width / 2 - trayRect.width - 40; // 40px for start button area

        // Count total buttons that would be shown ungrouped
        let buttonCount = 0;
        pinEntries.forEach(pin => {
            if (pin.appId) {
                try { if (!AppLoader.isService(pin.appId)) buttonCount++; } catch { /* skip */ }
            } else {
                buttonCount++;
            }
        });

        runningApps.forEach((windowIds, appId) => {
            if (appId === 'search' || isPinned(appId)) return;
            const windows = getWindowsForApp(appId);
            buttonCount += windows.length;
        });

        // Each button is ~44px (40px + gap), plus separators
        const estimatedWidth = buttonCount * 44 + 20;
        return estimatedWidth > availableWidth;
    }

    // Get windows for an app on the active desktop
    function getWindowsForApp(appId) {
        const result = [];
        if (!runningApps.has(appId)) return result;
        for (const id of runningApps.get(appId)) {
            if (isOnActiveDesktop(id)) {
                const win = WindowManager._getWindow(id);
                if (win) result.push(win);
            }
        }
        return result;
    }

    function createAppButton(entry) {
        const btn = document.createElement('button');
        btn.className = 'taskbar-btn app-btn';
        if (entry.appId) btn.dataset.app = entry.appId;
        if (entry.pinId) btn.dataset.pin = entry.pinId;
        if (entry.windowId) btn.dataset.windowId = entry.windowId;
        btn._taskbarEntry = entry;
        btn.title = entry.meta.name;
        btn.innerHTML = entry.icon || entry.meta.icon;

        // Add indicator for grouped apps with multiple windows
        if (!entry.isUngrouped && entry.windows.length > 1) {
            btn.classList.add('grouped');
            btn.setAttribute('data-window-count', entry.windows.length);
        }

        return btn;
    }

    function activateTaskbarEntry(entry) {
        if (!entry) return;
        if (entry.windowId) {
            focusWindowById(entry.windowId);
            return;
        }
        const appId = entry.appId;
        if (appId && appId !== 'search' && hasWindowOnActiveDesktop(appId)) {
            openApp(appId);
            return;
        }
        if (entry.pin && typeof entry.pin.launch === 'function') {
            try {
                const result = entry.pin.launch();
                if (result && typeof result.catch === 'function') result.catch(() => {});
            } catch { /* crash monitor reports launch failures */ }
            return;
        }
        if (appId && appId !== 'search') openApp(appId);
    }

    function showTaskbarEntryMenu(e, entry) {
        const { ContextMenu } = window._modules || {};
        if (!ContextMenu) return;
        const meta = entry.meta || AppMetadata.get(entry.appId);
        const appId = entry.appId;
        const items = [
            { label: meta.name, icon: '', disabled: true },
            'separator'
        ];

        if (appId) {
            const running = hasWindowOnActiveDesktop(appId);
            if (running) {
                items.push({
                    label: 'Close all windows', icon: UIIcons.action('close'), action: () => {
                        WindowManager.getWindowsByApp(appId).filter(w => isOnActiveDesktop(w.id))
                            .forEach(w => WindowManager.closeWindow(w.id));
                    }
                });
            } else {
                items.push({
                    label: 'Open', icon: UIIcons.action('open'), action: () => {
                        if (entry.pin) activateTaskbarEntry(entry);
                        else openApp(appId);
                    }
                });
            }
            items.push('separator');
            items.push(isPinned(appId)
                ? { label: 'Unpin from taskbar', icon: UIIcons.action('unpin'), action: () => unpinApp(appId) }
                : { label: 'Pin to taskbar', icon: UIIcons.action('pin'), action: () => pinApp(appId) });
        } else if (entry.pin) {
            items.push({
                label: 'Open', icon: UIIcons.action('open'), action: () => activateTaskbarEntry(entry)
            });
            items.push('separator');
            items.push({
                label: 'Unpin from taskbar', icon: UIIcons.action('unpin'),
                action: () => unpinPath(entry.pin.path)
            });
        }

        if (entry.pin && entry.pin.data) {
            if (entry.pin.targetLocation) {
                items.push({
                    label: 'Open file location', icon: UIIcons.folder('', 16), action: () => {
                        const b = bundleApi();
                        if (b) b.openFolder(entry.pin.targetLocation).catch(() => {});
                        else AppLoader.launch('fileExplorer', { path: entry.pin.targetLocation }).catch(() => {});
                    }
                });
            }
            items.push('separator');
            items.push({
                label: 'Properties', icon: UIIcons.action('properties'),
                action: () => shortcutApi() && shortcutApi().properties(entry.pin.path)
            });
        }

        ContextMenu.show(e.clientX, e.clientY, items);
    }

    function bindWindowMenu(btn, appId, windowId) {
        btn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const win = WindowManager._getWindow(windowId);
            if (!win) return;
            const meta = AppMetadata.get(appId);
            const items = [
                { label: win.title || meta.name, icon: '', disabled: true },
                'separator',
                { label: 'Close', icon: UIIcons.action('close'), action: () => WindowManager.closeWindow(windowId) },
                'separator',
                { label: 'Minimize', icon: UIIcons.action('minimize'), action: () => WindowManager.setMinimized(windowId, true) },
            ];
            const { ContextMenu } = window._modules || {};
            if (ContextMenu) ContextMenu.show(e.clientX, e.clientY, items);
        });
    }

    function setupAppButtonEvents(shouldGroup) {
        const buttons = document.querySelectorAll('.taskbar-btn.app-btn');
        buttons.forEach(btn => {
            const entry = btn._taskbarEntry || {};
            const appId = entry.appId;
            const windowId = entry.windowId;
            const isGrouped = btn.classList.contains('grouped');

            if (shouldGroup && isGrouped) {
                // Grouped app with multiple windows - show switcher on click/hover
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleSwitcher(appId, btn);
                });

                btn.addEventListener('mouseenter', () => {
                    if (switcherHoverTimer) clearTimeout(switcherHoverTimer);
                    switcherHoverTimer = setTimeout(() => {
                        if (!switcherPopup || !switcherPopup.classList.contains('show')) {
                            showSwitcher(appId, btn);
                        }
                    }, 200);
                });
                btn.addEventListener('mouseleave', () => {
                    if (switcherHoverTimer) {
                        clearTimeout(switcherHoverTimer);
                        switcherHoverTimer = null;
                    }
                });
            } else if (windowId) {
                // Ungrouped mode - each window has its own button
                btn.addEventListener('click', () => focusWindowById(windowId));
            } else {
                // Launcher button: pinned entry or a running grouped app.
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    activateTaskbarEntry(entry);
                });
            }

            if (windowId) {
                bindWindowMenu(btn, appId, windowId);
            } else if (entry.pin || (shouldGroup && appId)) {
                btn.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    hideSwitcher();
                    showTaskbarEntryMenu(e, entry);
                });
            }
        });

        // Click outside to close switcher. Register once: setupAppButtonEvents
        // runs on every taskbar re-render, so binding here per render leaked a
        // document listener each time.
        if (!outsideClickWired) {
            outsideClickWired = true;
            document.addEventListener('click', (e) => {
                if (switcherPopup && !switcherPopup.contains(e.target) && !e.target.closest('.taskbar-btn.grouped')) {
                    hideSwitcher();
                }
            }, true);
        }
    }

    // Switcher popup functions
    function showSwitcher(appId, anchorBtn) {
        if (switcherPopup) hideSwitcher();

        const windows = getWindowsForApp(appId);
        if (windows.length <= 1) {
            // Single window - just focus it
            if (windows.length === 1) {
                focusWindowById(windows[0].id);
            }
            return;
        }

        currentSwitcherAppId = appId;

        const popup = document.createElement('div');
        popup.id = 'taskbar-switcher';
        popup.className = 'taskbar-switcher hidden';
        document.body.appendChild(popup);

        const meta = AppMetadata.get(appId);
        let html = `<div class="switcher-header"><span class="switcher-app-icon">${meta.icon}</span><span class="switcher-app-name">${meta.name}</span></div><div class="switcher-list">`;

        windows.forEach((win, index) => {
            const isMinimized = WindowManager.isMinimized(win.id);
            const isFocused = win.element.classList.contains('focused');
            html += `
                <div class="switcher-item${isFocused ? ' focused' : ''}${isMinimized ? ' minimized' : ''}" 
                     data-window-id="${win.id}" 
                     data-app-id="${appId}"
                     title="${win.title}">
                    <span class="switcher-item-icon">${win.icon || meta.icon}</span>
                    <span class="switcher-item-title">${win.title || 'Untitled'}</span>
                    ${isMinimized ? '<span class="switcher-item-minimized">Minimized</span>' : ''}
                </div>`;
        });

        html += '</div>';
        popup.innerHTML = html;

        // Position above the anchor button. Rects/innerHeight are visual
        // viewport pixels; style offsets live inside the zoomed <body>.
        const z = Scaling.getUiZoom() || 1;
        const anchorRect = anchorBtn.getBoundingClientRect();
        const taskbar = document.getElementById('taskbar');
        const taskbarRect = taskbar.getBoundingClientRect();
        const isTop = taskbarRect.top < window.innerHeight / 2;

        if (isTop) {
            // Taskbar at top - popup goes below
            popup.style.top = `${(anchorRect.bottom + 4) / z}px`;
            popup.style.bottom = 'auto';
        } else {
            // Taskbar at bottom - popup goes above
            popup.style.bottom = `${(window.innerHeight - anchorRect.top + 4) / z}px`;
            popup.style.top = 'auto';
        }
        popup.style.left = `${(anchorRect.left + anchorRect.width / 2) / z}px`;
        popup.style.transform = 'translateX(-50%)';

        // Event listeners for switcher items
        popup.querySelectorAll('.switcher-item').forEach(item => {
            const winId = item.dataset.windowId;
            const appId = item.dataset.appId;

            // Click to focus
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                focusWindowById(winId);
                hideSwitcher();
            });

            // Hover for Aero peek
            item.addEventListener('mouseenter', () => {
                peekWindow(winId, true);
            });
            item.addEventListener('mouseleave', () => {
                peekWindow(winId, false);
            });

            // Right-click for window context menu
            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const win = WindowManager._getWindow(winId);
                if (!win) return;
                const meta = AppMetadata.get(appId);
                const items = [
                    { label: win.title || meta.name, icon: '', disabled: true },
                    'separator',
                    { label: 'Close', icon: UIIcons.action('close'), action: () => WindowManager.closeWindow(winId) },
                    'separator',
                    { label: 'Minimize', icon: UIIcons.action('minimize'), action: () => WindowManager.setMinimized(winId, true) },
                    { label: isMinimized ? 'Restore' : 'Maximize', icon: UIIcons.action(isMinimized ? 'restore' : 'maximize'), action: () => isMinimized ? focusWindowById(winId) : WindowManager.toggleMaximize(win) },
                ];
                const { ContextMenu } = window._modules || {};
                if (ContextMenu) ContextMenu.show(e.clientX, e.clientY, items);
            });
        });

        // Prevent switcher from closing when hovering over it
        popup.addEventListener('mouseenter', () => {
            if (switcherHoverTimer) {
                clearTimeout(switcherHoverTimer);
                switcherHoverTimer = null;
            }
        });
        popup.addEventListener('mouseleave', () => {
            // Start a timer to hide if not re-entered
            switcherHoverTimer = setTimeout(() => hideSwitcher(), 200);
        });

        switcherPopup = popup;
        // Force reflow then show
        requestAnimationFrame(() => {
            popup.classList.add('show');
            popup.classList.remove('hidden');
        });
    }

    function hideSwitcher() {
        // Capture the popup: the removal timer must never touch a switcher
        // that was created in the meantime (show() calls hide() first).
        const closing = switcherPopup;
        if (closing) {
            closing.classList.remove('show');
            closing.classList.add('closing');
            switcherPopup = null;
            currentSwitcherAppId = null;
            setTimeout(() => {
                if (closing.parentNode) closing.parentNode.removeChild(closing);
            }, 150);
        }
        if (switcherHoverTimer) {
            clearTimeout(switcherHoverTimer);
            switcherHoverTimer = null;
        }
        // End any active peek - use local peekWindow to properly reset peekEnabled flag
        if (peekEnabled) {
            peekWindow(null, false);
            peekEnabled = false;
        }
    }

    function toggleSwitcher(appId, anchorBtn) {
        if (switcherPopup && switcherPopup.classList.contains('show') && currentSwitcherAppId === appId) {
            hideSwitcher();
        } else {
            showSwitcher(appId, anchorBtn);
        }
    }

    function focusWindowById(windowId) {
        const win = WindowManager._getWindow(windowId);
        if (!win) return;
        if (WindowManager.isMinimized(windowId)) {
            WindowManager.setMinimized(windowId, false);
        }
        WindowManager.focusWindow(windowId);
    }

    function peekWindow(windowId, enable) {
        // Delegate to WindowManager: it knows how to dim the app's other
        // windows, move the peek to a new target and restore z-order.
        if (enable && windowId) {
            WindowManager.peekWindow(windowId, true);
            peekEnabled = true;
        } else if (peekEnabled) {
            WindowManager.peekWindow(null, false);
            peekEnabled = false;
        }
    }

    function getVD() {
        return (window._modules && window._modules.VirtualDesktops) || null;
    }

    // Virtual desktops: the taskbar only reflects the active desktop's
    // windows. Without the module (or before it boots), everything counts.
    // Concurrent sessions: another profile's windows never count either.
    function isOnActiveDesktop(windowId) {
        const S = window._Sessions;
        if (S) {
            const w = WindowManager._getWindow(windowId);
            if (w && w.userId && w.userId !== S.getActive()) return false;
        }
        const VD = getVD();
        if (!VD) return true;
        try {
            return VD.getDesktopOf(windowId) === VD.getActiveId();
        } catch (e) {
            return true;
        }
    }

    function hasWindowOnActiveDesktop(appId) {
        if (!runningApps.has(appId)) return false;
        for (const id of runningApps.get(appId)) {
            if (isOnActiveDesktop(id)) return true;
        }
        return false;
    }

    function updateClock() {
        const now = new Date();
        const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        const date = now.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
        document.getElementById('clock').innerHTML = `${time}<br>${date}`;
    }

    function setupStartButton() {
        const startBtn = document.getElementById('start-btn');
        const startMenu = document.getElementById('start-menu');

        startBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            Search.close();
            Flyout.toggle(startMenu);
        });

        document.addEventListener('click', (e) => {
            if (!startMenu.contains(e.target) && !startBtn.contains(e.target)) {
                Flyout.hide(startMenu);
            }
        });
    }

    async function openApp(appId, options = {}) {
        try {
            if (AppLoader.isService(appId)) return false;
        } catch (e) { /* manifest unreadable — fall through */ }
        if (!AppLoader.isLaunchable(appId)) return false;
        // Only windows on the active desktop take part: clicking an app
        // that runs solely elsewhere opens a fresh window here.
        const existing = WindowManager.getWindowsByApp(appId).filter(w => isOnActiveDesktop(w.id));
        if (existing.length > 0) {
            const win = existing[0];
            const wasFocused = win.element.classList.contains('focused');
            if (WindowManager.isMinimized(win.id)) {
                WindowManager.setMinimized(win.id, false);
                WindowManager.focusWindow(win.id);
            } else if (wasFocused && !options.page) {
                WindowManager.setMinimized(win.id, true);
            } else {
                WindowManager.focusWindow(win.id);
            }
            if (options.page) {
                try {
                    const app = await AppLoader.ensureLoaded(appId);
                    if (app && typeof app.showPage === 'function') {
                        app.showPage(options.page, options.subPage);
                    }
                } catch (e) { /* page target unavailable */ }
            }
        } else {
            await launchApp(appId, options);
        }
        Flyout.hide(document.getElementById('start-menu'));
        return true;
    }

    async function launchApp(appId, options = {}) {
        try {
            if (AppLoader.isService(appId)) return false;
        } catch (e) { /* manifest unreadable — fall through */ }
        if (!AppLoader.isLaunchable(appId)) return false;
        try {
            await AppLoader.launch(appId, options);
            return true;
        } catch (err) {
            // Load or launch failure -> crash recovery dialog.
            // (Lazy access: crashMonitor imports this module, so a
            // static import here would be a cycle.)
            try {
                window._modules?.CrashMonitor?.reportCrash(appId, {
                    message: err && err.message ? err.message : String(err),
                    stack: err && err.stack ? err.stack : '',
                    source: 'launch'
                });
            } catch (e) { /* recovery UI unavailable */ }
            return false;
        }
    }

    function addRunningApp(appId, windowData) {
        if (!runningApps.has(appId)) {
            runningApps.set(appId, new Set());
        }
        runningApps.get(appId).add(windowData.id);

        // Always re-render: a pinned app's button must switch to the grouped
        // switcher as soon as it gains a second window. (Pinned apps used to
        // only call updateRunningState, so their grouping never updated.)
        renderTaskbarButtons();
    }

    function removeRunningApp(appId, windowId) {
        if (runningApps.has(appId)) {
            runningApps.get(appId).delete(windowId);
            if (runningApps.get(appId).size === 0) runningApps.delete(appId);
        }
        renderTaskbarButtons();
    }

    function updateRunningState() {
        const btns = document.querySelectorAll('.taskbar-btn.app-btn');
        btns.forEach(btn => {
            const entry = btn._taskbarEntry || {};
            const app = entry.appId;
            const windowId = entry.windowId;
            if (!app) {
                btn.classList.remove('running');
                btn.classList.remove('active');
                return;
            }
            if (windowId) {
                // Ungrouped mode - check specific window
                const win = WindowManager._getWindow(windowId);
                if (win && !WindowManager.isMinimized(windowId) && isOnActiveDesktop(windowId)) {
                    btn.classList.add('running');
                } else {
                    btn.classList.remove('running');
                    btn.classList.remove('active');
                }
            } else {
                // Grouped mode - check if any window of this app is running
                if (hasWindowOnActiveDesktop(app)) {
                    btn.classList.add('running');
                } else {
                    btn.classList.remove('running');
                    btn.classList.remove('active');
                }
            }
        });
        updateTrayOverflow();
    }

    function setActiveApp(appId) {
        const btns = document.querySelectorAll('.taskbar-btn.app-btn');
        btns.forEach(btn => {
            const entry = btn._taskbarEntry || {};
            // In grouped mode, match by appId; in ungrouped, don't set active on window buttons
            if (!entry.windowId && entry.appId === appId) {
                btn.classList.add('active');
            } else if (!entry.windowId) {
                btn.classList.remove('active');
            }
        });
    }

    function clearActiveApp() {
        const btns = document.querySelectorAll('.taskbar-btn.app-btn');
        btns.forEach(btn => {
            const entry = btn._taskbarEntry || {};
            if (!entry.windowId) btn.classList.remove('active');
        });
    }

    // Tray overflow handling
    function updateTrayOverflow() {
        const trayAppIcons = document.getElementById('tray-app-icons');
        const trayIcons = document.getElementById('tray-icons');
        const trayNetwork = document.getElementById('tray-network');
        const clock = document.getElementById('clock');
        const taskbarTray = document.getElementById('taskbar-tray');

        if (!trayAppIcons || !trayIcons || !taskbarTray) return;

        // Get all tray icons (system + app)
        const systemIcons = Array.from(trayIcons.querySelectorAll('svg, button')).filter(el => el.id !== 'tray-network' && el.id !== 'tray-chevron');
        const appIcons = Array.from(trayAppIcons.querySelectorAll('.tray-app-icon'));
        const networkBtn = trayNetwork;
        const chevron = document.getElementById('tray-chevron');
        const clockEl = clock;

        // Check if we need overflow (more than 5 visible icons or app icons pushing into system area)
        const allVisibleIcons = [...systemIcons, ...appIcons, networkBtn].filter(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
        });

        const needsOverflow = allVisibleIcons.length > 5;

        // Use the existing chevron as overflow button
        if (chevron) {
            if (needsOverflow) {
                chevron.style.display = 'flex';
                chevron.style.alignItems = 'center';
                chevron.style.justifyContent = 'center';
                chevron.style.width = '28px';
                chevron.style.height = '28px';
                chevron.style.padding = '2px';
                chevron.style.borderRadius = '4px';
                chevron.style.cursor = 'pointer';
                chevron.style.color = 'var(--text-primary)';
                chevron.title = 'Show hidden icons';
                // Replace the chevron icon with the overflow icon
                if (!chevron.dataset.overflowSet) {
                    chevron.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
                    chevron.dataset.overflowSet = 'true';
                    setupTrayOverflow(chevron);
                }
            } else {
                chevron.style.display = 'none';
                // Also close flyout if open
                if (trayOverflowFlyout) {
                    hideTrayOverflowFlyout();
                }
            }
        }
    }

    function setupTrayOverflow(overflowBtn) {
        // Remove any existing listener
        overflowBtn.removeEventListener('click', overflowBtn._overflowHandler);
        const handler = (e) => {
            e.stopPropagation();
            toggleTrayOverflowFlyout(overflowBtn);
        };
        overflowBtn._overflowHandler = handler;
        overflowBtn.addEventListener('click', handler);
    }

    function toggleTrayOverflowFlyout(anchorBtn) {
        if (trayOverflowFlyout && trayOverflowFlyout.classList.contains('show')) {
            hideTrayOverflowFlyout();
        } else {
            showTrayOverflowFlyout(anchorBtn);
        }
    }

    function showTrayOverflowFlyout(anchorBtn) {
        if (trayOverflowFlyout) hideTrayOverflowFlyout();

        const trayAppIcons = document.getElementById('tray-app-icons');
        const trayIcons = document.getElementById('tray-icons');

        const flyout = document.createElement('div');
        flyout.id = 'tray-overflow-flyout';
        flyout.className = 'tray-overflow-flyout hidden';
        document.body.appendChild(flyout);

        // Collect hidden icons (icons that don't fit or are pushed out)
        // For simplicity, show all app icons in the flyout
        const appIcons = Array.from(trayAppIcons.querySelectorAll('.tray-app-icon')).filter(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none';
        });

        let html = '<div class="overflow-header">Hidden icons</div><div class="overflow-list">';

        appIcons.forEach(icon => {
            const appId = icon.dataset.app;
            const iconId = icon.dataset.trayIcon;
            const tooltip = icon.title || icon.getAttribute('aria-label') || '';
            const badge = icon.querySelector('.tray-app-badge');
            const badgeText = badge ? badge.textContent : '';
            const iconHtml = icon.innerHTML;

            html += `
                <div class="overflow-item" data-app="${appId}" data-icon="${iconId}" title="${tooltip}">
                    ${iconHtml}
                    <span class="overflow-item-name">${tooltip || appId}</span>
                    ${badgeText ? `<span class="overflow-item-badge">${badgeText}</span>` : ''}
                </div>`;
        });

        // Also include system tray icons that might be hidden
        const systemIcons = Array.from(trayIcons.querySelectorAll('button')).filter(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && el.id !== 'tray-network' && el.id !== 'tray-overflow';
        });

        systemIcons.forEach(icon => {
            const tooltip = icon.title || icon.getAttribute('aria-label') || '';
            const iconHtml = icon.innerHTML;
            html += `
                <div class="overflow-item system" title="${tooltip}">
                    ${iconHtml}
                    <span class="overflow-item-name">${tooltip}</span>
                </div>`;
        });

        html += '</div>';
        flyout.innerHTML = html;

        // Position the flyout (visual rects -> zoomed body coordinates).
        const z = Scaling.getUiZoom() || 1;
        const anchorRect = anchorBtn.getBoundingClientRect();
        const taskbar = document.getElementById('taskbar');
        const taskbarRect = taskbar.getBoundingClientRect();
        const isTop = taskbarRect.top < window.innerHeight / 2;

        if (isTop) {
            flyout.style.top = `${(anchorRect.bottom + 4) / z}px`;
            flyout.style.bottom = 'auto';
        } else {
            flyout.style.bottom = `${(window.innerHeight - anchorRect.top + 4) / z}px`;
            flyout.style.top = 'auto';
        }
        flyout.style.right = `${(window.innerWidth - anchorRect.right) / z}px`;
        flyout.style.left = 'auto';

        // Click handlers for overflow items
        flyout.querySelectorAll('.overflow-item').forEach(item => {
            item.addEventListener('click', () => {
                const appId = item.dataset.app;
                const iconId = item.dataset.icon;
                if (appId && iconId) {
                    // Simulate click on the actual tray icon
                    const trayIcon = document.querySelector(`.tray-app-icon[data-app="${appId}"][data-tray-icon="${iconId}"]`);
                    if (trayIcon) trayIcon.click();
                }
                hideTrayOverflowFlyout();
            });
        });

        // Close on outside click
        const closeHandler = (e) => {
            if (!flyout.contains(e.target) && !anchorBtn.contains(e.target)) {
                hideTrayOverflowFlyout();
                document.removeEventListener('click', closeHandler);
            }
        };
        setTimeout(() => document.addEventListener('click', closeHandler), 0);

        trayOverflowFlyout = flyout;
        requestAnimationFrame(() => {
            flyout.classList.add('show');
        });
    }

    function hideTrayOverflowFlyout() {
        const closing = trayOverflowFlyout;
        if (closing) {
            closing.classList.remove('show');
            closing.classList.add('closing');
            trayOverflowFlyout = null;
            setTimeout(() => {
                if (closing.parentNode) closing.parentNode.removeChild(closing);
            }, 150);
        }
    }

    function getPinnedApps() {
        return pinEntries.filter(entry => entry.appId).map(entry => entry.appId);
    }

    // Foreground session changed: reload this profile's pins and running apps.
    function activate() {
        loadPinnedEntries();
        renderTaskbarButtons();
    }

    // Public method to refresh taskbar when grouping setting changes
    function refreshGrouping() {
        renderTaskbarButtons();
    }

    return { init, activate, openApp, addRunningApp, removeRunningApp, updateRunningState, setActiveApp, clearActiveApp, getPinnedApps, pinApp, unpinApp, pinEntry, unpinPath, isPinned, isEntryPinned, renderTaskbarButtons, refreshGrouping };
})();

export { Taskbar, AppRegistry, AppMetadata };
