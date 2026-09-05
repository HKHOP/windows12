import WindowManager from './windowManager.js';
import FileSystem from './fileSystem.js';
import AppIcons from './appIcons.js';

const AppRegistry = (() => {
    const apps = {};

    function register(id, app) {
        apps[id] = app;
    }

    function get(id) {
        return apps[id];
    }

    function getAll() {
        return { ...apps };
    }

    return { register, get, getAll };
})();

const AppMetadata = (() => {
    const names = {
        fileExplorer: 'File Explorer',
        settings: 'Settings',
        notepad: 'Notepad',
        calendar: 'Calendar',
        taskManager: 'Task Manager',
        photos: 'Photos',
        calculator: 'Calculator',
        clock: 'Clock',
        paint: 'Paint',
        browser: 'Browser',
        appStore: 'Microsoft Store',
        terminal: 'Terminal',
        sampleApp: 'Sample App',
        vscode: 'Visual Studio Code',
        export: 'Ex/port'
    };

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

    return { get, getAll };
})();

const Taskbar = (() => {
    let runningApps = new Map();
    let clockInterval;
    let pinnedApps = [];
    const PINS_PATH = ['/', 'system', 'programs data', 'taskbar', 'pins.json'];

    function ensureDir(path) {
        for (let i = 1; i <= path.length - 1; i++) {
            const partial = path.slice(0, i);
            if (!FileSystem.itemExists(partial)) {
                const parent = path.slice(0, i - 1);
                FileSystem.createFolder(parent, path[i - 1]);
            }
        }
    }

    function readJson(path, fallback) {
        try {
            const raw = FileSystem.readFile(path);
            if (raw) return JSON.parse(raw);
        } catch {}
        return fallback;
    }

    function writeJson(path, data) {
        ensureDir(path);
        const name = path[path.length - 1];
        const parent = path.slice(0, -1);
        const json = JSON.stringify(data);
        if (FileSystem.itemExists(path)) {
            FileSystem.writeFile(path, json);
        } else {
            FileSystem.createFile(parent, name, json, 'json');
        }
    }

    function init() {
        loadPinnedApps();
        updateClock();
        clockInterval = setInterval(updateClock, 1000);
        renderTaskbarButtons();
    }

    function loadPinnedApps() {
        pinnedApps = readJson(PINS_PATH, ['fileExplorer', 'notepad', 'calendar', 'settings']);
    }

    function savePinnedApps() {
        writeJson(PINS_PATH, pinnedApps);
    }

    function isPinned(appId) {
        return pinnedApps.includes(appId);
    }

    function pinApp(appId) {
        if (!pinnedApps.includes(appId)) {
            pinnedApps.push(appId);
            savePinnedApps();
            renderTaskbarButtons();
        }
    }

    function unpinApp(appId) {
        pinnedApps = pinnedApps.filter(id => id !== appId);
        savePinnedApps();
        renderTaskbarButtons();
    }

    function renderTaskbarButtons() {
        const center = document.getElementById('taskbar-center');
        center.innerHTML = '';

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
        center.appendChild(searchBtn);

        const separator = document.createElement('div');
        separator.style.cssText = 'width:1px;height:24px;background:rgba(255,255,255,0.1);margin:0 4px;';
        center.appendChild(separator);

        pinnedApps.forEach(appId => {
            const meta = AppMetadata.get(appId);
            const btn = createAppButton(appId, meta);
            center.appendChild(btn);
        });

        const runningSeparator = document.createElement('div');
        runningSeparator.className = 'taskbar-running-separator';
        runningSeparator.style.cssText = 'width:1px;height:24px;background:rgba(255,255,255,0.1);margin:0 4px;display:none;';
        center.appendChild(runningSeparator);

        const nonPinnedRunning = [];
        runningApps.forEach((windows, appId) => {
            if (!pinnedApps.includes(appId) && appId !== 'search') {
                nonPinnedRunning.push(appId);
            }
        });

        if (nonPinnedRunning.length > 0) {
            runningSeparator.style.display = 'block';
            nonPinnedRunning.forEach(appId => {
                const meta = AppMetadata.get(appId);
                const btn = createAppButton(appId, meta);
                center.appendChild(btn);
            });
        }

        updateRunningState();
        setupAppButtonEvents();
    }

    function createAppButton(appId, meta) {
        const btn = document.createElement('button');
        btn.className = 'taskbar-btn app-btn';
        btn.dataset.app = appId;
        btn.title = meta.name;
        btn.innerHTML = meta.icon;
        return btn;
    }

    function setupAppButtonEvents() {
        document.querySelectorAll('.taskbar-btn.app-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const app = btn.dataset.app;
                if (app && app !== 'search') openApp(app);
            });

            btn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const appId = btn.dataset.app;
                if (appId === 'search') return;

                const meta = AppMetadata.get(appId);
                const isRunning = runningApps.has(appId);
                const pinned = isPinned(appId);

                const items = [
                    { label: meta.name, icon: '', disabled: true },
                    'separator'
                ];

                if (isRunning) {
                    items.push({ label: 'Close window', icon: '✕', action: () => {
                        const wins = WindowManager.getWindowsByApp(appId);
                        wins.forEach(w => WindowManager.closeWindow(w.id));
                    }});
                } else {
                    items.push({ label: 'Open', icon: '🚀', action: () => { openApp(appId); }});
                }

                items.push('separator');

                if (pinned) {
                    items.push({ label: 'Unpin from taskbar', icon: '📌', action: () => unpinApp(appId) });
                } else {
                    items.push({ label: 'Pin to taskbar', icon: '📍', action: () => pinApp(appId) });
                }

                const { ContextMenu } = window._modules || {};
                if (ContextMenu) {
                    ContextMenu.show(e.clientX, e.clientY, items);
                }
            });
        });
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
            startMenu.classList.toggle('hidden');
        });

        document.addEventListener('click', (e) => {
            if (!startMenu.contains(e.target) && !startBtn.contains(e.target)) {
                startMenu.classList.add('hidden');
            }
        });
    }

    function openApp(appId) {
        const existing = WindowManager.getWindowsByApp(appId);
        if (existing.length > 0) {
            const win = existing[0];
            if (win.element.style.display === 'none') {
                win.element.style.display = 'flex';
                WindowManager.focusWindow(win.id);
            } else if (win.element.classList.contains('focused')) {
                win.element.style.display = 'none';
            } else {
                WindowManager.focusWindow(win.id);
            }
        } else {
            launchApp(appId);
        }
        document.getElementById('start-menu').classList.add('hidden');
    }

    function launchApp(appId) {
        const app = AppRegistry.get(appId);
        if (app) {
            app.launch();
        }
    }

    function addRunningApp(appId, windowData) {
        if (!runningApps.has(appId)) {
            runningApps.set(appId, new Set());
        }
        runningApps.get(appId).add(windowData.id);

        const needsRender = !pinnedApps.includes(appId) && appId !== 'search';
        if (needsRender) {
            renderTaskbarButtons();
        } else {
            updateRunningState();
        }
    }

    function removeRunningApp(appId, windowId) {
        if (runningApps.has(appId)) {
            runningApps.get(appId).delete(windowId);
            if (runningApps.get(appId).size === 0) {
                runningApps.delete(appId);
                const wasPinned = pinnedApps.includes(appId);
                if (!wasPinned && appId !== 'search') {
                    renderTaskbarButtons();
                    return;
                }
            }
        }
        updateRunningState();
    }

    function updateRunningState() {
        const btns = document.querySelectorAll('.taskbar-btn.app-btn');
        btns.forEach(btn => {
            const app = btn.dataset.app;
            if (runningApps.has(app)) {
                btn.classList.add('running');
            } else {
                btn.classList.remove('running');
                btn.classList.remove('active');
            }
        });
    }

    function setActiveApp(appId) {
        const btns = document.querySelectorAll('.taskbar-btn.app-btn');
        btns.forEach(btn => {
            if (btn.dataset.app === appId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    function clearActiveApp() {
        const btns = document.querySelectorAll('.taskbar-btn.app-btn');
        btns.forEach(btn => btn.classList.remove('active'));
    }

    function getPinnedApps() {
        return [...pinnedApps];
    }

    return { init, openApp, addRunningApp, removeRunningApp, updateRunningState, setActiveApp, clearActiveApp, getPinnedApps, pinApp, unpinApp, isPinned, renderTaskbarButtons };
})();

export { Taskbar, AppRegistry, AppMetadata };
