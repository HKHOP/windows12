import WindowManager from '../modules/windowManager.js';

const FileExplorer = (() => {
    const icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 7V17C3 18.1 3.9 19 5 19H19C20.1 19 21 18.1 21 17V9C21 7.9 20.1 7 19 7H11L9 5H5C3.9 5 3 5.9 3 7Z" fill="#FFC107"/><path d="M3 7H21V9H3V7Z" fill="#FFD54F"/></svg>`;

    const fileSystem = {
        'This PC': {
            'Desktop': { 'new-folder': {}, 'notes.txt': 'file', 'screenshot.png': 'file' },
            'Documents': { 'report.docx': 'file', 'budget.xlsx': 'file', 'Projects': {} },
            'Downloads': { 'setup.exe': 'file', 'image.jpg': 'file', 'archive.zip': 'file' },
            'Pictures': { 'vacation': {}, 'wallpaper.png': 'file' },
            'Music': { 'song.mp3': 'file' },
            'Videos': { 'movie.mp4': 'file' }
        }
    };

    let currentPath = ['This PC'];

    function getContent() {
        return `
            <div style="display:flex;flex-direction:column;height:100%;">
                <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(0,0,0,0.15);border-bottom:1px solid rgba(255,255,255,0.06);">
                    <button class="fe-back" style="background:none;border:none;color:#888;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:16px;" disabled>&#9664;</button>
                    <button class="fe-forward" style="background:none;border:none;color:#888;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:16px;" disabled>&#9654;</button>
                    <button class="fe-up" style="background:none;border:none;color:#ccc;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:16px;">&#9650;</button>
                    <div class="fe-path" style="flex:1;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:4px;padding:6px 10px;font-size:13px;color:#ccc;">This PC</div>
                    <div style="position:relative;">
                        <input type="text" class="fe-search" placeholder="Search" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:4px;padding:6px 10px;font-size:13px;color:#ccc;width:160px;outline:none;">
                    </div>
                </div>
                <div style="display:flex;flex:1;overflow:hidden;">
                    <div class="fe-sidebar" style="width:200px;background:rgba(0,0,0,0.15);border-right:1px solid rgba(255,255,255,0.06);padding:8px;overflow-y:auto;">
                        ${buildSidebar()}
                    </div>
                    <div class="fe-content" style="flex:1;padding:8px;overflow-y:auto;display:flex;flex-wrap:wrap;align-content:flex-start;gap:4px;">
                    </div>
                </div>
                <div style="padding:4px 12px;border-top:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;font-size:12px;color:#666;">
                    <span class="fe-count">0 items</span>
                    <span></span>
                </div>
            </div>
        `;
    }

    function buildSidebar() {
        const items = [
            { name: 'Quick access', icon: '⭐' },
            { name: 'Desktop', icon: '🖥️' },
            { name: 'Documents', icon: '📄' },
            { name: 'Downloads', icon: '⬇️' },
            { name: 'Pictures', icon: '🖼️' },
            { name: 'Music', icon: '🎵' },
            { name: 'Videos', icon: '🎬' },
            { name: 'This PC', icon: '💻' }
        ];
        return items.map(i => `
            <div class="fe-sidebar-item" style="padding:6px 10px;border-radius:4px;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:8px;transition:background 0.12s;" data-nav="${i.name}" onmouseenter="this.style.background='rgba(255,255,255,0.06)'" onmouseleave="this.style.background='transparent'">
                <span style="font-size:14px;">${i.icon}</span>${i.name}
            </div>
        `).join('');
    }

    function navigate(win, path) {
        currentPath = path;
        const pathEl = win.element.querySelector('.fe-path');
        const contentEl = win.element.querySelector('.fe-content');
        const countEl = win.element.querySelector('.fe-count');
        const backBtn = win.element.querySelector('.fe-back');
        const upBtn = win.element.querySelector('.fe-up');

        pathEl.textContent = path.join(' > ');
        backBtn.disabled = path.length <= 1;

        let current = fileSystem;
        for (const segment of path) {
            if (current[segment]) {
                current = current[segment];
            } else {
                break;
            }
        }

        contentEl.innerHTML = '';
        const entries = Object.entries(current);
        entries.forEach(([name, value]) => {
            const isFolder = typeof value === 'object' && !Array.isArray(value);
            const item = document.createElement('div');
            item.className = 'fe-item';
            item.style.cssText = 'width:90px;padding:8px;border-radius:6px;cursor:pointer;text-align:center;transition:background 0.12s;';
            item.innerHTML = `
                <div style="font-size:32px;margin-bottom:4px;">${isFolder ? '📁' : '📄'}</div>
                <div style="font-size:12px;word-break:break-all;line-height:1.3;">${name}</div>
            `;
            item.addEventListener('mouseenter', () => item.style.background = 'rgba(255,255,255,0.06)');
            item.addEventListener('mouseleave', () => item.style.background = 'transparent');
            item.addEventListener('dblclick', () => {
                if (isFolder) {
                    navigate(win, [...path, name]);
                }
            });
            contentEl.appendChild(item);
        });

        countEl.textContent = `${entries.length} item${entries.length !== 1 ? 's' : ''}`;
    }

    function launch() {
        const win = WindowManager.createWindow('fileExplorer', 'File Explorer', icon, getContent(), { width: 800, height: 500 });

        navigate(win, currentPath);

        win.element.querySelector('.fe-back').addEventListener('click', () => {
            if (currentPath.length > 1) {
                navigate(win, currentPath.slice(0, -1));
            }
        });

        win.element.querySelector('.fe-up').addEventListener('click', () => {
            if (currentPath.length > 1) {
                navigate(win, currentPath.slice(0, -1));
            }
        });

        win.element.querySelectorAll('.fe-sidebar-item').forEach(item => {
            item.addEventListener('click', () => {
                const nav = item.dataset.nav;
                if (nav === 'This PC') {
                    navigate(win, ['This PC']);
                } else {
                    navigate(win, ['This PC', nav]);
                }
            });
        });
    }

    return { launch };
})();

export default FileExplorer;
