import WindowManager from './windowManager.js';
import { Taskbar, AppRegistry, AppMetadata } from './taskbar.js';
import UserActivity from './userActivity.js';
import FileSystem from './fileSystem.js';
import SystemConfig from '../modules/systemConfig.js';
import AppSystem from './appSystem.js';

const StartMenu = (() => {
    let pinnedApps = [];
    const PINS_PATH = ['/', 'system', 'programs data', 'startmenu', 'pins.json'];

    const defaultPinned = [
        { id: 'fileExplorer', name: 'File Explorer' },
        { id: 'settings', name: 'Settings' },
        { id: 'notepad', name: 'Notepad' },
        { id: 'calendar', name: 'Calendar' },
        { id: 'taskManager', name: 'Task Manager' },
        { id: 'photos', name: 'Photos' }
    ];

    const allApps = [
        { id: 'appStore', name: 'Microsoft Store' },
        { id: 'browser', name: 'Browser' },
        { id: 'calculator', name: 'Calculator' },
        { id: 'calendar', name: 'Calendar' },
        { id: 'clock', name: 'Clock' },
        { id: 'export', name: 'Ex/port' },
        { id: 'fileExplorer', name: 'File Explorer' },
        { id: 'notepad', name: 'Notepad' },
        { id: 'paint', name: 'Paint' },
        { id: 'photos', name: 'Photos' },
        { id: 'sampleApp', name: 'Sample App' },
        { id: 'settings', name: 'Settings' },
        { id: 'taskManager', name: 'Task Manager' },
        { id: 'terminal', name: 'Terminal' },
        { id: 'vscode', name: 'Visual Studio Code' }
    ];

    let currentView = 'main';
    let sections = [];
    let powerMenuOpen = false;

    function init() {
        loadPinnedApps();
        const menu = document.getElementById('start-menu');
        sections = menu.querySelectorAll('.start-menu-section');
        renderPinnedApps();
        renderRecommended();
        setupSearch();
        setupAllAppsButton();
        setupPowerButton();
        updateUserInfo();

        window.addEventListener('apps-changed', () => {
            renderPinnedApps();
            if (currentView === 'allApps') {
                showAllApps();
            }
        });
    }

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

    function loadPinnedApps() {
        pinnedApps = readJson(PINS_PATH, defaultPinned.map(a => a.id));
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
            renderPinnedApps();
        }
    }

    function unpinApp(appId) {
        pinnedApps = pinnedApps.filter(id => id !== appId);
        savePinnedApps();
        renderPinnedApps();
    }

    function updateUserInfo() {
        const config = SystemConfig.getAll();
        const username = config.userName || 'User';
        const avatar = document.querySelector('.user-avatar');
        const nameEl = document.querySelector('.user-info span');
        if (avatar) avatar.textContent = username.charAt(0).toUpperCase();
        if (nameEl) nameEl.textContent = username;
    }

    function setupPowerButton() {
        const powerBtn = document.getElementById('power-btn');
        if (powerBtn) {
            powerBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                togglePowerMenu();
            });
        }
    }

    function togglePowerMenu() {
        let menu = document.getElementById('power-options-menu');
        if (menu) {
            menu.remove();
            powerMenuOpen = false;
            return;
        }

        menu = document.createElement('div');
        menu.id = 'power-options-menu';
        menu.style.cssText = `
            position:absolute;bottom:50px;left:0;right:0;margin:0 16px 8px;
            background:var(--start-menu-bg);border:1px solid var(--window-border);
            border-radius:8px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.3);
            animation:powerMenuSlideUp 0.15s ease-out;
        `;

        const options = [
            { label: 'Switch user', icon: '👤', action: () => switchUser() },
            { label: 'Logout', icon: '🚪', action: () => logout() },
            { label: 'Restart', icon: '🔄', action: () => restart() },
            { label: 'Shutdown', icon: '⏻', action: () => shutdown() }
        ];

        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.style.cssText = `
                display:flex;align-items:center;gap:10px;width:100%;padding:10px 14px;
                border:none;background:transparent;color:var(--text-primary);
                cursor:pointer;font-size:13px;text-align:left;transition:background 0.12s;
            `;
            btn.innerHTML = `<span style="font-size:14px;width:20px;text-align:center;">${opt.icon}</span>${opt.label}`;
            btn.addEventListener('mouseenter', () => btn.style.background = 'var(--hover-bg)');
            btn.addEventListener('mouseleave', () => btn.style.background = 'transparent');
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                menu.remove();
                powerMenuOpen = false;
                opt.action();
            });
            menu.appendChild(btn);
        });

        const powerBtn = document.getElementById('power-btn');
        powerBtn.parentNode.style.position = 'relative';
        powerBtn.parentNode.appendChild(menu);
        powerMenuOpen = true;
    }

    function shutdown() {
        document.getElementById('start-menu').classList.add('hidden');
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;z-index:99999;opacity:0;transition:opacity 0.5s;display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML = '<div style="color:white;font-size:14px;">Shutting down...</div>';
        document.body.appendChild(overlay);
        setTimeout(() => { overlay.style.opacity = '1'; }, 10);
        setTimeout(() => { window.close(); }, 1500);
    }

    function restart() {
        document.getElementById('start-menu').classList.add('hidden');
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;z-index:99999;opacity:0;transition:opacity 0.5s;display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML = '<div style="color:white;font-size:14px;">Restarting...</div>';
        document.body.appendChild(overlay);
        setTimeout(() => { overlay.style.opacity = '1'; }, 10);
        setTimeout(() => { location.reload(); }, 1500);
    }

    function logout() {
        document.getElementById('start-menu').classList.add('hidden');
        showLoginScreen(false);
    }

    function switchUser() {
        document.getElementById('start-menu').classList.add('hidden');
        showLoginScreen(false);
    }

    function showLoginScreen(autoLogin) {
        const desktop = document.getElementById('desktop');
        const taskbar = document.getElementById('taskbar');

        let loginScreen = document.getElementById('login-screen');
        if (!loginScreen) {
            loginScreen = document.createElement('div');
            loginScreen.id = 'login-screen';
            loginScreen.innerHTML = `
                <div class="login-content">
                    <div class="login-avatar">U</div>
                    <div class="login-username" id="login-username">User</div>
                    ${autoLogin ? `
                        <div class="login-welcome">
                            <span>Welcome</span>
                            <div class="login-spinner"></div>
                        </div>
                    ` : `
                        <button class="login-signin-btn" style="
                            margin-top:16px;padding:8px 32px;border:1px solid rgba(255,255,255,0.3);
                            background:rgba(255,255,255,0.1);color:white;border-radius:4px;
                            cursor:pointer;font-size:14px;transition:background 0.12s;
                        ">Sign in</button>
                    `}
                </div>
            `;
            document.body.appendChild(loginScreen);
        }

        loginScreen.classList.remove('hidden');
        loginScreen.style.opacity = '0';

        const config = SystemConfig.getAll();
        const username = config.userName || 'User';
        document.getElementById('login-username').textContent = username;

        desktop.style.transition = 'opacity 0.4s ease-out';
        taskbar.style.transition = 'opacity 0.4s ease-out';
        desktop.style.opacity = '0';
        taskbar.style.opacity = '0';

        setTimeout(() => { loginScreen.style.opacity = '1'; }, 50);

        if (autoLogin) {
            setTimeout(() => {
                loginScreen.classList.add('fade-out');
                setTimeout(() => {
                    loginScreen.remove();
                    desktop.style.opacity = '1';
                    taskbar.style.opacity = '1';
                }, 600);
            }, 2000);
        } else {
            const signinBtn = loginScreen.querySelector('.login-signin-btn');
            if (signinBtn) {
                signinBtn.addEventListener('click', () => {
                    const spinner = document.createElement('div');
                    spinner.className = 'login-welcome';
                    spinner.innerHTML = '<span>Welcome</span><div class="login-spinner"></div>';
                    signinBtn.replaceWith(spinner);

                    setTimeout(() => {
                        loginScreen.classList.add('fade-out');
                        setTimeout(() => {
                            loginScreen.remove();
                            desktop.style.opacity = '1';
                            taskbar.style.opacity = '1';
                        }, 600);
                    }, 1500);
                });
            }
        }
    }

    function setupAllAppsButton() {
        const btn = document.querySelector('.start-menu-all-btn');
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                showAllApps();
            });
        }
    }

    function showAllApps() {
        currentView = 'allApps';
        sections[0].style.display = 'none';
        sections[1].style.display = 'none';

        let drawer = document.getElementById('all-apps-drawer');
        if (!drawer) {
            drawer = document.createElement('div');
            drawer.id = 'all-apps-drawer';
            drawer.style.cssText = 'max-height:420px;overflow-y:auto;padding:0 16px;animation:slideInRight 0.2s ease-out;';
            sections[0].parentNode.insertBefore(drawer, sections[0]);
        }
        drawer.innerHTML = '';
        drawer.style.display = 'block';

        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;gap:12px;padding:8px 0 12px;border-bottom:1px solid var(--window-border);margin-bottom:8px;position:sticky;top:0;background:var(--start-menu-bg);z-index:1;';

        const backBtn = document.createElement('button');
        backBtn.style.cssText = 'background:none;border:none;color:var(--text-primary);cursor:pointer;font-size:16px;padding:4px 8px;border-radius:4px;display:flex;align-items:center;';
        backBtn.innerHTML = '&#9664;';
        backBtn.addEventListener('mouseenter', () => backBtn.style.background = 'var(--hover-bg)');
        backBtn.addEventListener('mouseleave', () => backBtn.style.background = 'none');
        backBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showMainView();
        });

        const title = document.createElement('span');
        title.style.cssText = 'font-size:14px;font-weight:600;';
        title.textContent = 'All apps';

        header.appendChild(backBtn);
        header.appendChild(title);
        drawer.appendChild(header);

        const installed = AppSystem.getInstalledApps();
        const userApps = ['sampleApp', 'vscode', 'export'];
        const filteredApps = allApps.filter(app => {
            if (userApps.includes(app.id)) return installed.includes(app.id);
            return true;
        });

        const letters = {};
        filteredApps.forEach(app => {
            const letter = app.name[0].toUpperCase();
            if (!letters[letter]) letters[letter] = [];
            letters[letter].push(app);
        });

        Object.keys(letters).sort().forEach(letter => {
            const letterEl = document.createElement('div');
            letterEl.style.cssText = 'font-size:13px;font-weight:600;color:var(--accent-color);padding:8px 4px 4px;';
            letterEl.textContent = letter;
            drawer.appendChild(letterEl);

            letters[letter].forEach(app => {
                const meta = AppMetadata.get(app.id);
                const el = document.createElement('div');
                el.className = 'app-item';
                el.style.cssText = 'display:flex;align-items:center;gap:12px;padding:8px;border-radius:6px;cursor:pointer;transition:background 0.12s;';
                el.innerHTML = `
                    <div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;">${meta.icon.replace('<svg', '<svg style="width:20px;height:20px"')}</div>
                    <span style="font-size:13px;">${app.name}</span>
                `;
                el.addEventListener('mouseenter', () => el.style.background = 'var(--hover-bg)');
                el.addEventListener('mouseleave', () => el.style.background = 'transparent');
                el.addEventListener('click', () => {
                    document.getElementById('start-menu').classList.add('hidden');
                    UserActivity.trackAppOpen(app.id);
                    launchApp(app.id);
                    renderRecommended();
                    showMainView();
                });

                el.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const pinned = isPinned(app.id);
                    const taskbarPinned = Taskbar.isPinned(app.id);
                    const userAppList = ['sampleApp', 'vscode', 'export'];
                    const isUserApp = userAppList.includes(app.id);
                    const items = [
                        { label: app.name, icon: '', disabled: true },
                        'separator',
                        pinned
                            ? { label: 'Unpin from Start', icon: '📌', action: () => { unpinApp(app.id); showAllApps(); } }
                            : { label: 'Pin to Start', icon: '📍', action: () => { pinApp(app.id); showAllApps(); } },
                        taskbarPinned
                            ? { label: 'Unpin from taskbar', icon: '📌', action: () => Taskbar.unpinApp(app.id) }
                            : { label: 'Pin to taskbar', icon: '📍', action: () => Taskbar.pinApp(app.id) },
                        ...(isUserApp ? [
                            'separator',
                            { label: 'Uninstall', icon: '🗑️', action: () => { AppSystem.uninstallApp(app.id); showAllApps(); } }
                        ] : [])
                    ];
                    if (window._modules && window._modules.ContextMenu) {
                        window._modules.ContextMenu.show(e.clientX, e.clientY, items);
                    }
                });

                drawer.appendChild(el);
            });
        });
    }

    function showMainView() {
        currentView = 'main';

        const drawer = document.getElementById('all-apps-drawer');
        if (drawer) drawer.style.display = 'none';

        sections[0].style.display = '';
        sections[1].style.display = '';
        sections[0].style.animation = 'slideInLeft 0.2s ease-out';
        sections[1].style.animation = 'slideInLeft 0.2s ease-out';

        setTimeout(() => {
            sections[0].style.animation = '';
            sections[1].style.animation = '';
        }, 200);
    }

    function renderPinnedApps() {
        const container = document.getElementById('pinned-apps');
        if (!container) return;
        container.innerHTML = '';
        const installed = AppSystem.getInstalledApps();
        const userApps = ['sampleApp', 'vscode', 'export'];

        const activePinned = pinnedApps.filter(appId => {
            if (userApps.includes(appId)) return installed.includes(appId);
            return true;
        });

        activePinned.forEach(appId => {
            const meta = AppMetadata.get(appId);
            const el = document.createElement('div');
            el.className = 'app-item';
            el.innerHTML = `
                <div class="app-icon">${meta.icon}</div>
                <span class="app-name">${meta.name}</span>
            `;
            el.addEventListener('click', () => {
                document.getElementById('start-menu').classList.add('hidden');
                UserActivity.trackAppOpen(appId);
                launchApp(appId);
                renderRecommended();
            });

            el.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const isUserApp = userApps.includes(appId);
                const taskbarPinned = Taskbar.isPinned(appId);
                const items = [
                    { label: meta.name, icon: '', disabled: true },
                    'separator',
                    { label: 'Unpin from Start', icon: '📌', action: () => unpinApp(appId) },
                    taskbarPinned
                        ? { label: 'Unpin from taskbar', icon: '📌', action: () => Taskbar.unpinApp(appId) }
                        : { label: 'Pin to taskbar', icon: '📍', action: () => Taskbar.pinApp(appId) },
                    { label: 'Open', icon: '🚀', action: () => {
                        document.getElementById('start-menu').classList.add('hidden');
                        launchApp(appId);
                    }},
                    ...(isUserApp ? [
                        'separator',
                        { label: 'Uninstall', icon: '🗑️', action: () => AppSystem.uninstallApp(appId) }
                    ] : [])
                ];
                if (window._modules && window._modules.ContextMenu) {
                    window._modules.ContextMenu.show(e.clientX, e.clientY, items);
                }
            });

            container.appendChild(el);
        });
    }

    function launchApp(appId) {
        const existing = WindowManager.getWindowsByApp(appId);
        if (existing.length > 0) {
            const win = existing[0];
            if (win.element.style.display === 'none') {
                win.element.style.display = 'flex';
                WindowManager.focusWindow(win.id);
            } else {
                WindowManager.focusWindow(win.id);
            }
        } else {
            const appModule = AppRegistry.get(appId);
            if (appModule) appModule.launch();
        }
    }

    function renderRecommended() {
        const container = document.getElementById('recommended-apps');
        if (!container) return;
        container.innerHTML = '';

        const items = UserActivity.getRecommended();

        if (items.length === 0) {
            container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:13px;">No recent activity</div>';
            return;
        }

        items.forEach(item => {
            const el = document.createElement('div');
            el.className = 'list-item';

            let icon, name, detail;
            if (item.type === 'file') {
                icon = UserActivity.getFileIcon(item.name);
                name = item.name;
                detail = item.detail;
                el.addEventListener('click', () => {
                    document.getElementById('start-menu').classList.add('hidden');
                    UserActivity.trackFileOpen(item.path.split('/').filter(p => p), item.name);
                    openFile(item.path);
                    renderRecommended();
                });
            } else {
                icon = UserActivity.getAppIcon(item.id);
                name = item.name;
                detail = item.detail;
                el.addEventListener('click', () => {
                    document.getElementById('start-menu').classList.add('hidden');
                    UserActivity.trackAppOpen(item.id);
                    launchApp(item.id);
                    renderRecommended();
                });
            }

            el.innerHTML = `
                <div class="item-icon" style="font-size:24px;display:flex;align-items:center;justify-content:center;">${icon}</div>
                <div class="item-info">
                    <span class="item-name">${name}</span>
                    <span class="item-detail">${detail}</span>
                </div>
            `;
            container.appendChild(el);
        });
    }

    function openFile(pathStr) {
        const path = pathStr.split('/').filter(p => p);
        const content = FileSystem.readFile(path);
        if (content === null) return;
        const fileName = path[path.length - 1];

        const notepadIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="4" y="2" width="16" height="20" rx="2" fill="#1E88E5"/><rect x="7" y="6" width="10" height="1.5" rx="0.5" fill="white"/><rect x="7" y="9.5" width="8" height="1.5" rx="0.5" fill="white"/><rect x="7" y="13" width="10" height="1.5" rx="0.5" fill="white"/></svg>`;

        const notepadContent = `
            <div style="display:flex;flex-direction:column;height:100%;">
                <textarea class="notepad-textarea" style="flex:1;background:transparent;border:none;color:var(--text-primary);padding:12px 16px;resize:none;outline:none;font-family:'Consolas','Courier New',monospace;font-size:14px;line-height:1.6;" spellcheck="false">${escapeHtml(content)}</textarea>
                <div style="padding:4px 12px;border-top:1px solid var(--window-border);display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary);">
                    <span class="notepad-status">Ln 1, Col 1</span>
                    <span>UTF-8</span>
                </div>
            </div>
        `;

        const win = WindowManager.createWindow('notepad', `${fileName} - Notepad`, notepadIcon, notepadContent, { width: 650, height: 450 });
        const textarea = win.element.querySelector('.notepad-textarea');
        const status = win.element.querySelector('.notepad-status');

        textarea.addEventListener('input', () => updateStatus(textarea, status));
        textarea.addEventListener('click', () => updateStatus(textarea, status));
        textarea.addEventListener('keyup', () => updateStatus(textarea, status));
    }

    function updateStatus(textarea, status) {
        const text = textarea.value.substring(0, textarea.selectionStart);
        const lines = text.split('\n');
        status.textContent = `Ln ${lines.length}, Col ${lines[lines.length - 1].length + 1}`;
    }

    function escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function setupSearch() {
        const searchInput = document.getElementById('start-search');
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            if (currentView === 'allApps') {
                const items = document.querySelectorAll('#all-apps-drawer .app-item');
                items.forEach(item => {
                    const name = item.querySelector('span').textContent.toLowerCase();
                    item.style.display = name.includes(query) ? '' : 'none';
                });
            } else {
                const items = document.querySelectorAll('#pinned-apps .app-item');
                items.forEach(item => {
                    const name = item.querySelector('.app-name').textContent.toLowerCase();
                    item.style.display = name.includes(query) ? '' : 'none';
                });
            }
        });
    }

    function refresh() {
        renderRecommended();
    }

    return { init, refresh, pinApp, unpinApp, isPinned };
})();

export default StartMenu;
