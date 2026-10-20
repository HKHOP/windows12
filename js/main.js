import WindowManager from './modules/windowManager.js';
import UIIcons from './modules/uiIcons.js';
import { Taskbar } from './modules/taskbar.js';
import StartMenu from './modules/startMenu.js';
import ContextMenu from './modules/contextMenu.js';
import FileSystem from './modules/fileSystem.js';
import Packages from './modules/packages.js';
import UserActivity from './modules/userActivity.js';
import SystemConfig from './modules/systemConfig.js';
import Scaling from './modules/scaling.js';
import Touch from './modules/touch.js';
import DesktopIcons from './modules/desktopIcons.js';
import AppSystem from './modules/appSystem.js';
import WindowsUpdate from './modules/windowsUpdate.js';
import Search from './modules/search.js';
import Notifications from './modules/notifications.js';
import Cursor from './modules/cursor.js';
import BackgroundApps from './modules/backgroundApps.js';
import ClipboardManager from './modules/clipboardManager.js';
import VirtualDesktops from './modules/virtualDesktops.js';
import CrashMonitor from './modules/crashMonitor.js';
import Keyboard from './modules/keyboard.js';
import VirtualKeyboard from './modules/virtualKeyboard.js';
import Users from './modules/users.js';
import FSGuard from './modules/fsGuard.js';
import UAC from './modules/uac.js';
import LoginScreen from './modules/loginScreen.js';
import IframeViewportFix from './modules/iframeViewportFix.js';
import Sessions from './modules/sessions.js';
import LockScreen from './modules/lockScreen.js';
import WindowState from './modules/windowState.js';
import NetworkStatus from './modules/networkStatus.js';
import Tray from './modules/tray.js';
import Shortcuts from './modules/shortcuts.js';
import Sounds from './modules/sounds.js';
import CoreStore from './modules/coreStore.js';

// Filesystem access policy: app code may always touch its own AppData,
// anything else requires the 'filesystem' permission (see fsGuard.js).
// Must be wired before any app can run; shell code stays unguarded.
// window._FSGuard is the escape hatch every OS module's asShell() uses to
// shield its writes from app attribution — without it all per-user OS
// saves (config, pins, activity, ...) are denied while an app is focused.
window._FSGuard = FSGuard;
window._Users = Users;
window._UAC = UAC;
window._FileSystem = FileSystem;
window._Sessions = Sessions;
window._Shortcuts = Shortcuts;
// Scaling owns the shell's zoom factor; SystemConfig nudges it when the
// machine-wide display scaling changes.
window._Scaling = Scaling;
// Small shell API for apps that must trigger a session transition (e.g.
// Settings > Accounts > Sign out) without importing the shell modules.
window._Shell = {
    signIn: (id) => Sessions.signIn(id),
    activate: (id) => Sessions.activate(id),
    signOut: (id) => Sessions.signOut(id || Sessions.getActive()),
    activeUser: () => Sessions.getActive(),
    signedIn: () => Sessions.list(),
    lock: () => LockScreen.lock(),
    sleep: () => LockScreen.sleep(),
    restart: () => LockScreen.restart(),
    shutdown: () => LockScreen.shutdown(),
    switchUser: () => LockScreen.switchUser(),
    logout: () => LockScreen.logout()
};
FileSystem.setAccessChecker(FSGuard.check);
// Write policy: reads keep the access checker; mutations additionally need
// elevation for protected zones such as /Program Files (see fsGuard.js).
FileSystem.setWriteChecker(FSGuard.checkWrite);

// The shell is started by the bootstrap in index.html, which loads this
// module from the service worker (the OS core lives in OPFS). DOMContentLoaded
// has already fired by then, so the boot sequence is an explicit entry point
// rather than an event listener.
export async function boot() {
    window.SystemConfig = SystemConfig;

    // Device connectivity: paints the tray Wi-Fi indicator and gives online
    // features a shared, clean "you're offline" surface. Runs before the
    // shell so the icon is correct from the first paint.
    NetworkStatus.init();

    // Phase 1 — the MACHINE, not a user: filesystem + account store only.
    // The login screen can therefore show the picker immediately; nothing
    // per-user is preloaded. The CHOSEN profile boots in phase 2, after
    // sign-in (see bootShell / activateSession below), the way Windows loads
    // a profile only once you pick it.
    await FileSystem.init();
    Users.loadAccounts();

    // Mirror the installed OS core (OPFS) into \Windows so the operating
    // system's own files are visible in File Explorer — read-only. This is
    // machine-level work: it happens before anyone signs in.
    try { await CoreStore.init(); } catch (e) { /* the mirror is optional */ }

    // Device display settings (resolution and scaling) are global:
    // read them before the shell exists so the boot / login / lock screens
    // already render at the device's configuration.
    SystemConfig.initGlobal();
    Scaling.init();
    WindowManager.setScale(Scaling.getScale());

    // Concurrent sessions: main owns the shell, so it injects the hooks that
    // Sessions calls to build the shell once and re-point it per profile.
    Sessions.setHooks({ onBoot: bootShell, onActivate: activateSession, onClose: closeSession });

    const desktop = document.getElementById('desktop');
    const taskbar = document.getElementById('taskbar');
    const wallpaper = document.getElementById('wallpaper');
    if (desktop) desktop.style.opacity = '0';
    if (taskbar) taskbar.style.opacity = '0';
    if (wallpaper) wallpaper.style.opacity = '0';

    // Boot animation → user picker → sign-in → profile load → desktop.
    LoginScreen.bootSequence({ onSignIn: (id) => Sessions.signIn(id) });
}

