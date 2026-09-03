import WindowManager from '../modules/windowManager.js';
import FileSystem from '../modules/fileSystem.js';

const VSCode = (() => {
    const icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M17.5 2.5L6 12l11.5 9.5V2.5z" fill="#007ACC"/><path d="M6 12L2.5 9.5 6 12z" fill="#1E90FF"/><path d="M6 12l-3.5 2.5L6 12z" fill="#1E90FF"/><path d="M21 12l-3.5 2.5V9.5L21 12z" fill="#1E90FF"/></svg>`;

    let openTabs = [];
    let activeTab = null;
    let terminalVisible = false;
    let termCwd = ['/', 'users', 'default'];
    let termHistory = [];
    let termHistIdx = -1;

    const ICONS = {
        folder: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 7V17C3 18.1 3.9 19 5 19H19C20.1 19 21 18.1 21 17V9C21 7.9 20.1 7 19 7H11L9 5H5C3.9 5 3 5.9 3 7Z" fill="#E8A838"/></svg>`,
        folderOpen: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 7V17C3 18.1 3.9 19 5 19H19C20.1 19 21 18.1 21 17V9C21 7.9 20.1 7 19 7H11L9 5H5C3.9 5 3 5.9 3 7Z" fill="#E8A838"/><path d="M3 12H21V17C21 18.1 20.1 19 19 19H5C3.9 19 3 18.1 3 17V12Z" fill="#F0C060"/></svg>`,
        file: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" fill="#6D8086"/><path d="M14 2V8H20" fill="#4A5568"/></svg>`,
        js: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="3" fill="#F7DF1E"/><text x="12" y="18" text-anchor="middle" fill="#323330" font-size="12" font-weight="bold">JS</text></svg>`,
        json: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="3" fill="#5B5B5B"/><text x="12" y="17" text-anchor="middle" fill="#FFF" font-size="9" font-weight="bold">{}</text></svg>`,
        html: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="3" fill="#E44D26"/><text x="12" y="17" text-anchor="middle" fill="#FFF" font-size="9" font-weight="bold">&lt;/&gt;</text></svg>`,
        css: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="3" fill="#1572B6"/><text x="12" y="17" text-anchor="middle" fill="#FFF" font-size="9" font-weight="bold">CSS</text></svg>`,
        txt: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="3" fill="#6D8086"/><text x="12" y="17" text-anchor="middle" fill="#FFF" font-size="9" font-weight="bold">TXT</text></svg>`,
        md: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="3" fill="#42A5F5"/><text x="12" y="17" text-anchor="middle" fill="#FFF" font-size="9" font-weight="bold">MD</text></svg>`
    };

    function getFileIcon(name) {
        const ext = name.split('.').pop().toLowerCase();
        if (ext === 'js') return ICONS.js;
        if (ext === 'json') return ICONS.json;
        if (ext === 'html' || ext === 'htm') return ICONS.html;
        if (ext === 'css') return ICONS.css;
        if (ext === 'md') return ICONS.md;
        if (ext === 'txt') return ICONS.txt;
        return ICONS.file;
    }

    function getLang(name) {
        const ext = name.split('.').pop().toLowerCase();
        if (ext === 'js') return 'javascript';
        if (ext === 'json') return 'json';
        if (ext === 'html' || ext === 'htm') return 'html';
        if (ext === 'css') return 'css';
        if (ext === 'md') return 'markdown';
        if (ext === 'txt') return 'plaintext';
        return 'plaintext';
    }

    function highlightCode(code, lang) {
        let escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        if (lang === 'javascript') {
            escaped = escaped.replace(/\/\/.*/g, m => `<span style="color:#6A9955">${m}</span>`);
            escaped = escaped.replace(/\/\*[\s\S]*?\*\//g, m => `<span style="color:#6A9955">${m}</span>`);
            escaped = escaped.replace(/'[^']*'/g, m => `<span style="color:#CE9178">${m}</span>`);
            escaped = escaped.replace(/"[^"]*"/g, m => `<span style="color:#CE9178">${m}</span>`);
            escaped = escaped.replace(/\b(const|let|var|function|return|if|else|for|while|class|import|export|from|default|new|this|try|catch|throw|async|await|switch|case|break|continue|typeof|instanceof|in|of|null|undefined|true|false)\b/g, m => `<span style="color:#569CD6">${m}</span>`);
            escaped = escaped.replace(/\b(\d+)\b/g, m => `<span style="color:#B5CEA8">${m}</span>`);
        } else if (lang === 'json') {
            escaped = escaped.replace(/"[^"]*"\s*:/g, m => `<span style="color:#9CDCFE">${m}</span>`);
            escaped = escaped.replace(/:\s*"[^"]*"/g, m => `<span style="color:#CE9178">${m}</span>`);
            escaped = escaped.replace(/:\s*(\d+)/g, (m, n) => `: <span style="color:#B5CEA8">${n}</span>`);
            escaped = escaped.replace(/:\s*(true|false|null)/g, (m, kw) => `: <span style="color:#569CD6">${kw}</span>`);
        } else if (lang === 'html') {
            escaped = escaped.replace(/&lt;\/?[\w-]+/g, m => `<span style="color:#569CD6">${m}</span>`);
            escaped = escaped.replace(/&gt;/g, `<span style="color:#569CD6">&gt;</span>`);
            escaped = escaped.replace(/[\w-]+=/g, m => `<span style="color:#9CDCFE">${m}</span>`);
            escaped = escaped.replace(/"[^"]*"/g, m => `<span style="color:#CE9178">${m}</span>`);
        } else if (lang === 'css') {
            escaped = escaped.replace(/\/\*[\s\S]*?\*\//g, m => `<span style="color:#6A9955">${m}</span>`);
            escaped = escaped.replace(/[\w.-]+(?=\s*\{)/g, m => `<span style="color:#D7BA7D">${m}</span>`);
            escaped = escaped.replace(/:[^;{]+/g, m => `<span style="color:#9CDCFE">${m}</span>`);
        } else if (lang === 'markdown') {
            escaped = escaped.replace(/^### .+$/gm, m => `<span style="color:#569CD6;font-weight:bold">${m}</span>`);
            escaped = escaped.replace(/^## .+$/gm, m => `<span style="color:#569CD6;font-weight:bold">${m}</span>`);
            escaped = escaped.replace(/^# .+$/gm, m => `<span style="color:#569CD6;font-weight:bold">${m}</span>`);
            escaped = escaped.replace(/\*\*[^*]+\*\*/g, m => `<span style="font-weight:bold">${m}</span>`);
            escaped = escaped.replace(/`[^`]+`/g, m => `<span style="color:#CE9178">${m}</span>`);
        }
        return escaped;
    }

    function buildTree(path) {
        const node = FileSystem.readDirectory(path);
        if (!node) return '';
        const entries = [];
        for (const [name, item] of Object.entries(node)) {
            if (name.startsWith('.')) continue;
            entries.push({ name, item, path: [...path, name] });
        }
        entries.sort((a, b) => {
            if (a.item.type === 'folder' && b.item.type !== 'folder') return -1;
            if (a.item.type !== 'folder' && b.item.type === 'folder') return 1;
            return a.name.localeCompare(b.name);
        });
        return entries.map(e => {
            if (e.item.type === 'folder') {
                const children = buildTree(e.path);
                return `<div class="fs-folder" data-path="${e.path.join('/')}">
                    <div class="fs-item fs-folder-toggle" style="display:flex;align-items:center;gap:4px;padding:2px 4px;cursor:pointer;font-size:12px;color:#ccc;border-radius:3px;" data-path="${e.path.join('/')}">
                        <span class="fs-arrow" style="font-size:10px;color:#888;transition:transform 0.15s;">&#9654;</span>
                        <span>${ICONS.folder}</span>
                        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e.name}</span>
                    </div>
                    <div class="fs-children" style="display:none;padding-left:16px;">${children}</div>
                </div>`;
            }
            return `<div class="fs-file fs-item" data-path="${e.path.join('/')}" style="display:flex;align-items:center;gap:4px;padding:2px 4px;cursor:pointer;font-size:12px;color:#ccc;border-radius:3px;">
                <span>${getFileIcon(e.name)}</span>
                <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e.name}</span>
            </div>`;
        }).join('');
    }

    function launch() {
        openTabs = [];
        activeTab = null;
        terminalVisible = false;
        termCwd = ['/', 'users', 'default'];
        termHistory = [];
        termHistIdx = -1;

        const win = WindowManager.createWindow('vscode', 'Visual Studio Code', icon, '', {
            width: 950, height: 620, minWidth: 500, minHeight: 350
        });
        const el = win.element;
        const body = el.querySelector('.window-body');
        body.style.cssText = 'margin:0;padding:0;display:flex;flex-direction:column;height:100%;overflow:hidden;background:#1e1e1e;color:#cccccc;font-family:"Segoe UI",system-ui,sans-serif;font-size:13px;';

        body.innerHTML = `
            <div class="vsc-topbar" style="display:flex;align-items:center;height:32px;background:#323233;border-bottom:1px solid #3c3c3c;padding:0 8px;gap:8px;flex-shrink:0;">
                <span style="font-size:11px;color:#999;">File</span>
                <span style="font-size:11px;color:#999;">Edit</span>
                <span style="font-size:11px;color:#999;">View</span>
                <span style="font-size:11px;color:#999;">Run</span>
                <span style="font-size:11px;color:#999;">Help</span>
            </div>
            <div class="vsc-main" style="display:flex;flex:1;overflow:hidden;">
                <div class="vsc-activitybar" style="width:48px;background:#333333;display:flex;flex-direction:column;align-items:center;padding-top:4px;flex-shrink:0;border-right:1px solid #3c3c3c;">
                    <div class="vsc-ab-btn active" data-panel="explorer" style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;cursor:pointer;border-left:2px solid #0078D4;color:#fff;margin-bottom:2px;" title="Explorer">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 7V17C3 18.1 3.9 19 5 19H19C20.1 19 21 18.1 21 17V9C21 7.9 20.1 7 19 7H11L9 5H5C3.9 5 3 5.9 3 7Z" fill="currentColor"/></svg>
                    </div>
                    <div class="vsc-ab-btn" data-panel="search" style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;cursor:pointer;border-left:2px solid transparent;color:#858585;margin-bottom:2px;" title="Search">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    </div>
                    <div style="flex:1;"></div>
                    <div class="vsc-ab-btn" data-panel="settings" style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;cursor:pointer;border-left:2px solid transparent;color:#858585;" title="Settings">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    </div>
                </div>
                <div class="vsc-sidebar" style="width:220px;background:#252526;border-right:1px solid #3c3c3c;display:flex;flex-direction:column;overflow:hidden;flex-shrink:0;">
                    <div class="vsc-sidebar-header" style="padding:8px 12px;font-size:11px;font-weight:600;text-transform:uppercase;color:#999;letter-spacing:0.5px;">Explorer</div>
                    <div class="vsc-sidebar-content" style="flex:1;overflow-y:auto;padding:0 4px;"></div>
                </div>
                <div class="vsc-editor-area" style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
                    <div class="vsc-tabs" style="display:flex;background:#252526;border-bottom:1px solid #3c3c3c;overflow-x:auto;flex-shrink:0;"></div>
                    <div class="vsc-editor" style="flex:1;overflow:auto;background:#1e1e1e;position:relative;">
                        <div class="vsc-welcome" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#555;gap:12px;">
                            <svg width="64" height="64" viewBox="0 0 24 24" fill="none"><path d="M17.5 2.5L6 12l11.5 9.5V2.5z" fill="#007ACC"/></svg>
                            <div style="font-size:18px;font-weight:300;">Visual Studio Code</div>
                            <div style="font-size:12px;color:#444;">Open a file from the explorer to start editing</div>
                        </div>
                    </div>
                    <div class="vsc-terminal-panel" style="display:none;flex-direction:column;border-top:1px solid #3c3c3c;height:200px;flex-shrink:0;">
                        <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 12px;background:#1e1e1e;border-bottom:1px solid #3c3c3c;">
                            <div style="display:flex;gap:12px;">
                                <span style="font-size:11px;font-weight:600;color:#ccc;cursor:pointer;border-bottom:2px solid #0078D4;padding-bottom:2px;">Terminal</span>
                            </div>
                            <div style="display:flex;gap:8px;">
                                <button class="vsc-term-clear" style="background:none;border:none;color:#888;cursor:pointer;font-size:14px;" title="Clear">⌫</button>
                                <button class="vsc-term-close" style="background:none;border:none;color:#888;cursor:pointer;font-size:14px;" title="Close">✕</button>
                            </div>
                        </div>
                        <div class="vsc-term-output" style="flex:1;overflow-y:auto;padding:8px 12px;font-family:'Cascadia Mono','Consolas','Courier New',monospace;font-size:12px;color:#ccc;white-space:pre-wrap;word-break:break-all;line-height:1.4;"></div>
                        <div style="display:flex;padding:4px 12px 8px;align-items:center;font-family:'Cascadia Mono','Consolas','Courier New',monospace;font-size:12px;">
                            <span class="vsc-term-prompt" style="color:#569CD6;white-space:pre;"></span>
                            <input class="vsc-term-input" type="text" style="flex:1;background:transparent;border:none;outline:none;color:#ccc;font-family:inherit;font-size:inherit;caret-color:#ccc;margin-left:4px;" spellcheck="false" autocomplete="off">
                        </div>
                    </div>
                </div>
            </div>
            <div class="vsc-statusbar" style="height:22px;background:#0078D4;display:flex;align-items:center;padding:0 10px;font-size:11px;color:white;flex-shrink:0;">
                <span class="vsc-status-lang">Plain Text</span>
                <span style="flex:1;"></span>
                <span class="vsc-status-pos">Ln 1, Col 1</span>
            </div>
        `;

        const sidebarContent = body.querySelector('.vsc-sidebar-content');
        sidebarContent.innerHTML = buildTree(['/', 'users', 'default']);

        setupFileTreeEvents(el);
        setupActivityBar(el);
        setupTerminal(el);
        setupEditorEvents(el);
    }

    function setupFileTreeEvents(el) {
        el.querySelectorAll('.fs-folder-toggle').forEach(toggle => {
            toggle.addEventListener('click', () => {
                const arrow = toggle.querySelector('.fs-arrow');
                const children = toggle.nextElementSibling;
                if (children.style.display === 'none') {
                    children.style.display = 'block';
                    arrow.style.transform = 'rotate(90deg)';
                    toggle.querySelector('span:nth-child(2)').outerHTML = ICONS.folderOpen;
                } else {
                    children.style.display = 'none';
                    arrow.style.transform = 'rotate(0deg)';
                    toggle.querySelector('span:nth-child(2)').outerHTML = ICONS.folder;
                }
            });
            toggle.addEventListener('mouseenter', () => toggle.style.background = 'rgba(255,255,255,0.08)');
            toggle.addEventListener('mouseleave', () => toggle.style.background = '');
        });

        el.querySelectorAll('.fs-file').forEach(file => {
            file.addEventListener('click', () => {
                el.querySelectorAll('.fs-file').forEach(f => f.style.background = '');
                file.style.background = 'rgba(255,255,255,0.1)';
                const path = file.dataset.path.split('/');
                openFile(el, path);
            });
            file.addEventListener('mouseenter', () => { if (!file.style.background) file.style.background = 'rgba(255,255,255,0.05)'; });
            file.addEventListener('mouseleave', () => { if (file.style.background === 'rgba(255,255,255,0.05)') file.style.background = ''; });
        });
    }

    function openFile(el, pathArr) {
        const pathStr = pathArr.join('/');
        let tab = openTabs.find(t => t.path === pathStr);
        if (!tab) {
            const content = FileSystem.readFile(pathArr) || '';
            tab = { path: pathStr, name: pathArr[pathArr.length - 1], content, original: content, modified: false };
            openTabs.push(tab);
        }
        activeTab = tab;
        renderTabs(el);
        renderEditor(el);
    }

    function renderTabs(el) {
        const tabsContainer = el.querySelector('.vsc-tabs');
        tabsContainer.innerHTML = openTabs.map(t => {
            const isActive = t === activeTab;
            const dot = t.modified ? '<span style="width:6px;height:6px;background:#E8A838;border-radius:50;margin-left:6px;"></span>' : '';
            return `<div class="vsc-tab" data-path="${t.path}" style="display:flex;align-items:center;gap:6px;padding:0 12px;height:32px;font-size:12px;cursor:pointer;white-space:nowrap;border-right:1px solid #3c3c3c;${isActive ? 'background:#1e1e1e;border-bottom:2px solid #0078D4;color:#fff;' : 'background:#2d2d2d;color:#969696;'}">
                <span>${getFileIcon(t.name)}</span>
                <span>${t.name}</span>
                ${dot}
                <span class="vsc-tab-close" data-path="${t.path}" style="margin-left:4px;color:#888;cursor:pointer;font-size:12px;padding:2px;border-radius:3px;">&times;</span>
            </div>`;
        }).join('');

        tabsContainer.querySelectorAll('.vsc-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                if (e.target.classList.contains('vsc-tab-close')) return;
                const path = tab.dataset.path;
                activeTab = openTabs.find(t => t.path === path);
                renderTabs(el);
                renderEditor(el);
            });
        });

        tabsContainer.querySelectorAll('.vsc-tab-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const path = btn.dataset.path;
                openTabs = openTabs.filter(t => t.path !== path);
                if (activeTab && activeTab.path === path) {
                    activeTab = openTabs[openTabs.length - 1] || null;
                }
                renderTabs(el);
                renderEditor(el);
            });
        });
    }

    function renderEditor(el) {
        const editor = el.querySelector('.vsc-editor');
        const statusLang = el.querySelector('.vsc-status-lang');
        const statusPos = el.querySelector('.vsc-status-pos');

        if (!activeTab) {
            editor.innerHTML = `<div class="vsc-welcome" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#555;gap:12px;">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none"><path d="M17.5 2.5L6 12l11.5 9.5V2.5z" fill="#007ACC"/></svg>
                <div style="font-size:18px;font-weight:300;">Visual Studio Code</div>
                <div style="font-size:12px;color:#444;">Open a file from the explorer to start editing</div>
            </div>`;
            statusLang.textContent = 'Plain Text';
            statusPos.textContent = '';
            return;
        }

        const lang = getLang(activeTab.name);
        const lines = activeTab.content.split('\n');
        const highlighted = highlightCode(activeTab.content, lang);

        editor.innerHTML = `<div style="display:flex;height:100%;">
            <div class="vsc-line-numbers" style="padding:8px 0;text-align:right;color:#858585;font-family:'Cascadia Mono','Consolas','Courier New',monospace;font-size:13px;line-height:1.5;min-width:50px;padding-right:12px;padding-left:12px;user-select:none;border-right:1px solid #3c3c3c;overflow:hidden;">${lines.map((_, i) => `<div>${i + 1}</div>`).join('')}</div>
            <div class="vsc-code-wrapper" style="flex:1;overflow:auto;position:relative;">
                <textarea class="vsc-code-input" style="position:absolute;top:0;left:0;width:100%;height:100%;background:transparent;color:transparent;caret-color:#aeafad;border:none;outline:none;resize:none;padding:8px 12px;font-family:'Cascadia Mono','Consolas','Courier New',monospace;font-size:13px;line-height:1.5;white-space:pre;overflow:hidden;tab-size:4;z-index:2;" spellcheck="false" autocomplete="off">${activeTab.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
                <pre class="vsc-code-display" style="margin:0;padding:8px 12px;font-family:'Cascadia Mono','Consolas','Courier New',monospace;font-size:13px;line-height:1.5;white-space:pre;overflow:hidden;tab-size:4;z-index:1;pointer-events:none;">${highlighted}</pre>
            </div>
        </div>`;

        statusLang.textContent = lang.charAt(0).toUpperCase() + lang.slice(1);
        statusPos.textContent = `Ln 1, Col 1`;

        const textarea = editor.querySelector('.vsc-code-input');
        const display = editor.querySelector('.vsc-code-display');
        const codeWrapper = editor.querySelector('.vsc-code-wrapper');
        const lineNumbers = el.querySelector('.vsc-line-numbers');

        function syncScroll() {
            display.scrollTop = textarea.scrollTop;
            display.scrollLeft = textarea.scrollLeft;
            lineNumbers.scrollTop = textarea.scrollTop;
        }
        textarea.addEventListener('scroll', syncScroll);

        textarea.addEventListener('input', () => {
            activeTab.content = textarea.value;
            activeTab.modified = activeTab.content !== activeTab.original;
            display.innerHTML = highlightCode(activeTab.content, lang);
            const pos = getCursorPos(textarea);
            statusPos.textContent = `Ln ${pos.line}, Col ${pos.col}`;
            renderTabs(el);
        });

        textarea.addEventListener('click', () => {
            const pos = getCursorPos(textarea);
            statusPos.textContent = `Ln ${pos.line}, Col ${pos.col}`;
        });

        textarea.addEventListener('keyup', () => {
            const pos = getCursorPos(textarea);
            statusPos.textContent = `Ln ${pos.line}, Col ${pos.col}`;
        });

        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                textarea.value = textarea.value.substring(0, start) + '    ' + textarea.value.substring(end);
                textarea.selectionStart = textarea.selectionEnd = start + 4;
                textarea.dispatchEvent(new Event('input'));
            }
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                saveCurrentFile(el);
            }
        });

        textarea.focus();
    }

    function getCursorPos(textarea) {
        const text = textarea.value.substring(0, textarea.selectionStart);
        const lines = text.split('\n');
        return { line: lines.length, col: lines[lines.length - 1].length + 1 };
    }

    function saveCurrentFile(el) {
        if (!activeTab) return;
        const pathArr = activeTab.path.split('/');
        const parentPath = pathArr.slice(0, -1);
        const fileName = pathArr[pathArr.length - 1];

        if (FileSystem.itemExists(parentPath)) {
            if (FileSystem.itemExists(pathArr)) {
                FileSystem.writeFile(pathArr, activeTab.content);
            } else {
                FileSystem.createFile(parentPath, fileName, activeTab.content);
            }
        }
        activeTab.original = activeTab.content;
        activeTab.modified = false;
        renderTabs(el);
    }

    function setupEditorEvents(el) {
        el.querySelector('.vsc-editor-area').addEventListener('click', (e) => {
            if (e.target.classList.contains('vsc-tab') || e.target.closest('.vsc-tab')) return;
        });
    }

    function setupActivityBar(el) {
        el.querySelectorAll('.vsc-ab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const panel = btn.dataset.panel;
                if (panel === 'settings') {
                    const Settings = window._vscodeSettingsRef;
                    if (Settings) Settings.launch();
                    return;
                }
                el.querySelectorAll('.vsc-ab-btn').forEach(b => {
                    b.style.borderLeftColor = 'transparent';
                    b.style.color = '#858585';
                    b.classList.remove('active');
                });
                btn.style.borderLeftColor = '#0078D4';
                btn.style.color = '#fff';
                btn.classList.add('active');
            });
        });
    }

    function setupTerminal(el) {
        const termPanel = el.querySelector('.vsc-terminal-panel');
        const termOutput = el.querySelector('.vsc-term-output');
        const termInput = el.querySelector('.vsc-term-input');
        const termPrompt = el.querySelector('.vsc-term-prompt');

        function toggleTerminal() {
            terminalVisible = !terminalVisible;
            termPanel.style.display = terminalVisible ? 'flex' : 'none';
            if (terminalVisible) {
                termInput.focus();
                updateTermPrompt();
            }
        }

        function updateTermPrompt() {
            const p = termCwd.join('/').replace('//', '/');
            const home = '/users/default';
            const short = p === home ? '~' : '~' + p.replace(home, '');
            termPrompt.textContent = `${short} > `;
        }

        function termPrint(text) {
            termOutput.textContent += text + '\n';
            termOutput.scrollTop = termOutput.scrollHeight;
        }

        function resolveTermPath(input) {
            if (!input) return [...termCwd];
            let parts;
            if (input.startsWith('/')) {
                parts = input.split('/').filter(Boolean);
            } else if (input.startsWith('~/')) {
                parts = ['/', 'users', 'default', ...input.slice(2).split('/').filter(Boolean)];
            } else {
                parts = [...termCwd, ...input.split('/').filter(Boolean)];
            }
            const resolved = [];
            for (const p of parts) {
                if (p === '.') continue;
                if (p === '..') { resolved.pop(); continue; }
                resolved.push(p);
            }
            return resolved;
        }

        termInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const cmd = termInput.value.trim();
                termInput.value = '';
                termPrint(`${termPrompt.textContent}${cmd}`);
                if (cmd) {
                    termHistory.push(cmd);
                    termHistIdx = termHistory.length;
                }
                processTermCmd(cmd, el);
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (termHistIdx > 0) {
                    termHistIdx--;
                    termInput.value = termHistory[termHistIdx] || '';
                }
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (termHistIdx < termHistory.length - 1) {
                    termHistIdx++;
                    termInput.value = termHistory[termHistIdx] || '';
                } else {
                    termHistIdx = termHistory.length;
                    termInput.value = '';
                }
            }
        });

        el.querySelector('.vsc-term-clear').addEventListener('click', () => {
            termOutput.textContent = '';
        });

        el.querySelector('.vsc-term-close').addEventListener('click', () => {
            terminalVisible = false;
            termPanel.style.display = 'none';
        });

        function processTermCmd(cmd, el) {
            if (!cmd) return;
            const parts = cmd.split(/\s+/);
            const command = parts[0].toLowerCase();
            const args = parts.slice(1);

            switch (command) {
                case 'ls': {
                    const target = args[0] ? resolveTermPath(args[0]) : [...termCwd];
                    const node = FileSystem.readDirectory(target);
                    if (!node) { termPrint(`ls: cannot access '${args[0] || '.'}': No such directory`); break; }
                    const items = Object.keys(node).filter(n => !n.startsWith('.'));
                    const colored = items.map(n => node[n].type === 'folder' ? `\x1b[34m${n}\x1b[0m` : n);
                    termPrint(colored.join('  '));
                    break;
                }
                case 'cd': {
                    if (!args[0] || args[0] === '~') {
                        termCwd = ['/', 'users', 'default'];
                    } else if (args[0] === '/') {
                        termCwd = ['/'];
                    } else {
                        const target = resolveTermPath(args[0]);
                        const node = FileSystem.readDirectory(target);
                        if (!node) { termPrint(`cd: no such file or directory: ${args[0]}`); break; }
                        termCwd = target;
                    }
                    updateTermPrompt();
                    break;
                }
                case 'pwd':
                    termPrint(termCwd.join('/'));
                    break;
                case 'cat': {
                    if (!args[0]) { termPrint('cat: missing file operand'); break; }
                    const target = resolveTermPath(args[0]);
                    const content = FileSystem.readFile(target);
                    if (content === null) { termPrint(`cat: ${args[0]}: No such file`); break; }
                    termPrint(content);
                    break;
                }
                case 'mkdir': {
                    if (!args[0]) { termPrint('mkdir: missing operand'); break; }
                    const target = resolveTermPath(args[0]);
                    const parent = target.slice(0, -1);
                    const name = target[target.length - 1];
                    if (!FileSystem.itemExists(parent)) { termPrint(`mkdir: cannot create directory '${args[0]}': No such file or directory`); break; }
                    FileSystem.createFolder(parent, name);
                    termPrint(`Created directory: ${args[0]}`);
                    refreshTree(el);
                    break;
                }
                case 'touch':
                case 'write': {
                    if (!args[0]) { termPrint(`${command}: missing file operand`); break; }
                    const target = resolveTermPath(args[0]);
                    const parent = target.slice(0, -1);
                    const name = target[target.length - 1];
                    const content = args.slice(1).join(' ');
                    if (!FileSystem.itemExists(parent)) { termPrint(`${command}: cannot create '${args[0]}': No such file or directory`); break; }
                    if (FileSystem.itemExists(target)) {
                        FileSystem.writeFile(target, content);
                    } else {
                        FileSystem.createFile(parent, name, content);
                    }
                    termPrint(`Written: ${args[0]}`);
                    refreshTree(el);
                    break;
                }
                case 'rm': {
                    if (!args[0]) { termPrint('rm: missing operand'); break; }
                    const target = resolveTermPath(args[0]);
                    if (!FileSystem.itemExists(target)) { termPrint(`rm: ${args[0]}: No such file`); break; }
                    FileSystem.removeItem(target);
                    termPrint(`Removed: ${args[0]}`);
                    openTabs = openTabs.filter(t => t.path !== target.join('/'));
                    if (activeTab && activeTab.path === target.join('/')) {
                        activeTab = openTabs[openTabs.length - 1] || null;
                        renderTabs(el);
                        renderEditor(el);
                    }
                    refreshTree(el);
                    break;
                }
                case 'clear':
                    termOutput.textContent = '';
                    break;
                case 'echo':
                    termPrint(args.join(' '));
                    break;
                case 'help':
                    termPrint('Available commands: ls, cd, pwd, cat, mkdir, touch, rm, echo, clear, help');
                    break;
                default:
                    termPrint(`${command}: command not found. Type 'help' for available commands.`);
            }
        }

        function refreshTree(el) {
            const sidebarContent = el.querySelector('.vsc-sidebar-content');
            sidebarContent.innerHTML = buildTree(['/', 'users', 'default']);
            setupFileTreeEvents(el);
        }

        el.querySelector('.vsc-statusbar').addEventListener('dblclick', toggleTerminal);

        el.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === '`') {
                e.preventDefault();
                toggleTerminal();
            }
        });
    }

    return { launch, icon };
})();

export default VSCode;
