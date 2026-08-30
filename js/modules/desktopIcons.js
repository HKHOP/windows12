import FileSystem from './fileSystem.js';
import ContextMenu from './contextMenu.js';
import WindowManager from './windowManager.js';
import UserActivity from './userActivity.js';
import FileExplorer from '../apps/fileExplorer.js';

const DesktopIcons = (() => {
    const DESKTOP_PATH = ['/', 'users', 'default', 'Desktop'];
    const RECYCLE_BIN_PATH = ['/', 'system', '$Recycle.Bin'];
    let container;

    const RECYCLE_BIN_ICON = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none">
        <path d="M4 6H20" stroke="#888" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M8 6V4C8 3.45 8.45 3 9 3H15C15.55 3 16 3.45 16 4V6" stroke="#888" stroke-width="1.5"/>
        <path d="M5 6L6 20C6 20.55 6.45 21 7 21H17C17.55 21 18 20.55 18 20L19 6" stroke="#888" stroke-width="1.5"/>
        <path d="M10 10V16" stroke="#888" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M14 10V16" stroke="#888" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`;

    function init() {
        container = document.getElementById('desktop');
        render();
    }

    function render() {
        container.querySelectorAll('.desktop-icon').forEach(el => el.remove());

        renderRecycleBin();

        const entries = FileSystem.getChildren(DESKTOP_PATH);

        entries.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });

        const padding = 16;
        const iconW = 80;
        const iconH = 90;
        const cols = Math.floor((window.innerWidth - padding) / (iconW + padding));

        entries.forEach((entry, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = padding + col * (iconW + padding);
            const y = padding + row * (iconH + padding);

            const el = document.createElement('div');
            el.className = 'desktop-icon';
            el.style.cssText = `
                position:absolute;left:${x}px;top:${y}px;width:${iconW}px;
                padding:8px;border-radius:6px;cursor:pointer;text-align:center;
                transition:background 0.12s;user-select:none;
            `;

            const isDir = entry.type === 'folder';
            const icon = isDir ? getFolderIcon(entry.name) : getFileIcon(entry.ext);

            el.innerHTML = `
                <div style="font-size:32px;margin-bottom:4px;">${icon}</div>
                <div style="font-size:12px;word-break:break-all;line-height:1.3;color:white;text-shadow:0 1px 4px rgba(0,0,0,0.9),0 0px 8px rgba(0,0,0,0.5);">${entry.name}</div>
            `;

            el.addEventListener('mouseenter', () => el.style.background = 'rgba(255,255,255,0.1)');
            el.addEventListener('mouseleave', () => el.style.background = 'transparent');

            el.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                if (isDir) {
                    openFolderInExplorer([...DESKTOP_PATH, entry.name]);
                } else {
                    openFile([...DESKTOP_PATH, entry.name]);
                }
            });

            el.addEventListener('click', (e) => {
                e.stopPropagation();
                container.querySelectorAll('.desktop-icon').forEach(d => d.style.background = 'transparent');
                el.style.background = 'rgba(255,255,255,0.1)';
            });

            el.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                container.querySelectorAll('.desktop-icon').forEach(d => d.style.background = 'transparent');
                el.style.background = 'rgba(255,255,255,0.1)';

                const itemPath = [...DESKTOP_PATH, entry.name];
                const items = isDir ? [
                    { label: 'Open', icon: '📂', action: () => openFolderInExplorer(itemPath) },
                    'separator',
                    { label: 'Rename', icon: '✏', action: () => renameItem(itemPath) },
                    { label: 'Delete', icon: '🗑', action: () => deleteItem(itemPath) }
                ] : [
                    { label: 'Open', icon: '📄', action: () => openFile(itemPath) },
                    'separator',
                    { label: 'Rename', icon: '✏', action: () => renameItem(itemPath) },
                    { label: 'Delete', icon: '🗑', action: () => deleteItem(itemPath) }
                ];
                ContextMenu.show(e.clientX, e.clientY, items);
            });

            container.appendChild(el);
        });
    }

    function renderRecycleBin() {
        const el = document.createElement('div');
        el.className = 'desktop-icon';
        el.style.cssText = `
            position:absolute;left:16px;top:16px;width:80px;
            padding:8px;border-radius:6px;cursor:pointer;text-align:center;
            transition:background 0.12s;user-select:none;
        `;

        const items = FileSystem.getRecycleBinContent();
        const isEmpty = items.length === 0;

        el.innerHTML = `
            <div style="font-size:32px;margin-bottom:4px;">${isEmpty ? RECYCLE_BIN_ICON : RECYCLE_BIN_ICON.replace('#888', '#FF6B6B')}</div>
            <div style="font-size:12px;word-break:break-all;line-height:1.3;color:white;text-shadow:0 1px 4px rgba(0,0,0,0.9),0 0px 8px rgba(0,0,0,0.5);">Recycle Bin</div>
        `;

        el.addEventListener('mouseenter', () => el.style.background = 'rgba(255,255,255,0.1)');
        el.addEventListener('mouseleave', () => el.style.background = 'transparent');

        el.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            openRecycleBin();
        });

        el.addEventListener('click', (e) => {
            e.stopPropagation();
            container.querySelectorAll('.desktop-icon').forEach(d => d.style.background = 'transparent');
            el.style.background = 'rgba(255,255,255,0.1)';
        });

        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            container.querySelectorAll('.desktop-icon').forEach(d => d.style.background = 'transparent');
            el.style.background = 'rgba(255,255,255,0.1)';

            const items = [
                { label: 'Open', icon: '📂', action: () => openRecycleBin() },
                'separator',
                { label: 'Empty Recycle Bin', icon: '🗑', action: () => emptyRecycleBin() }
            ];
            ContextMenu.show(e.clientX, e.clientY, items);
        });

        container.appendChild(el);
    }

    function openRecycleBin() {
        const items = FileSystem.getRecycleBinContent();

        let content = '';
        if (items.length === 0) {
            content = '<div style="padding:40px;text-align:center;color:var(--text-secondary);">Recycle Bin is empty</div>';
        } else {
            content = `<div style="padding:8px;">
                <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px solid var(--window-border);margin-bottom:8px;">
                    <span style="font-size:13px;color:var(--text-secondary);">${items.length} item(s)</span>
                    <button class="rb-empty-btn" style="padding:4px 12px;border:1px solid var(--window-border);background:var(--hover-bg);color:var(--text-primary);border-radius:4px;cursor:pointer;font-size:12px;">Empty Recycle Bin</button>
                </div>
                <div style="max-height:350px;overflow-y:auto;">
                    ${items.map(item => `
                        <div class="rb-item" data-key="${item.recycleKey}" style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:4px;cursor:default;transition:background 0.12s;">
                            <span style="font-size:20px;">${item.type === 'folder' ? '📁' : '📄'}</span>
                            <div style="flex:1;min-width:0;">
                                <div style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.name}</div>
                                <div style="font-size:11px;color:var(--text-secondary);">${new Date(item.modified).toLocaleDateString()}</div>
                            </div>
                            <button class="rb-restore-btn" style="padding:2px 8px;border:1px solid var(--window-border);background:transparent;color:var(--text-primary);border-radius:3px;cursor:pointer;font-size:11px;">Restore</button>
                        </div>
                    `).join('')}
                </div>
            </div>`;
        }

        const recycleIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 6H20" stroke="#888" stroke-width="1.5" stroke-linecap="round"/><path d="M5 6L6 20C6 20.55 6.45 21 7 21H17C17.55 21 18 20.55 18 20L19 6" stroke="#888" stroke-width="1.5"/></svg>`;

        const win = WindowManager.createWindow('recycleBin', 'Recycle Bin', recycleIcon, content, { width: 500, height: 450 });

        const emptyBtn = win.element.querySelector('.rb-empty-btn');
        if (emptyBtn) {
            emptyBtn.addEventListener('click', () => {
                FileSystem.emptyRecycleBin();
                win.element.querySelector('.window-content').innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-secondary);">Recycle Bin is empty</div>';
                render();
            });
        }

        win.element.querySelectorAll('.rb-restore-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const key = e.target.closest('.rb-item').dataset.key;
                FileSystem.restoreFromRecycleBin(key);
                const itemEl = e.target.closest('.rb-item');
                itemEl.remove();
                const remaining = win.element.querySelectorAll('.rb-item').length;
                if (remaining === 0) {
                    win.element.querySelector('.window-content').innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-secondary);">Recycle Bin is empty</div>';
                }
                render();
            });
        });
    }

    function emptyRecycleBin() {
        if (confirm('Are you sure you want to permanently delete all items in the Recycle Bin?')) {
            FileSystem.emptyRecycleBin();
            render();
        }
    }

    function getFolderIcon(name) {
        const icons = {
            'New Folder': '📁', 'Projects': '📂', 'Desktop': '🖥️',
            'Documents': '📄', 'Downloads': '⬇️', 'Pictures': '🖼️'
        };
        return icons[name] || '📁';
    }

    function getFileIcon(ext) {
        const icons = {
            txt: '📝', md: '📋', json: '⚙️', js: '📜',
            html: '🌐', css: '🎨', png: '🖼️', jpg: '🖼️'
        };
        return icons[ext] || '📄';
    }

    function openFolderInExplorer(path) {
        const existing = WindowManager.getWindowsByApp('fileExplorer');
        if (existing.length > 0) {
            const win = existing[0];
            if (win.element.style.display === 'none') {
                win.element.style.display = 'flex';
            }
            WindowManager.focusWindow(win.id);
        } else {
            FileExplorer.launch();
        }
    }

    function openFile(path) {
        const content = FileSystem.readFile(path);
        if (content === null) return;
        const name = path[path.length - 1];
        UserActivity.trackFileOpen(path, name);

        const notepadIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="4" y="2" width="16" height="20" rx="2" fill="#1E88E5"/><rect x="7" y="6" width="10" height="1.5" rx="0.5" fill="white"/><rect x="7" y="9.5" width="8" height="1.5" rx="0.5" fill="white"/><rect x="7" y="13" width="10" height="1.5" rx="0.5" fill="white"/></svg>`;

        const notepadContent = `
            <div style="display:flex;flex-direction:column;height:100%;">
                <textarea class="notepad-textarea" style="flex:1;background:transparent;border:none;color:#ddd;padding:12px 16px;resize:none;outline:none;font-family:'Consolas','Courier New',monospace;font-size:14px;line-height:1.6;" spellcheck="false">${escapeHtml(content)}</textarea>
                <div style="padding:4px 12px;border-top:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;font-size:12px;color:#666;">
                    <span class="notepad-status">Ln 1, Col 1</span>
                    <span>UTF-8</span>
                </div>
            </div>
        `;

        const win = WindowManager.createWindow('notepad', `${name} - Notepad`, notepadIcon, notepadContent, { width: 650, height: 450 });
        const textarea = win.element.querySelector('.notepad-textarea');
        const status = win.element.querySelector('.notepad-status');

        textarea.addEventListener('input', () => updateStatus(textarea, status));
        textarea.addEventListener('click', () => updateStatus(textarea, status));
        textarea.addEventListener('keyup', () => updateStatus(textarea, status));

        textarea.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                FileSystem.writeFile(path, textarea.value);
                win.element.querySelector('.window-title').textContent = `${name} - Notepad`;
            }
        });
    }

    function updateStatus(textarea, status) {
        const text = textarea.value.substring(0, textarea.selectionStart);
        const lines = text.split('\n');
        status.textContent = `Ln ${lines.length}, Col ${lines[lines.length - 1].length + 1}`;
    }

    function escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function renameItem(path) {
        const oldName = path[path.length - 1];
        const newName = prompt('Enter new name:', oldName);
        if (newName && newName !== oldName) {
            FileSystem.renameItem(path, newName);
            render();
        }
    }

    function deleteItem(path) {
        const name = path[path.length - 1];
        if (confirm(`Delete "${name}"?`)) {
            FileSystem.deleteItem(path);
            render();
        }
    }

    function createNewFolder() {
        let name = 'New Folder';
        let i = 1;
        while (FileSystem.itemExists([...DESKTOP_PATH, name])) {
            name = `New Folder (${i++})`;
        }
        FileSystem.createFolder(DESKTOP_PATH, name);
        render();
    }

    function createNewFile() {
        let name = 'New Text Document.txt';
        let i = 1;
        while (FileSystem.itemExists([...DESKTOP_PATH, name])) {
            name = `New Text Document (${i++}).txt`;
        }
        FileSystem.createFile(DESKTOP_PATH, name, '', 'txt');
        render();
    }

    return { init, render, createNewFolder, createNewFile };
})();

export default DesktopIcons;