// One-time shell construction for the FIRST profile to sign in: everything
// that builds DOM or global wiring (windows, taskbar, start menu, ...) plus
// the package/app catalog. Later profiles reuse this shell and only run the
// per-user activate() hooks.
let shellReady = false;
async function bootShell() {
    if (shellReady) return;
    shellReady = true;

    Scaling.apply();
    WindowManager.setScale(Scaling.getScale());
    Scaling.setOnScaleChange((newScale) => {
        WindowManager.setScale(newScale);
    });

    // iPhone/iPad Safari iframe letterboxing fix — must be live before the
    // first window with an iframe is created; no-op on other engines.
    IframeViewportFix.init();

    // Concurrent sessions: every window is tagged with the session that
    // created it, and only the foreground session's windows are visible.
    WindowManager.setUserProvider({ getActiveId: () => Sessions.getActive() });

    // Package store + app catalog: machine-wide, run once.
    await Packages.init();
    await AppSystem.init();

    WindowManager.init();
    Taskbar.init();
    Tray.init();
    StartMenu.init();
    ContextMenu.init();
    DesktopIcons.init();
    Shortcuts.init();
    Touch.init();
    WindowsUpdate.init();
    Search.init();
    Notifications.init();
    ClipboardManager.init();
    VirtualDesktops.init();
    CrashMonitor.init();
    VirtualKeyboard.init();
    LockScreen.init();

    // ShellIcons: the system icon library (our shell32.dll) — every app can
    // use these via `import UIIcons from '../modules/uiIcons.js'` or the
    // global `window.ShellIcons` (same object).
    window.ShellIcons = UIIcons;
    window.UIIcons = UIIcons;
    window._modules = { ContextMenu, Cursor, UIIcons, ShellIcons: UIIcons, VirtualDesktops, CrashMonitor, VirtualKeyboard, Sessions, LockScreen };

    WindowManager.setOnFocusChanged((appId) => {
        if (appId) {
            Taskbar.setActiveApp(appId);
            FSGuard.setActiveApp(appId);
        } else {
            Taskbar.clearActiveApp();
            // Desktop has the focus: shell context, no app attribution.
            FSGuard.setActiveApp(null);
        }
    });

    WindowManager.setOnWindowCreated((appId, windowData) => {
        Taskbar.addRunningApp(appId, windowData);
        FSGuard.setActiveApp(appId);
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
    setupSystemShortcuts();

    // Empty-desktop click clearing is handled by DesktopIcons (it owns the
    // multi-selection set and the marquee suppress flag).

    // Background apps/services: wiring here, per-profile revive in
    // activateSession (concurrent sessions each keep their own headless apps).
    try { await BackgroundApps.init(); } catch (e) { /* never block sign-in */ }
}

// A profile became the foreground session: swap every per-user module onto
// its data and re-apply visibility / wallpaper / taskbar. Runs for the first
// sign-in too (after bootShell built the shell).
async function activateSession(userId) {
    if (!shellReady) await bootShell();
    WindowState.activate(userId);
    SystemConfig.activate();
    Packages.activate();
    UserActivity.activate();
    Notifications.activate();
    StartMenu.activate();
    DesktopIcons.activate();
    Shortcuts.activate();
    Taskbar.activate();
    VirtualDesktops.activate(userId);
    try { await BackgroundApps.activate(userId); } catch (e) { /* keep the session usable */ }
    Tray.activate(userId);
    WindowManager.applyVisibility();
    Sounds.login();
}

// A session is ending (sign out): close its windows and stop its headless
// apps, leaving the other sessions untouched.
async function closeSession(userId) {
    Sounds.logout();
    try { WindowManager.closeWindowsForUser(userId); } catch (e) { /* noop */ }
    try { await BackgroundApps.stopUser(userId); } catch (e) { /* noop */ }
    try { Tray.closeUser(userId); } catch (e) { /* noop */ }
}

// The service worker is registered by the bootstrap in index.html, before
// this module is ever loaded: it has to install the OS core into OPFS first.
// Nothing to do here.

function setupDesktopContextMenu() {
    const desktop = document.getElementById('desktop');
    desktop.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.app-window') || e.target.closest('.desktop-icon')) return;
        e.preventDefault();
        ContextMenu.show(e.clientX, e.clientY, [
            { label: 'View', icon: UIIcons.action('view'), disabled: true },
            { label: 'Sort by', icon: UIIcons.action('sort'), disabled: true },
            { label: 'Refresh', icon: UIIcons.action('refresh'), action: () => { DesktopIcons.render(); } },
            'separator',
            { label: 'New folder', icon: UIIcons.action('newFolder'), action: () => { DesktopIcons.createNewFolder(); } },
            { label: 'New text file', icon: UIIcons.action('newFile'), action: () => { DesktopIcons.createNewFile(); } },
            { label: 'New shortcut', icon: UIIcons.action('shortcut'), action: () => { Shortcuts.wizard(Users.home(['Desktop'])); } },
            'separator',
            { label: 'Display settings', icon: UIIcons.action('display'), action: () => { Taskbar.openApp('settings', { page: 'system', subPage: 'display' }); } },
            { label: 'Personalize', icon: UIIcons.action('personalize'), action: () => { Taskbar.openApp('settings', { page: 'personalization' }); } }
        ]);
    });
}

