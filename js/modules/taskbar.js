import WindowManager from './windowManager.js';

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
    const metadata = {
        fileExplorer: {
            name: 'File Explorer',
            icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 7V17C3 18.1 3.9 19 5 19H19C20.1 19 21 18.1 21 17V9C21 7.9 20.1 7 19 7H11L9 5H5C3.9 5 3 5.9 3 7Z" fill="#FFC107"/><path d="M3 7H21V9H3V7Z" fill="#FFD54F"/></svg>`,
            iconSmall: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 7V17C3 18.1 3.9 19 5 19H19C20.1 19 21 18.1 21 17V9C21 7.9 20.1 7 19 7H11L9 5H5C3.9 5 3 5.9 3 7Z" fill="#FFC107"/><path d="M3 7H21V9H3V7Z" fill="#FFD54F"/></svg>`
        },
        settings: {
            name: 'Settings',
            icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
            iconSmall: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`
        },
        notepad: {
            name: 'Notepad',
            icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="4" y="2" width="16" height="20" rx="2" fill="#1E88E5"/><rect x="7" y="6" width="10" height="1.5" rx="0.5" fill="white"/><rect x="7" y="9.5" width="8" height="1.5" rx="0.5" fill="white"/><rect x="7" y="13" width="10" height="1.5" rx="0.5" fill="white"/><rect x="7" y="16.5" width="6" height="1.5" rx="0.5" fill="white"/></svg>`,
            iconSmall: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="4" y="2" width="16" height="20" rx="2" fill="#1E88E5"/><rect x="7" y="6" width="10" height="1.5" rx="0.5" fill="white"/><rect x="7" y="9.5" width="8" height="1.5" rx="0.5" fill="white"/><rect x="7" y="13" width="10" height="1.5" rx="0.5" fill="white"/></svg>`
        },
        calendar: {
            name: 'Calendar',
            icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" fill="#E53935"/><rect x="3" y="4" width="18" height="6" rx="2" fill="#B71C1C"/><rect x="7" y="2" width="2" height="4" rx="1" fill="#ccc"/><rect x="15" y="2" width="2" height="4" rx="1" fill="#ccc"/><text x="12" y="18" text-anchor="middle" fill="white" font-size="8" font-weight="bold" font-family="sans-serif">31</text></svg>`,
            iconSmall: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" fill="#E53935"/><rect x="3" y="4" width="18" height="6" rx="2" fill="#B71C1C"/><rect x="7" y="2" width="2" height="4" rx="1" fill="#ccc"/><rect x="15" y="2" width="2" height="4" rx="1" fill="#ccc"/></svg>`
        },
        taskManager: {
            name: 'Task Manager',
            icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1" fill="#0078D4"/><rect x="14" y="3" width="7" height="7" rx="1" fill="#0078D4"/><rect x="3" y="14" width="7" height="7" rx="1" fill="#0078D4"/><rect x="14" y="14" width="7" height="7" rx="1" fill="#0078D4"/></svg>`,
            iconSmall: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1" fill="#0078D4"/><rect x="14" y="3" width="7" height="7" rx="1" fill="#0078D4"/><rect x="3" y="14" width="7" height="7" rx="1" fill="#0078D4"/><rect x="14" y="14" width="7" height="7" rx="1" fill="#0078D4"/></svg>`
        },
        photos: {
            name: 'Photos',
            icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" fill="#43A047"/><circle cx="8.5" cy="8.5" r="2" fill="white"/><path d="M3 16l4-4 3 3 4-4 7 7v1c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2v-3z" fill="white"/></svg>`,
            iconSmall: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" fill="#43A047"/><circle cx="8.5" cy="8.5" r="2" fill="white"/><path d="M3 16l4-4 3 3 4-4 7 7v1c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2v-3z" fill="white"/></svg>`
        },
        calculator: {
            name: 'Calculator',
            icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="4" y="2" width="16" height="20" rx="2" fill="#0078D4"/><rect x="7" y="4" width="10" height="5" rx="1" fill="#B3E5FC"/><rect x="7" y="11" width="2.5" height="2.5" rx="0.5" fill="white"/><rect x="10.75" y="11" width="2.5" height="2.5" rx="0.5" fill="white"/><rect x="14.5" y="11" width="2.5" height="2.5" rx="0.5" fill="#FFB74D"/><rect x="7" y="14.75" width="2.5" height="2.5" rx="0.5" fill="white"/><rect x="10.75" y="14.75" width="2.5" height="2.5" rx="0.5" fill="white"/><rect x="14.5" y="14.75" width="2.5" height="2.5" rx="0.5" fill="#FFB74D"/><rect x="7" y="18.5" width="6.25" height="2.5" rx="0.5" fill="white"/><rect x="14.5" y="18.5" width="2.5" height="2.5" rx="0.5" fill="#FFB74D"/></svg>`,
            iconSmall: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="4" y="2" width="16" height="20" rx="2" fill="#0078D4"/><rect x="7" y="4" width="10" height="5" rx="1" fill="#B3E5FC"/></svg>`
        },
        clock: {
            name: 'Clock',
            icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
            iconSmall: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
        },
        paint: {
            name: 'Paint',
            icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" fill="#FF9800"/><circle cx="8" cy="8" r="2" fill="white"/><circle cx="16" cy="8" r="2" fill="#E53935"/><circle cx="12" cy="16" r="2" fill="#43A047"/><circle cx="8" cy="16" r="2" fill="#1E88E5"/></svg>`,
            iconSmall: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" fill="#FF9800"/><circle cx="8" cy="8" r="2" fill="white"/><circle cx="16" cy="8" r="2" fill="#E53935"/></svg>`
        },
        browser: {
            name: 'Browser',
            icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#2196F3" stroke-width="2"/><path d="M2 12h20" stroke="#2196F3" stroke-width="1.5"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="#2196F3" stroke-width="1.5"/></svg>`,
            iconSmall: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#2196F3" stroke-width="2"/><path d="M2 12h20" stroke="#2196F3" stroke-width="1.5"/></svg>`
        }
    };

    function get(id) {
        return metadata[id] || { name: id, icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="2" fill="#666"/></svg>`, iconSmall: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="2" fill="#666"/></svg>` };
    }

    function getAll() {
        return { ...metadata };
    }

    return { get, getAll };
})();

const Taskbar = (() => {
    let runningApps = new Map();
    let clockInterval;
    let pinnedApps = [];
    const STORAGE_KEY = 'win12_taskbar_pins';

    function init() {
        loadPinnedApps();
        updateClock();
        clockInterval = setInterval(updateClock, 1000);
        renderTaskbarButtons();
    }

    function loadPinnedApps() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                pinnedApps = JSON.parse(saved);
            } else {
                pinnedApps = ['fileExplorer', 'notepad', 'calendar', 'settings'];
            }
        } catch {
            pinnedApps = ['fileExplorer', 'notepad', 'calendar', 'settings'];
        }
    }

    function savePinnedApps() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(pinnedApps));
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
        btn.innerHTML = meta.iconSmall;
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
