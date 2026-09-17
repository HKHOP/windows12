// VirtualDesktops — real multiple-desktop system (Desktop 1, Desktop 2, …).
//
// Each window belongs to exactly one desktop (WindowManager windowData
// `desktopId`); switching hides every window that isn't on the active
// desktop. The taskbar only lists the active desktop's windows, desktops
// can be added/renamed/removed, windows can be moved between them, and
// each desktop may override the global wallpaper.
//
// Entry points: Task View (taskbar button or WIN+TAB), WIN+CTRL+LEFT/RIGHT
// to move between desktops, WIN+CTRL+D for a new desktop,
// WIN+SHIFT+LEFT/RIGHT to throw the focused window across desktops.
// Persistence: names/order/active/wallpapers under
// /system/programs data/virtualDesktops/. Window→desktop assignment is
// session-only (all windows reopen on the active desktop after reload).
import WindowManager from './windowManager.js';
import FileSystem from './fileSystem.js';
import UIIcons from './uiIcons.js';
import Flyout from './flyout.js';
import Popup from './popup.js';
import Keyboard from './keyboard.js';
import SystemConfig from './systemConfig.js';
import { Taskbar } from './taskbar.js';

const VirtualDesktops = (() => {
    const DATA_DIR = ['/', 'system', 'programs data', 'virtualDesktops'];
    const STATE_PATH = [...DATA_DIR, 'desktops.json'];
    const MAX_DESKTOPS = 10;
    const DEFAULT_ID = 'desktop-1';

    // Mirrors SystemConfig's wallpaper table so a desktop override can be
    // applied (and the global style re-applied when leaving an override)
    // without fighting SystemConfig.apply().
    const WALLPAPERS = {
        dark: {
            gradient: 'linear-gradient(135deg, #0a1628 0%, #1a1a3e 30%, #2d1b4e 60%, #0a1628 100%)',
            blue: 'linear-gradient(135deg, #001a33 0%, #003366 50%, #001a33 100%)',
            purple: 'linear-gradient(135deg, #1a0033 0%, #4a0080 50%, #1a0033 100%)',
            green: 'linear-gradient(135deg, #001a00 0%, #004d00 50%, #001a00 100%)',
            sunset: 'linear-gradient(135deg, #1a0a00 0%, #663300 30%, #cc6600 60%, #1a0a00 100%)',
            solid: '#1a1a2e'
        },
        light: {
            gradient: 'linear-gradient(135deg, #e8f0fe 0%, #d0e0f5 30%, #c5d5f0 60%, #e8f0fe 100%)',
            blue: 'linear-gradient(135deg, #e0f0ff 0%, #b0d4f1 50%, #e0f0ff 100%)',
            purple: 'linear-gradient(135deg, #f0e8ff 0%, #d5c0f0 50%, #f0e8ff 100%)',
            green: 'linear-gradient(135deg, #e8f5e8 0%, #c0e0c0 50%, #e8f5e8 100%)',
            sunset: 'linear-gradient(135deg, #fff5e8 0%, #f0d5b0 50%, #fff5e8 100%)',
            solid: '#e8e8f0'
        }
    };
    const WALLPAPER_NAMES = { gradient: 'Default blue', blue: 'Blue', purple: 'Purple', green: 'Green', sunset: 'Sunset', solid: 'Solid' };

    let desktops = [{ id: DEFAULT_ID, name: 'Desktop 1', wallpaper: null }];
    let activeId = DEFAULT_ID;
    let panel = null;

    function ensureDir() {
        for (let i = 1; i <= DATA_DIR.length; i++) {
            const partial = DATA_DIR.slice(0, i);
            if (!FileSystem.itemExists(partial)) {
                FileSystem.createFolder(DATA_DIR.slice(0, i - 1), DATA_DIR[i - 1]);
            }
        }
    }

    function load() {
        try {
            const raw = FileSystem.readFile(STATE_PATH);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed.desktops) && parsed.desktops.length > 0) {
                    desktops = parsed.desktops
                        .filter(d => d && typeof d.id === 'string' && typeof d.name === 'string')
                        .map(d => ({ id: d.id, name: d.name, wallpaper: typeof d.wallpaper === 'string' ? d.wallpaper : null }));
                }
                if (parsed.activeId && desktops.some(d => d.id === parsed.activeId)) {
                    activeId = parsed.activeId;
                } else {
                    activeId = desktops[0].id;
                }
            }
        } catch { /* fresh defaults */ }
    }

    function save() {
        try {
            ensureDir();
            const json = JSON.stringify({ desktops, activeId });
            if (FileSystem.itemExists(STATE_PATH)) FileSystem.writeFile(STATE_PATH, json);
            else FileSystem.createFile(DATA_DIR, 'desktops.json', json, 'json');
        } catch { /* keep in-memory only */ }
    }

    function esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function getDesktops() {
        return desktops.map(d => ({ ...d }));
    }

    function getActiveId() {
        return activeId;
    }

    function getDesktopOf(windowId) {
        const w = WindowManager._getWindow(windowId);
        return (w && w.desktopId) || DEFAULT_ID;
    }

    function getWindows(desktopId) {
        return WindowManager.getAllWindows().filter(w => ((w.desktopId || DEFAULT_ID) === desktopId));
    }

    function notifyChanged() {
        try {
            window.dispatchEvent(new CustomEvent('virtual-desktop-changed', { detail: { activeId } }));
        } catch { /* noop */ }
    }

    function applyWallpaper() {
        try {
            const desktopEl = document.getElementById('desktop');
            if (!desktopEl) return;
            const current = desktops.find(d => d.id === activeId);
            const override = current && current.wallpaper;
            const theme = SystemConfig.get('darkMode') === false ? 'light' : 'dark';
            const style = override || SystemConfig.get('backgroundStyle') || 'gradient';
            desktopEl.style.background = (WALLPAPERS[theme] && WALLPAPERS[theme][style]) || WALLPAPERS[theme].gradient;
        } catch { /* desktop not ready */ }
    }

    function focusTopWindow() {
        let top = null;
        let topZ = -Infinity;
        for (const w of getWindows(activeId)) {
            if (w.minimized) continue;
            const z = parseInt(w.element.style.zIndex || '0', 10) || 0;
            if (z >= topZ) {
                topZ = z;
                top = w;
            }
        }
        if (top) {
            WindowManager.focusWindow(top.id);
        } else {
            Taskbar.clearActiveApp();
        }
    }

    function switchTo(id) {
        if (!desktops.some(d => d.id === id)) return false;
        activeId = id;
        save();
        for (const w of WindowManager.getAllWindows()) {
            const onThis = ((w.desktopId || DEFAULT_ID) === id);
            w.element.classList.remove('focused');
            w.element.style.display = (!onThis || w.minimized) ? 'none' : 'flex';
        }
        applyWallpaper();
        Taskbar.renderTaskbarButtons();
        focusTopWindow();
        notifyChanged();
        if (panel && Flyout.isOpen(panel)) renderPanel();
        return true;
    }

    function step(delta) {
        const i = desktops.findIndex(d => d.id === activeId);
        const n = (i + delta + desktops.length) % desktops.length;
        switchTo(desktops[n].id);
    }

    function add(name) {
        if (desktops.length >= MAX_DESKTOPS) {
            Popup.warn('Desktop limit', `You can have at most ${MAX_DESKTOPS} desktops.`);
            return null;
        }
        const n = desktops.length + 1;
        const id = `desktop-${Date.now().toString(36)}`;
        const desktop = { id, name: name || `Desktop ${n}`, wallpaper: null };
        desktops.push(desktop);
        save();
        switchTo(id);
        if (panel && Flyout.isOpen(panel)) renderPanel();
        return id;
    }

    function remove(id) {
        if (desktops.length <= 1) {
            Popup.warn('Cannot remove', 'You need at least one desktop.');
            return false;
        }
        const i = desktops.findIndex(d => d.id === id);
        if (i === -1) return false;
        const fallback = desktops[i - 1] || desktops[i + 1];
        for (const w of getWindows(id)) {
            w.desktopId = fallback.id;
        }
        desktops.splice(i, 1);
        save();
        if (activeId === id) {
            switchTo(fallback.id);
        } else {
            Taskbar.renderTaskbarButtons();
            notifyChanged();
        }
        if (panel && Flyout.isOpen(panel)) renderPanel();
        return true;
    }

    function rename(id, name) {
        const d = desktops.find(x => x.id === id);
        if (!d) return false;
        name = String(name || '').trim().slice(0, 32);
        if (!name) return false;
        d.name = name;
        save();
        if (panel && Flyout.isOpen(panel)) renderPanel();
        return true;
    }

    function promptRename(id) {
        const d = desktops.find(x => x.id === id);
        if (!d) return;
        Popup.textbox('Rename desktop', 'Desktop name:', { value: d.name }).then(name => {
            if (name) rename(id, name);
        });
    }

    function setWallpaper(id, style) {
        const d = desktops.find(x => x.id === id);
        if (!d) return false;
        d.wallpaper = (style && WALLPAPERS.dark[style]) ? style : null;
        save();
        applyWallpaper();
        return true;
    }

    function moveWindowTo(windowId, desktopId) {
        const w = WindowManager._getWindow(windowId);
        if (!w || !desktops.some(d => d.id === desktopId)) return false;
        w.desktopId = desktopId;
        if (desktopId === activeId) {
            if (!w.minimized) w.element.style.display = 'flex';
        } else {
            w.element.classList.remove('focused');
            w.element.style.display = 'none';
        }
        Taskbar.renderTaskbarButtons();
        focusTopWindow();
        notifyChanged();
        if (panel && Flyout.isOpen(panel)) renderPanel();
        return true;
    }

    function moveFocused(delta) {
        const focused = document.querySelector('.app-window.focused');
        if (!focused) return;
        const w = WindowManager._getWindow(focused.id);
        if (!w) return;
        const i = desktops.findIndex(d => d.id === (w.desktopId || DEFAULT_ID));
        const n = (i + delta + desktops.length) % desktops.length;
        moveWindowTo(w.id, desktops[n].id);
        switchTo(desktops[n].id);
        WindowManager.focusWindow(w.id);
    }

    // ---------- Task View ----------

    function buildPanel() {
        panel = document.createElement('div');
        panel.id = 'task-view';
        panel.classList.add('hidden');
        document.body.appendChild(panel);
        panel.addEventListener('mousedown', (e) => e.stopPropagation());
    }

    function renderPanel() {
        if (!panel) return;
        let html = '<div class="tv-title">Task View</div><div class="tv-desktops">';
        desktops.forEach((d, di) => {
            const wins = getWindows(d.id);
            html += `<div class="tv-desktop${d.id === activeId ? ' active' : ''}" data-desktop="${esc(d.id)}">
                <div class="tv-desktop-header">
                    <span class="tv-desktop-name" title="Double-click to rename">${esc(d.name)}</span>
                    <span class="tv-count">${wins.length}</span>
                    <button class="tv-rename" data-rename="${esc(d.id)}" title="Rename">Rename</button>
                    ${desktops.length > 1 ? `<button class="tv-close" data-close="${esc(d.id)}" title="Close desktop">&times;</button>` : ''}
                </div>
                <div class="tv-windows">`;
            if (wins.length === 0) {
                html += '<div class="tv-nowindows">No open windows</div>';
            } else {
                for (const w of wins) {
                    html += `<div class="tv-win" data-win="${esc(w.id)}" title="${esc(w.title)}">
                        ${di > 0 ? `<button class="tv-move" data-move-left="${esc(w.id)}" title="Move to ${esc(desktops[di - 1].name)}">&#8249;</button>` : '<span class="tv-move-sp"></span>'}
                        <span class="tv-win-icon">${w.icon || ''}</span>
                        <span class="tv-win-title">${esc(w.title)}</span>
                        ${di < desktops.length - 1 ? `<button class="tv-move" data-move-right="${esc(w.id)}" title="Move to ${esc(desktops[di + 1].name)}">&#8250;</button>` : '<span class="tv-move-sp"></span>'}
                    </div>`;
                }
            }
            html += `</div></div>`;
        });
        html += `<div class="tv-desktop tv-new" data-new="1">
            <div class="tv-new-plus">+</div>
            <div class="tv-new-label">New desktop</div>
        </div></div>
        <div class="tv-footer"><span>WIN+TAB task view &middot; WIN+CTRL+&larr;/&rarr; switch &middot; WIN+CTRL+D new &middot; click a window to jump to it</span></div>`;
        panel.innerHTML = html;

        panel.querySelectorAll('.tv-win').forEach(chip => {
            chip.addEventListener('click', (e) => {
                if (e.target.closest('.tv-move')) return;
                const id = chip.dataset.win;
                const desk = getDesktopOf(id);
                hide();
                switchTo(desk);
                const w = WindowManager._getWindow(id);
                if (w) {
                    WindowManager.setMinimized(id, false);
                    w.element.style.display = 'flex';
                    WindowManager.focusWindow(id);
                }
            });
        });
        panel.querySelectorAll('[data-move-left]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.moveLeft;
                const desk = getDesktopOf(id);
                const i = desktops.findIndex(d => d.id === desk);
                if (i > 0) moveWindowTo(id, desktops[i - 1].id);
            });
        });
        panel.querySelectorAll('[data-move-right]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.moveRight;
                const desk = getDesktopOf(id);
                const i = desktops.findIndex(d => d.id === desk);
                if (i >= 0 && i < desktops.length - 1) moveWindowTo(id, desktops[i + 1].id);
            });
        });
        panel.querySelectorAll('[data-rename]').forEach(btn => {
            btn.addEventListener('click', () => promptRename(btn.dataset.rename));
        });
        panel.querySelectorAll('.tv-desktop-name').forEach(nameEl => {
            nameEl.addEventListener('dblclick', () => {
                const desk = nameEl.closest('.tv-desktop').dataset.desktop;
                promptRename(desk);
            });
        });
        panel.querySelectorAll('[data-close]').forEach(btn => {
            btn.addEventListener('click', () => remove(btn.dataset.close));
        });
        panel.querySelector('[data-new]').addEventListener('click', () => add());
        panel.querySelectorAll('.tv-desktop-header').forEach(header => {
            header.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                const desk = header.closest('.tv-desktop').dataset.desktop;
                hide();
                switchTo(desk);
            });
        });
    }

    function show() {
        if (!panel) return;
        renderPanel();
        Flyout.show(panel);
    }

    function hide() {
        if (!panel) return;
        Flyout.hide(panel);
    }

    function toggle() {
        if (!panel) return;
        if (Flyout.isOpen(panel)) hide();
        else show();
    }

    function isOpen() {
        return !!panel && Flyout.isOpen(panel);
    }

    function registerShortcuts() {
        const sys = (description) => ({ system: true, description });
        Keyboard.register('WIN+CTRL+LEFT', () => step(-1), sys('Previous desktop'));
        Keyboard.register('WIN+CTRL+RIGHT', () => step(1), sys('Next desktop'));
        Keyboard.register('WIN+CTRL+D', () => add(), sys('New desktop'));
        Keyboard.register('WIN+TAB', () => toggle(), { ...sys('Open Task View'), stopPropagation: true });
        Keyboard.register('WIN+SHIFT+LEFT', () => moveFocused(-1), sys('Move window to previous desktop'));
        Keyboard.register('WIN+SHIFT+RIGHT', () => moveFocused(1), sys('Move window to next desktop'));
        Keyboard.register('ESCAPE', () => {
            if (!isOpen()) return false;
            hide();
        }, { ...sys('Close Task View'), preventDefault: false });
    }

    function init() {
        load();
        // Windows restored from a previous session land on the active one.
        for (const w of WindowManager.getAllWindows()) {
            if (!w.desktopId) w.desktopId = activeId;
        }
        WindowManager.setDesktopProvider({ getActiveId: () => activeId });
        buildPanel();
        registerShortcuts();
        applyWallpaper();
    }

    return {
        init, show, hide, toggle, isOpen,
        getDesktops, getActiveId, getDesktopOf, getWindows,
        switchTo, add, remove, rename, setWallpaper, moveWindowTo,
        WALLPAPER_NAMES
    };
})();

export default VirtualDesktops;
