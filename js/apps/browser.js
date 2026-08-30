import WindowManager from '../modules/windowManager.js';
import FileSystem from '../modules/fileSystem.js';

const Browser = (() => {
    const icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#2196F3" stroke-width="2"/><path d="M2 12h20" stroke="#2196F3" stroke-width="1.5"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="#2196F3" stroke-width="1.5"/></svg>`;

    const CORS_PROXIES = [
        url => ({ url: `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, check: h => h.includes('<html') || h.includes('<!DOCTYPE') }),
        url => ({ url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, check: h => h.includes('<html') || h.includes('<!DOCTYPE') }),
        url => ({ url: `https://thingproxy.freeboard.io/fetch/${url}`, check: h => h.includes('<html') || h.includes('<!DOCTYPE') })
    ];

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
            mode: 'iframe',
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
                    <button class="browser-mode-btn mode-iframe" title="Rendering mode (click to cycle)">⚙ Iframe</button>
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
                        <span class="browser-status-mode">Iframe</span>
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

    function getErrorHtml(title, msg) {
        return `
            <div class="browser-error">
                <div class="browser-error-icon">⚠️</div>
                <div class="browser-error-title">${title}</div>
                <div class="browser-error-msg">${msg}</div>
            </div>
        `;
    }

    function getCorsErrorHtml(url) {
        return `
            <div class="browser-error">
                <div class="browser-error-icon">🔒</div>
                <div class="browser-error-title">Cannot load this page</div>
                <div class="browser-error-msg">
                    <p>This site blocked the request due to CORS (Cross-Origin Resource Sharing) restrictions.</p>
                    <p style="margin-top:12px;"><strong>Try switching to Iframe mode</strong> (click the ⚙ button) — it loads pages directly without CORS restrictions.</p>
                    <p style="margin-top:12px;font-size:11px;color:#888;">URL: ${url}</p>
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

    async function fetchHtml(url) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const text = await res.text();
            if (text && text.trim().length > 10) return text;
            throw new Error('Empty response');
        } catch (e) {
            for (const proxy of CORS_PROXIES) {
                try {
                    const proxyConfig = proxy(url);
                    const res = await fetch(proxyConfig.url);
                    if (!res.ok) continue;
                    const text = await res.text();
                    if (!text || text.trim().length < 10) continue;
                    if (proxyConfig.check && !proxyConfig.check(text)) continue;
                    try {
                        const json = JSON.parse(text);
                        if (json.contents) return json.contents;
                    } catch {
                        return text;
                    }
                } catch { continue; }
            }
            throw new Error(`Could not load: ${getHost(url)}`);
        }
    }

    function injectBaseUrl(html, url) {
        const base = `<base href="${url}">`;
        if (/<head[\s>]/i.test(html)) {
            return html.replace(/(<head[\s>])/i, `$1\n${base}`);
        } else if (/<html[\s>]/i.test(html)) {
            return html.replace(/(<html[\s>])/i, `$1\n<head>${base}</head>`);
        }
        return `<!DOCTYPE html><head>${base}</head><body>${html}</body>`;
    }

    function stripFrameBlocking(html) {
        html = html.replace(/<meta[^>]*http-equiv\s*=\s*["']?x-frame-options["']?[^>]*>/gi, '');
        html = html.replace(/<meta[^>]*http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi, '');
        return html;
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
        const modeBtn = el.querySelector('.browser-mode-btn');
        const statusDot = el.querySelector('.browser-status-dot');
        const statusText = el.querySelector('.browser-status-text');
        const statusMode = el.querySelector('.browser-status-mode');
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
            statusMode.textContent = { iframe: 'Iframe', sandbox: 'Sandbox', direct: 'Direct' }[tab.mode];
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
            if (tab.renderContainer) tab.renderContainer.remove();
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

        function setMode(tab, mode) {
            tab.mode = mode;
            modeBtn.className = `browser-mode-btn mode-${mode}`;
            modeBtn.textContent = `⚙ ${mode.charAt(0).toUpperCase() + mode.slice(1)}`;
            statusMode.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);

            const tooltips = {
                iframe: 'Iframe: Loads pages directly (works for most sites)',
                sandbox: 'Sandbox: Fetches HTML, runs scripts in isolated iframe (may fail due to CORS)',
                direct: 'Direct: Fetches HTML, runs scripts in host context (may fail due to CORS)'
            };
            modeBtn.title = tooltips[mode];

            if (mode === 'direct') {
                showSecurityToast(el, 'Direct mode: scripts will have full access to the OS');
            } else if (mode === 'sandbox') {
                showSecurityToast(el, 'Sandbox mode: scripts run in isolated iframe');
            }

            if (tab.url) renderPage(tab);
        }

        function cycleMode() {
            const tab = tabs.get(activeTabId);
            if (!tab) return;
            const modes = ['iframe', 'sandbox', 'direct'];
            const idx = modes.indexOf(tab.mode);
            setMode(tab, modes[(idx + 1) % modes.length]);
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

            const loadingEl = document.createElement('div');
            loadingEl.className = 'browser-loading';
            contentEl.appendChild(loadingEl);

            contentEl.innerHTML = '';

            if (tab.mode === 'iframe') {
                renderIframeMode(contentEl, tab, tab.url);
                return;
            }

            try {
                const rawHtml = await fetchHtml(tab.url);
                let html = injectBaseUrl(rawHtml, tab.url);
                html = stripFrameBlocking(html);

                const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
                if (titleMatch) {
                    tab.title = titleMatch[1].trim();
                    renderTabs();
                }

                if (tab.mode === 'sandbox') {
                    renderSandboxMode(contentEl, tab, html);
                } else {
                    renderDirectMode(contentEl, tab, html);
                }

                statusDot.className = 'browser-status-dot';
                statusText.textContent = 'Done';
                tab.isLoading = false;
            } catch (err) {
                contentEl.innerHTML = getCorsErrorHtml(tab.url);
                statusDot.className = 'browser-status-dot error';
                statusText.textContent = 'Error';
                tab.isLoading = false;
            }
        }

        function renderIframeMode(container, tab, url) {
            const iframe = document.createElement('iframe');
            iframe.style.cssText = 'width:100%;height:100%;border:none;';
            tab.iframeEl = iframe;

            iframe.addEventListener('load', () => {
                statusDot.className = 'browser-status-dot';
                statusText.textContent = 'Done';
                try {
                    const iframeTitle = iframe.contentDocument?.title;
                    if (iframeTitle) {
                        tab.title = iframeTitle;
                        renderTabs();
                    }
                } catch {}
            });

            iframe.src = url;
            container.appendChild(iframe);
        }

        function renderSandboxMode(container, tab, html) {
            const iframe = document.createElement('iframe');
            iframe.sandbox = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox';
            iframe.style.cssText = 'width:100%;height:100%;border:none;';
            tab.iframeEl = iframe;

            iframe.addEventListener('load', () => {
                statusDot.className = 'browser-status-dot';
                statusText.textContent = 'Done';
            });

            iframe.srcdoc = html;
            container.appendChild(iframe);
        }

        function renderDirectMode(container, tab, html) {
            const renderDiv = document.createElement('div');
            renderDiv.className = 'browser-render-container';
            renderDiv.style.cssText = 'width:100%;height:100%;overflow:auto;background:white;color:black;';
            tab.renderContainer = renderDiv;

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            const scripts = [];
            doc.querySelectorAll('script').forEach(s => {
                if (s.textContent) scripts.push(s.textContent);
                s.remove();
            });

            const styles = [];
            doc.querySelectorAll('style').forEach(s => {
                styles.push(s.textContent);
                s.remove();
            });

            renderDiv.innerHTML = '';

            const styleEl = document.createElement('style');
            styleEl.textContent = styles.join('\n');
            renderDiv.appendChild(styleEl);

            const bodyContent = doc.body ? doc.body.innerHTML : doc.documentElement.innerHTML;
            const bodyDiv = document.createElement('div');
            bodyDiv.innerHTML = bodyContent;
            renderDiv.appendChild(bodyDiv);

            container.appendChild(renderDiv);

            scripts.forEach((scriptText, i) => {
                try {
                    const scriptEl = document.createElement('script');
                    scriptEl.textContent = scriptText;
                    renderDiv.appendChild(scriptEl);
                } catch (err) {
                    const errBanner = document.createElement('div');
                    errBanner.style.cssText = 'background:#ff4444;color:white;padding:8px 12px;font-size:12px;font-family:monospace;';
                    errBanner.textContent = `Script error (#${i + 1}): ${err.message}`;
                    renderDiv.prepend(errBanner);
                }
            });

            statusDot.className = 'browser-status-dot';
            statusText.textContent = 'Done';
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

        modeBtn.addEventListener('click', cycleMode);

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

    function showSecurityToast(el, msg) {
        const toast = document.createElement('div');
        toast.className = 'browser-security-toast';
        toast.textContent = msg;
        el.querySelector('.browser-content').appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 2500);
    }

    return { launch };
})();

export default Browser;
