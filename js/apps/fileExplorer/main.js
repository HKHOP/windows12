import AppIcons from '../../modules/appIcons.js';
import UIIcons from '../../modules/uiIcons.js';
import WindowManager from '../../modules/windowManager.js';
import ContextMenu from '../../modules/contextMenu.js';
import FileSystem from '../../modules/fileSystem.js';
import UserActivity from '../../modules/userActivity.js';
import SystemConfig from '../../modules/systemConfig.js';
import Popup from '../../modules/popup.js';
import DesktopIcons from '../../modules/desktopIcons.js';
import BatchEngine from '../../modules/batchEngine.js';
import VBEngine from '../../modules/vbsEngine.js';
import FileAssociations from '../../modules/fileAssociations.js';
import Keyboard from '../../modules/keyboard.js';
import Zip from '../../modules/zip.js';
import Users from '../../modules/users.js';

const FileExplorer = (() => {
    const icon = AppIcons.get('fileExplorer');

    // Coarse-pointer / touch UI: selection checkboxes stay visible so
    // multi-select is discoverable without a keyboard (Ctrl/Shift).
    const IS_TOUCH_UI = (typeof window !== 'undefined') && (
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
        ('ontouchstart' in window) ||
        (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)
    );
    const LONG_PRESS_SELECT_MS = 550;

    const VIEW_PATH = () => Users.appData('fileExplorer', ['view.json']);
    const view = { sortBy: 'name', sortDir: 'asc', groupBy: 'none' };

    function loadView() {
        try {
            const raw = FileSystem.readFile(VIEW_PATH());
            if (raw) Object.assign(view, JSON.parse(raw));
        } catch { /* defaults stand */ }
        if (!['name', 'date', 'size', 'type'].includes(view.sortBy)) view.sortBy = 'name';
        if (!['asc', 'desc'].includes(view.sortDir)) view.sortDir = 'asc';
        if (!['none', 'type'].includes(view.groupBy)) view.groupBy = 'none';
    }

    function saveView() {
        try {
            const json = JSON.stringify(view);
            if (FileSystem.itemExists(VIEW_PATH())) FileSystem.writeFile(VIEW_PATH(), json);
            else {
                const dir = VIEW_PATH().slice(0, -1);
                if (!FileSystem.itemExists(dir)) {
                    FileSystem.createFolder(dir.slice(0, -1), dir[dir.length - 1]);
                }
                FileSystem.createFile(dir, 'view.json', json, 'json');
            }
        } catch { /* session-only */ }
    }

    const GROUP_ORDER = ['Folders', 'Documents', 'Images', 'Audio', 'Video', 'Archives', 'Other'];
    const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'];
    const AUDIO_EXTS = ['mp3', 'wav', 'ogg', 'oga', 'm4a'];
    const VIDEO_EXTS = ['mp4', 'webm'];
    const DOC_EXTS = ['txt', 'md', 'json', 'js', 'html', 'css', 'log', 'cfg', 'xml', 'yml', 'yaml', 'csv', 'cesheet', 'celsheet', 'sledge', 'sledgepoint'];

    function categoryOf(entry) {
        if (entry.type === 'folder') return 'Folders';
        const e = (entry.ext || '').toLowerCase();
        if (IMAGE_EXTS.includes(e)) return 'Images';
        if (AUDIO_EXTS.includes(e)) return 'Audio';
        if (VIDEO_EXTS.includes(e)) return 'Video';
        if (e === 'zip') return 'Archives';
        if (DOC_EXTS.includes(e)) return 'Documents';
        return 'Other';
    }

    function sortEntries(entries) {
        const dir = view.sortDir === 'desc' ? -1 : 1;
        const valOf = (e) => {
            if (view.sortBy === 'date') return e.modified || 0;
            if (view.sortBy === 'size') return (e.type === 'folder' ? -1 : (e.size || 0));
            if (view.sortBy === 'type') return e.type === 'folder' ? '0' : ('1' + (e.ext || '').toLowerCase());
            return e.name.toLowerCase();
        };
        return [...entries].sort((a, b) => {
            if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
            const va = valOf(a), vb = valOf(b);
            if (va < vb) return -1 * dir;
            if (va > vb) return 1 * dir;
            return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
        });
    }

    // Open windows by id -> { win, state }. Pruned lazily via isConnected so
    // no global WindowManager close hook is needed (main.js owns that one).
    const openWindows = new Map();

    function pruneClosedWindows() {
        for (const [id, rec] of openWindows) {
            if (!rec.win.element.isConnected) openWindows.delete(id);
        }
    }

    function focusExplorerWindow(rec) {
        if (rec.win.element.style.display === 'none') {
            rec.win.element.style.display = 'flex';
        }
        WindowManager.focusWindow(rec.win.id);
    }

    // Tabs: each window owns window-level state (tabs, active tab, clipboard,
    // search text); each tab owns navigation history + selection. Render code
    // always works with the active tab, so per-tab switching is free.
    let tabSeq = 0;
    function makeTab(path) {
        return {
            id: `tab-${++tabSeq}`,
            pathHistory: [path ? path.slice() : ['/']],
            historyIndex: 0,
            selected: new Set(),
            lastClicked: null,
            currentPath: null
        };
    }

    function activeTab(wstate) {
        if (!wstate) return null;
        return wstate.tabs.find(t => t.id === wstate.activeTabId) || wstate.tabs[0] || null;
    }

    function tabTitle(tab) {
        if (!tab || !tab.currentPath) return 'This PC';
        const p = tab.currentPath;
        return p.length <= 1 ? 'Local Disk (C:)' : p[p.length - 1];
    }

    function getContent() {
        return `
            <div style="display:flex;flex-direction:column;height:100%;">
                <div class="fe-tabs" style="display:flex;align-items:center;gap:4px;padding:6px 8px 0 8px;background:rgba(128,128,128,0.08);overflow-x:auto;flex-shrink:0;"></div>
                <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(128,128,128,0.12);border-bottom:1px solid var(--window-border);">
                    <button class="fe-back" style="background:none;border:none;color:var(--text-secondary);padding:4px 8px;border-radius:4px;cursor:pointer;font-size:16px;" disabled>&#9664;</button>
                    <button class="fe-forward" style="background:none;border:none;color:var(--text-secondary);padding:4px 8px;border-radius:4px;cursor:pointer;font-size:16px;" disabled>&#9654;</button>
                    <button class="fe-up" style="background:none;border:none;color:var(--text-primary);padding:4px 8px;border-radius:4px;cursor:pointer;font-size:16px;">&#9650;</button>
                    <div class="fe-crumbbar" title="Click an empty area to edit the path" style="flex:1;display:flex;align-items:center;gap:2px;background:rgba(128,128,128,0.12);border:1px solid rgba(128,128,128,0.3);border-radius:4px;padding:2px 6px;min-height:30px;box-sizing:border-box;overflow:hidden;">
                        <div class="fe-crumbs" style="flex:1;display:flex;align-items:center;gap:2px;overflow:hidden;white-space:nowrap;"></div>
                        <input type="text" class="fe-path" style="flex:1;display:none;background:transparent;border:none;font-size:13px;color:var(--text-primary);outline:none;min-width:0;" value="This PC" spellcheck="false">
                    </div>
                    <input type="text" class="fe-search" placeholder="Search" style="background:rgba(128,128,128,0.12);border:1px solid rgba(128,128,128,0.3);border-radius:4px;padding:6px 10px;font-size:13px;color:var(--text-primary);width:160px;outline:none;">
                    <button class="fe-preview-btn" title="Preview pane" style="background:none;border:none;color:var(--text-secondary);padding:4px 8px;border-radius:4px;cursor:pointer;font-size:15px;">&#128065;</button>
                    <button class="fe-select" title="Select: multi-select mode (touch-friendly)" style="background:none;border:none;color:var(--text-secondary);padding:4px 8px;border-radius:4px;cursor:pointer;display:inline-flex;align-items:center;">${UIIcons.action('selectAll', 15)}</button>
                    <button class="fe-sort" title="Sort and group" style="background:none;border:none;color:var(--text-secondary);padding:4px 8px;border-radius:4px;cursor:pointer;font-size:15px;">&#8645;</button>
                </div>
                <div style="display:flex;flex:1;overflow:hidden;">
                    <div class="fe-sidebar" style="width:200px;background:rgba(128,128,128,0.08);border-right:1px solid var(--window-border);padding:8px;overflow-y:auto;flex-shrink:0;">
                        ${buildSidebar()}
                    </div>
                    <div class="fe-content" style="flex:1;padding:8px;overflow-y:auto;display:flex;flex-wrap:wrap;align-content:flex-start;gap:4px;position:relative;min-width:0;"></div>
                    <div class="fe-preview" style="display:none;width:260px;flex-shrink:0;background:rgba(128,128,128,0.06);border-left:1px solid var(--window-border);padding:12px;overflow-y:auto;"></div>
                </div>
                <div class="fe-statusbar" style="padding:4px 12px;border-top:1px solid var(--window-border);display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary);">
                    <span class="fe-count">0 items</span>
                    <span class="fe-path-text"></span>
                </div>
                <div class="fe-progress-bar" style="display:none;height:3px;background:rgba(128,128,128,0.2);">
                    <div class="fe-progress-fill" style="height:100%;background:var(--accent-color);width:0%;transition:width 0.3s;"></div>
                </div>
            </div>
        `;
    }

    function buildSidebar() {
        const items = [
            { name: 'Home', path: Users.home() },
            { name: 'Desktop', path: Users.home(['Desktop']) },
            { name: 'Documents', path: Users.home(['Documents']) },
            { name: 'Downloads', path: Users.home(['Downloads']) },
            { name: 'Pictures', path: Users.home(['Pictures']) },
            { name: 'Music', path: Users.home(['Music']) },
            { name: 'Videos', path: Users.home(['Videos']) },
            { name: 'Recycle Bin', path: ['/', 'system', '$Recycle.Bin'] },
            'separator',
            { name: 'This PC', path: ['__thispc__'] }
        ];
        return items.map(i => {
            if (i === 'separator') return '<div style="height:1px;background:var(--window-border);margin:6px 0;"></div>';
            return `
                <div class="fe-sidebar-item" style="padding:6px 10px;border-radius:4px;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:8px;transition:background 0.12s;" data-path='${JSON.stringify(i.path)}'>
                    <span style="width:16px;height:16px;display:inline-flex;flex-shrink:0;">${UIIcons.sidebar(i.name, 16)}</span>${i.name}
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

    function showThisPC(win, wstate) {
        const contentEl = win.element.querySelector('.fe-content');
        const countEl = win.element.querySelector('.fe-count');
        const pathEl = win.element.querySelector('.fe-path');
        const pathText = win.element.querySelector('.fe-path-text');

        const tab = activeTab(wstate);
        if (tab) tab.currentPath = null;
        renderTabStrip(win, wstate);
        renderCrumbs(win, null);
        renderPreview(win, wstate);

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
                        <div style="width:42px;height:42px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${UIIcons.places.drive(42)}</div>
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
            driveItem.addEventListener('click', () => navigate(win, ['/'], true, wstate));
        });
    }

    function navigate(win, path, addToHistory = true, wstate) {
        if (!FileSystem.isFolder(path)) return;
        // Render code works with the ACTIVE TAB; window-level concerns
        // (search text, tab strip, crumbs) use wstate directly.
        const state = activeTab(wstate);
        if (!state) return;

        // A real move to another folder drops the in-progress search.
        if (addToHistory && state.currentPath && state.currentPath.join('/') !== path.join('/')) {
            if (wstate) wstate.search = '';
            const searchInput = win.element.querySelector('.fe-search');
            if (searchInput) searchInput.value = '';
        }

        {
            deselectAll(state);
            state.currentPath = path.slice();
            if (addToHistory) {
                state.pathHistory = state.pathHistory.slice(0, state.historyIndex + 1);
                state.pathHistory.push(path);
                state.historyIndex = state.pathHistory.length - 1;
            }
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
        win.element.dataset.currentPath = JSON.stringify(path);
        if (state) {
            backBtn.disabled = state.historyIndex <= 0;
            forwardBtn.disabled = state.historyIndex >= state.pathHistory.length - 1;
        }
        upBtn.disabled = path.length <= 1;

        renderTabStrip(win, wstate);
        renderCrumbs(win, path);

        const query = (wstate && wstate.search || '').trim().toLowerCase();
        const searchMode = query.length > 0;
        // Rows pair each entry with its real directory so recursive search
        // results can share the exact same item rendering and actions.
        let rows;
        if (searchMode) {
            rows = searchFiles(path, query).map(r => ({ entry: r.entry, base: r.base }));
            contentEl._searchDirs = {};
            contentEl._searchEntries = {};
            for (const r of rows) {
                contentEl._searchDirs[r.entry.name] = r.base;
                contentEl._searchEntries[r.entry.name] = r.entry;
            }
        } else {
            rows = sortEntries(FileSystem.getChildren(path)).map(e => ({ entry: e, base: path }));
            contentEl._searchDirs = null;
            contentEl._searchEntries = null;
        }

        contentEl.innerHTML = '';

        if (rows.length === 0) {
            contentEl.innerHTML = searchMode
                ? `<div style="width:100%;text-align:center;padding:60px 20px;color:var(--text-secondary);font-size:14px;">No results for "${query.replace(/&/g, '&amp;').replace(/</g, '&lt;')}" in this folder</div>`
                : '<div style="width:100%;text-align:center;padding:60px 20px;color:var(--text-secondary);font-size:14px;">This folder is empty</div>';
            countEl.textContent = searchMode ? '0 results' : '0 items';
            renderPreview(win, wstate);
            return;
        }

        const allNames = rows.map(r => r.entry.name);

        const appendItem = (row) => {
            const entry = row.entry;
            const basePath = row.base;
            const fullPath = [...basePath, entry.name];
            const isDir = entry.type === 'folder';
            const item = document.createElement('div');
            item.className = 'fe-item';
            item.draggable = true;
            item.dataset.name = entry.name;
            item.dataset.type = entry.type;
            item.dataset.ext = entry.ext || '';
            item.style.cssText = 'width:90px;padding:8px;border-radius:6px;cursor:pointer;text-align:center;transition:background 0.12s;position:relative;border:2px solid transparent;';
            const relDir = searchMode && basePath.join('/') !== path.join('/')
                ? `<div style="font-size:10px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${basePath.slice(path.length).join('/') || ''}</div>`
                : '';
            item.innerHTML = `
                <div style="display:flex;justify-content:center;margin-bottom:4px;">${isDir ? getFolderIcon(entry.name) : getFileIcon(entry.ext, entry.name)}</div>
                <div class="fe-label" style="font-size:12px;word-break:break-all;line-height:1.3;">${entry.name}</div>
                ${relDir}
            `;

            // Selection checkbox: always visible on touch devices, otherwise
            // only in selection mode. Tapping it toggles without leaving
            // selection mode — the touch-friendly multi-select path.
            const check = document.createElement('div');
            check.className = 'fe-check';
            check.title = 'Tap to select this item';
            check.setAttribute('aria-hidden', 'true');
            check.style.cssText = 'position:absolute;left:4px;top:4px;width:22px;height:22px;border-radius:6px;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);border:1.5px solid rgba(255,255,255,0.55);box-sizing:border-box;z-index:2;';
            check.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="display:none;"><path d="M4 12.5l5 5L20 6.5" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            item.appendChild(check);
            check.addEventListener('click', (ev) => {
                ev.stopPropagation();
                if (!state) return;
                if (!wstate.selectMode) setSelectMode(win, wstate, true);
                if (state.selected.has(entry.name)) state.selected.delete(entry.name);
                else state.selected.add(entry.name);
                state.lastClicked = entry.name;
                repaintSelection(contentEl, wstate);
                renderPreview(win, wstate);
            });

            function updateItemVisual() {
                paintItemSelection(item, !!(state && state.selected.has(entry.name)), !!(wstate && wstate.selectMode));
            }
            updateItemVisual();

            item.addEventListener('mouseenter', () => {
                if (!state || !state.selected.has(entry.name)) item.style.background = 'rgba(255,255,255,0.06)';
            });
            item.addEventListener('mouseleave', () => {
                if (!state || !state.selected.has(entry.name)) item.style.background = 'transparent';
            });

            item.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!state) return;
                // Synthetic click arriving right after a long-press select
                // must not toggle the item back.
                if (wstate._lpSuppressUntil && Date.now() < wstate._lpSuppressUntil) return;
                if (wstate.selectMode) {
                    if (state.selected.has(entry.name)) state.selected.delete(entry.name);
                    else state.selected.add(entry.name);
                    state.lastClicked = entry.name;
                } else {
                    selectItem(state, entry.name, e.ctrlKey || e.metaKey, e.shiftKey, allNames);
                }
                repaintSelection(contentEl, wstate);
                renderPreview(win, wstate);
            });

            item.addEventListener('dblclick', () => {
                // A double-tap in selection mode toggles twice; make sure
                // the opened item ends up selected.
                if (state && !state.selected.has(entry.name)) {
                    state.selected.add(entry.name);
                    state.lastClicked = entry.name;
                }
                if (isDir) {
                    if (searchMode) {
                        wstate.search = '';
                        const searchInput = win.element.querySelector('.fe-search');
                        if (searchInput) searchInput.value = '';
                    }
                    navigate(win, fullPath, true, wstate);
                } else if ((entry.ext || '').toLowerCase() === 'zip') {
                    extractZipFlow(win, fullPath, wstate);
                } else {
                    openFileWithDefaultApp(fullPath, entry);
                }
            });

            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Native menu arriving right after a long-press select: the
                // press already toggled selection, don't pop a menu over it.
                if (wstate._lpSuppressUntil && Date.now() < wstate._lpSuppressUntil) return;
                wstate._ctxMenuAt = Date.now();
                if (state && !state.selected.has(entry.name)) {
                    state.selected.clear();
                    state.selected.add(entry.name);
                    state.lastClicked = entry.name;
                    repaintSelection(contentEl, wstate);
                }
                const selCount = state ? state.selected.size : 1;
                const itemPath = fullPath;
                const multiLabel = selCount > 1 ? ` (${selCount} items)` : '';
                // Search-result rows live in other folders: clipboard and
                // bulk ops resolve each selected name to its real directory.
                const selectedFullPaths = () => [...state.selected]
                    .map(n => {
                        const dir = searchMode ? (contentEl._searchDirs || {})[n] : basePath;
                        return dir ? [...dir, n] : null;
                    })
                    .filter(Boolean);
                const copySearchSelection = (action) => {
                    const items = selectedFullPaths().map(p => {
                        const info = searchEntryInfo(win, p[p.length - 1]);
                        const e = (info && info.entry) || {};
                        return { path: p, name: p[p.length - 1], type: e.type || 'file', ext: e.ext || '' };
                    });
                    if (items.length === 0) return;
                    wstate.clipboard = items;
                    wstate.clipboardAction = action;
                    showCutFeedback(win, wstate, action === 'cut');
                };
                const pinLabel = isDir && qaContains(loadQA(), fullPath) ? 'Unpin from Quick access' : 'Pin to Quick access';
                const menuItems = isDir ? [
                    { label: 'Open', icon: UIIcons.action('open'), action: () => {
                        if (searchMode) {
                            wstate.search = '';
                            const searchInput = win.element.querySelector('.fe-search');
                            if (searchInput) searchInput.value = '';
                        }
                        navigate(win, itemPath, true, wstate);
                    } },
                    { label: pinLabel, icon: UIIcons.action('pin'), action: () => {
                        toggleQAPin(fullPath);
                        renderSidebar(win, wstate);
                    } },
                    'separator',
                    { label: `Cut${multiLabel}`, icon: UIIcons.action('cut'), action: () => { searchMode ? copySearchSelection('cut') : cutSelected(win, wstate); } },
                    { label: `Copy${multiLabel}`, icon: UIIcons.action('copy'), action: () => { searchMode ? copySearchSelection('copy') : copySelected(win, wstate); } },
                    'separator',
                    { label: 'Rename', icon: UIIcons.action('rename'), action: () => { if (selCount === 1) renameItem(win, itemPath); } },
                    { label: `Delete${multiLabel}`, icon: UIIcons.action('delete'), action: () => { searchMode ? deletePaths(win, wstate, selectedFullPaths()) : deleteSelected(win, wstate); } },
                    'separator',
                    { label: 'Properties', icon: UIIcons.action('properties'), action: () => showProperties(entry, itemPath) }
                ] : [
                    { label: 'Open', icon: UIIcons.action('open'), action: () => openFileWithDefaultApp(itemPath, entry) },
                    { label: 'Open With...', icon: UIIcons.action('openWith'), action: () => showOpenWithMenu(itemPath, entry) },
                    ...((selCount === 1 && (entry.ext || '').toLowerCase() === 'zip')
                        ? [{ label: 'Extract All…', icon: UIIcons.action('open'), action: () => extractZipFlow(win, itemPath, wstate) }]
                        : []),
                    ...(searchMode ? [] : [{ label: `Compress to ZIP file${selCount > 1 ? ` (${selCount} items)` : ''}`, icon: UIIcons.action('newFile'), action: () => compressSelection(win, path, [...state.selected], wstate) }]),
                    'separator',
                    { label: `Cut${multiLabel}`, icon: UIIcons.action('cut'), action: () => { searchMode ? copySearchSelection('cut') : cutSelected(win, wstate); } },
                    { label: `Copy${multiLabel}`, icon: UIIcons.action('copy'), action: () => { searchMode ? copySearchSelection('copy') : copySelected(win, wstate); } },
                    'separator',
                    { label: 'Rename', icon: UIIcons.action('rename'), action: () => { if (selCount === 1) { searchMode ? renameViaDialog(win, itemPath, entry.name, wstate) : renameItem(win, itemPath); } } },
                    { label: `Delete${multiLabel}`, icon: UIIcons.action('delete'), action: () => { searchMode ? deletePaths(win, wstate, selectedFullPaths()) : deleteSelected(win, wstate); } },
                    'separator',
                    { label: 'Properties', icon: UIIcons.action('properties'), action: () => showProperties(entry, itemPath) }
                ];
                ContextMenu.show(e.clientX, e.clientY, menuItems);
            });

            // Touch long-press: enter selection mode and toggle the item
            // (standard mobile multi-select). A long-press on an already
            // selected item falls through to the context menu above, so
            // touch users can still reach Cut/Copy/Delete/etc.
            let lpTimer = null;
            let lpX = 0, lpY = 0;
            const lpCancel = () => {
                if (lpTimer) {
                    clearTimeout(lpTimer);
                    lpTimer = null;
                }
            };
            item.addEventListener('touchstart', (t) => {
                lpCancel();
                if (!t.touches || t.touches.length !== 1) return;
                lpX = t.touches[0].clientX;
                lpY = t.touches[0].clientY;
                lpTimer = setTimeout(() => {
                    lpTimer = null;
                    if (!state || !wstate) return;
                    // The native long-press menu beat us to it (browser fired
                    // contextmenu first): leave the menu alone, skip toggling.
                    if (wstate._ctxMenuAt && Date.now() - wstate._ctxMenuAt < 1200) return;
                    if (wstate.selectMode && state.selected.has(entry.name)) return;
                    if (!wstate.selectMode) setSelectMode(win, wstate, true);
                    if (state.selected.has(entry.name)) state.selected.delete(entry.name);
                    else state.selected.add(entry.name);
                    state.lastClicked = entry.name;
                    wstate._lpSuppressUntil = Date.now() + 900;
                    repaintSelection(contentEl, wstate);
                    renderPreview(win, wstate);
                    try {
                        if (navigator.vibrate) navigator.vibrate(12);
                    } catch (e2) { /* noop */ }
                }, LONG_PRESS_SELECT_MS);
            }, { passive: true });
            item.addEventListener('touchmove', (t) => {
                if (!lpTimer || !t.touches || t.touches.length === 0) return;
                const dx = t.touches[0].clientX - lpX;
                const dy = t.touches[0].clientY - lpY;
                if (Math.hypot(dx, dy) > 10) lpCancel();
            }, { passive: true });
            item.addEventListener('touchend', lpCancel, { passive: true });
            item.addEventListener('touchcancel', lpCancel, { passive: true });

            item.addEventListener('dragstart', (e) => {
                // Drag the whole selection when the dragged item is part of
                // it, otherwise just the one item. `path`/`name` stay for
                // legacy consumers (Notepad text drop reads data.path).
                const names = (state && state.selected.size > 0 && state.selected.has(entry.name))
                    ? [...state.selected]
                    : [entry.name];
                e.dataTransfer.setData('text/plain', JSON.stringify({ names, from: basePath, path: fullPath, name: entry.name, type: entry.type, ext: entry.ext }));
                e.dataTransfer.effectAllowed = 'move';
                item.style.opacity = '0.5';
            });

            item.addEventListener('dragend', () => {
                item.style.opacity = '1';
            });

            if (isDir) {
                item.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = wstate && wstate.clipboardAction === 'cut' ? 'move' : 'copy';
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
                    if (data && Array.isArray(data.names) && Array.isArray(data.from)) {
                        moveNamesWithProgress(win, fullPath, data.from, data.names, path, wstate);
                    }
                } catch (err) {}
            });
            }

            contentEl.appendChild(item);
        };

        if (view.groupBy === 'type' && !searchMode) {
            for (const g of GROUP_ORDER) {
                const members = rows.filter(r => categoryOf(r.entry) === g);
                if (members.length === 0) continue;
                const header = document.createElement('div');
                header.style.cssText = 'width:100%;font-size:12px;font-weight:600;color:var(--text-secondary);padding:10px 4px 2px;';
                header.textContent = g;
                contentEl.appendChild(header);
                members.forEach(appendItem);
            }
        } else {
            rows.forEach(appendItem);
        }

        countEl.textContent = searchMode
            ? `${rows.length} result${rows.length !== 1 ? 's' : ''}`
            : `${rows.length} item${rows.length !== 1 ? 's' : ''}`;

        function updateItemCount() {
            const selSize = state ? state.selected.size : 0;
            countEl.textContent = selSize > 0
                ? `${selSize} of ${rows.length} selected`
                : (searchMode ? `${rows.length} result${rows.length !== 1 ? 's' : ''}` : `${rows.length} item${rows.length !== 1 ? 's' : ''}`);
            if (contentEl._updateItemCount) contentEl._updateItemCount = updateItemCount;
        }
        contentEl._updateItemCount = updateItemCount;

        renderPreview(win, wstate);
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

    // Real transfer dialog: determinate progress + Cancel. Handlers update
    // per file and yield periodically so the UI stays alive.
    function showTransferDialog(title, total) {
        const dlg = WindowManager.createWindow('fileExplorer', title, icon, `
            <div style="display:flex;flex-direction:column;gap:10px;padding:16px;height:100%;box-sizing:border-box;">
                <div class="fe-t-name" style="font-size:12px;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Starting…</div>
                <div style="height:8px;background:rgba(255,255,255,0.08);border-radius:4px;overflow:hidden;">
                    <div class="fe-t-fill" style="height:100%;width:0%;background:var(--accent-color);border-radius:4px;transition:width 0.15s;"></div>
                </div>
                <div class="fe-t-count" style="font-size:11px;color:var(--text-secondary);">0 of ${total}</div>
                <div style="display:flex;justify-content:flex-end;margin-top:auto;">
                    <button class="fe-t-cancel" style="padding:5px 18px;background:rgba(255,255,255,0.08);border:1px solid var(--window-border);border-radius:4px;color:var(--text-primary);cursor:pointer;font-size:12px;">Cancel</button>
                </div>
            </div>`, { width: 440, height: 180, minWidth: 360, minHeight: 160, saveState: false });
        const el = dlg.element;
        let cancelled = false;
        el.querySelector('.fe-t-cancel').addEventListener('click', () => {
            cancelled = true;
            const btn = el.querySelector('.fe-t-cancel');
            btn.disabled = true;
            btn.textContent = 'Cancelling…';
        });
        return {
            update(done, name) {
                if (!el.isConnected) return;
                el.querySelector('.fe-t-fill').style.width = total > 0 ? `${Math.round(done / total * 100)}%` : '0%';
                el.querySelector('.fe-t-count').textContent = `${done} of ${total}`;
                if (name) el.querySelector('.fe-t-name').textContent = name;
            },
            isCancelled: () => cancelled,
            close: () => WindowManager.closeWindow(dlg.id)
        };
    }

    function nextCopyName(destParent, name) {
        if (!FileSystem.itemExists([...destParent, name])) return name;
        const dot = name.lastIndexOf('.');
        const base = dot > 0 ? name.slice(0, dot) : name;
        const ext = dot > 0 ? name.slice(dot) : '';
        let candidate = `${base} - Copy${ext}`;
        let i = 2;
        while (FileSystem.itemExists([...destParent, candidate])) {
            candidate = `${base} - Copy (${i++})${ext}`;
        }
        return candidate;
    }

    function ensurePath(root, segs) {
        let cur = root;
        for (const s of segs) {
            if (!FileSystem.itemExists([...cur, s])) FileSystem.createFolder(cur, s);
            cur = [...cur, s];
        }
        return cur;
    }

    async function copyOneFile(src, destParent, name, ext) {
        const final = nextCopyName(destParent, name);
        if (FileSystem.isBlobFile(src)) {
            try {
                const blob = await FileSystem.readFileBlob(src);
                if (!blob) return false;
                return await FileSystem.writeFileBlob(destParent, final, blob, ext);
            } catch { return false; }
        }
        const content = FileSystem.readFile(src);
        if (content === null) return false;
        return FileSystem.createFile(destParent, final, content, ext);
    }

    async function readAsBytes(p) {
        if (FileSystem.isBlobFile(p)) {
            try {
                const blob = await FileSystem.readFileBlob(p);
                if (!blob) return null;
                return new Uint8Array(await blob.arrayBuffer());
            } catch { return null; }
        }
        const text = FileSystem.readFile(p);
        return text === null ? null : new TextEncoder().encode(text);
    }

    async function compressSelection(win, folderPath, names, wstate) {
        const valid = names.filter(n => FileSystem.itemExists([...folderPath, n]));
        if (valid.length === 0) return;
        showProgressBar(win);
        try {
            const entries = [];
            for (const n of valid) {
                const src = [...folderPath, n];
                if (FileSystem.isFolder(src)) {
                    entries.push({ name: `${n}/`, isDir: true });
                    const stack = [{ src, rel: n }];
                    while (stack.length > 0) {
                        const { src: s, rel } = stack.pop();
                        for (const c of FileSystem.getChildren(s)) {
                            if (c.type === 'folder') {
                                entries.push({ name: `${rel}/${c.name}/`, isDir: true });
                                stack.push({ src: [...s, c.name], rel: `${rel}/${c.name}` });
                            } else {
                                const data = await readAsBytes([...s, c.name]);
                                if (data) entries.push({ name: `${rel}/${c.name}`, data });
                            }
                        }
                    }
                } else {
                    const data = await readAsBytes(src);
                    if (data) entries.push({ name: n, data });
                }
            }
            if (entries.length === 0) {
                Popup.error('Compress failed', 'None of the selected items could be read.');
                return;
            }
            const zipBytes = await Zip.createZip(entries);
            const base = valid.length === 1 ? valid[0].replace(/\.[^.]+$/, '') : 'Archive';
            const zipName = nextCopyName(folderPath, `${base}.zip`);
            const ok = await FileSystem.writeFileBlob(folderPath, zipName, new Blob([zipBytes], { type: 'application/zip' }), 'zip');
            if (!ok) {
                Popup.error('Compress failed', 'Could not write the ZIP file (storage may be full).');
                return;
            }
            navigate(win, folderPath, false, wstate);
            refreshIfDesktop(folderPath);
        } finally {
            hideProgressBar(win);
        }
    }

    async function extractZipFlow(win, zipPath, wstate) {
        const destParent = zipPath.slice(0, -1);
        const base = zipPath[zipPath.length - 1].replace(/\.zip$/i, '') || 'Archive';
        let bytes = null;
        if (FileSystem.isBlobFile(zipPath)) {
            try {
                const blob = await FileSystem.readFileBlob(zipPath);
                bytes = blob ? new Uint8Array(await blob.arrayBuffer()) : null;
            } catch { bytes = null; }
        } else {
            const text = FileSystem.readFile(zipPath);
            bytes = text === null ? null : new TextEncoder().encode(text);
        }
        if (!bytes) {
            Popup.error('Extract failed', 'Could not read the ZIP file.');
            return;
        }
        let entries;
        try {
            entries = Zip.readZip(bytes);
        } catch (err) {
            Popup.error('Invalid archive', 'This file is not a valid ZIP archive.');
            return;
        }
        const target = nextCopyName(destParent, base);
        FileSystem.createFolder(destParent, target);
        const root = [...destParent, target];
        const dlg = showTransferDialog('Extracting…', Math.max(entries.length, 1));
        const TEXT_EXTS = new Set(['txt', 'md', 'json', 'js', 'html', 'css', 'log', 'cfg', 'xml', 'yml', 'yaml', 'csv']);
        let i = 0;
        let skipped = 0;
        for (const e of entries) {
            if (dlg.isCancelled()) break;
            // Sanitize: no drive letters, no absolute paths, no traversal.
            const clean = e.name.replace(/\\/g, '/').split('/').filter(seg => seg && seg !== '.' && seg !== '..').join('/');
            if (!clean) {
                skipped++;
                i++;
                dlg.update(i, e.name);
                continue;
            }
            dlg.update(i, e.name);
            if (e.isDir) {
                ensurePath(root, clean.split('/'));
            } else {
                let data = null;
                try {
                    data = await Zip.extractFile(bytes, e);
                } catch (err) { data = null; }
                if (!data) {
                    skipped++;
                } else {
                    const segs = clean.split('/');
                    const fname = segs.pop();
                    const parent = ensurePath(root, segs);
                    const ext = (fname.includes('.') ? fname.split('.').pop() : '').toLowerCase();
                    const final = nextCopyName(parent, fname);
                    if (TEXT_EXTS.has(ext)) {
                        FileSystem.createFile(parent, final, new TextDecoder('utf-8').decode(data), ext);
                    } else {
                        await FileSystem.writeFileBlob(parent, final, new Blob([data]), ext);
                    }
                }
            }
            i++;
            dlg.update(i, e.name);
            if (i % 4 === 0) await new Promise(r => setTimeout(r, 0));
        }
        dlg.close();
        navigate(win, root, true, wstate);
        refreshIfDesktop(root);
        if (skipped > 0) {
            Popup.warn('Extract finished with skips', `${skipped} entr${skipped === 1 ? 'y was' : 'ies were'} skipped (unsupported compression or corrupt data).`);
        }
    }

    function showOpenWithMenu(itemPath, entry) {
        FileAssociations.openWithDialog(itemPath, (appId) => {
            UserActivity.trackFileOpen(itemPath, entry.name);
        });
    }

    function openFileWithDefaultApp(itemPath, entry) {
        const opened = FileAssociations.openDefault(itemPath, (appId) => {
            UserActivity.trackFileOpen(itemPath, entry.name);
        });
        if (opened) return;
        // No handler or viewer claims it — fall back to Notepad, which
        // renders anything as text.
        openFileWithNotepad(itemPath);
    }

    function openFileWithPhotos(itemPath, entry) {
        const name = entry.name;
        const ext = entry.ext || '';
        if (FileSystem.isBlobFile(itemPath)) {
            FileSystem.readFileBlob(itemPath).then(blob => {
                if (!blob) {
                    Popup.error('Open failed', `Could not read "${name}". The file data may be missing.`);
                    return;
                }
                UserActivity.trackFileOpen(itemPath, name);
                showPhotoViewer(name, ext, URL.createObjectURL(blob), (blob.size / 1024).toFixed(1));
            });
            return;
        }
        const content = FileSystem.readFile(itemPath);
        if (content === null) return;
        UserActivity.trackFileOpen(itemPath, name);
        showPhotoViewer(name, ext, content, (new Blob([content]).size / 1024).toFixed(1));
    }

    function showPhotoViewer(name, ext, src, sizeKb) {
        const viewerContent = `
            <div style="display:flex;flex-direction:column;height:100%;background:rgba(0,0,0,0.92);">
                <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);">
                    <span style="color:#ddd;font-size:13px;">${name}</span>
                </div>
                <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:20px;overflow:hidden;">
                    <img src="${src}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:4px;" alt="${name}">
                </div>
                <div style="text-align:center;padding:8px;color:#666;font-size:11px;">${ext.toUpperCase()} &middot; ${sizeKb} KB</div>
            </div>
        `;

        WindowManager.createWindow('photos', `${name} - Photos`, UIIcons.files.image(16), viewerContent, { width: 700, height: 500 });
    }

    function getFolderIcon(name) {
        return UIIcons.folder(name, 36);
    }

    // Raw editable form of a path for the address bar (Windows-style, so it
    // can be copied out or pasted in). Root '/' is Local Disk (C:).
    function pathToEditable(path) {
        if (!path) return 'This PC';
        if (path.length === 0) return 'This PC';
        if (path.length === 1 && path[0] === '/') return 'C:\\';
        return 'C:\\' + path.slice(1).join('\\');
    }

    // Parses what the user typed: 'C:\a\b', 'C:/a/b', '/a/b' (and bare
    // 'This PC' for the drives view). Returns a path array, ['__thispc__']
    // for the drives view, or null when blank.
    function parseEditablePath(text) {
        const t = String(text || '').trim();
        if (!t) return null;
        if (/^this\s*pc$/i.test(t)) return ['__thispc__'];
        const noDrive = t.replace(/^[A-Za-z]:/, '');
        const parts = noDrive.replace(/\\/g, '/').split('/').filter(p => p.length > 0);
        if (parts.length === 0) return ['/'];
        return ['/', ...parts];
    }

    function formatPath(path) {
        if (path.length === 0) return 'This PC';
        if (path.length === 1 && path[0] === '/') return 'Local Disk (C:)';
        if (path.join('/') === Users.home().join('/')) return 'Home';
        const nameMap = {
            'users': 'Users', 'system': 'System',
            'programs data': 'Programs Data', '$Recycle.Bin': 'Recycle Bin'
        };
        return path.map((p, i) => {
            if (i === 0) return 'Local Disk (C:)';
            return nameMap[p] || p;
        }).join(' > ');
    }

    function getFileIcon(ext, name) {
        return UIIcons.file(ext, name, 36);
    }

    function refreshIfDesktop(path) {
        if (path.join('/').includes(Users.home(['Desktop']).join('/'))) {
            DesktopIcons.render();
        }
    }

    function createNewFolder(win, path, wstate) {
        let name = 'New Folder';
        let i = 1;
        while (FileSystem.itemExists([...path, name])) {
            name = `New Folder (${i++})`;
        }
        FileSystem.createFolder(path, name);
        navigate(win, path, false, wstate);
        refreshIfDesktop(path);
    }

    function createNewFile(win, path, wstate) {
        let name = 'New Text Document.txt';
        let i = 1;
        while (FileSystem.itemExists([...path, name])) {
            name = `New Text Document (${i++}).txt`;
        }
        FileSystem.createFile(path, name, '', 'txt');
        navigate(win, path, false, wstate);
        refreshIfDesktop(path);
    }

    function renameItem(win, itemPath) {
        const oldName = itemPath[itemPath.length - 1];
        const parentPath = itemPath.slice(0, -1);
        // Inline rename: swap the item label for an input in place.
        const contentEl = win.element.querySelector('.fe-content');
        const itemEl = contentEl ? contentEl.querySelector(`.fe-item[data-name="${CSS.escape(oldName)}"]`) : null;
        const labelEl = itemEl ? itemEl.querySelector('.fe-label') : null;
        if (!itemEl || !labelEl) {
            renameViaDialog(win, itemPath, oldName, findStateFor(win));
            return;
        }
        if (itemEl.querySelector('.fe-rename-input')) return;
        const original = labelEl.textContent;
        labelEl.innerHTML = '';
        const input = document.createElement('input');
        input.className = 'fe-rename-input';
        input.value = oldName;
        input.spellcheck = false;
        input.style.cssText = 'width:100%;box-sizing:border-box;background:rgba(0,0,0,0.4);border:1px solid var(--accent-color);border-radius:3px;padding:1px 3px;font-size:12px;color:var(--text-primary);outline:none;text-align:center;';
        labelEl.appendChild(input);
        input.focus();
        // Select name without extension, Windows-style.
        const dot = oldName.lastIndexOf('.');
        try {
            if (dot > 0) input.setSelectionRange(0, dot);
            else input.select();
        } catch { try { input.select(); } catch (e2) {} }

        let done = false;
        const commit = () => {
            if (done) return;
            done = true;
            const newName = input.value.trim();
            if (!newName || newName === oldName) {
                labelEl.textContent = original;
                return;
            }
            if (!FileSystem.renameItem(itemPath, newName)) {
                Popup.error('Rename failed', `Could not rename to "${newName}". A file with that name may already exist.`);
                labelEl.textContent = original;
                return;
            }
            const state = findStateFor(win);
            const tab = state && activeTab(state);
            if (tab && tab.selected.has(oldName)) {
                tab.selected.delete(oldName);
                tab.selected.add(newName);
            }
            itemEl.dataset.name = newName;
            labelEl.textContent = newName;
            refreshIfDesktop(itemPath);
            refreshIfDesktop([...parentPath, newName]);
        };
        input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commit();
            else if (e.key === 'Escape') {
                done = true;
                labelEl.textContent = original;
            }
        });
        input.addEventListener('blur', commit);
        input.addEventListener('click', (e) => e.stopPropagation());
        input.addEventListener('dblclick', (e) => e.stopPropagation());
    }

    function findStateFor(win) {
        for (const rec of openWindows.values()) {
            if (rec.win === win || rec.win.id === win.id) return rec.state;
        }
        return null;
    }

    function renameViaDialog(win, itemPath, oldName, wstate) {
        Popup.textbox('Rename', 'Enter new name:', { value: oldName }).then(newName => {
            if (newName && newName !== oldName) {
                FileSystem.renameItem(itemPath, newName);
                if (wstate) navigate(win, itemPath.slice(0, -1), false, wstate);
                refreshIfDesktop(itemPath);
            }
        });
    }

    function copySelected(win, wstate) {
        const tab = activeTab(wstate);
        if (!tab || tab.selected.size === 0) return;
        const currentPath = tab.pathHistory[tab.historyIndex];
        wstate.clipboard = [...tab.selected].map(name => {
            const entry = FileSystem.getChildren(currentPath).find(e => e.name === name);
            return { path: [...currentPath, name], name, type: entry?.type || 'file', ext: entry?.ext || '' };
        });
        wstate.clipboardAction = 'copy';
        showCutFeedback(win, wstate, false);
    }

    function cutSelected(win, wstate) {
        const tab = activeTab(wstate);
        if (!tab || tab.selected.size === 0) return;
        const currentPath = tab.pathHistory[tab.historyIndex];
        wstate.clipboard = [...tab.selected].map(name => {
            const entry = FileSystem.getChildren(currentPath).find(e => e.name === name);
            return { path: [...currentPath, name], name, type: entry?.type || 'file', ext: entry?.ext || '' };
        });
        wstate.clipboardAction = 'cut';
        showCutFeedback(win, wstate, true);
    }

    function showCutFeedback(win, wstate, show) {
        const tab = activeTab(wstate);
        const contentEl = win.element.querySelector('.fe-content');
        contentEl.querySelectorAll('.fe-item').forEach(el => {
            if (show && wstate.clipboard.some(c => c.name === el.dataset.name)) {
                el.style.opacity = '0.4';
                el.style.borderStyle = 'dashed';
            } else if (!tab || !tab.selected.has(el.dataset.name)) {
                el.style.opacity = '1';
                el.style.borderStyle = 'solid';
            }
        });
    }

    async function pasteItems(win, destPath, wstate) {
        if (!wstate || !wstate.clipboard || wstate.clipboard.length === 0) return;
        const action = wstate.clipboardAction;
        // Expand into per-file ops upfront so progress is honest. Folders
        // merge into same-named destinations, Windows-style.
        const ops = [];
        for (const item of wstate.clipboard) {
            if (!FileSystem.itemExists(item.path)) continue;
            const isDir = FileSystem.isFolder(item.path);
            if (action === 'cut') {
                ops.push({ kind: 'move', src: item.path, name: item.name });
            } else if (isDir) {
                const root = FileSystem.itemExists([...destPath, item.name])
                    ? nextCopyName(destPath, item.name)
                    : item.name;
                ops.push({ kind: 'mkdir', dir: [root] });
                const stack = [{ src: item.path, rel: [root] }];
                while (stack.length > 0) {
                    const { src, rel } = stack.pop();
                    for (const c of FileSystem.getChildren(src)) {
                        if (c.type === 'folder') {
                            ops.push({ kind: 'mkdir', dir: [...rel, c.name] });
                            stack.push({ src: [...src, c.name], rel: [...rel, c.name] });
                        } else {
                            ops.push({ kind: 'file', dir: rel, src: [...src, c.name], name: c.name, ext: c.ext || '' });
                        }
                    }
                }
            } else {
                ops.push({ kind: 'file', dir: [], src: item.path, name: item.name, ext: item.ext || '' });
            }
        }
        if (ops.length === 0) return;
        const dlg = showTransferDialog(action === 'cut' ? 'Moving…' : 'Copying…', ops.length);
        const ensureDirChain = (rel) => ensurePath(destPath, rel);
        let i = 0;
        for (const op of ops) {
            if (dlg.isCancelled()) break;
            if (op.kind === 'mkdir') {
                ensureDirChain(op.dir);
            } else if (op.kind === 'file') {
                dlg.update(i, op.name);
                const parent = ensureDirChain(op.dir);
                await copyOneFile(op.src, parent, op.name, op.ext);
            } else if (op.kind === 'move') {
                dlg.update(i, op.name);
                // Never move a folder into itself.
                if (!destPath.join('/').startsWith(op.src.join('/') + '/')) {
                    if (FileSystem.itemExists([...destPath, op.name])) {
                        const final = nextCopyName(destPath, op.name);
                        if (FileSystem.renameItem(op.src, final)) {
                            FileSystem.moveItem([...op.src.slice(0, -1), final], destPath);
                        }
                    } else {
                        FileSystem.moveItem(op.src, destPath);
                    }
                }
            }
            i++;
            dlg.update(i, op.kind === 'mkdir' ? op.dir[op.dir.length - 1] : op.name);
            if (i % 8 === 0) await new Promise(r => setTimeout(r, 0));
        }
        dlg.close();
        if (action === 'cut') wstate.clipboard = [];
        navigate(win, destPath, false, wstate);
        refreshIfDesktop(destPath);
    }

    async function moveNamesWithProgress(win, destPath, srcDir, names, refreshPath, wstate) {
        const ops = names.filter(n => FileSystem.itemExists([...srcDir, n])).filter(n => {
            const src = [...srcDir, n];
            // Same folder, or destination inside the source: skip.
            if (srcDir.join('/') === destPath.join('/')) return false;
            if (destPath.join('/').startsWith(src.join('/') + '/')) return false;
            return true;
        });
        if (ops.length === 0) return;
        const dlg = showTransferDialog('Moving…', ops.length);
        let i = 0;
        for (const n of ops) {
            if (dlg.isCancelled()) break;
            dlg.update(i, n);
            const src = [...srcDir, n];
            if (FileSystem.itemExists([...destPath, n])) {
                const final = nextCopyName(destPath, n);
                if (FileSystem.renameItem(src, final)) {
                    FileSystem.moveItem([...srcDir, final], destPath);
                }
            } else {
                FileSystem.moveItem(src, destPath);
            }
            i++;
            dlg.update(i, n);
            if (i % 8 === 0) await new Promise(r => setTimeout(r, 0));
        }
        dlg.close();
        navigate(win, refreshPath, false, wstate);
        refreshIfDesktop(destPath);
        refreshIfDesktop(srcDir);
    }

    function deleteSelected(win, wstate) {
        const tab = activeTab(wstate);
        if (!tab || tab.selected.size === 0) return;
        const names = [...tab.selected];
        const label = names.length === 1 ? `"${names[0]}"` : `${names.length} items`;
        Popup.confirm('Delete', `Delete ${label}?`).then(ok => {
            if (ok) {
                showProgressBar(win);
                const currentPath = tab.pathHistory[tab.historyIndex];
                setTimeout(() => {
                    names.forEach(name => {
                        FileSystem.deleteItem([...currentPath, name]);
                        refreshIfDesktop([...currentPath, name]);
                    });
                    deselectAll(tab);
                    navigate(win, currentPath, false, wstate);
                    hideProgressBar(win);
                }, 300);
            }
        });
    }

    function showProperties(entry, itemPath) {
        const isDir = entry.type === 'folder';
        const content = `
            <div style="padding:20px;">
                <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;">
                    <div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${isDir ? UIIcons.folder(entry.name, 48) : UIIcons.file(entry.ext, entry.name, 48)}</div>
                    <div>
                        <div style="font-size:16px;font-weight:600;">${entry.name}</div>
                        <div style="font-size:13px;color:var(--text-secondary);">${isDir ? 'File folder' : `File (${entry.ext || 'unknown'})`}</div>
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:100px 1fr;gap:8px;font-size:13px;">
                    <span style="color:var(--text-secondary);">Type:</span><span>${isDir ? 'Folder' : 'File'}</span>
                    <span style="color:var(--text-secondary);">Location:</span><span style="word-break:break-all;">${itemPath.join(' > ')}</span>
                    ${!isDir ? `<span style="color:var(--text-secondary);">Size:</span><span>${formatBytes(entry.size)}</span>` : ''}
                    ${entry.modified ? `<span style="color:var(--text-secondary);">Modified:</span><span>${new Date(entry.modified).toLocaleString()}</span>` : ''}
                </div>
            </div>
        `;
        WindowManager.createWindow('properties', entry.name, UIIcons.action('properties', 16), content, { width: 420, height: 320 });
    }

    function openFileWithNotepad(itemPath) {
        const content = FileSystem.readFile(itemPath);
        if (content === null) return;
        const name = itemPath[itemPath.length - 1];
        UserActivity.trackFileOpen(itemPath, name);

        const cfgPath = Array.isArray(SystemConfig.CONFIG_PATH) ? SystemConfig.CONFIG_PATH.join('/') : SystemConfig.CONFIG_PATH;
        const isConfigFile = itemPath.join('/') === cfgPath;

        const notepadContent = `
            <div style="display:flex;flex-direction:column;height:100%;">
                <div style="display:flex;gap:2px;padding:4px 8px;background:rgba(0,0,0,0.2);border-bottom:1px solid rgba(255,255,255,0.06);">
                    <button style="background:none;border:none;color:var(--text-primary);padding:4px 10px;border-radius:4px;cursor:pointer;font-size:13px;" onmouseenter="this.style.background='var(--hover-bg)'" onmouseleave="this.style.background='none'">File</button>
                    <button style="background:none;border:none;color:var(--text-primary);padding:4px 10px;border-radius:4px;cursor:pointer;font-size:13px;" onmouseenter="this.style.background='var(--hover-bg)'" onmouseleave="this.style.background='none'">Edit</button>
                    <button style="background:none;border:none;color:var(--text-primary);padding:4px 10px;border-radius:4px;cursor:pointer;font-size:13px;" onmouseenter="this.style.background='var(--hover-bg)'" onmouseleave="this.style.background='none'">View</button>
                </div>
                ${isConfigFile ? '<div style="padding:4px 12px;background:rgba(0,120,212,0.15);border-bottom:1px solid rgba(0,120,212,0.2);font-size:12px;color:#4fc3f7;">System config - Ctrl+S to apply changes</div>' : ''}
                <textarea class="notepad-textarea" style="flex:1;background:transparent;border:none;color:var(--text-primary);padding:12px 16px;resize:none;outline:none;font-family:'Consolas','Courier New',monospace;font-size:14px;line-height:1.6;" spellcheck="false">${escapeHtml(content)}</textarea>
                <div style="padding:4px 12px;border-top:1px solid var(--window-border);display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary);">
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
                        Popup.error('Invalid Config', 'Invalid JSON config. Changes not applied.');
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
            <div style="position:absolute;inset:0;display:flex;flex-direction:column;min-height:0;overflow:hidden;">
                <div style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:rgba(128,128,128,0.12);border-bottom:1px solid var(--window-border);flex-shrink:0;">
                    <span style="color:var(--text-secondary);font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${displayPath}">${displayPath}</span>
                </div>
                <iframe sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox" style="flex:1 1 0%;width:100%;height:100%;min-height:0;min-width:0;display:block;border:none;background:white;" srcdoc="${escapeAttr(secureContent)}"></iframe>
                <div style="padding:3px 12px;border-top:1px solid var(--window-border);display:flex;justify-content:space-between;font-size:11px;color:var(--text-secondary);flex-shrink:0;">
                    <span>Local file</span>
                    <span>Restricted mode</span>
                </div>
            </div>
        `;

        WindowManager.createWindow('browser', `${name} - Browser`, browserIcon, content2, { width: 800, height: 500 });
    }

    function openFileWithTerminal(itemPath, entry) {
        const content = FileSystem.readFile(itemPath);
        if (content === null) return;
        const name = entry.name || itemPath[itemPath.length - 1];
        UserActivity.trackFileOpen(itemPath, name);

        const terminalIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="2" y="3" width="20" height="18" rx="2" fill="#0C0C0C"/><polyline points="6 9 10 12 6 15" stroke="#CCCCCC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="15" x2="18" y2="15" stroke="#CCCCCC" stroke-width="2" stroke-linecap="round"/></svg>`;

        const displayPath = itemPath.map((p, i) => i === 0 ? 'C:' : p).join('\\');

        const termContent = `
            <div style="margin:0;padding:0;background:#0C0C0C;font-family:'Cascadia Mono','Consolas','Courier New',monospace;font-size:13px;overflow:hidden;display:flex;flex-direction:column;height:100%;user-select:text;-webkit-user-select:text;">
                <div class="term-output" style="flex:1;overflow-y:auto;padding:12px 14px;color:#CCCCCC;white-space:pre-wrap;word-break:break-all;line-height:1.4;user-select:text;-webkit-user-select:text;"></div>
                <div style="padding:4px 14px 8px;color:#555;font-size:11px;border-top:1px solid #222;user-select:none;-webkit-user-select:none;">Script: ${displayPath}</div>
            </div>
        `;

        const win = WindowManager.createWindow('terminal', `${name} - Terminal`, terminalIcon, termContent, { width: 700, height: 450 });
        const output = win.element.querySelector('.term-output');

        output.addEventListener('selectstart', (e) => e.stopPropagation());
        output.addEventListener('mousedown', (e) => e.stopPropagation());

        const printFn = (text) => {
            if (text === '\x1BCLS') {
                output.textContent = '';
                return;
            }
            output.textContent += text + '\n';
            output.scrollTop = output.scrollHeight;
        };

        let scriptCwd = [...itemPath.slice(0, -1)];
        const getCwd = () => [...scriptCwd];
        const setCwd = (newCwd) => { scriptCwd = newCwd; };

        const ext = (entry.ext || name.split('.').pop() || '').toLowerCase();
        const isVBS = ext === 'vbs' || ext === 'vbe';
        const engine = isVBS
            ? VBEngine.create(printFn, getCwd, setCwd)
            : BatchEngine.create(printFn, getCwd, setCwd);

        printFn(`Windows 12 Terminal - Running ${name}\n`);

        setTimeout(() => {
            engine.run(content);
            printFn('\nScript finished.');
        }, 50);
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
        // iPad Safari lays framed pages lacking a viewport meta out at a 980px
        // default width — the page canvas then overflows the frame and shows
        // as a big white strip on the right (and below short content).
        // Force the layout viewport to match the frame width instead.
        // shrink-to-fit=no stops iPad Safari from auto-shrinking wide
        // content to the device aspect inside the frame.
        if (!/<meta\b[^>]*\bname\s*=\s*["']viewport["']/i.test(html)) {
            const meta = '<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">';
            if (/<head\b[^>]*>/i.test(html)) {
                html = html.replace(/<head\b[^>]*>/i, (m) => `${m}${meta}`);
            } else {
                html = meta + html;
            }
        }
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

    function getSelectedItems(state) {
        return [...state.selected];
    }

    function selectItem(state, name, ctrl, shift, allNames) {
        if (shift && state.lastClicked && allNames) {
            const startIdx = allNames.indexOf(state.lastClicked);
            const endIdx = allNames.indexOf(name);
            if (startIdx !== -1 && endIdx !== -1) {
                const from = Math.min(startIdx, endIdx);
                const to = Math.max(startIdx, endIdx);
                if (!ctrl) state.selected.clear();
                for (let i = from; i <= to; i++) state.selected.add(allNames[i]);
            }
        } else if (ctrl) {
            if (state.selected.has(name)) state.selected.delete(name);
            else state.selected.add(name);
        } else {
            state.selected.clear();
            state.selected.add(name);
        }
        state.lastClicked = name;
    }

    function deselectAll(state) {
        state.selected.clear();
        state.lastClicked = null;
    }

    // ---------- touch-friendly selection mode ----------
    // selectMode lives on wstate (shared across tabs of a window). While on,
    // tapping an item toggles it instead of single-selecting, and every item
    // shows a checkbox. Long-press enters the mode automatically.

    function paintItemSelection(el, selected, selectMode) {
        if (selected) {
            el.style.background = 'rgba(0,120,212,0.25)';
            el.style.borderColor = 'var(--accent-color)';
        } else {
            el.style.background = 'transparent';
            el.style.borderColor = 'transparent';
        }
        const chk = el.querySelector('.fe-check');
        if (chk) {
            chk.style.display = (selectMode || IS_TOUCH_UI) ? 'flex' : 'none';
            const tick = chk.querySelector('svg');
            if (tick) tick.style.display = selected ? 'block' : 'none';
            chk.style.borderColor = selected ? 'var(--accent-color)' : 'rgba(255,255,255,0.55)';
            chk.style.background = selected ? 'var(--accent-color)' : 'rgba(0,0,0,0.55)';
            chk.style.opacity = selected ? '1' : (selectMode ? '1' : '0.8');
        }
    }

    function repaintSelection(contentEl, wstate) {
        if (!contentEl) return;
        const tab = activeTab(wstate);
        const mode = !!(wstate && wstate.selectMode);
        contentEl.querySelectorAll('.fe-item').forEach(el => {
            paintItemSelection(el, !!(tab && tab.selected.has(el.dataset.name)), mode);
        });
        if (contentEl._updateItemCount) contentEl._updateItemCount();
    }

    function setSelectMode(win, wstate, on) {
        if (!wstate) return;
        wstate.selectMode = !!on;
        const btn = win.element.querySelector('.fe-select');
        if (btn) {
            btn.style.color = wstate.selectMode ? 'var(--accent-color)' : 'var(--text-secondary)';
            btn.style.background = wstate.selectMode ? 'rgba(0,120,212,0.2)' : 'none';
            btn.title = wstate.selectMode
                ? 'Selection mode ON — tap items to toggle. Click for Select all / Clear / Exit.'
                : 'Select: multi-select mode (tap checkboxes, or long-press an item)';
        }
        repaintSelection(win.element.querySelector('.fe-content'), wstate);
    }

    function selectAllItems(win, wstate) {
        const tab = activeTab(wstate);
        if (!tab) return;
        const contentEl = win.element.querySelector('.fe-content');
        if (!wstate.selectMode) setSelectMode(win, wstate, true);
        contentEl.querySelectorAll('.fe-item').forEach(el => tab.selected.add(el.dataset.name));
        tab.lastClicked = null;
        repaintSelection(contentEl, wstate);
        renderPreview(win, wstate);
    }

    function clearSelectionUI(win, wstate) {
        const tab = activeTab(wstate);
        if (tab) deselectAll(tab);
        const contentEl = win.element.querySelector('.fe-content');
        repaintSelection(contentEl, wstate);
        renderPreview(win, wstate);
    }

    function invertSelectionUI(win, wstate) {
        const tab = activeTab(wstate);
        if (!tab) return;
        const contentEl = win.element.querySelector('.fe-content');
        contentEl.querySelectorAll('.fe-item').forEach(el => {
            const n = el.dataset.name;
            if (tab.selected.has(n)) tab.selected.delete(n);
            else tab.selected.add(n);
        });
        tab.lastClicked = null;
        repaintSelection(contentEl, wstate);
        renderPreview(win, wstate);
    }

    function exitSelectMode(win, wstate) {
        const tab = activeTab(wstate);
        if (tab) deselectAll(tab);
        setSelectMode(win, wstate, false);
        renderPreview(win, wstate);
    }

    // Built-in file viewers (fallbacks behind manifest handlers). Registered
    // once — the Map overwrites make repeat launches harmless.
    let viewersRegistered = false;
    function registerViewers() {
        if (viewersRegistered) return;
        viewersRegistered = true;
        const entryFrom = (p) => {
            const name = p[p.length - 1];
            return { name, ext: (name.split('.').pop() || '').toLowerCase() };
        };
        FileAssociations.registerViewer('notepad',
            ['txt', 'md', 'json', 'js', 'html', 'css', 'log', 'cfg', 'xml', 'yml', 'yaml', 'csv'],
            (p) => openFileWithNotepad(p));
        FileAssociations.registerViewer('photos',
            ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'],
            (p) => openFileWithPhotos(p, entryFrom(p)));
        FileAssociations.registerViewer('terminal',
            ['bat', 'cmd', 'vbs', 'vbe'],
            (p) => openFileWithTerminal(p, entryFrom(p)));
        FileAssociations.registerViewer('browser',
            ['html', 'htm'],
            (p) => openFileWithBrowser(p));
    }

    // ---------- tabs ----------

    function renderTabStrip(win, wstate) {
        const strip = win.element.querySelector('.fe-tabs');
        if (!strip) return;
        strip.innerHTML = '';
        wstate.tabs.forEach(tab => {
            const isActive = tab.id === wstate.activeTabId;
            const el = document.createElement('div');
            el.style.cssText = `display:flex;align-items:center;gap:6px;padding:5px 6px 5px 12px;border-radius:6px 6px 0 0;font-size:12px;cursor:pointer;max-width:170px;flex-shrink:0;background:${isActive ? 'rgba(128,128,128,0.25)' : 'transparent'};color:${isActive ? 'var(--text-primary)' : 'var(--text-secondary)' };`;
            el.title = tabTitle(tab);
            const label = document.createElement('span');
            label.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            label.textContent = tabTitle(tab);
            const x = document.createElement('span');
            x.textContent = '×';
            x.title = 'Close tab';
            x.style.cssText = 'flex-shrink:0;width:18px;height:18px;display:flex;align-items:center;justify-content:center;border-radius:4px;font-size:13px;';
            x.addEventListener('mouseenter', () => x.style.background = 'rgba(255,255,255,0.15)');
            x.addEventListener('mouseleave', () => x.style.background = 'transparent');
            x.addEventListener('click', (e) => {
                e.stopPropagation();
                closeTab(win, wstate, tab.id);
            });
            el.addEventListener('click', () => switchTab(win, wstate, tab.id));
            el.appendChild(label);
            el.appendChild(x);
            strip.appendChild(el);
        });
        const plus = document.createElement('div');
        plus.textContent = '+';
        plus.title = 'New tab (Ctrl+T)';
        plus.style.cssText = 'flex-shrink:0;width:26px;height:26px;display:flex;align-items:center;justify-content:center;border-radius:6px;cursor:pointer;font-size:15px;color:var(--text-secondary);';
        plus.addEventListener('mouseenter', () => plus.style.background = 'rgba(255,255,255,0.08)');
        plus.addEventListener('mouseleave', () => plus.style.background = 'transparent');
        plus.addEventListener('click', () => addTab(win, wstate, null));
        strip.appendChild(plus);
    }

    function addTab(win, wstate, path) {
        const tab = makeTab(path || Users.home());
        wstate.tabs.push(tab);
        wstate.activeTabId = tab.id;
        renderTabStrip(win, wstate);
        navigate(win, tab.pathHistory[0], false, wstate);
    }

    function switchTab(win, wstate, id) {
        if (wstate.activeTabId === id) return;
        if (!wstate.tabs.some(t => t.id === id)) return;
        wstate.activeTabId = id;
        const tab = activeTab(wstate);
        renderTabStrip(win, wstate);
        if (tab && tab.currentPath) navigate(win, tab.currentPath, false, wstate);
        else showThisPC(win, wstate);
    }

    function closeTab(win, wstate, id) {
        if (wstate.tabs.length <= 1) {
            WindowManager.closeWindow(win.id);
            return;
        }
        wstate.tabs = wstate.tabs.filter(t => t.id !== id);
        if (wstate.activeTabId === id) {
            wstate.activeTabId = wstate.tabs[wstate.tabs.length - 1].id;
            const tab = activeTab(wstate);
            renderTabStrip(win, wstate);
            if (tab && tab.currentPath) navigate(win, tab.currentPath, false, wstate);
            else showThisPC(win, wstate);
        } else {
            renderTabStrip(win, wstate);
        }
    }

    // ---------- breadcrumbs ----------

    function renderCrumbs(win, path) {
        const crumbs = win.element.querySelector('.fe-crumbs');
        const input = win.element.querySelector('.fe-path');
        if (!crumbs || !input) return;
        input.style.display = 'none';
        crumbs.style.display = 'flex';
        crumbs.innerHTML = '';
        if (!path) {
            const span = document.createElement('span');
            span.style.cssText = 'font-size:13px;color:var(--text-primary);padding:4px 6px;';
            span.textContent = 'This PC';
            crumbs.appendChild(span);
            return;
        }
        const segs = [{ label: 'C:', path: ['/'] }];
        path.slice(1).forEach((seg, i) => segs.push({ label: seg, path: path.slice(0, i + 2) }));
        segs.forEach((s, i) => {
            if (i > 0) {
                const chev = document.createElement('span');
                chev.style.cssText = 'color:var(--text-secondary);font-size:11px;';
                chev.textContent = '›';
                crumbs.appendChild(chev);
            }
            const b = document.createElement('button');
            b.textContent = s.label;
            b.title = s.label;
            b.style.cssText = 'background:none;border:none;color:var(--text-primary);font-size:13px;cursor:pointer;padding:4px 6px;border-radius:4px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            b.addEventListener('mouseenter', () => b.style.background = 'rgba(255,255,255,0.08)');
            b.addEventListener('mouseleave', () => b.style.background = 'none');
            b.addEventListener('click', (e) => {
                e.stopPropagation();
                const ws = findStateFor(win);
                if (ws) navigate(win, s.path, true, ws);
            });
            crumbs.appendChild(b);
        });
    }

    function enterEditMode(win) {
        const crumbs = win.element.querySelector('.fe-crumbs');
        const input = win.element.querySelector('.fe-path');
        if (!crumbs || !input) return;
        const ws = findStateFor(win);
        const tab = ws && activeTab(ws);
        crumbs.style.display = 'none';
        input.style.display = 'block';
        input.value = tab && tab.currentPath ? pathToEditable(tab.currentPath) : 'This PC';
        input.focus();
        input.select();
    }

    // ---------- search within folders ----------

    function searchFiles(rootPath, query, limit = 200) {
        const hits = [];
        const stack = [rootPath];
        while (stack.length > 0 && hits.length < limit) {
            const dir = stack.pop();
            let children = [];
            try {
                children = FileSystem.getChildren(dir);
            } catch { continue; }
            for (const c of children) {
                const full = [...dir, c.name];
                if (c.type === 'folder') stack.push(full);
                if (c.name.toLowerCase().includes(query)) {
                    hits.push({ entry: c, base: dir });
                    if (hits.length >= limit) break;
                }
            }
        }
        return hits;
    }

    function searchEntryInfo(win, name) {
        const contentEl = win.element.querySelector('.fe-content');
        const dirs = (contentEl && contentEl._searchDirs) || {};
        const entries = (contentEl && contentEl._searchEntries) || {};
        if (!dirs[name] || !entries[name]) return null;
        return { dir: dirs[name], entry: entries[name] };
    }

    function deletePaths(win, wstate, paths) {
        if (!paths || paths.length === 0) return;
        const label = paths.length === 1 ? `"${paths[0][paths[0].length - 1]}"` : `${paths.length} items`;
        Popup.confirm('Delete', `Delete ${label}?`).then(ok => {
            if (!ok) return;
            showProgressBar(win);
            setTimeout(() => {
                paths.forEach(p => {
                    if (FileSystem.itemExists(p)) {
                        FileSystem.deleteItem(p);
                        refreshIfDesktop(p);
                    }
                });
                const tab = activeTab(wstate);
                if (tab) deselectAll(tab);
                hideProgressBar(win);
                const cur = tab && tab.currentPath;
                if (cur) navigate(win, cur, false, wstate);
            }, 300);
        });
    }

    // ---------- preview pane ----------

    let previewToken = 0;

    function renderPreview(win, wstate) {
        const pane = win.element.querySelector('.fe-preview');
        if (!pane) return;
        const tab = activeTab(wstate);
        const myToken = ++previewToken;
        if (!view.preview || !tab || tab.selected.size !== 1) {
            pane.style.display = 'none';
            pane.innerHTML = '';
            return;
        }
        const name = [...tab.selected][0];
        let dir = tab.currentPath;
        let entry = null;
        if (wstate.search && wstate.search.trim()) {
            const info = searchEntryInfo(win, name);
            if (info) {
                dir = info.dir;
                entry = info.entry;
            }
        } else if (dir) {
            entry = FileSystem.getChildren(dir).find(e => e.name === name) || null;
        }
        if (!entry || !dir) {
            pane.style.display = 'none';
            pane.innerHTML = '';
            return;
        }
        pane.style.display = 'block';
        const isDir = entry.type === 'folder';
        const ext = (entry.ext || '').toLowerCase();
        const head = `
            <div style="display:flex;flex-direction:column;align-items:center;gap:8px;margin-bottom:12px;">
                <div class="fe-pv-visual" style="width:100%;min-height:120px;max-height:220px;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:6px;background:rgba(0,0,0,0.25);"></div>
                <div style="font-size:13px;font-weight:600;text-align:center;word-break:break-all;">${name.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>
                <div style="font-size:11px;color:var(--text-secondary);">${isDir ? 'File folder' : `File (${ext || 'unknown'})`}</div>
            </div>
            <div style="display:grid;grid-template-columns:70px 1fr;gap:6px;font-size:12px;">
                ${!isDir ? `<span style="color:var(--text-secondary);">Size:</span><span>${formatBytes(entry.size || 0)}</span>` : ''}
                ${entry.modified ? `<span style="color:var(--text-secondary);">Modified:</span><span>${new Date(entry.modified).toLocaleString()}</span>` : ''}
            </div>
            <div class="fe-pv-text" style="margin-top:10px;font-size:11px;line-height:1.5;color:var(--text-secondary);white-space:pre-wrap;word-break:break-word;max-height:200px;overflow:hidden;"></div>`;
        pane.innerHTML = head;
        const visual = pane.querySelector('.fe-pv-visual');
        const textEl = pane.querySelector('.fe-pv-text');
        const fullPath = [...dir, name];
        const finishIcon = () => {
            if (myToken !== previewToken || !pane.isConnected) return;
            visual.innerHTML = `<div style="transform:scale(2);opacity:0.9;">${isDir ? UIIcons.folder(name, 48) : UIIcons.file(ext, name, 48)}</div>`;
        };
        if (isDir) {
            let count = 0;
            try {
                count = FileSystem.getChildren(fullPath).length;
            } catch { count = 0; }
            textEl.textContent = `${count} item${count !== 1 ? 's' : ''}`;
            finishIcon();
        } else if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'].includes(ext)) {
            const showSrc = (src) => {
                if (myToken !== previewToken || !pane.isConnected) return;
                visual.innerHTML = `<img src="${src}" style="max-width:100%;max-height:220px;object-fit:contain;" alt="">`;
            };
            if (FileSystem.isBlobFile(fullPath)) {
                FileSystem.readFileBlob(fullPath).then(blob => {
                    if (blob) showSrc(URL.createObjectURL(blob));
                    else finishIcon();
                }).catch(finishIcon);
            } else {
                const content = FileSystem.readFile(fullPath);
                if (content) showSrc(content);
                else finishIcon();
            }
        } else if (['txt', 'md', 'json', 'js', 'html', 'css', 'log', 'cfg', 'xml', 'yml', 'yaml', 'csv'].includes(ext)) {
            const content = FileSystem.readFile(fullPath);
            if (content !== null) textEl.textContent = content.slice(0, 2000);
            finishIcon();
        } else if (ext === 'zip') {
            textEl.textContent = 'ZIP archive — double-click to extract.';
            finishIcon();
        } else {
            finishIcon();
        }
    }

    // ---------- Quick Access ----------

    const QA_PATH = () => Users.appData('fileExplorer', ['quickaccess.json']);

    function loadQA() {
        try {
            const raw = FileSystem.readFile(QA_PATH());
            if (raw) {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr)) return arr.filter(p => Array.isArray(p) && FileSystem.isFolder(p));
            }
        } catch { /* none pinned */ }
        return [];
    }

    function saveQA(pins) {
        try {
            const json = JSON.stringify(pins);
            if (FileSystem.itemExists(QA_PATH())) FileSystem.writeFile(QA_PATH(), json);
            else {
                const dir = QA_PATH().slice(0, -1);
                if (!FileSystem.itemExists(dir)) FileSystem.createFolder(dir.slice(0, -1), dir[dir.length - 1]);
                FileSystem.createFile(dir, 'quickaccess.json', json, 'json');
            }
        } catch { /* session-only */ }
    }

    function qaContains(pins, path) {
        const key = path.join('/');
        return pins.some(p => p.join('/') === key);
    }

    function renderSidebar(win, wstate) {
        const sidebar = win.element.querySelector('.fe-sidebar');
        if (!sidebar) return;
        const pins = loadQA();
        const qaHtml = `
            <div style="font-size:11px;font-weight:600;color:var(--text-secondary);padding:4px 10px;">Quick access</div>
            ${pins.length === 0
                ? '<div style="font-size:11px;color:var(--text-secondary);padding:2px 10px 6px;">Right-click a folder → Pin to Quick access</div>'
                : pins.map(p => {
                    const label = p.length <= 1 ? 'Local Disk (C:)' : p[p.length - 1];
                    return `<div class="fe-sidebar-item fe-qa-item" style="padding:6px 10px;border-radius:4px;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:8px;transition:background 0.12s;" data-path='${JSON.stringify(p)}'>
                        <span style="width:16px;height:16px;display:inline-flex;flex-shrink:0;">${UIIcons.sidebar('Home', 16)}</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${label}</span>
                    </div>`;
                }).join('')}
            <div style="height:1px;background:var(--window-border);margin:6px 0;"></div>`;
        sidebar.innerHTML = qaHtml + buildSidebar();
        sidebar.querySelectorAll('.fe-sidebar-item').forEach(item => {
            item.addEventListener('click', () => {
                const path = JSON.parse(item.dataset.path);
                if (path[0] === '__thispc__') showThisPC(win, wstate);
                else navigate(win, path, true, wstate);
            });
            if (item.classList.contains('fe-qa-item')) {
                item.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const path = JSON.parse(item.dataset.path);
                    ContextMenu.show(e.clientX, e.clientY, [
                        { label: 'Unpin from Quick access', icon: UIIcons.action('unpin'), action: () => {
                            saveQA(loadQA().filter(p => p.join('/') !== path.join('/')));
                            renderSidebar(win, wstate);
                        } }
                    ]);
                });
            }
        });
    }

    function toggleQAPin(path) {
        const pins = loadQA();
        if (qaContains(pins, path)) {
            saveQA(pins.filter(p => p.join('/') !== path.join('/')));
            return false;
        }
        pins.push(path.slice());
        saveQA(pins);
        return true;
    }

    function launch(options = {}) {
        loadView();
        registerViewers();
        const wstate = {
            tabs: [],
            activeTabId: null,
            clipboard: [],
            clipboardAction: null,
            search: '',
            selectMode: false,
            _lpSuppressUntil: 0,
            _ctxMenuAt: 0
        };

        const win = WindowManager.createWindow('fileExplorer', 'File Explorer', icon, getContent(), { width: 900, height: 550 });
        openWindows.set(win.id, { win, state: wstate });

        const contentEl = win.element.querySelector('.fe-content');
        contentEl.addEventListener('contextmenu', (e) => {
            if (e.target !== contentEl) return;
            e.preventDefault();
            const currentPath = JSON.parse(win.element.dataset.currentPath || '["/"]');
            const menuItems = [
                { label: 'New folder', icon: UIIcons.action('newFolder'), action: () => createNewFolder(win, currentPath, wstate) },
                { label: 'New text file', icon: UIIcons.action('newFile'), action: () => createNewFile(win, currentPath, wstate) },
                'separator'
            ];
            if (wstate.clipboard && wstate.clipboard.length > 0) {
                const count = wstate.clipboard.length;
                const label = count > 1 ? ` (${count} items)` : '';
                menuItems.push({ label: `Paste${label}`, icon: UIIcons.action('paste'), action: () => pasteItems(win, currentPath, wstate) });
            }
            ContextMenu.show(e.clientX, e.clientY, menuItems);
        });
        contentEl.addEventListener('dragover', (e) => {
            if (e.target === contentEl) {
                e.preventDefault();
            }
        });
        contentEl.addEventListener('drop', (e) => {
            if (e.target !== contentEl) return;
            e.preventDefault();
            try {
                const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                const tab = activeTab(wstate);
                const cur = tab && (tab.currentPath || tab.pathHistory[tab.historyIndex]);
                if (data && Array.isArray(data.names) && Array.isArray(data.from) && cur) {
                    moveNamesWithProgress(win, cur, data.from, data.names, cur, wstate);
                }
            } catch (err) {}
        });
        contentEl.addEventListener('click', (e) => {
            if (e.target === contentEl) {
                const tab = activeTab(wstate);
                if (tab) deselectAll(tab);
                repaintSelection(contentEl, wstate);
                renderPreview(win, wstate);
            }
        });

        const initialPath = options.path && FileSystem.isFolder(options.path)
            ? options.path
            : Users.home();
        renderSidebar(win, wstate);
        addTab(win, wstate, initialPath);

        win.element.querySelector('.fe-back').addEventListener('click', () => {
            const tab = activeTab(wstate);
            if (tab && tab.historyIndex > 0) {
                tab.historyIndex--;
                navigate(win, tab.pathHistory[tab.historyIndex], false, wstate);
            }
        });

        win.element.querySelector('.fe-forward').addEventListener('click', () => {
            const tab = activeTab(wstate);
            if (tab && tab.historyIndex < tab.pathHistory.length - 1) {
                tab.historyIndex++;
                navigate(win, tab.pathHistory[tab.historyIndex], false, wstate);
            }
        });

        win.element.querySelector('.fe-up').addEventListener('click', () => {
            const tab = activeTab(wstate);
            if (!tab) return;
            const current = tab.pathHistory[tab.historyIndex];
            if (current.length > 1) {
                navigate(win, current.slice(0, -1), true, wstate);
            }
        });

        win.element.querySelector('.fe-select').addEventListener('click', (e) => {
            e.stopPropagation();
            if (!wstate.selectMode) {
                setSelectMode(win, wstate, true);
                return;
            }
            const r = win.element.querySelector('.fe-select').getBoundingClientRect();
            ContextMenu.show(r.left, r.bottom + 4, [
                { label: 'Select all', icon: UIIcons.action('selectAll'), action: () => selectAllItems(win, wstate) },
                { label: 'Clear selection', icon: UIIcons.action('close'), action: () => clearSelectionUI(win, wstate) },
                { label: 'Invert selection', icon: '', action: () => invertSelectionUI(win, wstate) },
                'separator',
                { label: 'Exit selection mode', icon: UIIcons.action('check'), action: () => exitSelectMode(win, wstate) }
            ]);
        });

        win.element.querySelector('.fe-sort').addEventListener('click', (e) => {
            const check = (on) => on ? UIIcons.action('check') : '';
            const sortNames = { name: 'Name', date: 'Date modified', size: 'Size', type: 'Type' };
            const tab = activeTab(wstate);
            const curPath = tab ? tab.pathHistory[tab.historyIndex] : ['/'];
            const refresh = () => navigate(win, curPath, false, wstate);
            ContextMenu.show(e.clientX, e.clientY, [
                ...Object.entries(sortNames).map(([key, label]) => ({
                    label: `Sort by ${label}`,
                    icon: check(view.sortBy === key),
                    action: () => {
                        view.sortBy = key;
                        saveView();
                        refresh();
                    }
                })),
                'separator',
                {
                    label: view.sortDir === 'asc' ? 'Descending' : 'Ascending',
                    icon: UIIcons.action('sort'),
                    action: () => {
                        view.sortDir = view.sortDir === 'asc' ? 'desc' : 'asc';
                        saveView();
                        refresh();
                    }
                },
                'separator',
                {
                    label: 'Group by Type',
                    icon: check(view.groupBy === 'type'),
                    action: () => {
                        view.groupBy = view.groupBy === 'type' ? 'none' : 'type';
                        saveView();
                        refresh();
                    }
                }
            ]);
        });

        const previewBtn = win.element.querySelector('.fe-preview-btn');
        const paintPreviewBtn = () => {
            previewBtn.style.color = view.preview ? 'var(--accent-color)' : 'var(--text-secondary)';
        };
        paintPreviewBtn();
        previewBtn.addEventListener('click', () => {
            view.preview = !view.preview;
            saveView();
            paintPreviewBtn();
            const tab = activeTab(wstate);
            if (tab && tab.currentPath) navigate(win, tab.currentPath, false, wstate);
            else renderPreview(win, wstate);
        });

        const searchInput = win.element.querySelector('.fe-search');
        searchInput.addEventListener('input', () => {
            wstate.search = searchInput.value;
            const tab = activeTab(wstate);
            if (tab && tab.currentPath) navigate(win, tab.currentPath, false, wstate);
        });
        searchInput.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Escape') {
                searchInput.value = '';
                wstate.search = '';
                const tab = activeTab(wstate);
                if (tab && tab.currentPath) navigate(win, tab.currentPath, false, wstate);
                else searchInput.blur();
            }
        });

        const pathInput = win.element.querySelector('.fe-path');
        const crumbbar = win.element.querySelector('.fe-crumbbar');
        crumbbar.addEventListener('click', () => {
            if (win.element.querySelector('.fe-path').style.display !== 'none') return;
            enterEditMode(win);
        });

        function currentTabPath() {
            const tab = activeTab(wstate);
            return tab && (tab.currentPath || tab.pathHistory[tab.historyIndex]);
        }

        function revertAddressBar() {
            const cur = currentTabPath();
            pathInput.value = cur ? formatPath(cur) : 'This PC';
            const tab = activeTab(wstate);
            renderCrumbs(win, tab ? tab.currentPath : null);
        }

        pathInput.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
                e.preventDefault();
                const inputPath = pathInput.value.trim();
                const rawPath = parseEditablePath(inputPath);
                if (!rawPath) {
                    revertAddressBar();
                    pathInput.blur();
                    return;
                }
                if (rawPath[0] === '__thispc__') {
                    showThisPC(win, wstate);
                } else if (FileSystem.isFolder(rawPath)) {
                    navigate(win, rawPath, true, wstate);
                } else if (FileSystem.itemExists(rawPath)) {
                    navigate(win, rawPath.slice(0, -1), true, wstate);
                } else {
                    Popup.error('Path Not Found', 'Path not found: ' + inputPath);
                    revertAddressBar();
                }
                pathInput.blur();
            } else if (e.key === 'Escape') {
                revertAddressBar();
                pathInput.blur();
            }
        });

        // Leaving without pressing Enter discards the edit.
        pathInput.addEventListener('blur', () => {
            revertAddressBar();
        });

        // Central shortcut registry, scoped to this window: combos fire only
        // while focus is inside it, and stale entries self-remove once the
        // window is closed (replaces the manual add/removeEventListener).
        const kb = { scope: win.element, owner: 'fileExplorer' };
        const copySearchHotkey = (action) => {
            const tab = activeTab(wstate);
            if (!tab || tab.selected.size === 0) return false;
            const items = [...tab.selected].map(n => {
                const info = searchEntryInfo(win, n);
                return info ? { path: [...info.dir, n], name: n, type: info.entry.type || 'file', ext: info.entry.ext || '' } : null;
            }).filter(Boolean);
            if (items.length === 0) return false;
            wstate.clipboard = items;
            wstate.clipboardAction = action;
            showCutFeedback(win, wstate, action === 'cut');
            return true;
        };
        const searching = () => !!(wstate.search && wstate.search.trim());
        Keyboard.register('CTRL+C', () => {
            if (searching()) {
                if (!copySearchHotkey('copy')) return false;
                return;
            }
            copySelected(win, wstate);
        }, { ...kb, description: 'Copy selection' });
        Keyboard.register('CTRL+X', () => {
            if (searching()) {
                if (!copySearchHotkey('cut')) return false;
                return;
            }
            cutSelected(win, wstate);
        }, { ...kb, description: 'Cut selection' });
        Keyboard.register('CTRL+V', () => {
            const tab = activeTab(wstate);
            const currentPath = tab && (tab.currentPath || tab.pathHistory[tab.historyIndex]);
            if (currentPath && wstate.clipboard && wstate.clipboard.length > 0) {
                pasteItems(win, currentPath, wstate);
            }
        }, { ...kb, description: 'Paste' });
        Keyboard.register('CTRL+A', () => {
            selectAllItems(win, wstate);
        }, { ...kb, description: 'Select all' });
        Keyboard.register('DELETE', () => {
            const tab = activeTab(wstate);
            if (!tab) return false;
            if (wstate.search && wstate.search.trim()) {
                if (tab.selected.size === 0) return false;
                deletePaths(win, wstate, [...tab.selected]
                    .map(n => {
                        const dir = (contentEl._searchDirs || {})[n];
                        return dir ? [...dir, n] : null;
                    })
                    .filter(Boolean));
                return;
            }
            if (tab.selected.size === 0) return false;
            deleteSelected(win, wstate);
        }, { ...kb, description: 'Delete selection' });
        Keyboard.register('CTRL+SHIFT+N', () => {
            const tab = activeTab(wstate);
            const cur = tab && (tab.currentPath || tab.pathHistory[tab.historyIndex]);
            if (cur) createNewFolder(win, cur, wstate);
        }, { ...kb, description: 'New folder' });
        Keyboard.register('F2', () => {
            const tab = activeTab(wstate);
            if (!tab || tab.selected.size !== 1) return false;
            const name = [...tab.selected][0];
            if (wstate.search && wstate.search.trim()) {
                const info = searchEntryInfo(win, name);
                if (!info) return false;
                renameViaDialog(win, [...info.dir, name], name, wstate);
                return;
            }
            const cur = tab.currentPath || tab.pathHistory[tab.historyIndex];
            renameItem(win, [...cur, name]);
        }, { ...kb, description: 'Rename' });
        Keyboard.register('CTRL+L', () => enterEditMode(win), { ...kb, description: 'Focus address bar' });
        Keyboard.register('CTRL+T', () => addTab(win, wstate, null), { ...kb, description: 'New tab' });
    }

    // Opens a folder in a new tab of the most recent Explorer window (or a
    // fresh window). Used by desktop icons.
    function openPath(path) {
        pruneClosedWindows();
        const safe = path && FileSystem.isFolder(path) ? path : null;
        if (openWindows.size > 0) {
            const rec = [...openWindows.values()].pop();
            focusExplorerWindow(rec);
            if (safe) addTab(rec.win, rec.state, safe);
            return;
        }
        launch(safe ? { path: safe } : {});
    }

    return { launch, openPath };
})();

export default FileExplorer;
