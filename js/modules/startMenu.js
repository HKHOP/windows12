import WindowManager from './windowManager.js';
import UIIcons from './uiIcons.js';
import Flyout from './flyout.js';
import Search from './search.js';
import { Taskbar, AppMetadata } from './taskbar.js';
import UserActivity from './userActivity.js';
import FileSystem from './fileSystem.js';
import AppSystem from './appSystem.js';
import AppLoader from './appLoader.js';
import AppIcons from './appIcons.js';
import Users from './users.js';
import LockScreen from './lockScreen.js';
import FileAssociations from './fileAssociations.js';

const StartMenu = (() => {
    let pinnedApps = [];
    // Start menu pins are per-user (under the account's OS data).
    function pinsPath() {
        return Users.userData(['startmenu', 'pins.json']);
    }

    // Shell-owned FS access: shield from the fsGuard app attribution so a
    // write triggered while an app window is focused isn't denied/prompted.
    function asShell(fn) {
        return (...args) => {
            const g = window._FSGuard;
            if (g) return g.asShell(fn)(...args);
            return fn(...args);
        };
    }

    const defaultPinned = [
        { id: 'fileExplorer', name: 'File Explorer' },
        { id: 'settings', name: 'Settings' },
        { id: 'notepad', name: 'Notepad' },
        { id: 'calendar', name: 'Calendar' },
        { id: 'taskManager', name: 'Task Manager' },
        { id: 'photos', name: 'Photos' }
    ];

    // Built from app manifests (see js/apps/*/manifest.json). Store apps are
    // hidden until installed; builtin apps always show.
    function shortcutsApi() { return window._Shortcuts || null; }

    function startMenuDir() {
        const s = shortcutsApi();
        return s ? s.startMenuDir() : Users.home(['AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs']);
    }

    // Seed the per-user Start Menu folder once. Later user deletions stick:
    // the marker records that this profile has already been populated.
    function seedStartMenuOnce() {
        const s = shortcutsApi();
        if (!s) return;
        const marker = Users.userData(['startmenu', 'folders.json']);
        const state = s.readJson(marker, null) || {};
        // The apps that were seeded. A new app (one that arrived with an OS
        // update) still gets its shortcut, but a shortcut the user deleted
        // stays deleted.
        const seeded = new Set(Array.isArray(state.seededApps) ? state.seededApps : []);
        s.ensureFolder(startMenuDir());
        let all = [];
        try { all = AppLoader.getAll(); } catch { return; }
        for (const man of all) {
            if (seeded.has(man.id)) continue;
            try {
                if (AppLoader.isService(man.id) || !AppLoader.isLaunchable(man.id)) continue;
                s.createAppShortcut(man.id, 'startMenu', {
                    manifest: man,
                    source: { kind: 'system', appId: man.id }
                });
                seeded.add(man.id);
            } catch { /* skip an unreadable manifest */ }
        }
        s.writeJson(marker, { ...state, startSeeded: true, seededApps: [...seeded] });
    }

    function isStoreApp(appId) {
        const man = AppLoader.getManifest(appId);
        return !!man && man.distribution === 'store';
    }

    let currentView = 'main';
    let sections = [];
    let powerMenuOpen = false;

    function init() {
        loadPinnedApps();
        seedStartMenuOnce();
        const menu = document.getElementById('start-menu');
        sections = menu.querySelectorAll('.start-menu-section');
        renderPinnedApps();
        renderRecommended();
        setupSearch();
        setupAllAppsButton();
        setupPowerButton();
        updateUserInfo();
        window.addEventListener('user-info-changed', updateUserInfo);

        window.addEventListener('apps-changed', () => {
            renderPinnedApps();
            if (currentView === 'allApps') {
                showAllApps();
            }
        });
        window.addEventListener('shortcuts-changed', () => {
            if (currentView === 'allApps') showAllApps();
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

    function loadPinnedApps() {
        pinnedApps = readJson(pinsPath(), defaultPinned.map(a => a.id));
    }

    function savePinnedApps() {
        writeJson(pinsPath(), pinnedApps);
    }

    function isPinned(appId) {
        return pinnedApps.includes(appId);
    }

    function pinApp(appId) {
        try {
            if (AppLoader.isService(appId)) return;
        } catch (e) { /* fall through */ }
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
        const u = Users.getCurrent();
        const username = (u && u.name) || 'User';
        const initial = username.charAt(0).toUpperCase();
        const avatar = document.querySelector('.user-avatar');
        const nameEl = document.querySelector('.user-info span');
        const searchAvatar = document.querySelector('.search-avatar');
        if (avatar) avatar.textContent = initial;
        if (nameEl) nameEl.textContent = username;
        if (searchAvatar) searchAvatar.textContent = initial;
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
            { label: 'Lock', icon: UIIcons.action('lock'), action: () => LockScreen.lock() },
            { label: 'Switch user', icon: UIIcons.action('switchUser'), action: () => LockScreen.switchUser() },
            { label: 'Sign out', icon: UIIcons.action('logout'), action: () => LockScreen.logout() },
            { label: 'Sleep', icon: UIIcons.action('sleep'), action: () => LockScreen.sleep() },
            { label: 'Restart', icon: UIIcons.action('restart'), action: () => LockScreen.restart() },
            { label: 'Shut down', icon: UIIcons.action('shutdown'), action: () => LockScreen.shutdown() }
        ];

        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.style.cssText = `
                display:flex;align-items:center;gap:10px;width:100%;padding:10px 14px;
                border:none;background:transparent;color:var(--text-primary);
                cursor:pointer;font-size:13px;text-align:left;transition:background 0.12s;
            `;
            btn.innerHTML = `<span style="width:20px;display:inline-flex;justify-content:center;flex-shrink:0;">${opt.icon}</span>${opt.label}`;
            btn.addEventListener('mouseenter', () => btn.style.background = 'var(--hover-bg)');
            btn.addEventListener('mouseleave', () => btn.style.background = 'transparent');
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                menu.remove();
                powerMenuOpen = false;
                hide();
                opt.action();
            });
            menu.appendChild(btn);
        });

        const powerBtn = document.getElementById('power-btn');
        powerBtn.parentNode.style.position = 'relative';
        powerBtn.parentNode.appendChild(menu);
        powerMenuOpen = true;
    }

    // Session transitions live in lockScreen.js: Lock keeps the session and
    // freezes it behind the secure desktop, Sign out ends it and reopens the
    // picker, Switch user brings the picker up over the live session.
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
            drawer.style.cssText = 'overflow:visible;padding:0 16px;animation:slideInRight 0.2s ease-out;';
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

        renderAllApps(drawer);
    }

    function openFolder(path) {
        AppLoader.launchById('fileExplorer', { path }).catch(() => {});
    }

    function openFilePath(path) {
        let opened = false;
        try { opened = FileAssociations.openDefault(path); } catch { opened = false; }
        if (opened) return;
        AppLoader.ensureLoadedById('notepad').then(app => {
            if (app && typeof app.launch === 'function') app.launch(path, path[path.length - 1]);
        }).catch(() => {});
    }

    function readStartEntries(dir, depth) {
        const s = shortcutsApi();
        let children = [];
        try { children = asShell(FileSystem.getChildren)(dir) || []; } catch { return []; }
        const out = [];
        for (const child of children) {
            if (String(child.name).startsWith('.')) continue;
            const full = [...dir, child.name];
            if (child.type === 'folder') {
                const man = AppLoader.manifestForFolder(full);
                if (man) {
                    out.push({
                        kind: 'item', type: 'appFolder', name: man.name || child.name,
                        path: full, appId: man.id, manifest: man,
                        icon: AppIcons.forFolder(full, man),
                        open: () => AppLoader.launch(full)
                    });
                } else if (depth > 0) {
                    const kids = readStartEntries(full, depth - 1);
                    if (kids.length) {
                        out.push({
                            kind: 'group', type: 'folder', name: child.name, path: full,
                            icon: UIIcons.folder(child.name, 22),
                            open: () => openFolder(full),
                            children: kids
                        });
                    }
                }
                continue;
            }
            if (child.ext === 'lnk' && s) {
                const data = s.readSync(full);
                if (!data) continue;
                const appId = s.appIdForShortcut(data);
                const man = appId ? AppLoader.getManifest(appId) : null;
                out.push({
                    kind: 'item', type: 'shortcut', name: String(child.name).replace(/\.lnk$/i, ''),
                    path: full, appId, manifest: man, data,
                    icon: s.iconHtml(data, 22, { arrow: false }),
                    open: () => s.open(full)
                });
                continue;
            }
            out.push({
                kind: 'item', type: 'file', name: child.name, path: full,
                icon: UIIcons.file(child.ext, child.name, 22),
                open: () => openFilePath(full)
            });
        }
        out.sort((a, b) => {
            if (a.kind !== b.kind) return a.kind === 'group' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
        return out;
    }

    function renderAllApps(drawer) {
        const entries = readStartEntries(startMenuDir(), 5);
        if (entries.length === 0) {
            const empty = document.createElement('div');
            empty.style.cssText = 'padding:28px;text-align:center;color:var(--text-secondary);font-size:13px;';
            empty.textContent = 'No apps in the Start Menu folder';
            drawer.appendChild(empty);
            return;
        }
        const letters = {};
        entries.forEach(entry => {
            const letter = String(entry.name || '#').charAt(0).toUpperCase() || '#';
            if (!letters[letter]) letters[letter] = [];
            letters[letter].push(entry);
        });
        Object.keys(letters).sort().forEach(letter => {
            const letterEl = document.createElement('div');
            letterEl.style.cssText = 'font-size:13px;font-weight:600;color:var(--accent-color);padding:8px 4px 4px;';
            letterEl.textContent = letter;
            drawer.appendChild(letterEl);
            letters[letter].forEach(entry => renderStartEntry(drawer, entry));
        });
    }

    function renderStartEntry(container, entry) {
        const el = document.createElement('div');
        el.className = 'app-item';
        el.style.cssText = 'display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:6px;cursor:pointer;transition:background 0.12s;';
        const icon = `<div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${entry.icon || ''}</div>`;
        if (entry.kind === 'group') {
            el.innerHTML = `${icon}<span style="font-size:13px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(entry.name)}</span><span class="start-group-chevron" style="font-size:10px;color:var(--text-secondary);transition:transform 0.15s;">&#9654;</span>`;
            const kids = document.createElement('div');
            kids.style.cssText = 'display:none;margin-left:14px;padding-left:8px;border-left:1px solid var(--window-border);';
            entry.children.forEach(child => renderStartEntry(kids, child));
            el.addEventListener('mouseenter', () => el.style.background = 'var(--hover-bg)');
            el.addEventListener('mouseleave', () => el.style.background = 'transparent');
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const open = kids.style.display === 'none';
                kids.style.display = open ? 'block' : 'none';
                const chev = el.querySelector('.start-group-chevron');
                if (chev) chev.style.transform = open ? 'rotate(90deg)' : '';
            });
            el.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                showEntryMenu(e, entry);
            });
            container.appendChild(el);
            container.appendChild(kids);
            return;
        }

        el.innerHTML = `${icon}<span style="font-size:13px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(entry.name)}</span>`;
        el.addEventListener('mouseenter', () => el.style.background = 'var(--hover-bg)');
        el.addEventListener('mouseleave', () => el.style.background = 'transparent');
        el.addEventListener('click', () => launchEntry(entry));
        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showEntryMenu(e, entry);
        });
        container.appendChild(el);
    }

    function launchEntry(entry) {
        hide();
        if (entry.appId) {
            try { UserActivity.trackAppOpen(entry.appId); } catch { /* noop */ }
        } else if (entry.type === 'file') {
            try { UserActivity.trackFileOpen(entry.path, entry.name); } catch { /* noop */ }
        }
        try {
            const result = entry.open();
            if (result && typeof result.catch === 'function') result.catch(() => {});
        } catch { /* the crash monitor reports launch failures */ }
        renderRecommended();
        showMainView();
    }

    function showEntryMenu(e, entry) {
        const ContextMenu = window._modules && window._modules.ContextMenu;
        if (!ContextMenu) return;
        const items = [
            { label: entry.name, icon: '', disabled: true },
            'separator',
            { label: entry.kind === 'group' ? 'Open' : 'Open', icon: UIIcons.action('open'), action: () => {
                if (entry.kind === 'group') openFolder(entry.path);
                else launchEntry(entry);
            } }
        ];

        if (entry.type === 'appFolder') {
            items.push({ label: 'Open folder', icon: UIIcons.folder('', 16), action: () => openFolder(entry.path) });
        }

        if (entry.appId && AppLoader.isLaunchable(entry.appId)) {
            const pinned = isPinned(entry.appId);
            const taskbarPinned = Taskbar.isPinned(entry.appId);
            items.push('separator');
            items.push(pinned
                ? { label: 'Unpin from Start', icon: UIIcons.action('unpin'), action: () => { unpinApp(entry.appId); if (currentView === 'allApps') showAllApps(); } }
                : { label: 'Pin to Start', icon: UIIcons.action('pin'), action: () => { pinApp(entry.appId); if (currentView === 'allApps') showAllApps(); } });
            items.push(taskbarPinned
                ? { label: 'Unpin from taskbar', icon: UIIcons.action('unpin'), action: () => Taskbar.unpinApp(entry.appId) }
                : { label: 'Pin to taskbar', icon: UIIcons.action('pin'), action: () => Taskbar.pinApp(entry.appId) });
        } else if (entry.kind === 'item') {
            items.push({ label: 'Pin to taskbar', icon: UIIcons.action('pin'), action: () => Taskbar.pinEntry(entry.path, { name: entry.name, appId: entry.appId }) });
        }

        const s = shortcutsApi();
        const location = entry.type === 'shortcut'
            ? (s ? s.locationFor(entry.path, entry.data) : entry.path.slice(0, -1))
            : (entry.path && entry.path.length > 1 ? entry.path.slice(0, -1) : null);
        if (location) {
            items.push({ label: 'Open file location', icon: UIIcons.folder('', 16), action: () => openFolder(location) });
        }
        if (entry.type === 'shortcut') {
            items.push('separator');
            items.push({ label: 'Properties', icon: UIIcons.action('properties'), action: () => shortcutsApi() && shortcutsApi().properties(entry.path) });
        }
        if (entry.appId && isStoreApp(entry.appId) && AppSystem.getInstalledApps().includes(entry.appId)) {
            items.push('separator');
            items.push({ label: 'Uninstall', icon: UIIcons.action('uninstall'), action: () => AppSystem.uninstallApp(entry.appId) });
        }
        ContextMenu.show(e.clientX, e.clientY, items);
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

        const activePinned = pinnedApps.filter(appId => {
            try {
                if (AppLoader.isService(appId)) return false;
            } catch (e) { /* fall through */ }
            if (isStoreApp(appId)) return installed.includes(appId);
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
                hide();
                UserActivity.trackAppOpen(appId);
                launchApp(appId);
                renderRecommended();
            });

            el.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const isUserApp = isStoreApp(appId);
                const taskbarPinned = Taskbar.isPinned(appId);
                const items = [
                    { label: meta.name, icon: '', disabled: true },
                    'separator',
                    { label: 'Unpin from Start', icon: UIIcons.action('unpin'), action: () => unpinApp(appId) },
                    taskbarPinned
                        ? { label: 'Unpin from taskbar', icon: UIIcons.action('unpin'), action: () => Taskbar.unpinApp(appId) }
                        : { label: 'Pin to taskbar', icon: UIIcons.action('pin'), action: () => Taskbar.pinApp(appId) },
                    { label: 'Open', icon: UIIcons.action('open'), action: () => {
                        hide();
                        launchApp(appId);
                    }},
                    ...(isUserApp ? [
                        'separator',
                        { label: 'Uninstall', icon: UIIcons.action('uninstall'), action: () => AppSystem.uninstallApp(appId) }
                    ] : [])
                ];
                if (window._modules && window._modules.ContextMenu) {
                    window._modules.ContextMenu.show(e.clientX, e.clientY, items);
                }
            });

            container.appendChild(el);
        });
    }

    // Only reuse a window that belongs to the foreground session and the
    // active virtual desktop; otherwise launch a fresh one there.
    function isCurrentWindow(win) {
        const data = WindowManager._getWindow(win.id) || win;
        const S = window._Sessions;
        if (S && data.userId && data.userId !== S.getActive()) return false;
        const VD = window._modules && window._modules.VirtualDesktops;
        if (VD) {
            try {
                if (VD.getDesktopOf(win.id) !== VD.getActiveId()) return false;
            } catch (e) { /* desktop module not ready */ }
        }
        return true;
    }

    function launchApp(appId) {
        try {
            if (AppLoader.isService(appId)) return;
        } catch (e) { /* manifest unreadable - fall through */ }
        const existing = WindowManager.getWindowsByApp(appId).filter(isCurrentWindow);
        if (existing.length > 0) {
            const win = existing[0];
            // Restore through the window manager: touching element.style
            // bypassed minimize/visibility bookkeeping and could reveal a
            // window from another profile.
            if (WindowManager.isMinimized(win.id)) {
                WindowManager.setMinimized(win.id, false);
            }
            WindowManager.focusWindow(win.id);
        } else {
            AppLoader.launchById(appId).catch(() => { /* crash monitor reports */ });
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
                    hide();
                    UserActivity.trackFileOpen(item.path.split('/').filter(p => p), item.name);
                    openFile(item.path);
                    renderRecommended();
                });
            } else {
                icon = UserActivity.getAppIcon(item.id);
                name = item.name;
                detail = item.detail;
                el.addEventListener('click', () => {
                    hide();
                    UserActivity.trackAppOpen(item.id);
                    launchApp(item.id);
                    renderRecommended();
                });
            }

            el.innerHTML = `
                <div class="item-icon" style="display:flex;align-items:center;justify-content:center;">${icon}</div>
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
            const query = e.target.value;
            if (query.length > 0) {
                hide();
                window.dispatchEvent(new CustomEvent('open-search', { detail: { query } }));
                searchInput.value = '';
            }
        });
    }

    function refresh() {
        renderRecommended();
    }

    // Foreground session changed: reload this profile's pins/recents and
    // identity, and reset the menu to its main view.
    function activate() {
        loadPinnedApps();
        seedStartMenuOnce();
        if (sections && sections.length) showMainView();
        renderPinnedApps();
        renderRecommended();
        updateUserInfo();
    }

    function getMenu() {
        return document.getElementById('start-menu');
    }

    function show() {
        // Start and Search are mutually exclusive: opening one closes the other.
        Search.close();
        Flyout.show(getMenu());
    }

    function hide() {
        Flyout.hide(getMenu());
    }

    function toggle() {
        const menu = getMenu();
        if (Flyout.isOpen(menu) && !menu.classList.contains('closing')) hide();
        else show();
    }

    function isOpen() {
        return Flyout.isOpen(getMenu());
    }

    return { init, activate, refresh, pinApp, unpinApp, isPinned, show, hide, toggle, isOpen };
})();

export default StartMenu;
