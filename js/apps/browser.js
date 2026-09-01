import WindowManager from '../modules/windowManager.js';
import ContextMenu from '../modules/contextMenu.js';
import FileSystem from '../modules/fileSystem.js';

const Browser = (() => {
    const icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#2196F3" stroke-width="2"/><path d="M2 12h20" stroke="#2196F3" stroke-width="1.5"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="#2196F3" stroke-width="1.5"/></svg>`;

    const QUICK_LINKS = [
        { name: 'GitHub', url: 'https://github.com', color: '#333', letter: 'G' },
        { name: 'Wikipedia', url: 'https://wikipedia.org', color: '#636466', letter: 'W' },
        { name: 'MDN', url: 'https://developer.mozilla.org', color: '#1b1b1b', letter: 'M' },
        { name: 'Stack Overflow', url: 'https://stackoverflow.com', color: '#F48024', letter: 'S' },
        { name: 'YouTube', url: 'https://youtube.com', color: '#FF0000', letter: 'Y' },
        { name: 'Reddit', url: 'https://reddit.com', color: '#FF4500', letter: 'R' },
        { name: 'Hacker News', url: 'https://news.ycombinator.com', color: '#FF6600', letter: 'H' },
        { name: 'MDN Docs', url: 'https://developer.mozilla.org/en-US/', color: '#005A9C', letter: 'D' }
    ];

    const HISTORY_PATH = ['/', 'system', 'programs data', 'browser', 'history.json'];
    const DOWNLOADS_PATH = ['/', 'system', 'programs data', 'browser', 'downloads.json'];
    const closedTabs = [];
    const MAX_CLOSED = 20;

    let tabCounter = 0;
    const tabs = new Map();
    let activeTabId = null;

    function createTab(url) {
        const id = `tab-${Date.now()}-${++tabCounter}`;
        const tab = {
            id,
            title: 'New Tab',
            url: '',
            displayUrl: '',
            history: [],
            historyIndex: -1,
            isLoading: false,
            zoom: 1,
            iframeEl: null
        };
        if (url) {
            tab.url = url;
            tab.displayUrl = url;
            tab.history = [url];
            tab.historyIndex = 0;
        }
        tabs.set(id, tab);
        return tab;
    }

    function getTabHtml() {
        return `
            <div class="browser-container">
                <div class="browser-tabs">
                    <div class="browser-tabs-list"></div>
                    <div class="browser-tab-add" title="New tab (Alt+T)">+</div>
                </div>
                <div class="browser-nav">
                    <button class="browser-nav-btn browser-home" title="Homepage">&#8962;</button>
                    <button class="browser-nav-btn browser-back" title="Back (Alt+←)" disabled>&#9664;</button>
                    <button class="browser-nav-btn browser-forward" title="Forward (Alt+→)" disabled>&#9654;</button>
                    <button class="browser-nav-btn browser-refresh" title="Refresh (Alt+R)">&#8635;</button>
                    <div class="browser-url-bar">
                        <span class="browser-url-icon">🔒</span>
                        <input type="text" class="browser-url-input" placeholder="Search or enter URL" spellcheck="false">
                    </div>
                    <button class="browser-nav-btn browser-dl-btn" title="Downloads">⬇</button>
                    <button class="browser-nav-btn browser-menu-btn" title="Menu">⋮</button>
                </div>
                <div class="browser-find-bar" style="display:none;">
                    <input type="text" class="browser-find-input" placeholder="Find in page..." spellcheck="false">
                    <span class="browser-find-count"></span>
                    <button class="browser-find-prev" title="Previous">&#9650;</button>
                    <button class="browser-find-next" title="Next">&#9660;</button>
                    <button class="browser-find-close">&times;</button>
                </div>
                <div class="browser-content">
                    <div class="browser-newtab"></div>
                </div>
                <div class="browser-status">
                    <div class="browser-status-left">
                        <div class="browser-status-dot"></div>
                        <span class="browser-status-text">Ready</span>
                    </div>
                    <div class="browser-status-right">
                        <span class="browser-status-zoom"></span>
                        <span class="browser-status-host"></span>
                    </div>
                </div>
            </div>
        `;
    }

    function normalizeUrl(input) {
        input = input.trim();
        if (!input) return '';
        if (/^(https?:\/\/)/i.test(input)) return input;
        if (/^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}/.test(input)) return `https://${input}`;
        return `https://www.google.com/search?q=${encodeURIComponent(input)}`;
    }

    function getHost(url) {
        try { return new URL(url).hostname; } catch { return ''; }
    }

    function isSecure(url) {
        return url.startsWith('https://');
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

    function addHistoryEntry(url, title) {
        if (!url || url === 'about:blank') return;
        const history = readJson(HISTORY_PATH, []);
        history.unshift({ url, title: title || url, time: Date.now() });
        if (history.length > 500) history.length = 500;
        writeJson(HISTORY_PATH, history);
    }

    function getHistory() {
        return readJson(HISTORY_PATH, []);
    }

    function clearHistory() {
        if (FileSystem.itemExists(HISTORY_PATH)) {
            FileSystem.deleteItem(HISTORY_PATH);
        }
    }

    function getDownloads() {
        return readJson(DOWNLOADS_PATH, []);
    }

    function addDownload(name, size, path) {
        const downloads = getDownloads();
        downloads.unshift({ name, size, path, time: Date.now() });
        if (downloads.length > 100) downloads.length = 100;
        writeJson(DOWNLOADS_PATH, downloads);
    }

    function launch() {
        const firstTab = createTab();
        activeTabId = firstTab.id;

        const win = WindowManager.createWindow('browser', 'Browser', icon, getTabHtml(), { width: 900, height: 600 });
        const el = win.element;
        const contentEl = el.querySelector('.browser-content');
        const tabsList = el.querySelector('.browser-tabs-list');
        const urlInput = el.querySelector('.browser-url-input');
        const urlIcon = el.querySelector('.browser-url-icon');
        const statusDot = el.querySelector('.browser-status-dot');
        const statusText = el.querySelector('.browser-status-text');
        const statusHost = el.querySelector('.browser-status-host');
        const statusZoom = el.querySelector('.browser-status-zoom');
        const backBtn = el.querySelector('.browser-back');
        const forwardBtn = el.querySelector('.browser-forward');
        const refreshBtn = el.querySelector('.browser-refresh');
        const homeBtn = el.querySelector('.browser-home');
        const findBar = el.querySelector('.browser-find-bar');
        const findInput = el.querySelector('.browser-find-input');
        const findCount = el.querySelector('.browser-find-count');
        const findPrev = el.querySelector('.browser-find-prev');
        const findNext = el.querySelector('.browser-find-next');
        const findClose = el.querySelector('.browser-find-close');
        const dlBtn = el.querySelector('.browser-dl-btn');

        let clockInterval = null;

        function updateClock() {
            const clockEl = contentEl.querySelector('.browser-newtab-clock');
            const dateEl = contentEl.querySelector('.browser-newtab-date');
            if (clockEl) {
                const now = new Date();
                clockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                if (dateEl) dateEl.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
            }
        }

        function updateZoomDisplay() {
            const tab = tabs.get(activeTabId);
            if (!tab) return;
            const pct = Math.round(tab.zoom * 100);
            statusZoom.textContent = pct !== 100 ? `${pct}%` : '';
        }

        function applyZoom(tab) {
            if (!tab || !tab.iframeEl) return;
            tab.iframeEl.style.transform = `scale(${tab.zoom})`;
            tab.iframeEl.style.transformOrigin = '0 0';
            if (tab.zoom !== 1) {
                tab.iframeEl.style.width = `${100 / tab.zoom}%`;
                tab.iframeEl.style.height = `${100 / tab.zoom}%`;
            } else {
                tab.iframeEl.style.width = '100%';
                tab.iframeEl.style.height = '100%';
            }
            updateZoomDisplay();
        }

        function updateUrlBar(tab) {
            urlInput.value = tab.displayUrl || tab.url || '';
            urlIcon.textContent = isSecure(tab.url) ? '🔒' : '⚠️';
            statusHost.textContent = getHost(tab.url);
        }

        function renderTabs() {
            tabsList.innerHTML = '';
            for (const [, tab] of tabs) {
                const tabEl = document.createElement('div');
                tabEl.className = 'browser-tab' + (tab.id === activeTabId ? ' active' : '');
                tabEl.dataset.tabId = tab.id;
                tabEl.innerHTML = `
                    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${tab.title}</span>
                    <span class="browser-tab-close" data-close="${tab.id}">&times;</span>
                `;
                tabEl.addEventListener('click', (e) => {
                    if (e.target.closest('.browser-tab-close')) return;
                    switchTab(tab.id);
                });
                tabEl.querySelector('.browser-tab-close').addEventListener('click', (e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                });
                tabEl.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    showTabContextMenu(e.clientX, e.clientY, tab.id);
                });
                tabsList.appendChild(tabEl);
            }
        }

        function showTabContextMenu(x, y, tabId) {
            const tab = tabs.get(tabId);
            if (!tab) return;
            const items = [
                { label: 'New Tab', icon: '+', action: () => addTab() },
                'separator',
                { label: 'Close Tab', icon: '×', action: () => closeTab(tabId) },
                { label: 'Close Other Tabs', icon: '', action: () => closeOtherTabs(tabId) },
                { label: 'Close Tabs to the Right', icon: '', action: () => closeTabsToRight(tabId) },
                'separator',
                { label: 'Duplicate Tab', icon: '⧉', action: () => { if (tab.url) addTab(tab.url); } },
                'separator',
                { label: 'Reload', icon: '↻', action: () => { if (tab.url) loadUrlInTab(tab, tab.url); } }
            ];
            ContextMenu.show(x, y, items);
        }

        function closeOtherTabs(keepId) {
            for (const [id, tab] of tabs) {
                if (id !== keepId) {
                    if (tab.iframeEl) tab.iframeEl.remove();
                    closedTabs.push({ url: tab.url, title: tab.title });
                    tabs.delete(id);
                }
            }
            activeTabId = keepId;
            renderTabs();
            switchTab(activeTabId);
        }

        function closeTabsToRight(tabId) {
            const ids = [...tabs.keys()];
            const idx = ids.indexOf(tabId);
            if (idx < 0) return;
            for (let i = ids.length - 1; i > idx; i--) {
                const tab = tabs.get(ids[i]);
                if (tab.iframeEl) tab.iframeEl.remove();
                closedTabs.push({ url: tab.url, title: tab.title });
                tabs.delete(ids[i]);
            }
            renderTabs();
            switchTab(activeTabId);
        }

        function switchTab(tabId) {
            if (!tabs.has(tabId)) return;
            activeTabId = tabId;
            renderTabs();
            const tab = tabs.get(tabId);
            updateNavState(tab);
            updateUrlBar(tab);
            updateZoomDisplay();

            if (!tab.url) {
                showNewTab();
            } else {
                showIframe(tab);
            }
        }

        function closeTab(tabId) {
            if (tabs.size <= 1) return;
            const tab = tabs.get(tabId);
            closedTabs.push({ url: tab.url, title: tab.title });
            if (closedTabs.length > MAX_CLOSED) closedTabs.shift();
            if (tab.iframeEl) tab.iframeEl.remove();
            tabs.delete(tabId);
            if (activeTabId === tabId) {
                const remaining = [...tabs.keys()];
                activeTabId = remaining[remaining.length - 1];
            }
            renderTabs();
            switchTab(activeTabId);
        }

        function reopenClosedTab() {
            if (closedTabs.length === 0) return;
            const last = closedTabs.pop();
            addTab(last.url);
        }

        function addTab(url) {
            const tab = createTab(url);
            activeTabId = tab.id;
            renderTabs();
            if (url) {
                updateUrlBar(tab);
                updateNavState(tab);
                loadUrlInTab(tab, url);
            } else {
                showNewTab();
            }
            switchTab(tab.id);
        }

        function updateNavState(tab) {
            backBtn.disabled = tab.historyIndex <= 0;
            forwardBtn.disabled = tab.historyIndex >= tab.history.length - 1;
        }

        function showNewTab() {
            const tab = tabs.get(activeTabId);
            if (!tab) return;

            if (tab.iframeEl) {
                tab.iframeEl.style.display = 'none';
            }

            tab.title = 'New Tab';
            tab.url = '';
            tab.displayUrl = '';
            urlInput.value = '';
            urlIcon.textContent = '🔒';
            statusDot.className = 'browser-status-dot';
            statusText.textContent = 'Ready';
            statusHost.textContent = '';
            updateZoomDisplay();
            renderTabs();

            const existingDiv = contentEl.querySelector('.browser-newtab');
            if (existingDiv) {
                existingDiv.innerHTML = getNewTabContentHtml();
                existingDiv.style.display = '';
            }

            if (clockInterval) clearInterval(clockInterval);
            updateClock();
            clockInterval = setInterval(updateClock, 10000);

            if (existingDiv) {
                const searchInput = existingDiv.querySelector('.browser-newtab-search-input');
                if (searchInput) {
                    searchInput.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            const val = searchInput.value.trim();
                            if (val) navigateTo(normalizeUrl(val));
                        }
                    });
                    setTimeout(() => searchInput.focus(), 50);
                }

                existingDiv.querySelectorAll('.browser-newtab-link').forEach(link => {
                    link.addEventListener('click', () => navigateTo(link.dataset.url));
                });
            }
        }

        function getNewTabContentHtml() {
            const links = QUICK_LINKS.map(l => `
                <div class="browser-newtab-link" data-url="${l.url}">
                    <div class="browser-newtab-link-icon" style="background:${l.color};">${l.letter}</div>
                    <div class="browser-newtab-link-label">${l.name}</div>
                </div>
            `).join('');

            return `
                <div class="browser-newtab-clock"></div>
                <div class="browser-newtab-date"></div>
                <div class="browser-newtab-search">
                    <span style="font-size:16px;">🔍</span>
                    <input type="text" class="browser-newtab-search-input" placeholder="Search the web or enter a URL" spellcheck="false">
                </div>
                <div class="browser-newtab-links">${links}</div>
            `;
        }

        function hideNewTab() {
            const newTabDiv = contentEl.querySelector('.browser-newtab');
            if (newTabDiv) {
                newTabDiv.style.display = 'none';
                newTabDiv.innerHTML = '';
            }
            if (clockInterval) { clearInterval(clockInterval); clockInterval = null; }
        }

        function showIframe(tab) {
            hideNewTab();
            if (tab.iframeEl) {
                tab.iframeEl.style.display = '';
            }
            statusDot.className = 'browser-status-dot';
            statusText.textContent = tab.isLoading ? 'Loading...' : 'Done';
        }

        function navigateTo(url) {
            const tab = tabs.get(activeTabId);
            if (!tab) return;
            if (!url) return;

            url = normalizeUrl(url);

            if (tab.historyIndex < tab.history.length - 1) {
                tab.history = tab.history.slice(0, tab.historyIndex + 1);
            }
            tab.history.push(url);
            tab.historyIndex = tab.history.length - 1;
            tab.url = url;
            tab.displayUrl = url;

            updateUrlBar(tab);
            updateNavState(tab);
            renderTabs();

            loadUrlInTab(tab, url);
        }

        function loadUrlInTab(tab, url) {
            tab.url = url;
            tab.displayUrl = url;

            updateUrlBar(tab);

            if (clockInterval) { clearInterval(clockInterval); clockInterval = null; }
            statusDot.className = 'browser-status-dot loading';
            statusText.textContent = 'Loading...';
            tab.isLoading = true;

            hideNewTab();

            if (!tab.iframeEl) {
                const iframe = document.createElement('iframe');
                iframe.style.cssText = 'width:100%;height:100%;border:none;';
                iframe.sandbox = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox';
                tab.iframeEl = iframe;
                contentEl.appendChild(iframe);

                iframe.addEventListener('load', () => onIframeLoad(tab));
            }

            tab.iframeEl.style.display = '';
            applyZoom(tab);
            tab.iframeEl.src = url;
        }

        function onIframeLoad(tab) {
            if (tab.id !== activeTabId) return;

            statusDot.className = 'browser-status-dot';
            statusText.textContent = 'Done';
            tab.isLoading = false;

            try {
                const iframeTitle = tab.iframeEl.contentDocument?.title;
                if (iframeTitle && iframeTitle !== tab.title) {
                    tab.title = iframeTitle;
                    renderTabs();
                }
            } catch {}

            let detectedUrl = null;

            try {
                detectedUrl = tab.iframeEl.contentWindow?.location?.href;
                if (detectedUrl === 'about:blank') detectedUrl = null;
            } catch {}

            if (!detectedUrl) detectedUrl = tab.url;
            if (detectedUrl && detectedUrl !== 'about:blank') {
                tab.url = detectedUrl;
                tab.displayUrl = detectedUrl;
                urlInput.value = detectedUrl;
                urlIcon.textContent = isSecure(detectedUrl) ? '🔒' : '⚠️';
                statusHost.textContent = getHost(detectedUrl);
                addHistoryEntry(detectedUrl, tab.title);
            }

            try {
                const doc = tab.iframeEl.contentDocument;
                if (doc) {
                    const script = doc.createElement('script');
                    script.textContent = `
                        (function() {
                            function notifyParent(url, title) {
                                try { window.parent.postMessage({type:'browser-nav', url:url, title:title||document.title}, '*'); } catch(e) {}
                            }

                            document.addEventListener('click', function(e) {
                                var link = e.target.closest('a[href]');
                                if (!link) return;
                                var href = link.getAttribute('href');
                                if (!href || href === '#' || href.startsWith('javascript:')) return;
                                var url;
                                try { url = new URL(href, location.href).href; } catch(ex) { return; }
                                notifyParent(url);
                            }, true);

                            var lastUrl = location.href;
                            setInterval(function() {
                                if (location.href !== lastUrl) {
                                    lastUrl = location.href;
                                    notifyParent(location.href);
                                }
                                if (document.title && document.title !== lastTitle) {
                                    lastTitle = document.title;
                                    notifyParent(location.href, document.title);
                                }
                            }, 300);

                            var lastTitle = document.title;

                            window.addEventListener('popstate', function() {
                                setTimeout(function() { notifyParent(location.href); }, 50);
                            });
                        })();
                    `;
                    (doc.head || doc.documentElement).appendChild(script);
                    script.remove();
                }
            } catch {}
        }

        function goBack() {
            const tab = tabs.get(activeTabId);
            if (!tab || tab.historyIndex <= 0) return;
            tab.historyIndex--;
            const url = tab.history[tab.historyIndex];
            tab.url = url;
            tab.displayUrl = url;
            updateUrlBar(tab);
            updateNavState(tab);
            loadUrlInTab(tab, url);
        }

        function goForward() {
            const tab = tabs.get(activeTabId);
            if (!tab || tab.historyIndex >= tab.history.length - 1) return;
            tab.historyIndex++;
            const url = tab.history[tab.historyIndex];
            tab.url = url;
            tab.displayUrl = url;
            updateUrlBar(tab);
            updateNavState(tab);
            loadUrlInTab(tab, url);
        }

        function openFindBar() {
            findBar.style.display = 'flex';
            findInput.value = '';
            findCount.textContent = '';
            findInput.focus();
        }

        function closeFindBar() {
            findBar.style.display = 'none';
            findInput.value = '';
            findCount.textContent = '';
            try {
                const tab = tabs.get(activeTabId);
                if (tab?.iframeEl?.contentWindow) {
                    tab.iframeEl.contentWindow.find('', false, false, false);
                }
            } catch {}
        }

        function doFind(direction) {
            const query = findInput.value;
            if (!query) { findCount.textContent = ''; return; }
            try {
                const tab = tabs.get(activeTabId);
                if (tab?.iframeEl?.contentWindow) {
                    tab.iframeEl.contentWindow.find(query, false, direction === 'prev', false);
                }
            } catch {
                findCount.textContent = 'N/A';
            }
        }

        function showHistoryPanel() {
            const history = getHistory();
            let html = '<div style="padding:12px;height:100%;overflow-y:auto;user-select:text;-webkit-user-select:text;">';
            html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">';
            html += '<span style="font-size:14px;font-weight:600;">History</span>';
            html += '<button id="bh-clear" style="background:none;border:1px solid rgba(255,255,255,0.15);color:#ccc;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;">Clear</button>';
            html += '</div>';
            if (history.length === 0) {
                html += '<div style="text-align:center;color:#666;padding:40px;">No history yet</div>';
            } else {
                html += '<div class="browser-history-list">';
                const now = new Date();
                let lastDate = '';
                for (const entry of history) {
                    const d = new Date(entry.time);
                    const dateStr = d.toLocaleDateString();
                    if (dateStr !== lastDate) {
                        lastDate = dateStr;
                        html += `<div style="font-size:11px;color:#888;padding:8px 0 4px;border-bottom:1px solid rgba(255,255,255,0.06);">${dateStr === now.toLocaleDateString() ? 'Today' : dateStr}</div>`;
                    }
                    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    html += `<div class="browser-history-item" data-url="${entry.url}" style="padding:6px 8px;border-radius:4px;cursor:pointer;font-size:12px;display:flex;gap:8px;align-items:center;transition:background 0.12s;">`;
                    html += `<span style="color:#888;white-space:nowrap;font-size:11px;">${timeStr}</span>`;
                    html += `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${entry.title}</span>`;
                    html += '</div>';
                }
                html += '</div></div>';
            }

            const hWin = WindowManager.createWindow('browser-history', 'History', '🕐', html, { width: 400, height: 450 });
            const hEl = hWin.element;

            hEl.querySelector('#bh-clear')?.addEventListener('click', () => {
                clearHistory();
                hEl.querySelector('.window-body').innerHTML = '<div style="text-align:center;color:#666;padding:40px;">No history yet</div>';
            });

            hEl.querySelectorAll('.browser-history-item').forEach(item => {
                item.addEventListener('mouseenter', () => item.style.background = 'rgba(255,255,255,0.06)');
                item.addEventListener('mouseleave', () => item.style.background = 'transparent');
                item.addEventListener('click', () => {
                    navigateTo(item.dataset.url);
                });
            });
        }

        function showDownloadsPanel() {
            const downloads = getDownloads();
            let html = '<div style="padding:12px;height:100%;overflow-y:auto;user-select:text;-webkit-user-select:text;">';
            html += '<div style="font-size:14px;font-weight:600;margin-bottom:12px;">Downloads</div>';
            if (downloads.length === 0) {
                html += '<div style="text-align:center;color:#666;padding:40px;">No downloads yet</div>';
            } else {
                for (const dl of downloads) {
                    const d = new Date(dl.time);
                    html += `<div style="padding:8px;border:1px solid rgba(255,255,255,0.06);border-radius:6px;margin-bottom:6px;">`;
                    html += `<div style="font-size:13px;margin-bottom:4px;">${dl.name}</div>`;
                    html += `<div style="font-size:11px;color:#888;">${d.toLocaleString()}${dl.size ? ' · ' + dl.size : ''}</div>`;
                    if (dl.path) {
                        html += `<div style="font-size:11px;color:#4fc3f7;margin-top:2px;cursor:pointer;" class="browser-dl-open" data-path="${dl.path}">${dl.path}</div>`;
                    }
                    html += '</div>';
                }
            }
            html += '</div>';

            WindowManager.createWindow('browser-downloads', 'Downloads', '⬇', html, { width: 420, height: 400 });
        }

        el.querySelector('.browser-tab-add').addEventListener('click', () => addTab());

        homeBtn.addEventListener('click', () => showNewTab());
        backBtn.addEventListener('click', goBack);
        forwardBtn.addEventListener('click', goForward);
        refreshBtn.addEventListener('click', () => {
            const tab = tabs.get(activeTabId);
            if (tab && tab.url) loadUrlInTab(tab, tab.url);
        });
        dlBtn.addEventListener('click', () => showDownloadsPanel());

        const menuBtn = el.querySelector('.browser-menu-btn');
        menuBtn.addEventListener('click', (e) => {
            const items = [
                { label: 'New Tab', icon: '+', action: () => addTab() },
                'separator',
                { label: 'Find in Page', icon: '🔍', action: () => openFindBar() },
                { label: 'History', icon: '🕐', action: () => showHistoryPanel() },
                { label: 'Downloads', icon: '⬇', action: () => showDownloadsPanel() },
                'separator',
                { label: 'Zoom In', icon: '+', action: () => { const tab = tabs.get(activeTabId); if (tab) { tab.zoom = Math.min(tab.zoom + 0.1, 3); applyZoom(tab); } } },
                { label: 'Zoom Out', icon: '−', action: () => { const tab = tabs.get(activeTabId); if (tab) { tab.zoom = Math.max(tab.zoom - 0.1, 0.3); applyZoom(tab); } } },
                { label: 'Reset Zoom', icon: '', action: () => { const tab = tabs.get(activeTabId); if (tab) { tab.zoom = 1; applyZoom(tab); } } },
                'separator',
                { label: 'Clear History', icon: '🗑', action: () => { clearHistory(); } },
                { label: 'Close Tab', icon: '×', action: () => closeTab(activeTabId) },
            ];
            ContextMenu.show(e.clientX, e.clientY, items);
        });

        urlInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const val = urlInput.value.trim();
                if (val) {
                    const tab = tabs.get(activeTabId);
                    if (tab) {
                        if (tab.historyIndex < tab.history.length - 1) {
                            tab.history = tab.history.slice(0, tab.historyIndex + 1);
                        }
                        tab.history.push(normalizeUrl(val));
                        tab.historyIndex = tab.history.length - 1;
                    }
                    navigateTo(val);
                }
            }
        });

        urlInput.addEventListener('focus', () => urlInput.select());

        findInput.addEventListener('input', () => doFind('next'));
        findInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doFind(e.shiftKey ? 'prev' : 'next');
            if (e.key === 'Escape') closeFindBar();
        });
        findPrev.addEventListener('click', () => doFind('prev'));
        findNext.addEventListener('click', () => doFind('next'));
        findClose.addEventListener('click', closeFindBar);

        el.addEventListener('keydown', (e) => {
            if (!el.contains(document.activeElement) && document.activeElement !== document.body) return;
            if (e.altKey && e.key === 't') { e.preventDefault(); addTab(); }
            if (e.altKey && e.key === 'w') { e.preventDefault(); closeTab(activeTabId); }
            if (e.altKey && e.key === 'q') { e.preventDefault(); reopenClosedTab(); }
            if (e.ctrlKey && e.key === 'l') { e.preventDefault(); urlInput.focus(); urlInput.select(); }
            if (e.altKey && e.key === 'r') { e.preventDefault(); refreshBtn.click(); }
            if (e.altKey && e.key === 'f') { e.preventDefault(); openFindBar(); }
            if (e.altKey && e.key === 'h') { e.preventDefault(); showHistoryPanel(); }
            if (e.altKey && e.key === 'j') { e.preventDefault(); showDownloadsPanel(); }
            if (e.altKey && e.key === '=') { e.preventDefault(); const tab = tabs.get(activeTabId); if (tab) { tab.zoom = Math.min(tab.zoom + 0.1, 3); applyZoom(tab); } }
            if (e.altKey && e.key === '-') { e.preventDefault(); const tab = tabs.get(activeTabId); if (tab) { tab.zoom = Math.max(tab.zoom - 0.1, 0.3); applyZoom(tab); } }
            if (e.altKey && e.key === '0') { e.preventDefault(); const tab = tabs.get(activeTabId); if (tab) { tab.zoom = 1; applyZoom(tab); } }
        });

        renderTabs();
        showNewTab();

        window.addEventListener('message', (e) => {
            if (e.data?.type === 'browser-nav') {
                const tab = tabs.get(activeTabId);
                if (!tab) return;

                if (e.data.title && e.data.title !== tab.title) {
                    tab.title = e.data.title;
                    renderTabs();
                }

                const url = e.data.url;
                if (url && url !== tab.url) {
                    tab.url = url;
                    tab.displayUrl = url;
                    urlInput.value = url;
                    urlIcon.textContent = isSecure(url) ? '🔒' : '⚠️';
                    statusHost.textContent = getHost(url);

                    if (tab.historyIndex < tab.history.length - 1) {
                        tab.history = tab.history.slice(0, tab.historyIndex + 1);
                    }
                    tab.history.push(url);
                    tab.historyIndex = tab.history.length - 1;
                    updateNavState(tab);
                    addHistoryEntry(url, tab.title);
                }
            }
        });
    }

    return { launch };
})();

export default Browser;
