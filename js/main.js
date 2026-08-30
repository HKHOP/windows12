import WindowManager from './modules/windowManager.js';
import { Taskbar, AppRegistry } from './modules/taskbar.js';
import StartMenu from './modules/startMenu.js';
import ContextMenu from './modules/contextMenu.js';
import FileSystem from './modules/fileSystem.js';
import UserActivity from './modules/userActivity.js';
import SystemConfig from './modules/systemConfig.js';
import Settings from './apps/settings.js';
import Notepad from './apps/notepad.js';
import FileExplorer from './apps/fileExplorer.js';

AppRegistry.register('settings', Settings);
AppRegistry.register('notepad', Notepad);
AppRegistry.register('fileExplorer', FileExplorer);

document.addEventListener('DOMContentLoaded', () => {
    FileSystem.init();
    UserActivity.init();
    SystemConfig.init();
    WindowManager.init();
    Taskbar.init();
    StartMenu.init();
    ContextMenu.init();

    WindowManager.setOnFocusChanged((appId) => {
        if (appId) {
            Taskbar.setActiveApp(appId);
        } else {
            Taskbar.clearActiveApp();
        }
    });

    WindowManager.setOnWindowCreated((appId, windowData) => {
        Taskbar.addRunningApp(appId, windowData);
    });

    WindowManager.setOnWindowClosed((appId, windowId) => {
        Taskbar.removeRunningApp(appId, windowId);
    });

    setupDesktopContextMenu();
    setupTaskbarContextMenu();
    setupTaskbarIconContextMenu();
    setupWindowTitleBarContextMenu();
});

function setupDesktopContextMenu() {
    const desktop = document.getElementById('desktop');
    desktop.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.app-window')) return;
        ContextMenu.show(e.clientX, e.clientY, [
            { label: 'View', icon: '👁', action: () => {} },
            { label: 'Sort by', icon: '↕', action: () => {} },
            { label: 'Refresh', icon: '🔄', action: () => location.reload() },
            'separator',
            { label: 'New', icon: '➕', action: () => {} },
            'separator',
            { label: 'Display settings', icon: '🖥', action: () => { Taskbar.openApp('settings'); } },
            { label: 'Personalize', icon: '🎨', action: () => { Taskbar.openApp('settings'); } },
            'separator',
            { label: 'Open in Terminal', icon: '⌨', disabled: true },
            { label: 'Show more options', icon: '', disabled: true }
        ]);
    });
}

function setupTaskbarContextMenu() {
    const taskbar = document.getElementById('taskbar');
    taskbar.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.app-btn')) return;
        e.preventDefault();
        ContextMenu.show(e.clientX, e.clientY, [
            { label: 'Task Manager', icon: '📊', disabled: true },
            'separator',
            { label: 'Taskbar settings', icon: '⚙', action: () => { Taskbar.openApp('settings'); } }
        ]);
    });
}

function setupTaskbarIconContextMenu() {
    const appBtns = document.querySelectorAll('.taskbar-btn.app-btn');
    appBtns.forEach(btn => {
        btn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const appId = btn.dataset.app;
            const appNames = { fileExplorer: 'File Explorer', settings: 'Settings', notepad: 'Notepad' };
            const isRunning = btn.classList.contains('running');
            const items = [
                { label: appNames[appId] || appId, icon: '', disabled: true },
                'separator'
            ];
            if (isRunning) {
                items.push({ label: 'Close window', icon: '✕', action: () => {
                    const wins = WindowManager.getWindowsByApp(appId);
                    if (wins.length > 0) WindowManager.closeWindow(wins[0].id);
                }});
            } else {
                items.push({ label: 'Open', icon: '🚀', action: () => { Taskbar.openApp(appId); }});
            }
            ContextMenu.show(e.clientX, e.clientY, items);
        });
    });
}

function setupWindowTitleBarContextMenu() {
    document.addEventListener('contextmenu', (e) => {
        const header = e.target.closest('.window-header');
        if (!header) return;
        if (e.target.closest('.window-controls')) return;
        e.preventDefault();
        const win = header.closest('.app-window');
        const winId = win.id;
        ContextMenu.show(e.clientX, e.clientY, [
            { label: 'Restore', icon: '↗', action: () => WindowManager.toggleMaximize(WindowManager._getWindow(winId)) },
            { label: 'Move', icon: '✋', disabled: true },
            { label: 'Size', icon: '↔', disabled: true },
            { label: 'Minimize', icon: '➖', action: () => { win.style.display = 'none'; Taskbar.updateRunningState(); } },
            { label: 'Maximize', icon: '⬜', action: () => WindowManager.toggleMaximize(WindowManager._getWindow(winId)) },
            'separator',
            { label: 'Close', icon: '✕', action: () => WindowManager.closeWindow(winId) }
        ]);
    });
}
