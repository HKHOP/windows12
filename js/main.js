import WindowManager from './modules/windowManager.js';
import { Taskbar, AppRegistry, AppMetadata } from './modules/taskbar.js';
import StartMenu from './modules/startMenu.js';
import ContextMenu from './modules/contextMenu.js';
import FileSystem from './modules/fileSystem.js';
import UserActivity from './modules/userActivity.js';
import SystemConfig from './modules/systemConfig.js';
import DesktopIcons from './modules/desktopIcons.js';
import Settings from './apps/settings.js';
import Notepad from './apps/notepad.js';
import FileExplorer from './apps/fileExplorer.js';
import TaskManager from './apps/taskManager.js';
import Photos from './apps/photos.js';
import Calendar from './apps/calendar.js';
import Calculator from './apps/calculator.js';
import Clock from './apps/clock.js';
import Paint from './apps/paint.js';

AppRegistry.register('settings', Settings);
AppRegistry.register('notepad', Notepad);
AppRegistry.register('fileExplorer', FileExplorer);
AppRegistry.register('taskManager', TaskManager);
AppRegistry.register('photos', Photos);
AppRegistry.register('calendar', Calendar);
AppRegistry.register('calculator', Calculator);
AppRegistry.register('clock', Clock);
AppRegistry.register('paint', Paint);

document.addEventListener('DOMContentLoaded', () => {
    FileSystem.init();
    UserActivity.init();
    SystemConfig.init();
    WindowManager.init();
    Taskbar.init();
    StartMenu.init();
    ContextMenu.init();
    DesktopIcons.init();

    window._modules = { ContextMenu };

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
    setupWindowTitleBarContextMenu();

    document.getElementById('desktop').addEventListener('click', (e) => {
        if (e.target === document.getElementById('desktop') || e.target === document.getElementById('windows-container')) {
            document.querySelectorAll('.desktop-icon').forEach(d => d.style.background = 'transparent');
        }
    });

    const desktop = document.getElementById('desktop');
    const taskbar = document.getElementById('taskbar');
    desktop.style.opacity = '0';
    taskbar.style.opacity = '0';

    setTimeout(() => {
        const bootScreen = document.getElementById('boot-screen');
        if (bootScreen) {
            bootScreen.classList.add('fade-out');
            setTimeout(() => {
                bootScreen.remove();
                const loginScreen = document.getElementById('login-screen');
                if (loginScreen) {
                    loginScreen.classList.remove('hidden');
                    const config = SystemConfig.getAll();
                    const username = config.userName || 'User';
                    document.getElementById('login-username').textContent = username;

                    setTimeout(() => {
                        loginScreen.classList.add('fade-out');
                        setTimeout(() => {
                            loginScreen.remove();
                            desktop.style.transition = 'opacity 0.5s ease-out';
                            taskbar.style.transition = 'opacity 0.5s ease-out';
                            desktop.style.opacity = '1';
                            taskbar.style.opacity = '1';
                        }, 600);
                    }, 2000);
                }
            }, 500);
        }
    }, 2000);
});

function setupDesktopContextMenu() {
    const desktop = document.getElementById('desktop');
    desktop.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.app-window') || e.target.closest('.desktop-icon')) return;
        e.preventDefault();
        ContextMenu.show(e.clientX, e.clientY, [
            { label: 'View', icon: '👁', disabled: true },
            { label: 'Sort by', icon: '↕', disabled: true },
            { label: 'Refresh', icon: '🔄', action: () => { DesktopIcons.render(); } },
            'separator',
            { label: 'New folder', icon: '📁', action: () => { DesktopIcons.createNewFolder(); } },
            { label: 'New text file', icon: '📄', action: () => { DesktopIcons.createNewFile(); } },
            'separator',
            { label: 'Display settings', icon: '🖥', action: () => { Taskbar.openApp('settings'); } },
            { label: 'Personalize', icon: '🎨', action: () => { Taskbar.openApp('settings'); } }
        ]);
    });
}

function setupTaskbarContextMenu() {
    const taskbar = document.getElementById('taskbar');
    taskbar.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.app-btn')) return;
        e.preventDefault();
        ContextMenu.show(e.clientX, e.clientY, [
            { label: 'Task Manager', icon: '📊', action: () => { Taskbar.openApp('taskManager'); } },
            'separator',
            { label: 'Taskbar settings', icon: '⚙', action: () => { Taskbar.openApp('settings'); } }
        ]);
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
