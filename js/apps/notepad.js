import WindowManager from '../modules/windowManager.js';
import FileSystem from '../modules/fileSystem.js';
import ContextMenu from '../modules/contextMenu.js';
import SavePrompt from '../modules/saveprompt.js';
import AppIcons from '../modules/appIcons.js';

const Notepad = (() => {
    const icon = AppIcons.get('notepad');

    function getContent() {
        return `
            <div style="display:flex;flex-direction:column;height:100%;">
                <div style="display:flex;gap:2px;padding:4px 8px;background:rgba(0,0,0,0.2);border-bottom:1px solid rgba(255,255,255,0.06);">
                    <button class="notepad-menu-btn" data-menu="file" style="background:none;border:none;color:#ccc;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:13px;">File</button>
                    <button class="notepad-menu-btn" data-menu="edit" style="background:none;border:none;color:#ccc;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:13px;">Edit</button>
                    <button class="notepad-menu-btn" data-menu="view" style="background:none;border:none;color:#ccc;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:13px;">View</button>
                </div>
                <div class="notepad-find-bar" style="display:none;padding:6px 12px;background:rgba(0,0,0,0.15);border-bottom:1px solid rgba(255,255,255,0.06);align-items:center;gap:8px;">
                    <input type="text" class="notepad-find-input" placeholder="Find..." style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:4px;padding:4px 8px;font-size:13px;color:#ccc;outline:none;width:200px;">
                    <label style="font-size:12px;color:#888;display:flex;align-items:center;gap:4px;cursor:pointer;">
                        <input type="checkbox" class="notepad-find-case" style="accent-color:var(--accent-color);"> Match case
                    </label>
                    <button class="notepad-find-prev" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);border-radius:4px;padding:3px 8px;color:#ccc;cursor:pointer;font-size:12px;">Prev</button>
                    <button class="notepad-find-next" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);border-radius:4px;padding:3px 8px;color:#ccc;cursor:pointer;font-size:12px;">Next</button>
                    <span class="notepad-find-count" style="font-size:12px;color:#888;min-width:60px;"></span>
                    <button class="notepad-find-close" style="background:none;border:none;color:#888;cursor:pointer;font-size:16px;padding:2px 6px;">&times;</button>
                </div>
                <textarea class="notepad-textarea" style="flex:1;background:transparent;border:none;color:#ddd;padding:12px 16px;resize:none;outline:none;font-family:'Consolas','Courier New',monospace;font-size:14px;line-height:1.6;white-space:pre;overflow-x:auto;word-break:normal;" placeholder="Start typing..." spellcheck="false"></textarea>
                <div style="padding:4px 12px;border-top:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;font-size:12px;color:#666;">
                    <span class="notepad-status">Ln 1, Col 1</span>
                    <div style="display:flex;gap:12px;">
                        <span class="notepad-zoom-label">100%</span>
                        <span>UTF-8</span>
                    </div>
                </div>
            </div>
        `;
    }

    function launch(filePath, fileName) {
        const title = fileName ? `${fileName} - Notepad` : 'Untitled - Notepad';
        const existingContent = filePath ? (FileSystem.readFile(filePath) || '') : '';

        const win = WindowManager.createWindow('notepad', title, icon, getContent(), { width: 650, height: 450 });
        const textarea = win.element.querySelector('.notepad-textarea');
        const status = win.element.querySelector('.notepad-status');
        const titleEl = win.element.querySelector('.window-title');

        let currentFilePath = filePath || null;

        textarea.value = existingContent;
        updateStatus(textarea, status);

        let wordWrap = false;
        let zoomLevel = 100;

        textarea.addEventListener('input', () => {
            updateStatus(textarea, status);
            if (!titleEl.textContent.startsWith('*')) {
                titleEl.textContent = `*${title}`;
            }
        });
        textarea.addEventListener('click', () => updateStatus(textarea, status));
        textarea.addEventListener('keyup', () => updateStatus(textarea, status));

        textarea.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                saveFile(currentFilePath, textarea, titleEl, title, (newPath) => { currentFilePath = newPath; });
            }
            if (e.ctrlKey && e.key === 'f') {
                e.preventDefault();
                toggleFindBar(win);
            }
            if (e.ctrlKey && e.key === 'h') {
                e.preventDefault();
                toggleFindBar(win);
            }
            if (e.ctrlKey && e.key === 'a') {
                e.preventDefault();
                textarea.select();
            }
            if (e.ctrlKey && e.key === 'z') {
                e.preventDefault();
                document.execCommand('undo');
            }
            if (e.ctrlKey && e.key === 'y') {
                e.preventDefault();
                document.execCommand('redo');
            }
        });

        setupMenus(win, textarea, titleEl, title, () => currentFilePath, (v) => { currentFilePath = v; }, () => wordWrap, (v) => { wordWrap = v; }, () => zoomLevel, (v) => { zoomLevel = v; });
        setupFindBar(win, textarea);
    }

    function setupMenus(win, textarea, titleEl, defaultTitle, getFilePath, setFilePath, getWordWrap, setWordWrap, getZoom, setZoom) {
        win.element.querySelectorAll('.notepad-menu-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const menuType = btn.dataset.menu;
                let items = [];

                if (menuType === 'file') {
                    items = [
                        { label: 'New', icon: '📄', action: () => {
                            textarea.value = '';
                            titleEl.textContent = 'Untitled - Notepad';
                        }},
                        { label: 'Open...', icon: '📂', action: () => openFile(win, textarea, titleEl) },
                        'separator',
                        { label: 'Save (Ctrl+S)', icon: '💾', action: () => saveFile(getFilePath(), textarea, titleEl, defaultTitle, setFilePath) },
                        { label: 'Save As...', icon: '💾', action: () => saveAsNewFile(textarea, titleEl, defaultTitle, setFilePath) },
                        'separator',
                        { label: 'Close', icon: '✕', action: () => WindowManager.closeWindow(win.id) }
                    ];
                } else if (menuType === 'edit') {
                    items = [
                        { label: 'Undo (Ctrl+Z)', icon: '↶', action: () => document.execCommand('undo') },
                        { label: 'Redo (Ctrl+Y)', icon: '↷', action: () => document.execCommand('redo') },
                        'separator',
                        { label: 'Cut (Ctrl+X)', icon: '✂', action: async () => {
                            const start = textarea.selectionStart;
                            const end = textarea.selectionEnd;
                            if (start !== end) {
                                const text = textarea.value.substring(start, end);
                                try { await navigator.clipboard.writeText(text); } catch {}
                                textarea.value = textarea.value.substring(0, start) + textarea.value.substring(end);
                                textarea.selectionStart = textarea.selectionEnd = start;
                                textarea.dispatchEvent(new Event('input'));
                            }
                        }},
                        { label: 'Copy (Ctrl+C)', icon: '📋', action: async () => {
                            const text = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
                            if (text) {
                                try { await navigator.clipboard.writeText(text); } catch {}
                            }
                        }},
                        { label: 'Paste (Ctrl+V)', icon: '📋', action: async () => {
                            try {
                                const text = await navigator.clipboard.readText();
                                const start = textarea.selectionStart;
                                const end = textarea.selectionEnd;
                                textarea.value = textarea.value.substring(0, start) + text + textarea.value.substring(end);
                                textarea.selectionStart = textarea.selectionEnd = start + text.length;
                                textarea.dispatchEvent(new Event('input'));
                            } catch {}
                        }},
                        { label: 'Delete (Del)', icon: '🗑', action: () => {
                            const start = textarea.selectionStart;
                            const end = textarea.selectionEnd;
                            if (start !== end) {
                                textarea.value = textarea.value.substring(0, start) + textarea.value.substring(end);
                                textarea.selectionStart = textarea.selectionEnd = start;
                            } else if (start < textarea.value.length) {
                                textarea.value = textarea.value.substring(0, start) + textarea.value.substring(start + 1);
                                textarea.selectionStart = textarea.selectionEnd = start;
                            }
                            textarea.dispatchEvent(new Event('input'));
                        }},
                        'separator',
                        { label: 'Find (Ctrl+F)', icon: '🔍', action: () => toggleFindBar(win) },
                        { label: 'Replace (Ctrl+H)', icon: '🔄', action: () => toggleFindBar(win) },
                        'separator',
                        { label: 'Select All (Ctrl+A)', icon: '☐', action: () => textarea.select() },
                        { label: 'Time/Date (F5)', icon: '🕐', action: () => {
                            const now = new Date();
                            const ts = now.toLocaleTimeString() + ' ' + now.toLocaleDateString();
                            const start = textarea.selectionStart;
                            textarea.value = textarea.value.substring(0, start) + ts + textarea.value.substring(textarea.selectionEnd);
                            textarea.selectionStart = textarea.selectionEnd = start + ts.length;
                            textarea.dispatchEvent(new Event('input'));
                        }}
                    ];
                } else if (menuType === 'view') {
                    items = [
                        { label: `${getWordWrap() ? '✓ ' : '   '}Word Wrap`, icon: '', action: () => {
                            const newVal = !getWordWrap();
                            setWordWrap(newVal);
                            textarea.style.whiteSpace = newVal ? 'pre-wrap' : 'pre';
                            textarea.style.overflowX = newVal ? 'hidden' : 'auto';
                            textarea.style.wordBreak = newVal ? 'break-all' : 'normal';
                        }},
                        'separator',
                        { label: 'Zoom In (Ctrl++)', icon: '🔍', action: () => {
                            const z = Math.min(500, getZoom() + 10);
                            setZoom(z);
                            textarea.style.fontSize = `${z / 100 * 14}px`;
                            win.element.querySelector('.notepad-zoom-label').textContent = `${z}%`;
                        }},
                        { label: 'Zoom Out (Ctrl+-)', icon: '🔍', action: () => {
                            const z = Math.max(10, getZoom() - 10);
                            setZoom(z);
                            textarea.style.fontSize = `${z / 100 * 14}px`;
                            win.element.querySelector('.notepad-zoom-label').textContent = `${z}%`;
                        }},
                        { label: 'Reset Zoom (Ctrl+0)', icon: '🔍', action: () => {
                            setZoom(100);
                            textarea.style.fontSize = '14px';
                            win.element.querySelector('.notepad-zoom-label').textContent = '100%';
                        }}
                    ];
                }

                ContextMenu.show(e.clientX, e.clientY, items);
            });
        });
    }

    function toggleFindBar(win) {
        const findBar = win.element.querySelector('.notepad-find-bar');
        const isVisible = findBar.style.display !== 'none';
        findBar.style.display = isVisible ? 'none' : 'flex';
        if (!isVisible) {
            findBar.querySelector('.notepad-find-input').focus();
        }
    }

    function setupFindBar(win, textarea) {
        const findInput = win.element.querySelector('.notepad-find-input');
        const findCase = win.element.querySelector('.notepad-find-case');
        const findPrev = win.element.querySelector('.notepad-find-prev');
        const findNext = win.element.querySelector('.notepad-find-next');
        const findCount = win.element.querySelector('.notepad-find-count');
        const findClose = win.element.querySelector('.notepad-find-close');

        let matches = [];
        let currentMatch = -1;

        function findText() {
            const query = findInput.value;
            if (!query) {
                findCount.textContent = '';
                matches = [];
                currentMatch = -1;
                textarea.setSelectionRange(0, 0);
                return;
            }

            const text = findCase.checked ? textarea.value : textarea.value.toLowerCase();
            const search = findCase.checked ? query : query.toLowerCase();
            matches = [];
            let idx = 0;
            while ((idx = text.indexOf(search, idx)) !== -1) {
                matches.push(idx);
                idx += 1;
            }

            if (matches.length > 0) {
                currentMatch = 0;
                textarea.setSelectionRange(matches[0], matches[0] + query.length);
                textarea.focus();
                findCount.textContent = `1 of ${matches.length}`;
            } else {
                currentMatch = -1;
                findCount.textContent = 'No matches';
            }
        }

        findInput.addEventListener('input', findText);
        findCase.addEventListener('change', findText);

        findNext.addEventListener('click', () => {
            if (matches.length === 0) return;
            currentMatch = (currentMatch + 1) % matches.length;
            textarea.setSelectionRange(matches[currentMatch], matches[currentMatch] + findInput.value.length);
            textarea.focus();
            findCount.textContent = `${currentMatch + 1} of ${matches.length}`;
        });

        findPrev.addEventListener('click', () => {
            if (matches.length === 0) return;
            currentMatch = (currentMatch - 1 + matches.length) % matches.length;
            textarea.setSelectionRange(matches[currentMatch], matches[currentMatch] + findInput.value.length);
            textarea.focus();
            findCount.textContent = `${currentMatch + 1} of ${matches.length}`;
        });

        findClose.addEventListener('click', () => {
            win.element.querySelector('.notepad-find-bar').style.display = 'none';
        });

        findInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.shiftKey ? findPrev.click() : findNext.click();
            }
            if (e.key === 'Escape') {
                win.element.querySelector('.notepad-find-bar').style.display = 'none';
            }
        });
    }

    function openFile(win, textarea, titleEl) {
        const fileList = FileSystem.getChildren(['/', 'users', 'default', 'Documents']);
        const files = fileList.filter(item => {
            const ext = item.name.split('.').pop().toLowerCase();
            return ['txt', 'log', 'md', 'json', 'js', 'html', 'css', 'csv'].includes(ext);
        }).map(item => item.name);

        if (files.length === 0) {
            const toast = document.createElement('div');
            toast.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);background:var(--window-bg);border:1px solid var(--window-border);border-radius:8px;padding:10px 20px;font-size:13px;color:var(--text-primary);box-shadow:0 4px 20px rgba(0,0,0,0.3);z-index:99999;';
            toast.textContent = 'No text files found in Documents';
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 2500);
            return;
        }

        const items = files.map(name => ({
            label: name,
            icon: '📄',
            action: () => {
                const path = ['/', 'users', 'default', 'Documents', name];
                const content = FileSystem.readFile(path) || '';
                textarea.value = content;
                titleEl.textContent = `${name} - Notepad`;
                textarea.dispatchEvent(new Event('input'));
            }
        }));

        ContextMenu.show(win.element.getBoundingClientRect().left + 20, win.element.getBoundingClientRect().top + 40, items);
    }

    function saveFile(filePath, textarea, titleEl, defaultTitle, setFilePath) {
        if (filePath) {
            FileSystem.writeFile(filePath, textarea.value);
            titleEl.textContent = defaultTitle;
        } else {
            saveAsNewFile(textarea, titleEl, defaultTitle, setFilePath);
        }
    }

    function saveAsNewFile(textarea, titleEl, defaultTitle, setFilePath) {
        SavePrompt.show({
            defaultName: 'Untitled.txt',
            defaultPath: ['/', 'users', 'default', 'Documents'],
            parentApp: 'notepad'
        }).then(result => {
            if (result) {
                FileSystem.createFile(result.path, result.fullName, textarea.value, result.ext);
                setFilePath([...result.path, result.fullName]);
                titleEl.textContent = `${result.fullName} - Notepad`;
            }
        });
    }

    function updateStatus(textarea, status) {
        const text = textarea.value.substring(0, textarea.selectionStart);
        const lines = text.split('\n');
        const ln = lines.length;
        const col = lines[lines.length - 1].length + 1;
        const totalLines = textarea.value.split('\n').length;
        status.textContent = `Ln ${ln}, Col ${col} | ${totalLines} lines`;
    }

    return { launch };
})();

export default Notepad;
