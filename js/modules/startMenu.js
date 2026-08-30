import WindowManager from './windowManager.js';
import { AppRegistry } from './taskbar.js';

const StartMenu = (() => {
    const pinnedApps = [
        { id: 'fileExplorer', name: 'File Explorer', icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M3 7V17C3 18.1 3.9 19 5 19H19C20.1 19 21 18.1 21 17V9C21 7.9 20.1 7 19 7H11L9 5H5C3.9 5 3 5.9 3 7Z" fill="#FFC107"/><path d="M3 7H21V9H3V7Z" fill="#FFD54F"/></svg>` },
        { id: 'settings', name: 'Settings', icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>` },
        { id: 'notepad', name: 'Notepad', icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><rect x="4" y="2" width="16" height="20" rx="2" fill="#1E88E5"/><rect x="7" y="6" width="10" height="1.5" rx="0.5" fill="white"/><rect x="7" y="9.5" width="8" height="1.5" rx="0.5" fill="white"/><rect x="7" y="13" width="10" height="1.5" rx="0.5" fill="white"/><rect x="7" y="16.5" width="6" height="1.5" rx="0.5" fill="white"/></svg>` }
    ];

    const recommendedItems = [
        { name: 'getting-started.txt', detail: 'Recently created', icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="4" y="2" width="16" height="20" rx="2" fill="#555"/><rect x="7" y="6" width="10" height="1.5" rx="0.5" fill="#999"/><rect x="7" y="9.5" width="8" height="1.5" rx="0.5" fill="#999"/></svg>` }
    ];

    function init() {
        renderPinnedApps();
        renderRecommended();
        setupSearch();
    }

    function renderPinnedApps() {
        const container = document.getElementById('pinned-apps');
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
                const existing = WindowManager.getWindowsByApp(app.id);
                if (existing.length > 0) {
                    const win = existing[0];
                    if (win.element.style.display === 'none') {
                        win.element.style.display = 'flex';
                        WindowManager.focusWindow(win.id);
                    } else {
                        WindowManager.focusWindow(win.id);
                    }
                } else {
                    const appModule = AppRegistry.get(app.id);
                    if (appModule) appModule.launch();
                }
            });
            container.appendChild(el);
        });
    }

    function renderRecommended() {
        const container = document.getElementById('recommended-apps');
        container.innerHTML = '';
        recommendedItems.forEach(item => {
            const el = document.createElement('div');
            el.className = 'list-item';
            el.innerHTML = `
                <div class="item-icon">${item.icon}</div>
                <div class="item-info">
                    <span class="item-name">${item.name}</span>
                    <span class="item-detail">${item.detail}</span>
                </div>
            `;
            container.appendChild(el);
        });
    }

    function setupSearch() {
        const searchInput = document.getElementById('start-search');
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const items = document.querySelectorAll('#pinned-apps .app-item');
            items.forEach(item => {
                const name = item.querySelector('.app-name').textContent.toLowerCase();
                item.style.display = name.includes(query) ? '' : 'none';
            });
        });
    }

    return { init };
})();

export default StartMenu;
