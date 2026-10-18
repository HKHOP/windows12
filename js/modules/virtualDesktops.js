// VirtualDesktops — real multiple-desktop system (Desktop 1, Desktop 2, …).
//
// Each window belongs to exactly one desktop (WindowManager windowData
// `desktopId`); switching hides every window that isn't on the active
// desktop. The taskbar only lists the active desktop's windows, desktops
// can be added/renamed/removed, windows can be moved between them, and
// each desktop may override the global wallpaper.
//
// Desktops are PER-USER: every profile keeps its own list, names, order,
// active desktop and per-desktop wallpapers, under
// /system/users/<id>/programs data/virtualDesktops/. Concurrent sessions
// therefore never see each other's desktops. Window→desktop assignment is
// session-only (windows reopen on their session's active desktop).
//
// Entry points: Task View (taskbar button or WIN+TAB), WIN+CTRL+LEFT/RIGHT
// to move between desktops, WIN+CTRL+D for a new desktop,
// WIN+SHIFT+LEFT/RIGHT to throw the focused window across desktops.
import WindowManager from './windowManager.js';
import FileSystem from './fileSystem.js';
import UIIcons from './uiIcons.js';
import Flyout from './flyout.js';
import Popup from './popup.js';
import Keyboard from './keyboard.js';
import SystemConfig from './systemConfig.js';
import { Taskbar } from './taskbar.js';
import Users from './users.js';

