import WindowManager from './windowManager.js';
import FileSystem from './fileSystem.js';
import Popup from './popup.js';

const SavePrompt = (() => {
    function buildSidebar() {
        const items = [
            { name: 'Home', icon: '🏠', path: ['/', 'users', 'default'] },
            { name: 'Desktop', icon: '🖥️', path: ['/', 'users', 'default', 'Desktop'] },
            { name: 'Documents', icon: '📄', path: ['/', 'users', 'default', 'Documents'] },
            { name: 'Downloads', icon: '⬇️', path: ['/', 'users', 'default', 'Downloads'] },
            { name: 'Pictures', icon: '🖼️', path: ['/', 'users', 'default', 'Pictures'] },
            { name: 'Music', icon: '🎵', path: ['/', 'users', 'default', 'Music'] },
            { name: 'Videos', icon: '🎬', path: ['/', 'users', 'default', 'Videos'] }
        ];
        return items.map(i => `
            <div class="save-sidebar-item" data-path='${JSON.stringify(i.path)}' style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:6px;transition:background 0.12s;">
                <span style="font-size:13px;">${i.icon}</span>${i.name}
            </div>
        `).join('');
    }

    function show(opts = {}) {
        const defaultName = opts.defaultName || 'Untitled.txt';
        const defaultPath = opts.defaultPath || ['/', 'users', 'default', 'Documents'];
        const extensions = opts.extensions || null;
        const parentApp = opts.parentApp || 'save-dialog';

        const extHtml = extensions
            ? `<select class="save-ext" style="min-width:90px;">${extensions.map(e => `<option value="${e.value}">${e.label}</option>`).join('')}</select>`
            : '';

        const dialogContent = `
            <div style="display:flex;flex-direction:column;height:100%;">
                <div style="padding:12px 16px;border-bottom:1px solid var(--window-border);background:rgba(0,0,0,0.15);">
                    <div style="font-size:14px;font-weight:500;margin-bottom:8px;">Save As</div>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <label style="font-size:12px;color:var(--text-secondary);min-width:70px;">File name:</label>
                        <input type="text" class="save-filename" value="${defaultName}" style="flex:1;background:var(--hover-bg);border:1px solid var(--window-border);border-radius:4px;padding:6px 10px;font-size:13px;color:var(--text-primary);outline:none;">
                        ${extHtml}
                    </div>
                </div>
                <div style="display:flex;flex:1;overflow:hidden;">
                    <div class="save-sidebar" style="width:160px;background:rgba(0,0,0,0.15);border-right:1px solid var(--window-border);padding:8px;overflow-y:auto;">
                        ${buildSidebar()}
                    </div>
                    <div style="flex:1;display:flex;flex-direction:column;">
                        <div style="display:flex;align-items:center;gap:6px;padding:6px 10px;background:rgba(0,0,0,0.1);border-bottom:1px solid var(--window-border);">
                            <button class="save-back" style="background:none;border:none;color:#888;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:14px;" disabled>&#9664;</button>
                            <button class="save-forward" style="background:none;border:none;color:#888;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:14px;" disabled>&#9654;</button>
                            <button class="save-up" style="background:none;border:none;color:#ccc;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:14px;">&#9650;</button>
                            <div class="save-path" style="flex:1;background:var(--hover-bg);border:1px solid var(--window-border);border-radius:4px;padding:4px 8px;font-size:12px;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></div>
                        </div>
                        <div class="save-content" style="flex:1;padding:6px;overflow-y:auto;display:flex;flex-wrap:wrap;align-content:flex-start;gap:2px;"></div>
                    </div>
                </div>
                <div style="padding:10px 16px;border-top:1px solid var(--window-border);display:flex;justify-content:flex-end;gap:8px;background:rgba(0,0,0,0.1);">
                    <button class="save-cancel-btn" style="padding:6px 20px;border:1px solid var(--window-border);background:var(--hover-bg);color:var(--text-primary);border-radius:4px;cursor:pointer;font-size:13px;">Cancel</button>
                    <button class="save-confirm-btn" style="padding:6px 20px;border:none;background:var(--accent-color);color:white;border-radius:4px;cursor:pointer;font-size:13px;">Save</button>
                </div>
            </div>
        `;

        const saveWin = WindowManager.createWindow(parentApp, 'Save As', '💾', dialogContent, { width: 550, height: 400, minWidth: 400, minHeight: 300 });
        const el = saveWin.element;

        const maxBtn = el.querySelector('.maximize-btn');
        if (maxBtn) maxBtn.remove();

        const pathEl = el.querySelector('.save-path');
        const contentEl = el.querySelector('.save-content');
        const filenameInput = el.querySelector('.save-filename');
        const backBtn = el.querySelector('.save-back');
        const forwardBtn = el.querySelector('.save-forward');
        const upBtn = el.querySelector('.save-up');

        let currentPath = defaultPath.slice();
        let pathHistory = [currentPath.slice()];
        let historyIdx = 0;
        let currentExt = extensions ? extensions[0].value : '';

        if (extensions) {
            const extSelect = el.querySelector('.save-ext');
            if (extSelect) {
                extSelect.addEventListener('change', () => {
                    currentExt = extSelect.value;
                    renderFolder();
                });
            }
        }

        function renderPath() {
            const nameMap = { 'users': 'Users', 'default': 'User', 'system': 'System', 'programs data': 'Programs Data', '$Recycle.Bin': 'Recycle Bin' };
            if (currentPath.length === 0 || (currentPath.length === 1 && currentPath[0] === '/')) {
                pathEl.textContent = 'Local Disk (C:)';
            } else if (currentPath.join('/') === '/users/default') {
                pathEl.textContent = 'Home';
            } else {
                pathEl.textContent = currentPath.map((p, i) => i === 0 ? 'Local Disk (C:)' : (nameMap[p] || p)).join(' > ');
            }
            backBtn.disabled = historyIdx <= 0;
            forwardBtn.disabled = historyIdx >= pathHistory.length - 1;
            upBtn.disabled = currentPath.length <= 1;
        }

        function navigateTo(path) {
            if (!FileSystem.isFolder(path)) return;
            currentPath = path.slice();
            pathHistory = pathHistory.slice(0, historyIdx + 1);
            pathHistory.push(currentPath.slice());
            historyIdx = pathHistory.length - 1;
            renderFolder();
        }

        function renderFolder() {
            renderPath();
            const entries = FileSystem.getChildren(currentPath);
            entries.sort((a, b) => {
                if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
                return a.name.localeCompare(b.name);
            });

            contentEl.innerHTML = '';

            const specialFolders = {
                'Desktop': '🖥️', 'Documents': '📄', 'Downloads': '⬇️',
                'Pictures': '🖼️', 'Music': '🎵', 'Videos': '🎬'
            };

            const fileIcons = {
                'txt': '📝', 'md': '📝', 'js': '📜', 'html': '📜', 'css': '📜', 'json': '📜',
                'png': '🖼️', 'jpg': '🖼️', 'jpeg': '🖼️', 'gif': '🖼️', 'webp': '🖼️', 'bmp': '🖼️', 'svg': '🖼️',
                'mp3': '🎵', 'wav': '🎵', 'ogg': '🎵',
                'mp4': '🎬', 'webm': '🎬',
                'pdf': '📄', 'doc': '📄', 'docx': '📄',
                'zip': '📦', 'rar': '📦',
                'exe': '⚙️'
            };

            entries.forEach(entry => {
                const item = document.createElement('div');
                item.style.cssText = 'width:72px;padding:6px;border-radius:4px;cursor:pointer;text-align:center;transition:background 0.1s;font-size:11px;';

                if (entry.type === 'folder') {
                    item.innerHTML = `
                        <div style="font-size:28px;margin-bottom:2px;">${specialFolders[entry.name] || '📁'}</div>
                        <div style="word-break:break-all;line-height:1.2;color:var(--text-primary);">${entry.name}</div>
                    `;
                    item.addEventListener('dblclick', () => navigateTo([...currentPath, entry.name]));
                } else {
                    if (extensions) {
                        const entryExt = entry.name.split('.').pop().toLowerCase();
                        if (entryExt !== currentExt) return;
                    }
                    const ext = entry.name.split('.').pop().toLowerCase();
                    const icon = fileIcons[ext] || '📄';
                    item.innerHTML = `
                        <div style="font-size:28px;margin-bottom:2px;">${icon}</div>
                        <div style="word-break:break-all;line-height:1.2;color:var(--text-primary);">${entry.name}</div>
                    `;
                    item.addEventListener('click', () => {
                        contentEl.querySelectorAll('div[style]').forEach(d => d.style.outline = 'none');
                        item.style.outline = '1px solid var(--accent-color)';
                        filenameInput.value = entry.name;
                    });
                }

                item.addEventListener('mouseenter', () => item.style.background = 'var(--hover-bg)');
                item.addEventListener('mouseleave', () => item.style.background = 'transparent');
                item.addEventListener('click', () => {
                    if (entry.type === 'folder') {
                        contentEl.querySelectorAll('div[style]').forEach(d => d.style.outline = 'none');
                        item.style.outline = '1px solid var(--accent-color)';
                    }
                });
                contentEl.appendChild(item);
            });

            if (entries.filter(e => e.type === 'folder').length === 0 && contentEl.children.length === 0) {
                contentEl.innerHTML = '<div style="width:100%;text-align:center;padding:30px;color:var(--text-secondary);font-size:12px;">This folder is empty</div>';
            }
        }

        backBtn.addEventListener('click', () => {
            if (historyIdx > 0) {
                historyIdx--;
                currentPath = pathHistory[historyIdx].slice();
                renderFolder();
            }
        });

        forwardBtn.addEventListener('click', () => {
            if (historyIdx < pathHistory.length - 1) {
                historyIdx++;
                currentPath = pathHistory[historyIdx].slice();
                renderFolder();
            }
        });

        upBtn.addEventListener('click', () => {
            if (currentPath.length > 1) {
                navigateTo(currentPath.slice(0, -1));
            }
        });

        el.querySelectorAll('.save-sidebar-item').forEach(item => {
            item.addEventListener('click', () => {
                const path = JSON.parse(item.dataset.path);
                navigateTo(path);
            });
        });

        el.querySelector('.save-cancel-btn').addEventListener('click', () => {
            WindowManager.closeWindow(saveWin.id);
        });

        return new Promise(resolve => {
            function doSave() {
                const name = filenameInput.value.trim() || defaultName;
                const ext = extensions ? el.querySelector('.save-ext').value : name.split('.').pop() || '';
                const fullName = extensions && !name.includes('.') ? `${name}.${ext}` : name;
                const pathDisplay = pathEl.textContent;

                const existing = FileSystem.readFile([...currentPath, fullName]);
                if (existing !== null) {
                    Popup.confirm('Replace File', `"${fullName}" already exists. Replace it?`).then(ok => {
                        if (!ok) return;
                        FileSystem.createFile(currentPath, fullName, '', ext);
                        WindowManager.closeWindow(saveWin.id);
                        showToast(`Saved "${fullName}" to ${pathDisplay}`);
                        resolve({ path: currentPath.slice(), name: fullName, fullName, ext });
                    });
                    return;
                }

                FileSystem.createFile(currentPath, fullName, '', ext);
                WindowManager.closeWindow(saveWin.id);
                showToast(`Saved "${fullName}" to ${pathDisplay}`);
                resolve({ path: currentPath.slice(), name: fullName, fullName, ext });
            }

            el.querySelector('.save-confirm-btn').addEventListener('click', doSave);

            filenameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') doSave();
                if (e.key === 'Escape') {
                    WindowManager.closeWindow(saveWin.id);
                    resolve(null);
                }
            });

            el.querySelector('.save-cancel-btn').addEventListener('click', () => resolve(null));
        });

        function showToast(msg) {
            const toast = document.createElement('div');
            toast.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);background:var(--window-bg);border:1px solid var(--window-border);border-radius:8px;padding:10px 20px;font-size:13px;color:var(--text-primary);box-shadow:0 4px 20px rgba(0,0,0,0.3);z-index:99999;animation:windowOpen 0.2s ease-out;';
            toast.textContent = msg;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 2500);
        }
    }

    return { show };
})();

export default SavePrompt;
