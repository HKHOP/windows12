import FileSystem from './fileSystem.js';
import UIIcons from './uiIcons.js';
import ContextMenu from './contextMenu.js';
import WindowManager from './windowManager.js';
import UserActivity from './userActivity.js';
import { AppRegistry } from './taskbar.js';
import Popup from './popup.js';
import Scaling from './scaling.js';
import Sounds from './sounds.js';
import Users from './users.js';

const DesktopIcons = (() => {
    // Desktop and its icon layout are per-user.
    function desktopPath() {
        return Users.home(['Desktop']);
    }
    function layoutPath() {
        return Users.userData(['desktop-layout.json']);
    }

    // Shell-owned FS access (shield from fsGuard app attribution).
    function asShell(fn) {
        return (...args) => {
            const g = window._FSGuard;
            if (g) return g.asShell(fn)(...args);
            return fn(...args);
        };
    }

    const ICON_W = 80;
    const ICON_H = 90;
    const PADDING = 16;
    const STEP_X = ICON_W + PADDING;
    const STEP_Y = ICON_H + PADDING;
    const BOTTOM_RESERVE = 100;
    let container;
    let positions = {};
    let resizeTimer = null;
    // Multi-select state: names of selected icons ('$Recycle.Bin' included).
    let selected = new Set();
    let lastClicked = null;
    let marqueeEl = null;
    let suppressDesktopClick = false;

    const RECYCLE_BIN_ICON = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none">
        <path d="M4 6H20" stroke="#888" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M8 6V4C8 3.45 8.45 3 9 3H15C15.55 3 16 3.45 16 4V6" stroke="#888" stroke-width="1.5"/>
        <path d="M5 6L6 20C6 20.55 6.45 21 7 21H17C17.55 21 18 20.55 18 20L19 6" stroke="#888" stroke-width="1.5"/>
        <path d="M10 10V16" stroke="#888" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M14 10V16" stroke="#888" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`;

    function init() {
        container = document.getElementById('desktop');
        loadPositions();
        render();
        setupMarquee();
        setupKeyboard();
        // Self-heal the grid when the viewport changes (resize, zoom,
        // resolution/scale switches): re-snap, clamp and de-overlap icons.
        window.addEventListener('resize', () => {
            if (resizeTimer) clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                resizeTimer = null;
                try { render(); } catch (e) { /* noop */ }
            }, 200);
        });
    }

    // ---------- Multi-select helpers ----------
    function orderedNames() {
        let entries = [];
        try { entries = FileSystem.getChildren(desktopPath()) || []; } catch (e) { entries = []; }
        return ['$Recycle.Bin', ...sortedEntries(entries).map(e => e.name)];
    }

    function refreshSelection() {
        if (!container) return;
        container.querySelectorAll('.desktop-icon').forEach(el => {
            if (selected.has(el.dataset.name)) {
                el.classList.add('selected');
                el.style.background = 'rgba(0,120,212,0.3)';
            } else {
                el.classList.remove('selected');
                el.style.background = 'transparent';
            }
        });
    }

    function clearSelection() {
        if (selected.size === 0) return;
        selected.clear();
        lastClicked = null;
        refreshSelection();
    }

    function selectAll() {
        selected = new Set(orderedNames());
        lastClicked = null;
        refreshSelection();
    }

    function getSelected() {
        return [...selected];
    }

    function isSelected(name) {
        return selected.has(name);
    }

    function handleIconClick(name, e) {
        const multi = e.ctrlKey || e.metaKey;
        const range = e.shiftKey;
        if (multi) {
            if (selected.has(name)) selected.delete(name);
            else selected.add(name);
            lastClicked = name;
        } else if (range && lastClicked && lastClicked !== name) {
            const order = orderedNames();
            const a = order.indexOf(lastClicked);
            const b = order.indexOf(name);
            if (a !== -1 && b !== -1) {
                const [from, to] = a < b ? [a, b] : [b, a];
                for (let i = from; i <= to; i++) selected.add(order[i]);
            } else {
                selected.clear();
                selected.add(name);
                lastClicked = name;
            }
        } else {
            selected.clear();
            selected.add(name);
            lastClicked = name;
        }
        refreshSelection();
    }

    function setupKeyboard() {
        document.addEventListener('keydown', (e) => {
            const tag = (document.activeElement && document.activeElement.tagName) || '';
            if (tag === 'INPUT' || tag === 'TEXTAREA' || (document.activeElement && document.activeElement.isContentEditable)) return;
            // Only act when no app window has focus (desktop scope).
            const focusedWin = document.activeElement && document.activeElement.closest
                ? document.activeElement.closest('.app-window') : null;
            if (focusedWin) return;
            if (selected.size === 0) return;
            if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
                e.preventDefault();
                selectAll();
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                deleteSelected();
            } else if (e.key === 'Escape') {
                clearSelection();
            }
        });
    }

    // ---------- Blue rubber-band (marquee) selection ----------
    function toDesktopPoint(clientX, clientY) {
        const s = Scaling.getScale() || 1;
        const rect = container.getBoundingClientRect();
        return {
            x: (clientX - rect.left) / s,
            y: (clientY - rect.top) / s
        };
    }

    function rectsIntersect(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    function setupMarquee() {
        marqueeEl = document.createElement('div');
        marqueeEl.id = 'desktop-selection-rect';
        marqueeEl.style.display = 'none';
        container.appendChild(marqueeEl);

        // Empty-space click clears (Ctrl+click preserves). Marquee drags
        // set suppressDesktopClick so the trailing click doesn't wipe the box.
        container.addEventListener('click', (e) => {
            if (suppressDesktopClick) {
                suppressDesktopClick = false;
                return;
            }
            if (e.target.closest('.desktop-icon') || e.target.closest('.app-window')) return;
            if (e.ctrlKey || e.metaKey) return;
            clearSelection();
        });

        container.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            if (e.target.closest('.desktop-icon')) return;
            if (e.target.closest('.app-window')) return;
            if (e.target.closest('#context-menu')) return;

            const s = Scaling.getScale() || 1;
            const rect = container.getBoundingClientRect();
            const startClientX = e.clientX;
            const startClientY = e.clientY;
            const startPt = toDesktopPoint(startClientX, startClientY);
            const additive = e.ctrlKey || e.metaKey;
            const anchor = additive ? new Set(selected) : new Set();
            let active = false;

            function onMove(me) {
                const dxScreen = me.clientX - startClientX;
                const dyScreen = me.clientY - startClientY;
                if (!active && Math.hypot(dxScreen, dyScreen) < 4) return;
                active = true;

                const cur = toDesktopPoint(me.clientX, me.clientY);
                const x = Math.min(startPt.x, cur.x);
                const y = Math.min(startPt.y, cur.y);
                const w = Math.abs(cur.x - startPt.x);
                const h = Math.abs(cur.y - startPt.y);
                // Clamp into desktop bounds.
                const maxW = container.scrollWidth || (window.innerWidth / s);
                const maxH = container.scrollHeight || (window.innerHeight / s);
                const cx = Math.max(0, x);
                const cy = Math.max(0, y);

                marqueeEl.style.display = 'block';
                marqueeEl.style.left = cx + 'px';
                marqueeEl.style.top = cy + 'px';
                marqueeEl.style.width = w + 'px';
                marqueeEl.style.height = h + 'px';

                const box = { x: cx, y: cy, w, h };
                const next = new Set(anchor);
                container.querySelectorAll('.desktop-icon').forEach(el => {
                    const r = {
                        x: el.offsetLeft,
                        y: el.offsetTop,
                        w: el.offsetWidth,
                        h: el.offsetHeight
                    };
                    if (rectsIntersect(box, r)) next.add(el.dataset.name);
                });
                selected = next;
                refreshSelection();
            }

            function onUp() {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                marqueeEl.style.display = 'none';
                if (active) {
                    // A real box drag was made: keep the result and swallow
                    // the click event the browser fires right after mouseup.
                    suppressDesktopClick = true;
                    if (selected.size > 0) lastClicked = [...selected].pop();
                    else lastClicked = null;
                    e.preventDefault();
                } else if (!additive) {
                    clearSelection();
                }
            }

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    const loadPositions = asShell(function loadPositions() {
        const data = FileSystem.readFile(layoutPath());
        if (data) {
            try {
                positions = JSON.parse(data);
            } catch {
                positions = {};
            }
        }
    });

    const savePositions = asShell(function savePositions() {
        const content = JSON.stringify(positions, null, 2);
        const parent = layoutPath().slice(0, -1);
        if (FileSystem.itemExists(layoutPath())) {
            FileSystem.writeFile(layoutPath(), content);
        } else {
            FileSystem.createFile(parent, 'desktop-layout.json', content, 'json');
        }
    });

    // ---------- Single grid model (placement AND drag-snap share it) ----------
    // Cell (col, row) -> top-left pixel. Every icon slot, including the
    // Recycle Bin's first-boot slot, comes from here, so default placement
    // and manual drag-snapping can never disagree.
    function getGridMetrics() {
        const s = Scaling.getScale() || 1;
        const availW = window.innerWidth / s;
        const availH = window.innerHeight / s - BOTTOM_RESERVE;
        const cols = Math.max(1, Math.floor((availW - PADDING) / STEP_X));
        const rows = Math.max(1, Math.floor((availH - PADDING - ICON_H) / STEP_Y) + 1);
        return { s, cols, rows };
    }

    function cellToPos(col, row) {
        return { x: PADDING + col * STEP_X, y: PADDING + row * STEP_Y };
    }

    function posToCell(x, y) {
        return {
            col: Math.round((x - PADDING) / STEP_X),
            row: Math.round((y - PADDING) / STEP_Y)
        };
    }

    function clampCell(col, row, m) {
        return {
            col: Math.max(0, Math.min(m.cols - 1, col)),
            row: Math.max(0, Math.min(m.rows - 1, row))
        };
    }

    function claimFreeCell(cell, m, occupied) {
        let col = cell.col, row = cell.row;
        const key = (c, r) => c + ':' + r;
        let guard = m.cols * m.rows + 1;
        while (occupied.has(key(col, row)) && guard-- > 0) {
            col++;
            if (col >= m.cols) { col = 0; row++; }
            if (row >= m.rows) { row = 0; col = 0; }
        }
        occupied.add(key(col, row));
        return { col, row };
    }

    function sortedEntries(entries) {
        return [...entries].sort((a, b) => {
            if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
    }

    // Self-healing pass, run before every render: snaps every stored position
    // onto the current grid, clamps into the visible area, pushes colliding
    // icons to the next free cell, assigns slots to new icons, and drops
    // stale entries (deleted/renamed). The repaired layout is persisted.
    function normalizeLayout() {
        let entries = [];
        try { entries = FileSystem.getChildren(desktopPath()) || []; } catch (e) { entries = []; }
        const names = ['$Recycle.Bin', ...sortedEntries(entries).map(e => e.name)];
        const m = getGridMetrics();
        const occupied = new Set();
        const fresh = {};
        let changed = false;
        names.forEach((name, order) => {
            const stored = positions[name];
            let cell;
            if (stored && isFinite(stored.x) && isFinite(stored.y)) {
                const c = posToCell(stored.x, stored.y);
                cell = clampCell(c.col, c.row, m);
            } else {
                cell = clampCell(order % m.cols, Math.floor(order / m.cols), m);
            }
            cell = claimFreeCell(cell, m, occupied);
            const pos = cellToPos(cell.col, cell.row);
            if (!stored || stored.x !== pos.x || stored.y !== pos.y) changed = true;
            fresh[name] = pos;
        });
        if (Object.keys(positions).length !== names.length) changed = true;
        positions = fresh;
        if (changed) {
            try { savePositions(); } catch (e) { /* noop */ }
        }
        return entries;
    }

    function render() {
        // Marquee element is a child of the container — re-append keeps it
        // on top after icons are rebuilt.
        if (marqueeEl && marqueeEl.parentNode === container) marqueeEl.remove();
        container.querySelectorAll('.desktop-icon').forEach(el => el.remove());

        const entries = sortedEntries(normalizeLayout());

        renderRecycleBin();

        // Drop selection for icons that no longer exist.
        const valid = new Set(['$Recycle.Bin', ...entries.map(e => e.name)]);
        [...selected].forEach(n => { if (!valid.has(n)) selected.delete(n); });

        entries.forEach((entry) => {
            // normalizeLayout() guarantees a valid, collision-free slot.
            const pos = positions[entry.name] || cellToPos(0, 0);

            const el = document.createElement('div');
            el.className = 'desktop-icon';
            el.dataset.name = entry.name;
            el.style.cssText = `
                position:absolute;left:${pos.x}px;top:${pos.y}px;width:${ICON_W}px;
                padding:8px;border-radius:6px;cursor:pointer;text-align:center;
                transition:background 0.12s;user-select:none;
            `;

            const isDir = entry.type === 'folder';
            const icon = isDir ? getFolderIcon(entry.name) : getFileIcon(entry.ext);

            el.innerHTML = `
                <div style="display:flex;justify-content:center;margin-bottom:4px;">${icon}</div>
                <div style="font-size:12px;word-break:break-all;line-height:1.3;color:white;text-shadow:0 1px 4px rgba(0,0,0,0.9),0 0px 8px rgba(0,0,0,0.5);">${entry.name}</div>
            `;

            makeDraggable(el, entry.name);

            el.addEventListener('mouseenter', () => {
                if (!selected.has(entry.name)) el.style.background = 'rgba(255,255,255,0.1)';
            });
            el.addEventListener('mouseleave', () => {
                if (!selected.has(entry.name)) el.style.background = 'transparent';
            });

            el.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                // Double-clicking one icon of a multi-selection opens everything
                // selected (Windows parity); single selection opens just it.
                const names = (selected.size > 1 && selected.has(entry.name))
                    ? [...selected].filter(n => n !== '$Recycle.Bin')
                    : [entry.name];
                names.forEach(n => {
                    let ent = entries.find(x => x.name === n);
                    if (!ent && n === entry.name) ent = entry;
                    if (!ent) return;
                    if (ent.type === 'folder') openFolderInExplorer([...desktopPath(), n]);
                    else openFile([...desktopPath(), n]);
                });
            });

            el.addEventListener('click', (e) => {
                e.stopPropagation();
                // A drag that just moved icons must not collapse the selection.
                // Ctrl+mousedown already added the icon — skip the toggle.
                if (el._ctrlAdded) {
                    el._ctrlAdded = false;
                    el._dragMoved = false;
                    return;
                }
                if (el._dragMoved) {
                    el._dragMoved = false;
                    return;
                }
                handleIconClick(entry.name, e);
            });

            el.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!selected.has(entry.name)) {
                    selected.clear();
                    selected.add(entry.name);
                    lastClicked = entry.name;
                }
                refreshSelection();
                showIconContextMenu(e.clientX, e.clientY, entry, entries);
            });

            container.appendChild(el);
        });
        if (marqueeEl) container.appendChild(marqueeEl);
        refreshSelection();
    }

    function showIconContextMenu(x, y, entry, entries) {
        const count = [...selected].filter(n => n !== '$Recycle.Bin').length;
        const multi = count > 1 && selected.has(entry.name);
        const itemPath = [...desktopPath(), entry.name];
        if (multi) {
            ContextMenu.show(x, y, [
                { label: `Open (${count} items)`, icon: UIIcons.action('open'), action: () => openSelected() },
                'separator',
                { label: `Delete (${count} items)`, icon: UIIcons.action('delete'), action: () => deleteSelected() }
            ]);
            return;
        }
        const isDir = entry.type === 'folder';
        const items = isDir ? [
            { label: 'Open', icon: UIIcons.action('open'), action: () => openFolderInExplorer(itemPath) },
            'separator',
            { label: 'Rename', icon: UIIcons.action('rename'), action: () => renameItem(itemPath) },
            { label: 'Delete', icon: UIIcons.action('delete'), action: () => deleteItem(itemPath) }
        ] : [
            { label: 'Open', icon: UIIcons.action('open'), action: () => openFile(itemPath) },
            'separator',
            { label: 'Rename', icon: UIIcons.action('rename'), action: () => renameItem(itemPath) },
            { label: 'Delete', icon: UIIcons.action('delete'), action: () => deleteItem(itemPath) }
        ];
        ContextMenu.show(x, y, items);
    }

    function openSelected() {
        let entries = [];
        try { entries = FileSystem.getChildren(desktopPath()) || []; } catch (e) { entries = []; }
        const byName = new Map(entries.map(e => [e.name, e]));
        [...selected].filter(n => n !== '$Recycle.Bin').forEach(n => {
            const ent = byName.get(n);
            if (!ent) return;
            if (ent.type === 'folder') openFolderInExplorer([...desktopPath(), n]);
            else openFile([...desktopPath(), n]);
        });
    }

    function deleteSelected() {
        const names = [...selected].filter(n => n !== '$Recycle.Bin');
        if (names.length === 0) return;
        const label = names.length === 1 ? `"${names[0]}"` : `${names.length} items`;
        Popup.confirm('Delete', `Delete ${label}?`).then(ok => {
            if (!ok) return;
            names.forEach(n => {
                try { FileSystem.deleteItem([...desktopPath(), n]); } catch (e) { /* noop */ }
                delete positions[n];
            });
            selected.clear();
            lastClicked = null;
            savePositions();
            render();
        });
    }

    function snapPosition(name, rawX, rawY, occupied) {
        const m = getGridMetrics();
        const dropped = posToCell(rawX, rawY);
        const clamped = clampCell(dropped.col, dropped.row, m);
        const free = claimFreeCell(clamped, m, occupied);
        return cellToPos(free.col, free.row);
    }

    function occupyAllExcept(except) {
        const m = getGridMetrics();
        const occupied = new Set();
        const skip = new Set(except);
        Object.entries(positions).forEach(([other, p]) => {
            if (skip.has(other)) return;
            const c = posToCell(p.x, p.y);
            const cc = clampCell(c.col, c.row, m);
            occupied.add(cc.col + ':' + cc.row);
        });
        return occupied;
    }

    function makeDraggable(el, name) {
        let isDragging = false;
        let startX, startY, origX, origY;
        let group = null;

        function onMouseMove(e) {
            if (!isDragging) return;

            const s = Scaling.getScale();
            const dx = (e.clientX - startX) / s;
            const dy = (e.clientY - startY) / s;
            if (Math.hypot(e.clientX - startX, e.clientY - startY) > 3) {
                el._dragMoved = true;
                if (group) group.forEach(g => { g.el._dragMoved = true; });
            }

            const newX = Math.max(0, Math.min(window.innerWidth / s - ICON_W, origX + dx));
            const newY = Math.max(0, Math.min(window.innerHeight / s - 100, origY + dy));

            el.style.left = newX + 'px';
            el.style.top = newY + 'px';

            // Drag the rest of the multi-selection along with the grabbed icon.
            if (group) {
                group.forEach(g => {
                    const gx = Math.max(0, Math.min(window.innerWidth / s - ICON_W, g.origX + dx));
                    const gy = Math.max(0, Math.min(window.innerHeight / s - 100, g.origY + dy));
                    g.el.style.left = gx + 'px';
                    g.el.style.top = gy + 'px';
                });
            }
        }

        function onMouseUp() {
            if (!isDragging) return;
            isDragging = false;

            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            el.style.transition = 'background 0.12s';
            el.style.zIndex = '';
            el.style.opacity = '';
            if (group) group.forEach(g => {
                g.el.style.transition = 'background 0.12s';
                g.el.style.zIndex = '';
                g.el.style.opacity = '';
            });

            const moved = el._dragMoved;
            // Snap the dragged icon, then snap grouped icons near their drop
            // points so the whole block lands on free cells without stacking.
            const occupied = occupyAllExcept(group ? [name, ...group.map(g => g.name)] : [name]);
            const rawX = parseInt(el.style.left);
            const rawY = parseInt(el.style.top);
            const pos = snapPosition(name, rawX, rawY, occupied);
            el.style.left = pos.x + 'px';
            el.style.top = pos.y + 'px';
            positions[name] = { x: pos.x, y: pos.y };

            if (group) {
                group.forEach(g => {
                    const gx = parseInt(g.el.style.left);
                    const gy = parseInt(g.el.style.top);
                    const gp = snapPosition(g.name, gx, gy, occupied);
                    g.el.style.left = gp.x + 'px';
                    g.el.style.top = gp.y + 'px';
                    positions[g.name] = { x: gp.x, y: gp.y };
                });
            }
            savePositions();
            if (group) group.forEach(g => { g.el._dragMoved = false; g.el._ctrlAdded = false; });
            group = null;
            // Let the click handler know a real drag happened so it doesn't
            // collapse the multi-selection. The flag is cleared on click.
            if (!moved) el._dragMoved = false;
        }

        el.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            if (e.target.closest('button')) return;

            // Pre-select on press so drags start with the right set:
            // - plain press on an unselected icon selects it alone,
            // - Ctrl press on an unselected icon adds it (click skips toggle),
            // - pressing an already-selected icon keeps the group for group-drag
            //   (Ctrl+click toggles off only if it was a real click, no drag).
            const additive = e.ctrlKey || e.metaKey;
            if (!selected.has(name)) {
                if (additive) {
                    selected.add(name);
                    lastClicked = name;
                    refreshSelection();
                    el._ctrlAdded = true;
                } else if (!e.shiftKey) {
                    selected.clear();
                    selected.add(name);
                    lastClicked = name;
                    refreshSelection();
                } else {
                    handleIconClick(name, e);
                }
            }
            e.stopPropagation();

            // Build the drag group from the current multi-selection.
            group = null;
            if (selected.size > 1 && selected.has(name) && !e.shiftKey) {
                group = [];
                selected.forEach(other => {
                    if (other === name) return;
                    const otherEl = container.querySelector(`.desktop-icon[data-name="${CSS.escape(other)}"]`);
                    if (!otherEl) return;
                    group.push({
                        name: other,
                        el: otherEl,
                        origX: parseInt(otherEl.style.left) || 0,
                        origY: parseInt(otherEl.style.top) || 0
                    });
                });
                group.forEach(g => {
                    g.el.style.transition = 'none';
                    g.el.style.zIndex = '9998';
                    g.el.style.opacity = '0.85';
                });
                if (group.length === 0) group = null;
            }

            isDragging = true;
            el._dragMoved = false;
            startX = e.clientX;
            startY = e.clientY;
            origX = parseInt(el.style.left) || 0;
            origY = parseInt(el.style.top) || 0;

            el.style.transition = 'none';
            el.style.zIndex = '9999';
            el.style.opacity = '0.85';

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);

            e.preventDefault();
        });
    }

    function renderRecycleBin() {
        const el = document.createElement('div');
        el.className = 'desktop-icon';
        el.dataset.name = '$Recycle.Bin';

        const pos = positions['$Recycle.Bin'] || cellToPos(0, 0);
        el.style.cssText = `
            position:absolute;left:${pos.x}px;top:${pos.y}px;width:80px;
            padding:8px;border-radius:6px;cursor:pointer;text-align:center;
            transition:background 0.12s;user-select:none;
        `;

        const items = FileSystem.getRecycleBinContent();
        const isEmpty = items.length === 0;

        el.innerHTML = `
            <div style="display:flex;justify-content:center;margin-bottom:4px;">${isEmpty ? UIIcons.places.recycle(36) : UIIcons.places.recycleFull(36)}</div>
            <div style="font-size:12px;word-break:break-all;line-height:1.3;color:white;text-shadow:0 1px 4px rgba(0,0,0,0.9),0 0px 8px rgba(0,0,0,0.5);">Recycle Bin</div>
        `;

        makeDraggable(el, '$Recycle.Bin');

        el.addEventListener('mouseenter', () => {
            if (!selected.has('$Recycle.Bin')) el.style.background = 'rgba(255,255,255,0.1)';
        });
        el.addEventListener('mouseleave', () => {
            if (!selected.has('$Recycle.Bin')) el.style.background = 'transparent';
        });

        el.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            openRecycleBin();
        });

        el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (el._ctrlAdded) {
                el._ctrlAdded = false;
                el._dragMoved = false;
                return;
            }
            if (el._dragMoved) {
                el._dragMoved = false;
                return;
            }
            handleIconClick('$Recycle.Bin', e);
        });

        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Recycle Bin has its own actions — select only it on right-click.
            selected.clear();
            selected.add('$Recycle.Bin');
            lastClicked = '$Recycle.Bin';
            refreshSelection();

            const items = [
                { label: 'Open', icon: UIIcons.action('open'), action: () => openRecycleBin() },
                'separator',
                { label: 'Empty Recycle Bin', icon: UIIcons.action('empty'), action: () => emptyRecycleBin() }
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
                            <span style="width:22px;height:22px;display:inline-flex;flex-shrink:0;">${item.type === 'folder' ? UIIcons.folder(item.name, 22) : UIIcons.file(item.name.split('.').pop(), item.name, 22)}</span>
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
                Sounds.recycleBin();
                win.element.querySelector('.window-body').innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-secondary);">Recycle Bin is empty</div>';
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
                    win.element.querySelector('.window-body').innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-secondary);">Recycle Bin is empty</div>';
                }
                render();
            });
        });
    }

    function emptyRecycleBin() {
        Popup.confirm('Empty Recycle Bin', 'Are you sure you want to permanently delete all items in the Recycle Bin?').then(ok => {
            if (ok) {
                FileSystem.emptyRecycleBin();
                Sounds.recycleBin();
                render();
            }
        });
    }

    function getFolderIcon(name) {
        return UIIcons.folder(name, 36);
    }

    function getFileIcon(ext) {
        return UIIcons.file(ext, '', 36);
    }

    function openFolderInExplorer(path) {
        // Route through the Explorer module so the window actually lands on
        // the folder (reused or freshly opened) instead of just appearing.
        const explorer = AppRegistry.get('fileExplorer');
        if (explorer && typeof explorer.openPath === 'function') {
            explorer.openPath(path);
        } else if (explorer) {
            explorer.launch();
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
        Popup.textbox('Rename', 'Enter new name:', { value: oldName }).then(newName => {
            if (newName && newName !== oldName) {
                if (positions[oldName]) {
                    positions[newName] = positions[oldName];
                    delete positions[oldName];
                    savePositions();
                }
                FileSystem.renameItem(path, newName);
                render();
            }
        });
    }

    function deleteItem(path) {
        const name = path[path.length - 1];
        Popup.confirm('Delete', `Delete "${name}"?`).then(ok => {
            if (ok) {
                FileSystem.deleteItem(path);
                delete positions[name];
                selected.delete(name);
                savePositions();
                render();
            }
        });
    }

    function createNewFolder() {
        let name = 'New Folder';
        let i = 1;
        while (FileSystem.itemExists([...desktopPath(), name])) {
            name = `New Folder (${i++})`;
        }
        FileSystem.createFolder(desktopPath(), name);
        const entries = FileSystem.getChildren(desktopPath());
        const s = Scaling.getScale();
        const cols = Math.floor((window.innerWidth / s - PADDING) / (ICON_W + PADDING));
        const idx = entries.length - 1;
        positions[name] = {
            x: PADDING + (idx % cols) * (ICON_W + PADDING),
            y: PADDING + Math.floor(idx / cols) * (ICON_H + PADDING)
        };
        savePositions();
        render();
    }

    function createNewFile() {
        let name = 'New Text Document.txt';
        let i = 1;
        while (FileSystem.itemExists([...desktopPath(), name])) {
            name = `New Text Document (${i++}).txt`;
        }
        FileSystem.createFile(desktopPath(), name, '', 'txt');
        const entries = FileSystem.getChildren(desktopPath());
        const s = Scaling.getScale();
        const cols = Math.floor((window.innerWidth / s - PADDING) / (ICON_W + PADDING));
        const idx = entries.length - 1;
        positions[name] = {
            x: PADDING + (idx % cols) * (ICON_W + PADDING),
            y: PADDING + Math.floor(idx / cols) * (ICON_H + PADDING)
        };
        savePositions();
        render();
    }

    return { init, render, createNewFolder, createNewFile, clearSelection, selectAll, getSelected, isSelected, deleteSelected, openSelected };
})();

export default DesktopIcons;
