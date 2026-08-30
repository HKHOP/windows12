import WindowManager from '../modules/windowManager.js';
import ContextMenu from '../modules/contextMenu.js';
import FileSystem from '../modules/fileSystem.js';
import UserActivity from '../modules/userActivity.js';
import SystemConfig from '../modules/systemConfig.js';
import DesktopIcons from '../modules/desktopIcons.js';

const FileExplorer = (() => {
    const icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 7V17C3 18.1 3.9 19 5 19H19C20.1 19 21 18.1 21 17V9C21 7.9 20.1 7 19 7H11L9 5H5C3.9 5 3 5.9 3 7Z" fill="#FFC107"/><path d="M3 7H21V9H3V7Z" fill="#FFD54F"/></svg>`;

    let pathHistory = [['/']];
    let historyIndex = 0;

    function getContent() {
        return `
            <div style="display:flex;flex-direction:column;height:100%;">
                <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(0,0,0,0.15);border-bottom:1px solid rgba(255,255,255,0.06);">
                    <button class="fe-back" style="background:none;border:none;color:#888;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:16px;" disabled>&#9664;</button>
                    <button class="fe-forward" style="background:none;border:none;color:#888;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:16px;" disabled>&#9654;</button>
                    <button class="fe-up" style="background:none;border:none;color:#ccc;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:16px;">&#9650;</button>
                    <div class="fe-path" style="flex:1;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:4px;padding:6px 10px;font-size:13px;color:#ccc;">This PC</div>
                    <input type="text" class="fe-search" placeholder="Search" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:4px;padding:6px 10px;font-size:13px;color:#ccc;width:160px;outline:none;">
                </div>
                <div style="display:flex;flex:1;overflow:hidden;">
                    <div class="fe-sidebar" style="width:200px;background:rgba(0,0,0,0.15);border-right:1px solid rgba(255,255,255,0.06);padding:8px;overflow-y:auto;">
                        ${buildSidebar()}
                    </div>
                    <div class="fe-content" style="flex:1;padding:8px;overflow-y:auto;display:flex;flex-wrap:wrap;align-content:flex-start;gap:4px;"></div>
                </div>
                <div style="padding:4px 12px;border-top:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;font-size:12px;color:#666;">
                    <span class="fe-count">0 items</span>
                    <span class="fe-path-text"></span>
                </div>
            </div>
        `;
    }

    function buildSidebar() {
        const items = [
            { name: 'Home', icon: '🏠', path: ['/'] },
            { name: 'Desktop', icon: '🖥️', path: ['/', 'users', 'default', 'Desktop'] },
            { name: 'Documents', icon: '📄', path: ['/', 'users', 'default', 'Documents'] },
            { name: 'Downloads', icon: '⬇️', path: ['/', 'users', 'default', 'Downloads'] },
            { name: 'Pictures', icon: '🖼️', path: ['/', 'users', 'default', 'Pictures'] },
            { name: 'Music', icon: '🎵', path: ['/', 'users', 'default', 'Music'] },
            { name: 'Videos', icon: '🎬', path: ['/', 'users', 'default', 'Videos'] },
            { name: 'Recycle Bin', icon: '🗑️', path: ['/', 'system', '$Recycle.Bin'] },
            { name: 'System', icon: '⚙️', path: ['/', 'system'] },
            { name: 'Programs Data', icon: '📦', path: ['/', 'programs data'] }
        ];
        return items.map(i => `
            <div class="fe-sidebar-item" style="padding:6px 10px;border-radius:4px;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:8px;transition:background 0.12s;" data-path='${JSON.stringify(i.path)}'>
                <span style="font-size:14px;">${i.icon}</span>${i.name}
            </div>
        `).join('');
    }

    function navigate(win, path, addToHistory = true) {
        if (!FileSystem.isFolder(path)) return;

        if (addToHistory) {
            pathHistory = pathHistory.slice(0, historyIndex + 1);
            pathHistory.push(path);
            historyIndex = pathHistory.length - 1;
        }

        const pathEl = win.element.querySelector('.fe-path');
        const contentEl = win.element.querySelector('.fe-content');
        const countEl = win.element.querySelector('.fe-count');
        const pathText = win.element.querySelector('.fe-path-text');
        const backBtn = win.element.querySelector('.fe-back');
        const forwardBtn = win.element.querySelector('.fe-forward');
        const upBtn = win.element.querySelector('.fe-up');

        pathEl.textContent = path.join(' > ');
        pathText.textContent = path.join(' > ');
        backBtn.disabled = historyIndex <= 0;
        forwardBtn.disabled = historyIndex >= pathHistory.length - 1;
        upBtn.disabled = path.length <= 1;

        const entries = FileSystem.getChildren(path);

        // Sort: folders first, then files, alphabetical
        entries.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });

        contentEl.innerHTML = '';

        // Context menu on empty area
        contentEl.addEventListener('contextmenu', (e) => {
            if (e.target !== contentEl) return;
            e.preventDefault();
            ContextMenu.show(e.clientX, e.clientY, [
                { label: 'New folder', icon: '📁', action: () => createNewFolder(win, path) },
                { label: 'New text file', icon: '📄', action: () => createNewFile(win, path) },
                'separator',
                { label: 'Paste', icon: '📋', disabled: true },
                'separator',
                { label: 'Properties', icon: 'ℹ', disabled: true }
            ]);
        });

        // Empty state
        if (entries.length === 0) {
            contentEl.innerHTML = '<div style="width:100%;text-align:center;padding:60px 20px;color:#666;font-size:14px;">This folder is empty</div>';
            countEl.textContent = '0 items';
            return;
        }

        entries.forEach(entry => {
            const isDir = entry.type === 'folder';
            const item = document.createElement('div');
            item.className = 'fe-item';
            item.style.cssText = 'width:90px;padding:8px;border-radius:6px;cursor:pointer;text-align:center;transition:background 0.12s;';
            item.innerHTML = `
                <div style="font-size:32px;margin-bottom:4px;">${isDir ? getFolderIcon(entry.name) : getFileIcon(entry.ext)}</div>
                <div style="font-size:12px;word-break:break-all;line-height:1.3;">${entry.name}</div>
            `;
            item.addEventListener('mouseenter', () => item.style.background = 'rgba(255,255,255,0.06)');
            item.addEventListener('mouseleave', () => item.style.background = 'transparent');

            item.addEventListener('dblclick', () => {
                if (isDir) {
                    navigate(win, [...path, entry.name]);
                } else {
                    openFileWithNotepad([...path, entry.name]);
                }
            });

            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const itemPath = [...path, entry.name];
                const menuItems = isDir ? [
                    { label: 'Open', icon: '📂', action: () => navigate(win, itemPath) },
                    'separator',
                    { label: 'Rename', icon: '✏', action: () => renameItem(win, itemPath) },
                    { label: 'Delete', icon: '🗑', action: () => deleteItem(win, itemPath) },
                    'separator',
                    { label: 'Properties', icon: 'ℹ', action: () => showProperties(entry, itemPath) }
                ] : [
                    { label: 'Open with Notepad', icon: '📝', action: () => openFileWithNotepad(itemPath) },
                    'separator',
                    { label: 'Rename', icon: '✏', action: () => renameItem(win, itemPath) },
                    { label: 'Delete', icon: '🗑', action: () => deleteItem(win, itemPath) },
                    'separator',
                    { label: 'Properties', icon: 'ℹ', action: () => showProperties(entry, itemPath) }
                ];
                ContextMenu.show(e.clientX, e.clientY, menuItems);
            });

            contentEl.appendChild(item);
        });

        countEl.textContent = `${entries.length} item${entries.length !== 1 ? 's' : ''}`;
    }

    function getFolderIcon(name) {
        const icons = {
            'Desktop': '🖥️', 'Documents': '📄', 'Downloads': '⬇️',
            'Pictures': '🖼️', 'Music': '🎵', 'Videos': '🎬',
            'Projects': '📂', 'New Folder': '📁',
            'system': '⚙️', 'users': '👤', 'default': '👤',
            'programs data': '📦', 'Wallpapers': '🖼️', 'Screenshots': '📸',
            '$Recycle.Bin': '🗑️'
        };
        return icons[name] || '📁';
    }

    function getFileIcon(ext) {
        const icons = {
            'txt': '📝', 'md': '📋', 'json': '⚙️', 'js': '📜',
            'html': '🌐', 'css': '🎨', 'png': '🖼️', 'jpg': '🖼️'
        };
        return icons[ext] || '📄';
    }

    function refreshIfDesktop(path) {
        if (path.join('/').includes('/users/default/Desktop')) {
            DesktopIcons.render();
        }
    }

    function createNewFolder(win, path) {
        let name = 'New Folder';
        let i = 1;
        while (FileSystem.itemExists([...path, name])) {
            name = `New Folder (${i++})`;
        }
        FileSystem.createFolder(path, name);
        navigate(win, path, false);
        refreshIfDesktop(path);
    }

    function createNewFile(win, path) {
        let name = 'New Text Document.txt';
        let i = 1;
        while (FileSystem.itemExists([...path, name])) {
            name = `New Text Document (${i++}).txt`;
        }
        FileSystem.createFile(path, name, '', 'txt');
        navigate(win, path, false);
        refreshIfDesktop(path);
    }

    function renameItem(win, itemPath) {
        const oldName = itemPath[itemPath.length - 1];
        const newName = prompt('Enter new name:', oldName);
        if (newName && newName !== oldName) {
            FileSystem.renameItem(itemPath, newName);
            navigate(win, itemPath.slice(0, -1), false);
            refreshIfDesktop(itemPath);
        }
    }

    function deleteItem(win, itemPath) {
        const name = itemPath[itemPath.length - 1];
        if (confirm(`Delete "${name}"?`)) {
            FileSystem.deleteItem(itemPath);
            navigate(win, itemPath.slice(0, -1), false);
            refreshIfDesktop(itemPath);
        }
    }

    function showProperties(entry, itemPath) {
        const isDir = entry.type === 'folder';
        const content = `
            <div style="padding:20px;">
                <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;">
                    <div style="font-size:48px;">${isDir ? '📁' : getFileIcon(entry.ext)}</div>
                    <div>
                        <div style="font-size:16px;font-weight:600;">${entry.name}</div>
                        <div style="font-size:13px;color:#888;">${isDir ? 'File folder' : `File (${entry.ext || 'unknown'})`}</div>
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:100px 1fr;gap:8px;font-size:13px;">
                    <span style="color:#888;">Type:</span><span>${isDir ? 'Folder' : 'File'}</span>
                    <span style="color:#888;">Location:</span><span>${itemPath.join(' > ')}</span>
                    ${!isDir ? `<span style="color:#888;">Size:</span><span>${entry.size} bytes</span>` : ''}
                    ${entry.modified ? `<span style="color:#888;">Modified:</span><span>${new Date(entry.modified).toLocaleString()}</span>` : ''}
                </div>
            </div>
        `;
        WindowManager.createWindow('properties', entry.name, 'ℹ', content, { width: 420, height: 320 });
    }

    function openFileWithNotepad(itemPath) {
        const content = FileSystem.readFile(itemPath);
        if (content === null) return;
        const name = itemPath[itemPath.length - 1];
        UserActivity.trackFileOpen(itemPath, name);

        const isConfigFile = itemPath.join('/') === SystemConfig.CONFIG_PATH;

        const notepadContent = `
            <div style="display:flex;flex-direction:column;height:100%;">
                <div style="display:flex;gap:2px;padding:4px 8px;background:rgba(0,0,0,0.2);border-bottom:1px solid rgba(255,255,255,0.06);">
                    <button style="background:none;border:none;color:#ccc;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:13px;" onmouseenter="this.style.background='rgba(255,255,255,0.08)'" onmouseleave="this.style.background='none'">File</button>
                    <button style="background:none;border:none;color:#ccc;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:13px;" onmouseenter="this.style.background='rgba(255,255,255,0.08)'" onmouseleave="this.style.background='none'">Edit</button>
                    <button style="background:none;border:none;color:#ccc;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:13px;" onmouseenter="this.style.background='rgba(255,255,255,0.08)'" onmouseleave="this.style.background='none'">View</button>
                </div>
                ${isConfigFile ? '<div style="padding:4px 12px;background:rgba(0,120,212,0.15);border-bottom:1px solid rgba(0,120,212,0.2);font-size:12px;color:#4fc3f7;">System config - Ctrl+S to apply changes</div>' : ''}
                <textarea class="notepad-textarea" style="flex:1;background:transparent;border:none;color:#ddd;padding:12px 16px;resize:none;outline:none;font-family:'Consolas','Courier New',monospace;font-size:14px;line-height:1.6;" spellcheck="false">${escapeHtml(content)}</textarea>
                <div style="padding:4px 12px;border-top:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;font-size:12px;color:#666;">
                    <span class="notepad-status">Ln 1, Col 1</span>
                    <span>UTF-8</span>
                </div>
            </div>
        `;

        const notepadIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="4" y="2" width="16" height="20" rx="2" fill="#1E88E5"/><rect x="7" y="6" width="10" height="1.5" rx="0.5" fill="white"/><rect x="7" y="9.5" width="8" height="1.5" rx="0.5" fill="white"/><rect x="7" y="13" width="10" height="1.5" rx="0.5" fill="white"/></svg>`;

        const win = WindowManager.createWindow('notepad', `${name} - Notepad`, notepadIcon, notepadContent, { width: 650, height: 450 });
        const textarea = win.element.querySelector('.notepad-textarea');
        const status = win.element.querySelector('.notepad-status');

        textarea.addEventListener('input', () => updateStatus(textarea, status));
        textarea.addEventListener('click', () => updateStatus(textarea, status));
        textarea.addEventListener('keyup', () => updateStatus(textarea, status));

        textarea.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                FileSystem.writeFile(itemPath, textarea.value);
                win.element.querySelector('.window-title').textContent = `${name} - Notepad`;

                if (isConfigFile) {
                    try {
                        const parsed = JSON.parse(textarea.value);
                        SystemConfig.setMultiple(parsed);
                    } catch (err) {
                        alert('Invalid JSON config. Changes not applied.');
                    }
                }
            }
        });

        textarea.addEventListener('input', () => {
            win.element.querySelector('.window-title').textContent = `*${name} - Notepad`;
        });
    }

    function updateStatus(textarea, status) {
        const text = textarea.value.substring(0, textarea.selectionStart);
        const lines = text.split('\n');
        const ln = lines.length;
        const col = lines[lines.length - 1].length + 1;
        status.textContent = `Ln ${ln}, Col ${col}`;
    }

    function escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function launch() {
        const win = WindowManager.createWindow('fileExplorer', 'File Explorer', icon, getContent(), { width: 800, height: 500 });

        navigate(win, ['/']);

        win.element.querySelector('.fe-back').addEventListener('click', () => {
            if (historyIndex > 0) {
                historyIndex--;
                navigate(win, pathHistory[historyIndex], false);
            }
        });

        win.element.querySelector('.fe-forward').addEventListener('click', () => {
            if (historyIndex < pathHistory.length - 1) {
                historyIndex++;
                navigate(win, pathHistory[historyIndex], false);
            }
        });

        win.element.querySelector('.fe-up').addEventListener('click', () => {
            const current = pathHistory[historyIndex];
            if (current.length > 1) {
                navigate(win, current.slice(0, -1));
            }
        });

        win.element.querySelectorAll('.fe-sidebar-item').forEach(item => {
            item.addEventListener('click', () => {
                const path = JSON.parse(item.dataset.path);
                navigate(win, path);
            });
        });
    }

    return { launch };
})();

export default FileExplorer;
