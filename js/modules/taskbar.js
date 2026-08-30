import WindowManager from './windowManager.js';

const Taskbar = (() => {
    let runningApps = new Map();
    let clockInterval;

    function init() {
        updateClock();
        clockInterval = setInterval(updateClock, 1000);
        setupStartButton();
        setupAppButtons();
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

    function setupAppButtons() {
        const appBtns = document.querySelectorAll('.taskbar-btn.app-btn');
        appBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const app = btn.dataset.app;
                if (app) openApp(app);
            });
        });
    }

    function openApp(appId) {
        const existing = WindowManager.getWindowsByApp(appId);
        if (existing.length > 0) {
            const win = existing[0];
            if (win.element.style.display === 'none') {
                win.element.style.display = 'flex';
                WindowManager.focusWindow(win.id);
            } else {
                WindowManager.toggleMaximize(win);
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
        updateRunningState();
    }

    function removeRunningApp(appId, windowId) {
        if (runningApps.has(appId)) {
            runningApps.get(appId).delete(windowId);
            if (runningApps.get(appId).size === 0) {
                runningApps.delete(appId);
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
            }
        });
    }

    return { init, openApp, addRunningApp, removeRunningApp, updateRunningState };
})();

const AppRegistry = (() => {
    const apps = {};

    function register(id, app) {
        apps[id] = app;
    }

    function get(id) {
        return apps[id];
    }

    return { register, get };
})();

export { Taskbar, AppRegistry };