const VirtualDesktops = (() => {
    const DIR = ['virtualDesktops'];
    const FILE = 'desktops.json';
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

    // Per-user state, loaded lazily: userId -> { desktops, activeId }.
    const states = new Map();
    let activeUserId = null;
    let panel = null;

    function defaultState() {
        return { desktops: [{ id: DEFAULT_ID, name: 'Desktop 1', wallpaper: null }], activeId: DEFAULT_ID };
    }

    function currentId() {
        if (activeUserId) return activeUserId;
        const u = Users.getCurrent();
        return u ? u.id : 'default';
    }

    function statePath(userId) {
        return Users.userDataFor(userId, [...DIR, FILE]);
    }

    function ensureDir(userId) {
        const dir = Users.userDataFor(userId, DIR);
        for (let i = 1; i <= dir.length; i++) {
            const partial = dir.slice(0, i);
            if (!FileSystem.itemExists(partial)) {
                FileSystem.createFolder(dir.slice(0, i - 1), dir[i - 1]);
            }
        }
    }

    // Shell-owned FS access (shield from fsGuard app attribution).
    function asShell(fn) {
        return (...args) => {
            const g = window._FSGuard;
            if (g) return g.asShell(fn)(...args);
            return fn(...args);
        };
    }

    const readState = asShell(function readState(userId) {
        const st = defaultState();
        try {
            const raw = FileSystem.readFile(statePath(userId));
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed.desktops) && parsed.desktops.length > 0) {
                    const list = parsed.desktops
                        .filter(d => d && typeof d.id === 'string' && typeof d.name === 'string')
                        .map(d => ({ id: d.id, name: d.name, wallpaper: typeof d.wallpaper === 'string' ? d.wallpaper : null }));
                    if (list.length > 0) st.desktops = list;
                }
                if (parsed.activeId && st.desktops.some(d => d.id === parsed.activeId)) st.activeId = parsed.activeId;
                else st.activeId = st.desktops[0].id;
            }
        } catch { /* fresh defaults */ }
        return st;
    });

    const writeState = asShell(function writeState(userId, st) {
        try {
            ensureDir(userId);
            const json = JSON.stringify({ desktops: st.desktops, activeId: st.activeId });
            const path = statePath(userId);
            if (FileSystem.itemExists(path)) FileSystem.writeFile(path, json);
            else FileSystem.createFile(Users.userDataFor(userId, DIR), FILE, json, 'json');
        } catch { /* keep in-memory only */ }
    });

    function state(userId) {
        const id = userId || currentId();
        let st = states.get(id);
        if (!st) {
            st = readState(id);
            states.set(id, st);
        }
        return st;
    }

    function save() {
        writeState(currentId(), state());
    }

    function esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function getDesktops() {
        return state().desktops.map(d => ({ ...d }));
    }

    function getActiveId() {
        return state().activeId;
    }

    function getDesktopOf(windowId) {
        const w = WindowManager._getWindow(windowId);
        return (w && w.desktopId) || DEFAULT_ID;
    }

    // Windows of the foreground session on one desktop.
    function getWindows(desktopId) {
        const uid = currentId();
        return WindowManager.getAllWindows().filter(w =>
            (!w.userId || w.userId === uid) && ((w.desktopId || DEFAULT_ID) === desktopId));
    }

    function notifyChanged() {
        try {
            window.dispatchEvent(new CustomEvent('virtual-desktop-changed', { detail: { activeId: getActiveId() } }));
        } catch { /* noop */ }
    }

    function applyWallpaper() {
        try {
            const desktopEl = document.getElementById('desktop');
            if (!desktopEl) return;
            const st = state();
            const current = st.desktops.find(d => d.id === st.activeId);
            const override = current && current.wallpaper;
            const theme = SystemConfig.get('darkMode') === false ? 'light' : 'dark';
            if (!override && typeof SystemConfig.applyImageWallpaper === 'function' && SystemConfig.applyImageWallpaper(desktopEl)) {
                // Custom image configured: gradient fallback is painted by
                // SystemConfig.apply() underneath; the image lands on top.
                // Re-assert the fallback in case a previous override set it.
                const fallback = SystemConfig.get('backgroundStyle') || 'gradient';
                desktopEl.style.background = (WALLPAPERS[theme] && WALLPAPERS[theme][fallback]) || WALLPAPERS[theme].gradient;
                return;
            }
            const style = override || SystemConfig.get('backgroundStyle') || 'gradient';
            desktopEl.style.background = (WALLPAPERS[theme] && WALLPAPERS[theme][style]) || WALLPAPERS[theme].gradient;
            desktopEl.style.backgroundImage = '';
            desktopEl.style.backgroundSize = '';
            desktopEl.style.backgroundPosition = '';
            desktopEl.style.backgroundRepeat = '';
        } catch { /* desktop not ready */ }
    }

    function focusTopWindow() {
        let top = null;
        let topZ = -Infinity;
        const st = state();
        for (const w of getWindows(st.activeId)) {
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
        const st = state();
        if (!st.desktops.some(d => d.id === id)) return false;
        st.activeId = id;
        save();
        WindowManager.applyVisibility();
        applyWallpaper();
        Taskbar.renderTaskbarButtons();
        focusTopWindow();
        notifyChanged();
        if (panel && Flyout.isOpen(panel)) renderPanel();
        return true;
    }

    function step(delta) {
        const st = state();
        const i = st.desktops.findIndex(d => d.id === st.activeId);
        const n = (i + delta + st.desktops.length) % st.desktops.length;
        switchTo(st.desktops[n].id);
    }

    function add(name) {
        const st = state();
        if (st.desktops.length >= MAX_DESKTOPS) {
            Popup.warn('Desktop limit', `You can have at most ${MAX_DESKTOPS} desktops.`);
            return null;
        }
        const n = st.desktops.length + 1;
        const id = `desktop-${Date.now().toString(36)}`;
        st.desktops.push({ id, name: name || `Desktop ${n}`, wallpaper: null });
        save();
        switchTo(id);
        if (panel && Flyout.isOpen(panel)) renderPanel();
        return id;
    }

    function remove(id) {
        const st = state();
        if (st.desktops.length <= 1) {
            Popup.warn('Cannot remove', 'You need at least one desktop.');
            return false;
        }
        const i = st.desktops.findIndex(d => d.id === id);
        if (i === -1) return false;
        const fallback = st.desktops[i - 1] || st.desktops[i + 1];
        for (const w of getWindows(id)) {
            w.desktopId = fallback.id;
        }
        st.desktops.splice(i, 1);
        save();
        if (st.activeId === id) {
            switchTo(fallback.id);
        } else {
            WindowManager.applyVisibility();
            Taskbar.renderTaskbarButtons();
            notifyChanged();
        }
        if (panel && Flyout.isOpen(panel)) renderPanel();
        return true;
    }

    function rename(id, name) {
        const st = state();
        const d = st.desktops.find(x => x.id === id);
        if (!d) return false;
        name = String(name || '').trim().slice(0, 32);
        if (!name) return false;
        d.name = name;
        save();
        if (panel && Flyout.isOpen(panel)) renderPanel();
        return true;
    }

    function promptRename(id) {
        const st = state();
        const d = st.desktops.find(x => x.id === id);
        if (!d) return;
        Popup.textbox('Rename desktop', 'Desktop name:', { value: d.name }).then(name => {
            if (name) rename(id, name);
        });
    }

    function setWallpaper(id, style) {
        const st = state();
        const d = st.desktops.find(x => x.id === id);
        if (!d) return false;
        d.wallpaper = (style && WALLPAPERS.dark[style]) ? style : null;
        save();
        applyWallpaper();
        if (panel && Flyout.isOpen(panel)) renderPanel();
        return true;
    }

    function moveWindowTo(windowId, desktopId) {
        const w = WindowManager._getWindow(windowId);
        if (!w || !state().desktops.some(d => d.id === desktopId)) return false;
        w.desktopId = desktopId;
        WindowManager.applyVisibility();
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
        const st = state();
        const i = st.desktops.findIndex(d => d.id === (w.desktopId || DEFAULT_ID));
        const n = (i + delta + st.desktops.length) % st.desktops.length;
        moveWindowTo(w.id, st.desktops[n].id);
        switchTo(st.desktops[n].id);
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
        const st = state();
        let html = '<div class="tv-title">Task View</div><div class="tv-desktops">';
        st.desktops.forEach((d, di) => {
            const wins = getWindows(d.id);
            html += `<div class="tv-desktop${d.id === st.activeId ? ' active' : ''}" data-desktop="${esc(d.id)}">
                <div class="tv-desktop-header">
                    <span class="tv-desktop-name" title="Double-click to rename">${esc(d.name)}</span>
                    <span class="tv-count">${wins.length}</span>
                    <button class="tv-rename" data-rename="${esc(d.id)}" title="Rename">Rename</button>
                    ${st.desktops.length > 1 ? `<button class="tv-close" data-close="${esc(d.id)}" title="Close desktop">&times;</button>` : ''}
                </div>
                <div class="tv-windows">`;
            if (wins.length === 0) {
                html += '<div class="tv-nowindows">No open windows</div>';
            } else {
                for (const w of wins) {
                    html += `<div class="tv-win" data-win="${esc(w.id)}" title="${esc(w.title)}">
                        ${di > 0 ? `<button class="tv-move" data-move-left="${esc(w.id)}" title="Move to ${esc(st.desktops[di - 1].name)}">&#8249;</button>` : '<span class="tv-move-sp"></span>'}
                        <span class="tv-win-icon">${w.icon || ''}</span>
                        <span class="tv-win-title">${esc(w.title)}</span>
                        ${di < st.desktops.length - 1 ? `<button class="tv-move" data-move-right="${esc(w.id)}" title="Move to ${esc(st.desktops[di + 1].name)}">&#8250;</button>` : '<span class="tv-move-sp"></span>'}
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
                    WindowManager.focusWindow(id);
                }
            });
        });
        panel.querySelectorAll('[data-move-left]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.moveLeft;
                const desk = getDesktopOf(id);
                const i = state().desktops.findIndex(d => d.id === desk);
                if (i > 0) moveWindowTo(id, state().desktops[i - 1].id);
            });
        });
        panel.querySelectorAll('[data-move-right]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.moveRight;
                const desk = getDesktopOf(id);
                const st2 = state();
                const i = st2.desktops.findIndex(d => d.id === desk);
                if (i >= 0 && i < st2.desktops.length - 1) moveWindowTo(id, st2.desktops[i + 1].id);
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

    // Foreground session changed: load that profile's desktops and re-apply
    // visibility + wallpaper + taskbar. Windows restored from a previous
    // session land on the active desktop.
    function activate(userId) {
        activeUserId = userId || (Users.getCurrent() ? Users.getCurrent().id : 'default');
        const st = state();
        for (const w of WindowManager.getAllWindows()) {
            if ((!w.userId || w.userId === activeUserId) && !w.desktopId) w.desktopId = st.activeId;
        }
        WindowManager.applyVisibility();
        applyWallpaper();
        Taskbar.renderTaskbarButtons();
        focusTopWindow();
        if (panel && Flyout.isOpen(panel)) renderPanel();
    }

    function init() {
        WindowManager.setDesktopProvider({ getActiveId: () => getActiveId() });
        buildPanel();
        registerShortcuts();
        activate();
    }

    return {
        init, activate, show, hide, toggle, isOpen,
        getDesktops, getActiveId, getDesktopOf, getWindows,
        switchTo, add, remove, rename, setWallpaper, moveWindowTo,
        WALLPAPER_NAMES
    };
})();

export default VirtualDesktops;
