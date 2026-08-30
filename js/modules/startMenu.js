import WindowManager from './windowManager.js';
import { AppRegistry } from './taskbar.js';
import UserActivity from './userActivity.js';
import FileSystem from './fileSystem.js';

const StartMenu = (() => {
    const pinnedApps = [
        { id: 'fileExplorer', name: 'File Explorer', icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M3 7V17C3 18.1 3.9 19 5 19H19C20.1 19 21 18.1 21 17V9C21 7.9 20.1 7 19 7H11L9 5H5C3.9 5 3 5.9 3 7Z" fill="#FFC107"/><path d="M3 7H21V9H3V7Z" fill="#FFD54F"/></svg>` },
        { id: 'settings', name: 'Settings', icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>` },
        { id: 'notepad', name: 'Notepad', icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><rect x="4" y="2" width="16" height="20" rx="2" fill="#1E88E5"/><rect x="7" y="6" width="10" height="1.5" rx="0.5" fill="white"/><rect x="7" y="9.5" width="8" height="1.5" rx="0.5" fill="white"/><rect x="7" y="13" width="10" height="1.5" rx="0.5" fill="white"/><rect x="7" y="16.5" width="6" height="1.5" rx="0.5" fill="white"/></svg>` }
    ];

    const allApps = [
        { id: 'fileExplorer', name: 'File Explorer', icon: pinnedApps[0].icon },
        { id: 'notepad', name: 'Notepad', icon: pinnedApps[2].icon },
        { id: 'settings', name: 'Settings', icon: pinnedApps[1].icon }
    ].sort((a, b) => a.name.localeCompare(b.name));

    let currentView = 'main';

    function init() {
        renderMainView();
        setupSearch();
        setupAllAppsButton();
    }

    function setupAllAppsButton() {
        const btn = document.querySelector('.start-menu-all-btn');
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                slideToAllApps();
            });
        }
    }

    function slideToAllApps() {
        currentView = 'allApps';
        const menu = document.getElementById('start-menu');
        const body = menu.querySelector('.start-menu-body');

        if (!body) {
            const existingBody = document.createElement('div');
            existingBody.className = 'start-menu-body';
            const search = menu.querySelector('.start-menu-search');
            const footer = menu.querySelector('#start-menu-footer');
            search.after(existingBody);
            existingBody.appendChild(menu.querySelector('.start-menu-section'));
        }

        const bodyEl = menu.querySelector('.start-menu-body');
        bodyEl.innerHTML = '';
        bodyEl.style.position = 'relative';
        bodyEl.style.overflow = 'hidden';

        const drawer = document.createElement('div');
        drawer.className = 'all-apps-drawer';
        drawer.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:var(--start-menu-bg);padding:0 16px;overflow-y:auto;animation:slideInRight 0.25s ease-out;';

        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--window-border);margin-bottom:8px;position:sticky;top:0;background:var(--start-menu-bg);z-index:1;';

        const backBtn = document.createElement('button');
        backBtn.style.cssText = 'background:none;border:none;color:var(--text-primary);cursor:pointer;font-size:18px;padding:4px 8px;border-radius:4px;display:flex;align-items:center;justify-content:center;';
        backBtn.innerHTML = '&#9664;';
        backBtn.addEventListener('mouseenter', () => backBtn.style.background = 'var(--hover-bg)');
        backBtn.addEventListener('mouseleave', () => backBtn.style.background = 'none');
        backBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            slideToMain();
        });

        const title = document.createElement('span');
        title.style.cssText = 'font-size:14px;font-weight:600;';
        title.textContent = 'All apps';

        header.appendChild(backBtn);
        header.appendChild(title);
        drawer.appendChild(header);

        const letters = {};
        allApps.forEach(app => {
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
                const el = document.createElement('div');
                el.className = 'app-item';
                el.style.cssText = 'display:flex;align-items:center;gap:12px;padding:8px;border-radius:6px;cursor:pointer;transition:background 0.12s;';
                el.innerHTML = `
                    <div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;">${app.icon}</div>
                    <span style="font-size:13px;">${app.name}</span>
                `;
                el.addEventListener('mouseenter', () => el.style.background = 'var(--hover-bg)');
                el.addEventListener('mouseleave', () => el.style.background = 'transparent');
                el.addEventListener('click', () => {
                    menu.classList.add('hidden');
                    UserActivity.trackAppOpen(app.id);
                    launchApp(app.id);
                    renderRecommended();
                    slideToMain();
                });
                drawer.appendChild(el);
            });
        });

        bodyEl.appendChild(drawer);
    }

    function slideToMain() {
        currentView = 'main';
        const menu = document.getElementById('start-menu');
        const body = menu.querySelector('.start-menu-body');

        if (body) {
            body.style.animation = 'none';
            body.offsetHeight;
            body.style.animation = 'slideInLeft 0.25s ease-out';

            setTimeout(() => {
                renderMainView();
            }, 250);
        }
    }

    function renderMainView() {
        const menu = document.getElementById('start-menu');
        let body = menu.querySelector('.start-menu-body');

        if (!body) {
            body = document.createElement('div');
            body.className = 'start-menu-body';
            const search = menu.querySelector('.start-menu-search');
            search.after(body);
        }

        body.innerHTML = '';
        body.style.cssText = '';

        const pinnedSection = document.createElement('div');
        pinnedSection.className = 'start-menu-section';
        pinnedSection.innerHTML = `
            <div class="start-menu-section-header">
                <span>Pinned</span>
                <button class="start-menu-all-btn">All apps &gt;</button>
            </div>
            <div id="pinned-apps" class="start-menu-grid"></div>
        `;

        const recSection = document.createElement('div');
        recSection.className = 'start-menu-section';
        recSection.innerHTML = `
            <div class="start-menu-section-header">
                <span>Recommended</span>
            </div>
            <div id="recommended-apps" class="start-menu-list"></div>
        `;

        body.appendChild(pinnedSection);
        body.appendChild(recSection);

        pinnedSection.querySelector('.start-menu-all-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            slideToAllApps();
        });

        renderPinnedApps();
        renderRecommended();
    }

    function renderPinnedApps() {
        const container = document.getElementById('pinned-apps');
        if (!container) return;
        container.innerHTML = '';
        pinnedApps.forEach(app => {
            const el = document.createElement('div');
            el.className = 'app-item';
            el.innerHTML = `
                <div class="app-icon">${app.icon}</div>
                <span class="app-name">${app.name}</span>
            `;
            el.addEventListener('click', () => {
                document.getElementById('start-menu').classList.add('hidden');
                UserActivity.trackAppOpen(app.id);
                launchApp(app.id);
                renderRecommended();
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
                const items = document.querySelectorAll('.all-apps-drawer .app-item');
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

    return { init, refresh };
})();

export default StartMenu;
