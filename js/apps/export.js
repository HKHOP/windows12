import WindowManager from '../modules/windowManager.js';
import FileSystem from '../modules/fileSystem.js';
import AppIcons from '../modules/appIcons.js';

const ExportImport = (() => {
    const icon = AppIcons.get('export');

    function getContent() {
        return `
            <div style="display:flex;flex-direction:column;height:100%;">
                <div style="display:flex;background:#2d2d2d;border-bottom:1px solid #3d3d3d;">
                    <button class="exp-tab active" data-tab="import" style="flex:1;padding:10px;background:none;border:none;border-bottom:2px solid #0078D4;color:#fff;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15V3m0 12l-4-4m4 4l4-4"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>
                        Import
                    </button>
                    <button class="exp-tab" data-tab="export" style="flex:1;padding:10px;background:none;border:none;border-bottom:2px solid transparent;color:#888;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0l-4-4m4 4l4-4"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>
                        Export
                    </button>
                </div>
                <div class="exp-content" style="flex:1;overflow-y:auto;padding:20px;">
                    <div class="exp-import-panel">
                        <div class="exp-dropzone" style="border:2px dashed #3d3d3d;border-radius:12px;padding:40px 20px;text-align:center;cursor:pointer;transition:all 0.2s;margin-bottom:20px;">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.5" style="margin-bottom:12px;">
                                <path d="M12 15V3m0 12l-4-4m4 4l4-4"/>
                                <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/>
                            </svg>
                            <div style="color:#888;font-size:14px;margin-bottom:8px;">Drop files here or click to browse</div>
                            <div style="color:#666;font-size:12px;">Supports images, documents, audio, video, and any file type</div>
                            <input type="file" class="exp-file-input" multiple style="display:none;">
                        </div>
                        <div class="exp-import-options" style="background:#252526;border:1px solid #3d3d3d;border-radius:8px;padding:16px;margin-bottom:20px;">
                            <div style="font-size:13px;font-weight:500;color:#ccc;margin-bottom:12px;">Import to:</div>
                            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                                <button class="exp-path-btn active" data-path="/users/default/Desktop" style="padding:6px 12px;background:rgba(0,120,212,0.2);border:1px solid #0078D4;border-radius:6px;color:#ccc;font-size:12px;cursor:pointer;">Desktop</button>
                                <button class="exp-path-btn" data-path="/users/default/Documents" style="padding:6px 12px;background:#3c3c3c;border:1px solid #555;border-radius:6px;color:#ccc;font-size:12px;cursor:pointer;">Documents</button>
                                <button class="exp-path-btn" data-path="/users/default/Downloads" style="padding:6px 12px;background:#3c3c3c;border:1px solid #555;border-radius:6px;color:#ccc;font-size:12px;cursor:pointer;">Downloads</button>
                                <button class="exp-path-btn" data-path="/users/default/Pictures" style="padding:6px 12px;background:#3c3c3c;border:1px solid #555;border-radius:6px;color:#ccc;font-size:12px;cursor:pointer;">Pictures</button>
                                <button class="exp-path-btn" data-path="/users/default/Music" style="padding:6px 12px;background:#3c3c3c;border:1px solid #555;border-radius:6px;color:#ccc;font-size:12px;cursor:pointer;">Music</button>
                                <button class="exp-path-btn" data-path="/users/default/Videos" style="padding:6px 12px;background:#3c3c3c;border:1px solid #555;border-radius:6px;color:#ccc;font-size:12px;cursor:pointer;">Videos</button>
                            </div>
                            <div style="margin-top:12px;display:flex;align-items:center;gap:8px;">
                                <span style="color:#888;font-size:12px;">Custom path:</span>
                                <input type="text" class="exp-custom-path" placeholder="/users/default/..." style="flex:1;padding:6px 10px;background:#3c3c3c;border:1px solid #555;border-radius:4px;color:#ccc;font-size:12px;outline:none;">
                            </div>
                        </div>
                        <button class="exp-import-btn" disabled style="width:100%;padding:12px;background:#0078D4;border:none;border-radius:6px;color:white;font-size:13px;font-weight:500;cursor:not-allowed;opacity:0.5;">Import Files</button>
                        <div class="exp-import-status" style="margin-top:12px;font-size:12px;color:#888;"></div>
                    </div>
                    <div class="exp-export-panel" style="display:none;">
                        <div style="background:#252526;border:1px solid #3d3d3d;border-radius:8px;padding:16px;margin-bottom:20px;">
                            <div style="font-size:13px;font-weight:500;color:#ccc;margin-bottom:12px;">Select files to export:</div>
                            <div class="exp-file-tree" style="max-height:300px;overflow-y:auto;background:#1e1e1e;border-radius:6px;padding:8px;"></div>
                        </div>
                        <button class="exp-export-btn" disabled style="width:100%;padding:12px;background:#0078D4;border:none;border-radius:6px;color:white;font-size:13px;font-weight:500;cursor:not-allowed;opacity:0.5;">Download Selected</button>
                        <div class="exp-export-status" style="margin-top:12px;font-size:12px;color:#888;"></div>
                    </div>
                </div>
            </div>
        `;
    }

    function launch() {
        const win = WindowManager.createWindow('export', 'Ex/port', icon, getContent(), { width: 600, height: 500 });
        const el = win.element;

        let selectedFiles = [];
        let importPath = '/users/default/Desktop';
        let exportSelection = new Set();

        const dropzone = el.querySelector('.exp-dropzone');
        const fileInput = el.querySelector('.exp-file-input');
        const importBtn = el.querySelector('.exp-import-btn');
        const importStatus = el.querySelector('.exp-import-status');
        const exportBtn = el.querySelector('.exp-export-btn');
        const exportStatus = el.querySelector('.exp-export-status');
        const fileTree = el.querySelector('.exp-file-tree');

        el.querySelectorAll('.exp-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                el.querySelectorAll('.exp-tab').forEach(t => {
                    t.style.borderBottomColor = 'transparent';
                    t.style.color = '#888';
                    t.classList.remove('active');
                });
                tab.style.borderBottomColor = '#0078D4';
                tab.style.color = '#fff';
                tab.classList.add('active');
                const tabId = tab.dataset.tab;
                el.querySelector('.exp-import-panel').style.display = tabId === 'import' ? '' : 'none';
                el.querySelector('.exp-export-panel').style.display = tabId === 'export' ? '' : 'none';
                if (tabId === 'export') renderExportTree();
            });
        });

        dropzone.addEventListener('click', () => fileInput.click());
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = '#0078D4';
            dropzone.style.background = 'rgba(0,120,212,0.1)';
        });
        dropzone.addEventListener('dragleave', () => {
            dropzone.style.borderColor = '#3d3d3d';
            dropzone.style.background = '';
        });
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = '#3d3d3d';
            dropzone.style.background = '';
            handleFiles(e.dataTransfer.files);
        });
        fileInput.addEventListener('change', () => handleFiles(fileInput.files));

        function handleFiles(files) {
            selectedFiles = Array.from(files);
            if (selectedFiles.length > 0) {
                dropzone.innerHTML = `
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" stroke-width="2" style="margin-bottom:8px;">
                        <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                        <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                    <div style="color:#4CAF50;font-size:14px;margin-bottom:4px;">${selectedFiles.length} file(s) selected</div>
                    <div style="color:#888;font-size:12px;">${selectedFiles.map(f => f.name).join(', ')}</div>
                `;
                importBtn.disabled = false;
                importBtn.style.cursor = 'pointer';
                importBtn.style.opacity = '1';
            }
        }

        el.querySelectorAll('.exp-path-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                el.querySelectorAll('.exp-path-btn').forEach(b => {
                    b.style.background = '#3c3c3c';
                    b.style.borderColor = '#555';
                    b.classList.remove('active');
                });
                btn.style.background = 'rgba(0,120,212,0.2)';
                btn.style.borderColor = '#0078D4';
                btn.classList.add('active');
                importPath = btn.dataset.path;
                el.querySelector('.exp-custom-path').value = '';
            });
        });

        el.querySelector('.exp-custom-path').addEventListener('input', (e) => {
            if (e.target.value) {
                el.querySelectorAll('.exp-path-btn').forEach(b => {
                    b.style.background = '#3c3c3c';
                    b.style.borderColor = '#555';
                    b.classList.remove('active');
                });
                importPath = e.target.value;
            }
        });

        importBtn.addEventListener('click', async () => {
            if (selectedFiles.length === 0) return;
            importBtn.disabled = true;
            importStatus.textContent = 'Importing...';
            importStatus.style.color = '#0078D4';

            let imported = 0;
            let failed = 0;

            for (const file of selectedFiles) {
                try {
                    const pathArr = importPath.split('/').filter(Boolean);
                    const parentPath = ['/', ...pathArr];
                    
                    if (!FileSystem.itemExists(parentPath)) {
                        failed++;
                        continue;
                    }

                    const content = await readFileAsDataURL(file);
                    const ext = file.name.split('.').pop() || '';
                    
                    if (FileSystem.itemExists([...parentPath, file.name])) {
                        FileSystem.writeFile([...parentPath, file.name], content);
                    } else {
                        FileSystem.createFile(parentPath, file.name, content, ext);
                    }
                    imported++;
                } catch (e) {
                    failed++;
                }
            }

            importStatus.textContent = `Imported ${imported} file(s)${failed > 0 ? `, ${failed} failed` : ''}`;
            importStatus.style.color = imported > 0 ? '#4CAF50' : '#F44336';
            selectedFiles = [];
            fileInput.value = '';
            dropzone.innerHTML = `
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.5" style="margin-bottom:12px;">
                    <path d="M12 15V3m0 12l-4-4m4 4l4-4"/>
                    <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/>
                </svg>
                <div style="color:#888;font-size:14px;margin-bottom:8px;">Drop files here or click to browse</div>
                <div style="color:#666;font-size:12px;">Supports images, documents, audio, video, and any file type</div>
            `;
            importBtn.disabled = true;
            importBtn.style.cursor = 'not-allowed';
            importBtn.style.opacity = '0.5';
        });

        function readFileAsDataURL(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }

        function renderExportTree() {
            fileTree.innerHTML = buildExportTree(['/', 'users', 'default']);
            fileTree.querySelectorAll('.exp-file-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const path = item.dataset.path;
                    const type = item.dataset.type;
                    if (type === 'file') {
                        if (exportSelection.has(path)) {
                            exportSelection.delete(path);
                            item.style.background = '';
                            item.querySelector('.exp-check').textContent = '☐';
                        } else {
                            exportSelection.add(path);
                            item.style.background = 'rgba(0,120,212,0.2)';
                            item.querySelector('.exp-check').textContent = '☑';
                        }
                        updateExportBtn();
                    }
                });
            });
        }

        function buildExportTree(path, depth = 0) {
            const node = FileSystem.getNode(path);
            if (!node || node.type !== 'folder' || !node.children) return '';
            
            let html = '';
            const entries = Object.entries(node.children)
                .filter(([name]) => !name.startsWith('.'))
                .sort(([, a], [, b]) => {
                    if (a.type === 'folder' && b.type !== 'folder') return -1;
                    if (a.type !== 'folder' && b.type === 'folder') return 1;
                    return 0;
                });

            for (const [name, item] of entries) {
                const itemPath = [...path, name].join('/');
                const isFolder = item.type === 'folder';
                const indent = depth * 16;
                
                if (isFolder) {
                    html += `
                        <div class="exp-folder" style="padding:4px 8px;padding-left:${indent + 8}px;cursor:pointer;display:flex;align-items:center;gap:6px;color:#ccc;font-size:12px;" data-path="${itemPath}">
                            <span style="color:#888;">▶</span>
                            <span>📁</span>
                            <span>${name}</span>
                        </div>
                        <div class="exp-folder-children" style="display:none;">
                            ${buildExportTree([...path, name], depth + 1)}
                        </div>
                    `;
                } else {
                    const isSelected = exportSelection.has(itemPath);
                    html += `
                        <div class="exp-file-item" data-path="${itemPath}" data-type="file" style="padding:4px 8px;padding-left:${indent + 8}px;cursor:pointer;display:flex;align-items:center;gap:6px;color:#ccc;font-size:12px;border-radius:4px;${isSelected ? 'background:rgba(0,120,212,0.2);' : ''}">
                            <span class="exp-check" style="width:16px;">${isSelected ? '☑' : '☐'}</span>
                            <span>${getFileIcon(name)}</span>
                            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</span>
                            <span style="color:#666;font-size:10px;">${formatSize(item.content ? item.content.length : 0)}</span>
                        </div>
                    `;
                }
            }
            return html;
        }

        fileTree.addEventListener('click', (e) => {
            const folder = e.target.closest('.exp-folder');
            if (folder) {
                const children = folder.nextElementSibling;
                const arrow = folder.querySelector('span:first-child');
                if (children.style.display === 'none') {
                    children.style.display = 'block';
                    arrow.textContent = '▼';
                } else {
                    children.style.display = 'none';
                    arrow.textContent = '▶';
                }
            }
        });

        function updateExportBtn() {
            const count = exportSelection.size;
            exportBtn.disabled = count === 0;
            exportBtn.style.cursor = count > 0 ? 'pointer' : 'not-allowed';
            exportBtn.style.opacity = count > 0 ? '1' : '0.5';
            exportBtn.textContent = count > 0 ? `Download ${count} file(s)` : 'Download Selected';
        }

        exportBtn.addEventListener('click', async () => {
            if (exportSelection.size === 0) return;
            exportBtn.disabled = true;
            exportStatus.textContent = 'Preparing downloads...';
            exportStatus.style.color = '#0078D4';

            let downloaded = 0;
            const files = Array.from(exportSelection);

            for (let i = 0; i < files.length; i++) {
                const pathStr = files[i];
                const pathArr = pathStr.split('/').filter(Boolean);
                const content = FileSystem.readFile(['/', ...pathArr]);
                if (content !== null) {
                    const name = pathArr[pathArr.length - 1];
                    downloadFile(name, content);
                    downloaded++;
                    if (i < files.length - 1) {
                        await new Promise(r => setTimeout(r, 300));
                    }
                }
            }

            exportBtn.disabled = false;
            updateExportBtn();
            exportStatus.textContent = `Downloaded ${downloaded} file(s)`;
            exportStatus.style.color = '#4CAF50';
        });

        function downloadFile(name, content) {
            const link = document.createElement('a');
            link.href = content;
            link.download = name;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        function getFileIcon(name) {
            const ext = name.split('.').pop().toLowerCase();
            const icons = {
                jpg: '🖼', jpeg: '🖼', png: '🖼', gif: '🖼', svg: '🖼', webp: '🖼',
                mp3: '🎵', wav: '🎵', ogg: '🎵', flac: '🎵',
                mp4: '🎬', webm: '🎬', avi: '🎬', mkv: '🎬',
                pdf: '📄', doc: '📄', docx: '📄', txt: '📄',
                zip: '📦', rar: '📦', '7z': '📦',
                js: '📜', json: '📋', html: '🌐', css: '🎨',
                exe: '⚙', bat: '⚙', cmd: '⚙'
            };
            return icons[ext] || '📄';
        }

        function formatSize(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
        }
    }

    return { launch, icon };
})();

export default ExportImport;
