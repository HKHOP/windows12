import { AppRegistry, AppMetadata } from './taskbar.js';
import UserActivity from './userActivity.js';
import FileSystem from './fileSystem.js';
import AppIcons from './appIcons.js';

const Search = (() => {
    let panel = null;
    let searchInput = null;
    let isOpen = false;

    function init() {
        panel = document.getElementById('search-panel');
        searchInput = panel.querySelector('.search-input');
        wireEvents();
    }

    function esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function getTodayString() {
        const d = new Date();
        const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        return `${days[d.getDay()]} \u2022 ${months[d.getMonth()]} ${d.getDate()}`;
    }

    function getAllApps() {
        const all = AppRegistry.getAll();
        return Object.entries(all).map(([id, app]) => ({
            id,
            name: AppMetadata.get(id).name,
            icon: AppIcons.get(id)
        }));
    }

    function getRecentApps() {
        const recommended = UserActivity.getRecommended();
        return recommended.filter(r => r.type === 'app').slice(0, 8);
    }

    function getTopApps() {
        const ids = ['fileExplorer', 'notepad', 'browser', 'calculator', 'settings', 'terminal', 'paint', 'photos'];
        return ids.map(id => {
            const meta = AppMetadata.get(id);
            return { id, name: meta.name, icon: AppIcons.get(id) };
        }).filter(a => AppRegistry.get(a.id));
    }

    function searchFiles(query) {
        const results = [];
        const q = query.toLowerCase();
        function walk(path) {
            const children = FileSystem.getChildren(path);
            if (!children) return;
            for (const child of children) {
                const childPath = [...path, child.name];
                if (child.type === 'folder') {
                    walk(childPath);
                } else if (child.name.toLowerCase().includes(q)) {
                    results.push({ name: child.name, path: childPath, ext: child.ext || '' });
                    if (results.length >= 10) return;
                }
            }
            if (results.length >= 10) return;
        }
        walk(['/', 'users', 'default', 'Documents']);
        walk(['/', 'users', 'default', 'Desktop']);
        walk(['/', 'users', 'default', 'Downloads']);
        walk(['/', 'users', 'default', 'Pictures']);
        return results;
    }

    function searchApps(query) {
        const q = query.toLowerCase();
        return getAllApps().filter(a => a.name.toLowerCase().includes(q));
    }

    function getDailyStats() {
        const recommended = UserActivity.getRecommended();
        return { count: recommended.length };
    }

    function renderDefault() {
        const recent = getRecentApps();
        const top = getTopApps();
        const stats = getDailyStats();

        const recentHtml = recent.length > 0
            ? recent.map(r => `
                <div class="search-recent-item" data-app="${r.id}">
                    <div class="search-recent-icon">${AppIcons.get(r.id) || '<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="2" fill="#666"/></svg>'}</div>
                    <span class="search-recent-name">${esc(r.name)}</span>
                </div>
            `).join('')
            : '<div class="search-empty">No recent items</div>';

        const topHtml = top.map(a => `
            <div class="search-top-item" data-app="${a.id}">
                <div class="search-top-icon">${a.icon}</div>
                <span class="search-top-name">${esc(a.name)}</span>
            </div>
        `).join('');

        return `
            <div class="search-left">
                <div class="search-section-header">Recent</div>
                <div class="search-recent-list">${recentHtml}</div>
            </div>
            <div class="search-right">
                <div class="search-today">
                    <div class="search-today-header">
                        <span class="search-today-label">Today</span>
                        <span class="search-today-date">${getTodayString()}</span>
                    </div>
                    <div class="search-today-stats">
                        <span class="search-stat">${stats.count} items</span>
                    </div>
                </div>
                <div class="search-top-section">
                    <div class="search-section-header">Top apps</div>
                    <div class="search-top-grid">${topHtml}</div>
                </div>
            </div>
        `;
    }

    function renderResults(query) {
        const apps = searchApps(query);
        const files = searchFiles(query);

        let html = '';

        if (apps.length > 0) {
            html += `<div class="search-section-header">Apps</div>`;
            html += `<div class="search-results-list">`;
            for (const a of apps) {
                html += `
                    <div class="search-result-item" data-app="${a.id}">
                        <div class="search-result-icon">${a.icon}</div>
                        <div class="search-result-info">
                            <span class="search-result-name">${esc(a.name)}</span>
                            <span class="search-result-type">App</span>
                        </div>
                    </div>
                `;
            }
            html += `</div>`;
        }

        if (files.length > 0) {
            html += `<div class="search-section-header">Files</div>`;
            html += `<div class="search-results-list">`;
            for (const f of files) {
                const icon = UserActivity.getFileIcon(f.name);
                html += `
                    <div class="search-result-item" data-file="${esc(f.path.join('/'))}">
                        <div class="search-result-icon"><span style="font-size:20px">${icon}</span></div>
                        <div class="search-result-info">
                            <span class="search-result-name">${esc(f.name)}</span>
                            <span class="search-result-type">${esc(f.path.slice(0, -1).join('/'))}</span>
                        </div>
                    </div>
                `;
            }
            html += `</div>`;
        }

        if (!apps.length && !files.length) {
            html = `<div class="search-no-results">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                <span>No results for "${esc(query)}"</span>
            </div>`;
        }

        return html;
    }

    function render(query) {
        const body = panel.querySelector('.search-body');
        if (!body) return;
        body.innerHTML = query ? renderResults(query) : renderDefault();
        wireResultClicks();
    }

    function wireResultClicks() {
        panel.querySelectorAll('[data-app]').forEach(el => {
            el.addEventListener('click', () => {
                const appId = el.dataset.app;
                const app = AppRegistry.get(appId);
                if (app) {
                    app.launch();
                    close();
                }
            });
        });

        panel.querySelectorAll('[data-file]').forEach(el => {
            el.addEventListener('click', () => {
                const filePath = el.dataset.file.split('/');
                const fileName = filePath.pop();
                const ext = fileName.split('.').pop().toLowerCase();
                const content = FileSystem.readFile(filePath);
                if (content === null) return;
                const app = AppRegistry.get('notepad');
                if (app) {
                    app.launch();
                    close();
                }
            });
        });
    }

    function wireEvents() {
        searchInput.addEventListener('input', () => {
            render(searchInput.value.trim());
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                close();
                return;
            }
            if (e.key === 'Enter') {
                const first = panel.querySelector('.search-result-item, .search-recent-item, .search-top-item');
                if (first) first.click();
            }
        });

        document.addEventListener('click', (e) => {
            if (isOpen && !panel.contains(e.target) && !e.target.closest('#taskbar-center')) {
                close();
            }
        });
    }

    function toggle() {
        if (isOpen) close();
        else open();
    }

    function open() {
        if (!panel) return;
        isOpen = true;
        panel.classList.remove('hidden');
        searchInput.value = '';
        render('');
        setTimeout(() => searchInput.focus(), 50);
    }

    function close() {
        if (!panel) return;
        isOpen = false;
        panel.classList.add('hidden');
    }

    return { init, toggle, open, close };
})();

export default Search;
