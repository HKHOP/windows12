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
    let clipboard = null;
    let clipboardAction = 'copy';

    function getContent() {
        return `
            <div style="display:flex;flex-direction:column;height:100%;">
                <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(0,0,0,0.15);border-bottom:1px solid rgba(255,255,255,0.06);">
                    <button class="fe-back" style="background:none;border:none;color:#888;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:16px;" disabled>&#9664;</button>
                    <button class="fe-forward" style="background:none;border:none;color:#888;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:16px;" disabled>&#9654;</button>
                    <button class="fe-up" style="background:none;border:none;color:#ccc;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:16px;">&#9650;</button>
                    <input type="text" class="fe-path" style="flex:1;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:4px;padding:6px 10px;font-size:13px;color:#ccc;outline:none;" value="This PC" spellcheck="false">
                    <input type="text" class="fe-search" placeholder="Search" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:4px;padding:6px 10px;font-size:13px;color:#ccc;width:160px;outline:none;">
                </div>
                <div style="display:flex;flex:1;overflow:hidden;">
                    <div class="fe-sidebar" style="width:200px;background:rgba(0,0,0,0.15);border-right:1px solid rgba(255,255,255,0.06);padding:8px;overflow-y:auto;">
                        ${buildSidebar()}
                    </div>
                    <div class="fe-content" style="flex:1;padding:8px;overflow-y:auto;display:flex;flex-wrap:wrap;align-content:flex-start;gap:4px;position:relative;"></div>
                </div>
                <div class="fe-statusbar" style="padding:4px 12px;border-top:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;font-size:12px;color:#666;">
                    <span class="fe-count">0 items</span>
                    <span class="fe-path-text"></span>
                </div>
                <div class="fe-progress-bar" style="display:none;height:3px;background:rgba(255,255,255,0.06);">
                    <div class="fe-progress-fill" style="height:100%;background:var(--accent-color);width:0%;transition:width 0.3s;"></div>
                </div>
            </div>
        `;
    }

    function buildSidebar() {
        const items = [
            { name: 'Home', icon: '🏠', path: ['/', 'users', 'default'] },
            { name: 'Desktop', icon: '🖥️', path: ['/', 'users', 'default', 'Desktop'] },
            { name: 'Documents', icon: '📄', path: ['/', 'users', 'default', 'Documents'] },
            { name: 'Downloads', icon: '⬇️', path: ['/', 'users', 'default', 'Downloads'] },
            { name: 'Pictures', icon: '🖼️', path: ['/', 'users', 'default', 'Pictures'] },
            { name: 'Music', icon: '🎵', path: ['/', 'users', 'default', 'Music'] },
            { name: 'Videos', icon: '🎬', path: ['/', 'users', 'default', 'Videos'] },
            { name: 'Recycle Bin', icon: '🗑️', path: ['/', 'system', '$Recycle.Bin'] },
            'separator',
            { name: 'This PC', icon: '💻', path: ['__thispc__'] }
        ];
        return items.map(i => {
            if (i === 'separator') return '<div style="height:1px;background:rgba(255,255,255,0.06);margin:6px 0;"></div>';
            return `
                <div class="fe-sidebar-item" style="padding:6px 10px;border-radius:4px;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:8px;transition:background 0.12s;" data-path='${JSON.stringify(i.path)}'>
                    <span style="font-size:14px;">${i.icon}</span>${i.name}
                </div>
            `;
        }).join('');
    }

    async function getStorageInfo() {
        let used = 0;
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                used += localStorage.getItem(key).length * 2;
            }
        }
        let quota = 0;
        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            quota = estimate.quota || 0;
        }
        return { used, quota };
    }

    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function showThisPC(win) {
        const contentEl = win.element.querySelector('.fe-content');
        const countEl = win.element.querySelector('.fe-count');
        const pathEl = win.element.querySelector('.fe-path');
        const pathText = win.element.querySelector('.fe-path-text');

        pathEl.value = 'This PC';
        pathText.textContent = 'This PC';
        countEl.textContent = '';
        contentEl.innerHTML = '<div style="width:100%;text-align:center;padding:40px;color:var(--text-secondary);">Loading storage info...</div>';

        getStorageInfo().then(info => {
            const usedPercent = info.quota > 0 ? ((info.used / info.quota) * 100).toFixed(1) : 0;
            const freePercent = info.quota > 0 ? (100 - usedPercent).toFixed(1) : 0;

            contentEl.innerHTML = `
                <div style="width:100%;padding:16px;">
                    <div style="font-size:14px;font-weight:600;margin-bottom:16px;color:var(--text-primary);">Devices and drives</div>
                    <div class="drive-item" style="display:flex;align-items:center;gap:16px;padding:16px;border:1px solid var(--window-border);border-radius:8px;cursor:pointer;transition:background 0.12s;max-width:320px;">
                        <div style="font-size:40px;">💿</div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:13px;font-weight:500;margin-bottom:6px;color:var(--text-primary);">Local Disk (C:)</div>
                            <div style="height:16px;background:rgba(255,255,255,0.06);border-radius:8px;overflow:hidden;margin-bottom:4px;">
                                <div style="height:100%;width:${usedPercent}%;background:linear-gradient(90deg,#0078D4,#00a8e8);border-radius:8px;transition:width 0.3s;"></div>
                            </div>
                            <div style="font-size:11px;color:var(--text-secondary);">${formatBytes(info.used)} used of ${formatBytes(info.quota)} (${usedPercent}% used, ${freePercent}% free)</div>
                        </div>
                    </div>
                </div>
            `;

            const driveItem = contentEl.querySelector('.drive-item');
            driveItem.addEventListener('mouseenter', () => driveItem.style.background = 'rgba(255,255,255,0.04)');
            driveItem.addEventListener('mouseleave', () => driveItem.style.background = 'transparent');
            driveItem.addEventListener('click', () => navigate(win, ['/']));
        });
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

        const displayPath = formatPath(path);
        pathEl.value = displayPath;
        pathEl.dataset.rawPath = path.join('/');
        pathText.textContent = displayPath;
        backBtn.disabled = historyIndex <= 0;
        forwardBtn.disabled = historyIndex >= pathHistory.length - 1;
        upBtn.disabled = path.length <= 1;

        const entries = FileSystem.getChildren(path);
        entries.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });

        contentEl.innerHTML = '';

        contentEl.addEventListener('contextmenu', (e) => {
            if (e.target !== contentEl) return;
            e.preventDefault();
            const menuItems = [
                { label: 'New folder', icon: '📁', action: () => createNewFolder(win, path) },
                { label: 'New text file', icon: '📄', action: () => createNewFile(win, path) },
                'separator'
            ];
            if (clipboard) {
                menuItems.push({ label: `Paste (${clipboardAction === 'copy' ? 'Ctrl+V' : 'Ctrl+X'})`, icon: '📋', action: () => pasteItems(win, path) });
            }
            ContextMenu.show(e.clientX, e.clientY, menuItems);
        });

        if (entries.length === 0) {
            contentEl.innerHTML = '<div style="width:100%;text-align:center;padding:60px 20px;color:#666;font-size:14px;">This folder is empty</div>';
            countEl.textContent = '0 items';
            return;
        }

        entries.forEach(entry => {
            const isDir = entry.type === 'folder';
            const item = document.createElement('div');
            item.className = 'fe-item';
            item.draggable = true;
            item.dataset.name = entry.name;
            item.dataset.type = entry.type;
            item.dataset.ext = entry.ext || '';
            item.style.cssText = 'width:90px;padding:8px;border-radius:6px;cursor:pointer;text-align:center;transition:background 0.12s;position:relative;';
            item.innerHTML = `
                <div style="font-size:32px;margin-bottom:4px;">${isDir ? getFolderIcon(entry.name) : getFileIcon(entry.ext, entry.name)}</div>
                <div style="font-size:12px;word-break:break-all;line-height:1.3;">${entry.name}</div>
            `;

            item.addEventListener('mouseenter', () => item.style.background = 'rgba(255,255,255,0.06)');
            item.addEventListener('mouseleave', () => item.style.background = 'transparent');

            item.addEventListener('dblclick', () => {
                if (isDir) {
                    navigate(win, [...path, entry.name]);
                } else {
                    openFileWithDefaultApp([...path, entry.name], entry);
                }
            });

            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const itemPath = [...path, entry.name];
                const menuItems = isDir ? [
                    { label: 'Open', icon: '📂', action: () => navigate(win, itemPath) },
                    'separator',
                    { label: 'Cut (Ctrl+X)', icon: '✂', action: () => { clipboard = { path: itemPath, name: entry.name, type: entry.type }; clipboardAction = 'cut'; } },
                    { label: 'Copy (Ctrl+C)', icon: '📋', action: () => { clipboard = { path: itemPath, name: entry.name, type: entry.type }; clipboardAction = 'copy'; } },
                    'separator',
                    { label: 'Rename', icon: '✏', action: () => renameItem(win, itemPath) },
                    { label: 'Delete', icon: '🗑', action: () => deleteItem(win, itemPath) },
                    'separator',
                    { label: 'Properties', icon: 'ℹ', action: () => showProperties(entry, itemPath) }
                ] : [
                    { label: 'Open', icon: '📝', action: () => openFileWithDefaultApp(itemPath, entry) },
                    { label: 'Open With...', icon: '📂', action: () => showOpenWithMenu(itemPath, entry) },
                    'separator',
                    { label: 'Cut (Ctrl+X)', icon: '✂', action: () => { clipboard = { path: itemPath, name: entry.name, type: entry.type }; clipboardAction = 'cut'; } },
                    { label: 'Copy (Ctrl+C)', icon: '📋', action: () => { clipboard = { path: itemPath, name: entry.name, type: entry.type }; clipboardAction = 'copy'; } },
                    'separator',
                    { label: 'Rename', icon: '✏', action: () => renameItem(win, itemPath) },
                    { label: 'Delete', icon: '🗑', action: () => deleteItem(win, itemPath) },
                    'separator',
                    { label: 'Properties', icon: 'ℹ', action: () => showProperties(entry, itemPath) }
                ];
                ContextMenu.show(e.clientX, e.clientY, menuItems);
            });

            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', JSON.stringify({ path: itemPath, name: entry.name, type: entry.type, ext: entry.ext }));
                e.dataTransfer.effectAllowed = 'move';
                item.style.opacity = '0.5';
            });

            item.addEventListener('dragend', () => {
                item.style.opacity = '1';
            });

            if (isDir) {
                item.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = clipboardAction === 'cut' ? 'move' : 'copy';
                    item.style.background = 'rgba(0,120,212,0.2)';
                    item.style.outline = '2px solid var(--accent-color)';
                });
                item.addEventListener('dragleave', () => {
                    item.style.background = 'transparent';
                    item.style.outline = 'none';
                });
                item.addEventListener('drop', (e) => {
                    e.preventDefault();
                    item.style.background = 'transparent';
                    item.style.outline = 'none';
                    try {
                        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                        if (data.path) {
                            const destPath = [...path, entry.name, data.name];
                            const parentPath = data.path.slice(0, -1);
                            showProgressBar(win);
                            setTimeout(() => {
                                FileSystem.renameItem(data.path, data.name);
                                navigate(win, path, false);
                                refreshIfDesktop([...path, entry.name]);
                                hideProgressBar(win);
                            }, 300);
                        }
                    } catch (err) {}
                });
            }

            contentEl.appendChild(item);
        });

        contentEl.addEventListener('dragover', (e) => {
            if (e.target === contentEl) {
                e.preventDefault();
            }
        });

        countEl.textContent = `${entries.length} item${entries.length !== 1 ? 's' : ''}`;
    }

    function showProgressBar(win) {
        const bar = win.element.querySelector('.fe-progress-bar');
        const fill = win.element.querySelector('.fe-progress-fill');
        bar.style.display = 'block';
        fill.style.width = '0%';
        setTimeout(() => fill.style.width = '60%', 10);
        setTimeout(() => fill.style.width = '90%', 200);
    }

    function hideProgressBar(win) {
        const fill = win.element.querySelector('.fe-progress-fill');
        fill.style.width = '100%';
        setTimeout(() => {
            win.element.querySelector('.fe-progress-bar').style.display = 'none';
            fill.style.width = '0%';
        }, 400);
    }

    function showOpenWithMenu(itemPath, entry) {
        const ext = entry.ext || '';
        const apps = [
            { name: 'Notepad', id: 'notepad', exts: ['txt', 'md', 'json', 'js', 'html', 'css', 'log', 'cfg'] },
            { name: 'Browser', id: 'browser', exts: ['html'] },
            { name: 'Paint', id: 'paint', exts: ['png', 'jpg', 'jpeg', 'gif', 'bmp'] },
            { name: 'Photos', id: 'photos', exts: ['png', 'jpg', 'jpeg', 'gif'] }
        ];

        const matched = apps.filter(a => a.exts.includes(ext));
        const all = [...matched, ...apps.filter(a => !matched.includes(a))];

        const items = all.map(app => ({
            label: app.name,
            icon: app.exts.includes(ext) ? '✓' : '',
            action: () => openFileWithApp(itemPath, app.id)
        }));

        ContextMenu.show(window.event.clientX, window.event.clientY, items);
    }

    function openFileWithDefaultApp(itemPath, entry) {
        const ext = entry.ext || '';
        const textExts = ['txt', 'md', 'json', 'js', 'html', 'css', 'log', 'cfg', 'xml', 'yml', 'yaml', 'csv'];
        const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'];
        if (imageExts.includes(ext)) {
            openFileWithPhotos(itemPath, entry);
        } else if (textExts.includes(ext)) {
            openFileWithNotepad(itemPath);
        } else {
            openFileWithNotepad(itemPath);
        }
    }

    function openFileWithPhotos(itemPath, entry) {
        const content = FileSystem.readFile(itemPath);
        if (content === null) return;
        const name = entry.name;
        const ext = entry.ext || '';
        UserActivity.trackFileOpen(itemPath, name);

        const viewerContent = `
            <div style="display:flex;flex-direction:column;height:100%;background:rgba(0,0,0,0.92);">
                <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);">
                    <span style="color:#ddd;font-size:13px;">${name}</span>
                </div>
                <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:20px;overflow:hidden;">
                    <img src="${content}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:4px;" alt="${name}">
                </div>
                <div style="text-align:center;padding:8px;color:#666;font-size:11px;">${ext.toUpperCase()} &middot; ${(new Blob([content]).size / 1024).toFixed(1)} KB</div>
            </div>
        `;

        WindowManager.createWindow('photos', `${name} - Photos`, '🖼️', viewerContent, { width: 700, height: 500 });
    }

    function openFileWithApp(itemPath, appId) {
        if (appId === 'notepad') {
            openFileWithNotepad(itemPath);
        } else if (appId === 'browser') {
            openFileWithBrowser(itemPath);
        } else if (appId === 'photos') {
            const entry = { name: itemPath[itemPath.length - 1], ext: itemPath[itemPath.length - 1].split('.').pop() };
            openFileWithPhotos(itemPath, entry);
        } else {
            const app = window._modules?.AppRegistry?.get(appId);
            if (app?.launch) app.launch();
        }
    }

    function getFolderIcon(name) {
        const icons = {
            'Desktop': '🖥️', 'Documents': '📄', 'Downloads': '⬇️',
            'Pictures': '🖼️', 'Music': '🎵', 'Videos': '🎬',
            'Projects': '📂', 'New Folder': '📁',
            'system': '⚙️', 'users': '👤', 'default': '👤',
            'programs data': '📦', 'Wallpapers': '🖼️', 'Screenshots': '📸',
            '$Recycle.Bin': '🗑️', 'C:': '💿'
        };
        return icons[name] || '📁';
    }

    function formatPath(path) {
        if (path.length === 0) return 'This PC';
        if (path.length === 1 && path[0] === '/') return 'Local Disk (C:)';
        if (path.join('/') === '/users/default') return 'Home';
        const nameMap = {
            'users': 'Users', 'default': 'User', 'system': 'System',
            'programs data': 'Programs Data', '$Recycle.Bin': 'Recycle Bin'
        };
        return path.map((p, i) => {
            if (i === 0) return 'Local Disk (C:)';
            return nameMap[p] || p;
        }).join(' > ');
    }

    function getFileIcon(ext, name) {
        const icons = {
            'txt': '📝', 'md': '📋', 'json': '⚙️', 'js': '📜',
            'html': '🌐', 'css': '🎨', 'png': '🖼️', 'jpg': '🖼️',
            'jpeg': '🖼️', 'gif': '🖼️', 'bmp': '🖼️', 'svg': '🖼️',
            'mp3': '🎵', 'wav': '🎵', 'ogg': '🎵',
            'mp4': '🎬', 'avi': '🎬', 'mkv': '🎬',
            'pdf': '📕', 'doc': '📘', 'docx': '📘',
            'xls': '📗', 'xlsx': '📗', 'ppt': '📙',
            'zip': '📦', 'rar': '📦', '7z': '📦',
            'exe': '⚡', 'msi': '⚡',
            'log': '📄', 'cfg': '⚙️', 'ini': '⚙️',
            'xml': '📄', 'csv': '📊', 'yml': '📄', 'yaml': '📄'
        };
        if (name === 'config.json') return '⚙️';
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
            showProgressBar(win);
            setTimeout(() => {
                FileSystem.deleteItem(itemPath);
                navigate(win, itemPath.slice(0, -1), false);
                refreshIfDesktop(itemPath);
                hideProgressBar(win);
            }, 300);
        }
    }

    function pasteItems(win, destPath) {
        if (!clipboard) return;
        showProgressBar(win);
        setTimeout(() => {
            if (clipboardAction === 'cut') {
                FileSystem.renameItem(clipboard.path, clipboard.name);
            } else {
                const content = FileSystem.readFile(clipboard.path) || '';
                FileSystem.createFile(destPath, clipboard.name, content, clipboard.ext || '');
            }
            navigate(win, destPath, false);
            hideProgressBar(win);
            clipboard = null;
        }, 300);
    }

    function showProperties(entry, itemPath) {
        const isDir = entry.type === 'folder';
        const content = `
            <div style="padding:20px;">
                <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;">
                    <div style="font-size:48px;">${isDir ? '📁' : getFileIcon(entry.ext, entry.name)}</div>
                    <div>
                        <div style="font-size:16px;font-weight:600;">${entry.name}</div>
                        <div style="font-size:13px;color:#888;">${isDir ? 'File folder' : `File (${entry.ext || 'unknown'})`}</div>
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:100px 1fr;gap:8px;font-size:13px;">
                    <span style="color:#888;">Type:</span><span>${isDir ? 'Folder' : 'File'}</span>
                    <span style="color:#888;">Location:</span><span style="word-break:break-all;">${itemPath.join(' > ')}</span>
                    ${!isDir ? `<span style="color:#888;">Size:</span><span>${formatBytes(entry.size)}</span>` : ''}
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

        textarea.addEventListener('dragover', (e) => {
            e.preventDefault();
            textarea.style.background = 'rgba(0,120,212,0.1)';
        });

        textarea.addEventListener('dragleave', () => {
            textarea.style.background = 'transparent';
        });

        textarea.addEventListener('drop', (e) => {
            e.preventDefault();
            textarea.style.background = 'transparent';
            try {
                const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                if (data.path) {
                    const fileContent = FileSystem.readFile(data.path);
                    if (fileContent !== null) {
                        textarea.value = fileContent;
                        win.element.querySelector('.window-title').textContent = `*${data.name} - Notepad`;
                    }
                }
            } catch (err) {}
        });
    }

    function openFileWithBrowser(itemPath) {
        const content = FileSystem.readFile(itemPath);
        if (content === null) return;
        const name = itemPath[itemPath.length - 1];
        UserActivity.trackFileOpen(itemPath, name);

        const displayPath = itemPath.map((p, i) => i === 0 ? 'C:' : p).join('\\');
        const secureContent = sanitizeLocalHtml(content);

        const browserIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#2196F3" stroke-width="2"/><path d="M2 12h20" stroke="#2196F3" stroke-width="1.5"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="#2196F3" stroke-width="1.5"/></svg>`;

        const content2 = `
            <div style="display:flex;flex-direction:column;height:100%;">
                <div style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:rgba(0,0,0,0.3);border-bottom:1px solid rgba(255,255,255,0.06);">
                    <span style="color:#aaa;font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${displayPath}">${displayPath}</span>
                </div>
                <iframe sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox" style="width:100%;flex:1;border:none;background:white;" srcdoc="${escapeAttr(secureContent)}"></iframe>
                <div style="padding:3px 12px;border-top:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;font-size:11px;color:#666;">
                    <span>Local file</span>
                    <span>Restricted mode</span>
                </div>
            </div>
        `;

        WindowManager.createWindow('browser', `${name} - Browser`, browserIcon, content2, { width: 800, height: 500 });
    }

    function sanitizeLocalHtml(html) {
        html = html.replace(/<script\b[^>]*\btype\s*=\s*["']module["'][^>]*>[\s\S]*?<\/script>/gi, '<!-- module script blocked -->');
        html = html.replace(/<script\b[^>]*\bsrc\s*=\s*["'][^"']*\.mjs["'][^>]*>[\s\S]*?<\/script>/gi, '<!-- module script blocked -->');
        html = html.replace(/import\s*\(/g, '/* blocked */(');
        html = html.replace(/from\s+["'][^"']*["']/g, '/* blocked */""');
        html = html.replace(/import\s+{[^}]*}\s+from/g, '/* blocked */ var');
        html = html.replace(/import\s+\w+\s+from/g, '/* blocked */ var');
        html = html.replace(/export\s+(default\s+)?/g, '/* blocked */ ');
        html = html.replace(/export\s+{[^}]*}/g, '/* blocked */');
        return html;
    }

    function escapeAttr(str) {
        return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

        navigate(win, ['/', 'users', 'default']);

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

        const pathInput = win.element.querySelector('.fe-path');
        pathInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const inputPath = pathInput.value.trim();
                const rawPath = inputPath.split('/').filter(p => p);
                if (rawPath.length === 0) rawPath.unshift('/');
                if (FileSystem.isFolder(rawPath)) {
                    navigate(win, rawPath);
                } else if (FileSystem.itemExists(rawPath)) {
                    navigate(win, rawPath.slice(0, -1));
                } else {
                    alert('Path not found: ' + inputPath);
                    pathInput.value = formatPath(pathHistory[historyIndex]);
                }
            } else if (e.key === 'Escape') {
                pathInput.value = formatPath(pathHistory[historyIndex]);
                pathInput.blur();
            }
        });

        pathInput.addEventListener('focus', () => pathInput.select());

        win.element.querySelectorAll('.fe-sidebar-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const path = JSON.parse(item.dataset.path);
                if (path[0] === '__thispc__') {
                    showThisPC(win);
                } else {
                    navigate(win, path);
                }
            });
        });

        document.addEventListener('keydown', (e) => {
            if (!win.element.contains(document.activeElement) && document.activeElement !== document.body) return;
            if (e.ctrlKey && e.key === 'c' && clipboard === null) {
                const selected = win.element.querySelector('.fe-item[style*="rgba(0,120,212"]');
                if (selected) {
                    const name = selected.dataset.name;
                    const currentPath = pathHistory[historyIndex];
                    clipboard = { path: [...currentPath, name], name, type: selected.dataset.type, ext: selected.dataset.ext };
                    clipboardAction = 'copy';
                }
            }
            if (e.ctrlKey && e.key === 'v' && clipboard) {
                const currentPath = pathHistory[historyIndex];
                pasteItems(win, currentPath);
            }
        });
    }

    return { launch };
})();

export default FileExplorer;
