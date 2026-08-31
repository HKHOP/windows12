import WindowManager from '../modules/windowManager.js';

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
            isLoading: false
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
                    <div class="browser-tab-add" title="New tab (Ctrl+T)">+</div>
                </div>
                <div class="browser-nav">
                    <button class="browser-nav-btn browser-back" title="Back (Alt+←)" disabled>&#9664;</button>
                    <button class="browser-nav-btn browser-forward" title="Forward (Alt+→)" disabled>&#9654;</button>
                    <button class="browser-nav-btn browser-refresh" title="Refresh (Ctrl+R)">&#8635;</button>
                    <div class="browser-url-bar">
                        <span class="browser-url-icon">🔒</span>
                        <input type="text" class="browser-url-input" placeholder="Search or enter URL" spellcheck="false">
                    </div>
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
                        <span class="browser-status-host"></span>
                    </div>
                </div>
            </div>
        `;
    }

    function getNewTabHtml() {
        const links = QUICK_LINKS.map(l => `
            <div class="browser-newtab-link" data-url="${l.url}">
                <div class="browser-newtab-link-icon" style="background:${l.color};">${l.letter}</div>
                <div class="browser-newtab-link-label">${l.name}</div>
            </div>
        `).join('');

        return `
            <div class="browser-newtab">
                <div class="browser-newtab-clock"></div>
                <div class="browser-newtab-date"></div>
                <div class="browser-newtab-search">
                    <span style="font-size:16px;">🔍</span>
                    <input type="text" class="browser-newtab-search-input" placeholder="Search the web or enter a URL" spellcheck="false">
                </div>
                <div class="browser-newtab-links">${links}</div>
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
        const backBtn = el.querySelector('.browser-back');
        const forwardBtn = el.querySelector('.browser-forward');
        const refreshBtn = el.querySelector('.browser-refresh');

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
                tabsList.appendChild(tabEl);
            }
        }

        function switchTab(tabId) {
            if (!tabs.has(tabId)) return;
            activeTabId = tabId;
            renderTabs();
            const tab = tabs.get(tabId);
            updateNavState(tab);
            urlInput.value = tab.displayUrl || '';
            urlIcon.textContent = isSecure(tab.url) ? '🔒' : '⚠️';
            statusHost.textContent = getHost(tab.url);

            if (!tab.url) {
                showNewTab();
            } else {
                renderPage(tab);
            }
        }

        function closeTab(tabId) {
            if (tabs.size <= 1) return;
            const tab = tabs.get(tabId);
            if (tab.iframeEl) tab.iframeEl.remove();
            tabs.delete(tabId);
            if (activeTabId === tabId) {
                const remaining = [...tabs.keys()];
                activeTabId = remaining[remaining.length - 1];
            }
            renderTabs();
            switchTab(activeTabId);
        }

        function addTab(url) {
            const tab = createTab(url);
            activeTabId = tab.id;
            renderTabs();
            if (url) {
                navigateTo(url);
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
            tab.title = 'New Tab';
            tab.url = '';
            tab.displayUrl = '';
            urlInput.value = '';
            urlIcon.textContent = '🔒';
            statusDot.className = 'browser-status-dot';
            statusText.textContent = 'Ready';
            statusHost.textContent = '';
            renderTabs();

            contentEl.innerHTML = getNewTabHtml();
            if (clockInterval) clearInterval(clockInterval);
            updateClock();
            clockInterval = setInterval(updateClock, 10000);

            const searchInput = contentEl.querySelector('.browser-newtab-search-input');
            if (searchInput) {
                searchInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        const val = searchInput.value.trim();
                        if (val) navigateTo(normalizeUrl(val));
                    }
                });
                setTimeout(() => searchInput.focus(), 50);
            }

            contentEl.querySelectorAll('.browser-newtab-link').forEach(link => {
                link.addEventListener('click', () => navigateTo(link.dataset.url));
            });
        }

        async function navigateTo(url) {
            const tab = tabs.get(activeTabId);
            if (!tab) return;
            if (!url) return;

            url = normalizeUrl(url);
            tab.url = url;
            tab.displayUrl = url;

            if (tab.historyIndex < tab.history.length - 1) {
                tab.history = tab.history.slice(0, tab.historyIndex + 1);
            }
            tab.history.push(url);
            tab.historyIndex = tab.history.length - 1;

            urlInput.value = url;
            urlIcon.textContent = isSecure(url) ? '🔒' : '⚠️';
            statusHost.textContent = getHost(url);
            updateNavState(tab);
            renderTabs();

            await renderPage(tab);
        }

        async function renderPage(tab) {
            if (!tab.url) { showNewTab(); return; }

            if (clockInterval) { clearInterval(clockInterval); clockInterval = null; }

            statusDot.className = 'browser-status-dot loading';
            statusText.textContent = 'Loading...';
            tab.isLoading = true;

            contentEl.innerHTML = '';

            const iframe = document.createElement('iframe');
            iframe.style.cssText = 'width:100%;height:100%;border:none;';
            iframe.sandbox = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox';
            tab.iframeEl = iframe;

            iframe.addEventListener('load', () => {
                statusDot.className = 'browser-status-dot';
                statusText.textContent = 'Done';
                tab.isLoading = false;
                try {
                    const iframeTitle = iframe.contentDocument?.title;
                    if (iframeTitle) {
                        tab.title = iframeTitle;
                        renderTabs();
                    }
                    const iframeUrl = iframe.contentWindow?.location?.href;
                    if (iframeUrl && iframeUrl !== 'about:blank') {
                        tab.url = iframeUrl;
                        tab.displayUrl = iframeUrl;
                        urlInput.value = iframeUrl;
                        urlIcon.textContent = isSecure(iframeUrl) ? '🔒' : '⚠️';
                        statusHost.textContent = getHost(iframeUrl);
                    }
                } catch {}
            });

            iframe.src = tab.url;
            contentEl.appendChild(iframe);
        }

        el.querySelector('.browser-tab-add').addEventListener('click', () => addTab());

        backBtn.addEventListener('click', () => {
            const tab = tabs.get(activeTabId);
            if (!tab || tab.historyIndex <= 0) return;
            tab.historyIndex--;
            tab.url = tab.history[tab.historyIndex];
            tab.displayUrl = tab.url;
            urlInput.value = tab.url;
            urlIcon.textContent = isSecure(tab.url) ? '🔒' : '⚠️';
            statusHost.textContent = getHost(tab.url);
            updateNavState(tab);
            renderPage(tab);
        });

        forwardBtn.addEventListener('click', () => {
            const tab = tabs.get(activeTabId);
            if (!tab || tab.historyIndex >= tab.history.length - 1) return;
            tab.historyIndex++;
            tab.url = tab.history[tab.historyIndex];
            tab.displayUrl = tab.url;
            urlInput.value = tab.url;
            urlIcon.textContent = isSecure(tab.url) ? '🔒' : '⚠️';
            statusHost.textContent = getHost(tab.url);
            updateNavState(tab);
            renderPage(tab);
        });

        refreshBtn.addEventListener('click', () => {
            const tab = tabs.get(activeTabId);
            if (tab && tab.url) renderPage(tab);
        });

        urlInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const val = urlInput.value.trim();
                if (val) navigateTo(val);
            }
        });

        urlInput.addEventListener('focus', () => urlInput.select());

        el.addEventListener('keydown', (e) => {
            if (!el.contains(document.activeElement) && document.activeElement !== document.body) return;
            if (e.ctrlKey && e.key === 't') { e.preventDefault(); addTab(); }
            if (e.ctrlKey && e.key === 'w') { e.preventDefault(); closeTab(activeTabId); }
            if (e.ctrlKey && e.key === 'l') { e.preventDefault(); urlInput.focus(); urlInput.select(); }
            if (e.ctrlKey && e.key === 'r') { e.preventDefault(); refreshBtn.click(); }
        });

        renderTabs();
        showNewTab();
    }

    return { launch };
})();

export default Browser;
