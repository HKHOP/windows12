// Tray — app icons in the system tray (the taskbar notification area).
//
// Apps that can run headless (manifest "background": true, the "background"
// permission, or "service": true) may register one or more icons next to the
// system icons. An icon can have click / double-click / right-click handlers,
// a context menu, a tooltip and a live icon + badge, and it keeps working
// while the app runs with no window open — the whole point of a tray icon.
//
// This module owns the DOM + registry; the public, validated surface is the
// SDK (`js/sdk/tray.js`, `app.tray`). The tray requires background capability
// so an icon can outlive the app's window (checked in the SDK).
//
//   const tray = (await import('./tray.js')).default;
//   tray.init();                                   // boot (once)
//   const icon = tray.register('myApp', { icon, tooltip, onClick, menu });
//
// Icons are tagged with the session that registered them so concurrent
// sessions only see their own (see js/modules/sessions.js). They are removed
// when the app is uninstalled, its session signs out, or a headless app is
// stopped (see js/modules/backgroundApps.js) — or by the app itself.
import AppLoader from './appLoader.js';
import AppIcons from './appIcons.js';
import UIIcons from './uiIcons.js';
import ContextMenu from './contextMenu.js';
import { Taskbar } from './taskbar.js';

const Tray = (() => {
    const CONTAINER_ID = 'tray-app-icons';

    // appId -> Map(iconId -> record). The record holds the source of truth;
    // the handle returned to apps is a thin view over it.
    const byApp = new Map();
    let container = null;
    let activeUserId = null;
    let wired = false;

    function logError(context, err) {
        try { console.error(`[Tray] ${context}`, err); } catch (e) { /* noop */ }
    }

    // The notification-area container. Lives in #taskbar-tray (NOT inside
    // #tray-icons) so an app's authored SVG keeps its own colors instead of
    // the shell's monochrome tray recolor.
    function ensureContainer() {
        if (container && container.isConnected) return container;
        const tray = document.getElementById('taskbar-tray');
        if (!tray) return null;
        let c = document.getElementById(CONTAINER_ID);
        if (!c) {
            c = document.createElement('div');
            c.id = CONTAINER_ID;
            const clock = document.getElementById('clock');
            if (clock && typeof tray.insertBefore === 'function') tray.insertBefore(c, clock);
            else tray.appendChild(c);
        }
        container = c;
        return c;
    }

    function currentSession() {
        try {
            const S = window._Sessions;
            return (S && typeof S.getActive === 'function') ? (S.getActive() || null) : null;
        } catch (e) {
            return null;
        }
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // Accepts: inline SVG markup, an image URL, or a descriptor
    // ({ svg, app, action, setting, url, size }). Falls back to the app icon.
    function resolveIcon(icon, appId) {
        if (icon === undefined || icon === null || icon === '') {
            return AppIcons.get(appId) || UIIcons.action('open', 16);
        }
        if (typeof icon === 'object') {
            if (icon.svg) return String(icon.svg);
            if (icon.app) return AppIcons.get(icon.app) || '';
            if (icon.action) return UIIcons.action(icon.action, icon.size || 16);
            if (icon.setting) return UIIcons.setting(icon.setting, icon.size || 20);
            if (icon.url) return `<img src="${escapeHtml(icon.url)}" alt="" draggable="false">`;
            return '';
        }
        const raw = String(icon).trim();
        if (raw.startsWith('<')) return raw;                       // inline SVG
        return `<img src="${escapeHtml(raw)}" alt="" draggable="false">`;
    }

    function normalizeBadge(value) {
        if (value === null || value === undefined || value === false || value === '') return null;
        return value;
    }

    function isVisible(rec) {
        if (rec.visible === false) return false;
        if (rec.userId && activeUserId && rec.userId !== activeUserId) return false;
        return true;
    }

    function applyVisibility(rec) {
        if (!rec.el) return;
        rec.el.style.display = isVisible(rec) ? '' : 'none';
    }

    function paint(rec) {
        if (!rec.el) return;
        const badge = normalizeBadge(rec.badge);
        rec.el.innerHTML = (rec.icon || '') +
            (badge !== null ? `<span class="tray-app-badge">${escapeHtml(badge)}</span>` : '');
        rec.el.classList.toggle('has-badge', badge !== null);
        rec.el.title = rec.tooltip || '';
        rec.el.setAttribute('aria-label', rec.tooltip || rec.id);
        applyVisibility(rec);
    }

    function normalizeMenu(menu) {
        if (!Array.isArray(menu)) return null;
        const items = [];
        for (const item of menu) {
            if (item === 'separator') { items.push('separator'); continue; }
            if (!item || typeof item !== 'object') continue;
            items.push({
                label: item.label == null ? '' : String(item.label),
                icon: item.icon || '',
                disabled: !!item.disabled,
                action: typeof item.action === 'function' ? item.action : () => {}
            });
        }
        return items;
    }

    function showMenu(rec, x, y) {
        if (typeof rec.onContextMenu === 'function') {
            try { rec.onContextMenu({ appId: rec.appId, id: rec.id, x, y }); } catch (e) { logError('context menu handler', e); }
            return;
        }
        const raw = typeof rec.menu === 'function' ? rec.menu() : rec.menu;
        const items = normalizeMenu(raw);
        if (items && items.length) ContextMenu.show(x, y, items);
    }

    function defaultOpen(appId) {
        try {
            if (!AppLoader.isLaunchable(appId)) return;
            Taskbar.openApp(appId);
        } catch (e) { /* manifest unreadable — nothing to open */ }
    }

    function wireEvents(rec) {
        const el = rec.el;
        el.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof rec.onClick === 'function') {
                try { rec.onClick({ appId: rec.appId, id: rec.id }); } catch (err) { logError('click handler', err); }
            } else {
                defaultOpen(rec.appId);
            }
        });
        el.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof rec.onDoubleClick === 'function') {
                try { rec.onDoubleClick({ appId: rec.appId, id: rec.id }); } catch (err) { logError('double-click handler', err); }
            }
        });
        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showMenu(rec, e.clientX, e.clientY);
        });
    }

    function defaultTooltip(appId) {
        try {
            const man = AppLoader.getManifest(appId);
            return man && man.name ? man.name : appId;
        } catch (e) {
            return appId;
        }
    }

    function applyPatch(rec, patch) {
        if (!patch || typeof patch !== 'object') return;
        if ('icon' in patch) rec.icon = resolveIcon(patch.icon, rec.appId);
        if ('tooltip' in patch) rec.tooltip = patch.tooltip == null ? '' : String(patch.tooltip);
        if ('badge' in patch) rec.badge = normalizeBadge(patch.badge);
        if ('visible' in patch) rec.visible = patch.visible !== false;
        if ('menu' in patch) rec.menu = patch.menu;
        if ('onClick' in patch) rec.onClick = typeof patch.onClick === 'function' ? patch.onClick : null;
        if ('onDoubleClick' in patch) rec.onDoubleClick = typeof patch.onDoubleClick === 'function' ? patch.onDoubleClick : null;
        if ('onContextMenu' in patch) rec.onContextMenu = typeof patch.onContextMenu === 'function' ? patch.onContextMenu : null;
        paint(rec);
    }

    function makeHandle(rec) {
        if (rec.handle) return rec.handle;
        const api = {
            id: rec.id,
            appId: rec.appId,
            get element() { return rec.el; },
            setIcon(icon) { rec.icon = resolveIcon(icon, rec.appId); paint(rec); return api; },
            setTooltip(text) { rec.tooltip = text == null ? '' : String(text); paint(rec); return api; },
            setBadge(value) { rec.badge = normalizeBadge(value); paint(rec); return api; },
            setVisible(visible) { rec.visible = visible !== false; applyVisibility(rec); return api; },
            setMenu(menu) { rec.menu = menu; return api; },
            onClick(fn) { rec.onClick = typeof fn === 'function' ? fn : null; return api; },
            onDoubleClick(fn) { rec.onDoubleClick = typeof fn === 'function' ? fn : null; return api; },
            onContextMenu(fn) { rec.onContextMenu = typeof fn === 'function' ? fn : null; return api; },
            update(patch) { applyPatch(rec, patch); return api; },
            remove() { return unregister(rec.appId, rec.id); }
        };
        rec.handle = api;
        return api;
    }

    function recordOf(appId, iconId) {
        const map = byApp.get(appId);
        return map ? map.get(iconId || 'default') : null;
    }

    // ---- public surface ----

    function canUse(appId) {
        try { return AppLoader.canRunBackground(appId); } catch (e) { return false; }
    }

    function register(appId, spec = {}) {
        const id = spec.id ? String(spec.id) : 'default';
        const host = ensureContainer();
        if (!host) return null;

        // Idempotent: re-registering an id replaces the previous icon.
        if (recordOf(appId, id)) unregister(appId, id);

        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'tray-app-icon';
        el.dataset.app = appId;
        el.dataset.trayIcon = id;

        const rec = {
            appId,
            id,
            el,
            handle: null,
            userId: currentSession(),
            icon: resolveIcon(spec.icon, appId),
            tooltip: spec.tooltip != null ? String(spec.tooltip) : defaultTooltip(appId),
            badge: normalizeBadge(spec.badge),
            visible: spec.visible !== false,
            menu: spec.menu != null ? spec.menu : null,
            onClick: typeof spec.onClick === 'function' ? spec.onClick : null,
            onDoubleClick: typeof spec.onDoubleClick === 'function' ? spec.onDoubleClick : null,
            onContextMenu: typeof spec.onContextMenu === 'function' ? spec.onContextMenu : null
        };

        let map = byApp.get(appId);
        if (!map) { map = new Map(); byApp.set(appId, map); }
        map.set(id, rec);
        host.appendChild(el);
        paint(rec);
        wireEvents(rec);
        return makeHandle(rec);
    }

    function update(appId, iconId, patch) {
        const rec = recordOf(appId, iconId);
        if (!rec) return null;
        applyPatch(rec, patch);
        return makeHandle(rec);
    }

    function unregister(appId, iconId) {
        const map = byApp.get(appId);
        if (!map) return false;
        const rec = map.get(iconId || 'default');
        if (!rec) return false;
        try {
            if (rec.el && rec.el.parentNode) rec.el.parentNode.removeChild(rec.el);
            else if (rec.el && typeof rec.el.remove === 'function') rec.el.remove();
        } catch (e) { /* already detached */ }
        rec.el = null;
        map.delete(rec.id);
        if (map.size === 0) byApp.delete(appId);
        return true;
    }

    function removeAll(appId) {
        const map = byApp.get(appId);
        if (!map) return 0;
        const ids = [...map.keys()];
        for (const id of ids) unregister(appId, id);
        return ids.length;
    }

    function get(appId, iconId) {
        const rec = recordOf(appId, iconId);
        return rec ? makeHandle(rec) : null;
    }

    function list(appId) {
        const map = byApp.get(appId);
        return map ? [...map.values()].map(makeHandle) : [];
    }

    function listApps() {
        return [...byApp.keys()];
    }

    // Foreground session changed: show this profile's icons, hide the rest.
    function activate(userId) {
        activeUserId = userId || null;
        for (const map of byApp.values()) {
            for (const rec of map.values()) applyVisibility(rec);
        }
    }

    // A session ended: drop the icons it registered.
    function closeUser(userId) {
        if (!userId) return 0;
        let removed = 0;
        for (const [appId, map] of [...byApp]) {
            for (const rec of [...map.values()]) {
                if (rec.userId === userId) { unregister(appId, rec.id); removed++; }
            }
        }
        return removed;
    }

    // Drop icons of apps that are no longer installed.
    function handleAppsChanged() {
        for (const appId of [...byApp.keys()]) {
            let installed = true;
            try { installed = AppLoader.isInstalled(appId); } catch (e) { installed = true; }
            if (!installed) removeAll(appId);
        }
    }

    function init() {
        ensureContainer();
        if (!wired) {
            wired = true;
            try { window.addEventListener('apps-changed', handleAppsChanged); } catch (e) { /* noop */ }
        }
        // Lets OS modules (backgroundApps shutdown) clean up without a cycle.
        try { window._Tray = Tray; } catch (e) { /* noop */ }
    }

    return {
        init, activate, closeUser,
        canUse,
        register, update, remove: unregister, removeAll,
        get, list, listApps
    };
})();

export default Tray;