function setupTaskbarContextMenu() {
    const taskbar = document.getElementById('taskbar');
    taskbar.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.app-btn')) return;
        e.preventDefault();
        ContextMenu.show(e.clientX, e.clientY, [
            { label: 'Task Manager', icon: UIIcons.action('taskManager'), action: () => { Taskbar.openApp('taskManager'); } },
            'separator',
            { label: 'Taskbar settings', icon: UIIcons.action('taskbarSettings'), action: () => { Taskbar.openApp('settings', { page: 'personalization' }); } }
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
            { label: 'Restore', icon: UIIcons.action('restore'), action: () => WindowManager.toggleMaximize(WindowManager._getWindow(winId)) },
            { label: 'Move', icon: UIIcons.action('move'), disabled: true },
            { label: 'Size', icon: UIIcons.action('size'), disabled: true },
            { label: 'Minimize', icon: UIIcons.action('minimize'), action: () => { WindowManager.setMinimized(winId, true); Taskbar.updateRunningState(); } },
            { label: 'Maximize', icon: UIIcons.action('maximize'), action: () => WindowManager.toggleMaximize(WindowManager._getWindow(winId)) },
            'separator',
            { label: 'Close', icon: UIIcons.action('close'), action: () => WindowManager.closeWindow(winId) }
        ]);
    });
}

function setupSystemShortcuts() {
    // Alt+F4 closes the focused window (through close handlers, so apps
    // can veto on unsaved changes). Note: real desktop browsers reserve
    // Alt+F4 for themselves and may never deliver it — harmless then.
    Keyboard.register('ALT+F4', () => {
        const focused = document.querySelector('.app-window.focused');
        if (!focused) return false;
        WindowManager.requestClose(focused.id);
    }, { system: true, description: 'Close focused window' });
}

function setupScreenshotCapture() {
    Keyboard.register('PRINTSCREEN', (e) => {
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
            const picturesPath = Users.home(['Pictures']);
            // Screenshots can exceed the localStorage budget — store raw
            // bytes in the blob store, falling back to inline on failure.
            canvas.toBlob(async (blob) => {
                let saved = false;
                if (blob) {
                    try { saved = await FileSystem.writeFileBlob(picturesPath, fileName, blob, 'png'); } catch (e) { saved = false; }
                }
                if (!saved) {
                    saved = FileSystem.createFile(picturesPath, fileName, dataUrl, 'png');
                    FileSystem.flush();
                }
                showScreenshotToast(fileName, saved);
            }, 'image/png');
    }, { system: true, description: 'Take screenshot' });
}

function showScreenshotToast(fileName, saved) {
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:60px;right:20px;background:var(--window-bg);border:1px solid var(--window-border);border-radius:8px;padding:12px 20px;font-size:13px;color:var(--text-primary);box-shadow:0 4px 20px rgba(0,0,0,0.3);z-index:99999;display:flex;align-items:center;gap:10px;animation:windowOpen 0.2s ease-out;';
    toast.innerHTML = `<span style="width:20px;height:20px;display:inline-flex;flex-shrink:0;">${UIIcons.action('camera', 20)}</span><div><div style="font-weight:500;">${saved ? 'Screenshot saved' : 'Screenshot failed (disk full)'}</div><div style="font-size:11px;color:var(--text-secondary);">Pictures/${fileName}</div></div>`;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 2500);
}
