import WindowManager from './modules/windowManager.js';
import { Taskbar, AppRegistry, AppMetadata } from './modules/taskbar.js';
import StartMenu from './modules/startMenu.js';
import ContextMenu from './modules/contextMenu.js';
import FileSystem from './modules/fileSystem.js';
import UserActivity from './modules/userActivity.js';
import SystemConfig from './modules/systemConfig.js';
import Scaling from './modules/scaling.js';
import Touch from './modules/touch.js';
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
import Browser from './apps/browser.js';
import Terminal from './apps/terminal.js';
import AppStore from './apps/appStore.js';
import AppSystem from './modules/appSystem.js';
import WindowsUpdate from './modules/windowsUpdate.js';
import Search from './modules/search.js';

AppRegistry.register('settings', Settings);
AppRegistry.register('notepad', Notepad);
AppRegistry.register('fileExplorer', FileExplorer);
AppRegistry.register('taskManager', TaskManager);
AppRegistry.register('photos', Photos);
AppRegistry.register('calendar', Calendar);
AppRegistry.register('calculator', Calculator);
AppRegistry.register('clock', Clock);
AppRegistry.register('paint', Paint);
AppRegistry.register('browser', Browser);
AppRegistry.register('terminal', Terminal);
AppRegistry.register('appStore', AppStore);

AppSystem.init();

document.addEventListener('DOMContentLoaded', () => {
    window.SystemConfig = SystemConfig;

    Scaling.init();
    const s = Scaling.getScale();
    WindowManager.setScale(s);

    FileSystem.init();
    UserActivity.init();
    SystemConfig.init();

    Scaling.apply();
    WindowManager.setScale(Scaling.getScale());

    Scaling.setOnScaleChange((newScale) => {
        WindowManager.setScale(newScale);
    });

    WindowManager.init();
    Taskbar.init();
    StartMenu.init();
    ContextMenu.init();
    DesktopIcons.init();
    Touch.init();
    WindowsUpdate.init();
    Search.init();

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

    WindowManager.setOnWindowMinimized(() => {
        Taskbar.updateRunningState();
    });

    setupDesktopContextMenu();
    setupTaskbarContextMenu();
    setupWindowTitleBarContextMenu();
    setupScreenshotCapture();

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

function setupScreenshotCapture() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'PrintScreen') {
            e.preventDefault();

            const flash = document.createElement('div');
            flash.style.cssText = 'position:fixed;inset:0;background:white;z-index:999999;opacity:0;transition:opacity 0.08s ease-out;pointer-events:none;';
            document.body.appendChild(flash);

            requestAnimationFrame(() => {
                flash.style.opacity = '0.9';
                setTimeout(() => {
                    flash.style.opacity = '0';
                    setTimeout(() => flash.remove(), 150);
                }, 100);
            });

            const now = new Date();
            const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const fileName = `Screenshot ${ts}.png`;

            const canvas = document.createElement('canvas');
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 24px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Screenshot Captured', canvas.width / 2, canvas.height / 2 - 20);

            ctx.font = '14px sans-serif';
            ctx.fillStyle = '#aaaaaa';
            ctx.fillText(now.toLocaleString(), canvas.width / 2, canvas.height / 2 + 15);

            const dataUrl = canvas.toDataURL('image/png');
            const picturesPath = ['/', 'users', 'default', 'Pictures'];
            FileSystem.createFile(picturesPath, fileName, dataUrl, 'png');

            const toast = document.createElement('div');
            toast.style.cssText = 'position:fixed;bottom:60px;right:20px;background:var(--window-bg);border:1px solid var(--window-border);border-radius:8px;padding:12px 20px;font-size:13px;color:var(--text-primary);box-shadow:0 4px 20px rgba(0,0,0,0.3);z-index:99999;display:flex;align-items:center;gap:10px;animation:windowOpen 0.2s ease-out;';
            toast.innerHTML = `<span style="font-size:18px;">📸</span><div><div style="font-weight:500;">Screenshot saved</div><div style="font-size:11px;color:var(--text-secondary);">Pictures/${fileName}</div></div>`;
            document.body.appendChild(toast);
            setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 2500);
        }
    });
}
