import FileSystem from './fileSystem.js';
import SystemConfig from './systemConfig.js';
import Sounds from './sounds.js';
import WindowManager from './windowManager.js';
import { AppMetadata, Taskbar } from './taskbar.js';

// System notification center: Windows 11-style toasts + Action Center panel
// with quick settings. Apps send info / action / forum notifications.
//
//   import Notifications from '../modules/notifications.js';
//   Notifications.info('Done', 'Export finished.');
//   Notifications.action('Update?', 'Restart to apply?', {
//       actions: [{ label: 'Restart', value: 'yes', primary: true }, { label: 'Later', value: 'no' }],
//       onAction: v => { if (v === 'yes') location.reload(); }
//   });
//   Notifications.forum('Wi-Fi', 'Enter credentials:', {
//       fields: [{ key: 'ssid', label: 'Network' }, { key: 'pass', label: 'Password', type: 'password' }],
//       onSubmit: data => connect(data.ssid, data.pass)
//   });
//
// Flags (opts): sticky (stay until dismissed), critical (pinned panel-top,
// bypasses Focus assist), silent (no toast/sound, panel only), tag (replaces
// same-tag notification), timeout (ms, default 6000), appId, icon.
// Dismiss reasons delivered to onDismiss: 'action' | 'submit' | 'dismiss'
// (X / panel clear-one) | 'timeout' (ignored) | 'clear' (clear all) |
// 'replace' (superseded by tag).

const Notifications = (() => {
    const DATA_DIR = ['/', 'system', 'programs data', 'notifications'];
    const MAX_STORED = 20;
    const DEFAULT_TIMEOUT = 6000;
    const CRITICAL_TIMEOUT = 15000;

    let seq = 1;
    const items = new Map();
    let panelOpen = false;
    let panelEl = null;
    let toastRoot = null;
    let listEl = null;
    let bellBtn = null;
    let badgeEl = null;
    let dnd = false;
    let unread = 0;

    function esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function timeAgo(ts) {
        const d = Date.now() - ts;
        if (d < 60000) return 'Just now';
        if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
        if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
        return new Date(ts).toLocaleDateString();
    }

    // ---------------- persistence ----------------
    function ensureDataDir() {
        if (!FileSystem.itemExists(DATA_DIR)) {
            FileSystem.createFolder(['/', 'system', 'programs data'], 'notifications');
        }
    }
    function persist() {
        try {
            ensureDataDir();
            const data = JSON.stringify({
                dnd,
                items: [...items.values()].slice(-MAX_STORED).map(it => ({
                    id: it.id, type: it.type, title: it.title, message: it.message,
                    appId: it.appId, sticky: it.sticky, critical: it.critical,
                    time: it.time, tag: it.tag || null,
                    actions: it.actions || [], fields: it.fields || [],
                    submitLabel: it.submitLabel, cancelLabel: it.cancelLabel
                }))
            });
            const p = [...DATA_DIR, 'notifications.json'];
            if (FileSystem.itemExists(p)) FileSystem.writeFile(p, data);
            else FileSystem.createFile(DATA_DIR, 'notifications.json', data, 'json');
        } catch (e) { /* session continues in memory */ }
    }
    function restore() {
        try {
            const raw = FileSystem.readFile([...DATA_DIR, 'notifications.json']);
            if (!raw) return;
            const d = JSON.parse(raw);
            dnd = !!d.dnd;
            (d.items || []).forEach(it => {
                if (!it || !it.id) return;
                items.set(it.id, { ...it, onAction: null, onSubmit: null, onDismiss: null, timer: 0, toastEl: null });
                const n = parseInt(String(it.id).split('-')[1], 10);
                if (Number.isFinite(n) && n >= seq) seq = n + 1;
            });
        } catch (e) { /* corrupt save -> start fresh */ }
    }

    // ---------------- gating ----------------
    function appNameOf(appId) {
        try {
            return AppMetadata.get(appId || 'system').name;
        } catch (e) {
            return appId || 'system';
        }
    }
    function alertsAllowed(appId, critical) {
        try {
            if (SystemConfig.get('notificationAlerts') === false && !critical) return false;
            const perApp = SystemConfig.get('appNotifications') || {};
            const name = appNameOf(appId);
            if (perApp[name] === false && !critical) return false;
        } catch (e) { /* fail open */ }
        return true;
    }
    function shouldToast(rec) {
        if (rec.silent) return false;
        if (dnd && !rec.critical) return false;
        return alertsAllowed(rec.appId, rec.critical);
    }

    // ---------------- core ----------------
    function add(type, title, message, opts) {
        opts = opts || {};
        const rec = {
            id: `notif-${seq++}`,
            type,
            title: String(title ?? ''),
            message: String(message ?? ''),
            appId: opts.appId || 'system',
            icon: opts.icon || null,
            sticky: !!opts.sticky,
            critical: !!opts.critical,
            silent: !!opts.silent,
            tag: opts.tag || null,
            timeout: Number.isFinite(opts.timeout) ? opts.timeout : (opts.critical ? CRITICAL_TIMEOUT : DEFAULT_TIMEOUT),
            actions: Array.isArray(opts.actions) && opts.actions.length ? opts.actions : (type === 'action' ? [{ label: 'OK', value: 'ok' }] : []),
            fields: Array.isArray(opts.fields) ? opts.fields : [],
            submitLabel: opts.submitLabel || 'Submit',
            cancelLabel: opts.cancelLabel || 'Cancel',
            onAction: typeof opts.onAction === 'function' ? opts.onAction : null,
            onSubmit: typeof opts.onSubmit === 'function' ? opts.onSubmit : null,
            onDismiss: typeof opts.onDismiss === 'function' ? opts.onDismiss : null,
            time: Date.now(),
            timer: 0,
            toastEl: null
        };
        if (rec.tag) {
            for (const [id, it] of items) {
                if (it.tag === rec.tag && it.appId === rec.appId && id !== rec.id) {
                    removeItem(id, 'replace');
                }
            }
        }
        items.set(rec.id, rec);
        if (shouldToast(rec)) showToast(rec);
        else {
            unread++;
            updateBadge();
        }
        renderPanelList();
        persist();
        return rec.id;
    }

    function info(title, message, opts) {
        return add('info', title, message, opts);
    }
    function action(title, message, opts) {
        return add('action', title, message, opts);
    }
    function forum(title, message, opts) {
        return add('forum', title, message, opts);
    }

    function removeItem(id, reason) {
        const rec = items.get(id);
        if (!rec) return false;
        if (rec.timer) { clearTimeout(rec.timer); rec.timer = 0; }
        if (rec.toastEl && rec.toastEl.isConnected) rec.toastEl.remove();
        rec.toastEl = null;
        items.delete(id);
        if (rec.onDismiss) {
            try { rec.onDismiss(reason); } catch (e) { /* app callback error */ }
        }
        renderPanelList();
        persist();
        return true;
    }

    function dismiss(id, reason) {
        return removeItem(id, reason || 'dismiss');
    }
    function clearAll() {
        [...items.keys()].forEach(id => removeItem(id, 'clear'));
        unread = 0;
        updateBadge();
    }
    function getAll() {
        return sortedItems().map(it => ({
            id: it.id, type: it.type, title: it.title, message: it.message,
            appId: it.appId, sticky: it.sticky, critical: it.critical, time: it.time, tag: it.tag
        }));
    }
    function sortedItems() {
        return [...items.values()].sort((a, b) => {
            if (!!a.critical !== !!b.critical) return a.critical ? -1 : 1;
            return b.time - a.time;
        });
    }

    // ---------------- toasts ----------------
    function ensureToastRoot() {
        if (toastRoot && toastRoot.isConnected) return toastRoot;
        toastRoot = document.createElement('div');
        toastRoot.id = 'notif-toasts';
        document.body.appendChild(toastRoot);
        return toastRoot;
    }
    function showToast(rec) {
        const root = ensureToastRoot();
        const el = buildCard(rec, 'toast');
        root.appendChild(el);
        rec.toastEl = el;
        unread++;
        updateBadge();
        try {
            if (rec.critical) Sounds.warn();
            else Sounds.click();
        } catch (e) { /* audio unavailable */ }
        if (!rec.sticky && rec.timeout > 0) {
            rec.timer = setTimeout(() => dismiss(rec.id, 'timeout'), rec.timeout);
        }
    }

    // ---------------- card renderer (shared toast + panel) ----------------
    function appIconHtml(rec) {
        if (rec.icon) return `<span class="notif-appicon">${rec.icon}</span>`;
        try {
            const meta = AppMetadata.get(rec.appId);
            if (meta && meta.icon) return `<span class="notif-appicon">${meta.icon}</span>`;
        } catch (e) { /* noop */ }
        return `<span class="notif-appicon notif-appicon-fallback">${esc(appNameOf(rec.appId).charAt(0) || '?')}</span>`;
    }
    function buildCard(rec, ctx) {
        const el = document.createElement('div');
        el.className = `notif-card${rec.critical ? ' critical' : ''}${rec.sticky ? ' sticky' : ''}`;
        el.dataset.id = rec.id;
        const hasCallbacks = !!(rec.onAction || rec.onSubmit);

        let body = `
            <div class="notif-top">
                ${appIconHtml(rec)}
                <span class="notif-app">${esc(appNameOf(rec.appId))}</span>
                <span class="notif-time">${esc(timeAgo(rec.time))}</span>
                ${rec.critical ? '<span class="notif-crit">Critical</span>' : ''}
                <button class="notif-x" title="Dismiss">✕</button>
            </div>
            <div class="notif-title">${esc(rec.title)}</div>
            ${rec.message ? `<div class="notif-msg">${esc(rec.message)}</div>` : ''}`;

        if (rec.type === 'forum') {
            body += `<div class="notif-fields">${rec.fields.map(fieldHtml).join('')}</div>
                <div class="notif-actions">
                    <button class="notif-btn primary" data-nact="submit">${esc(rec.submitLabel)}</button>
                    <button class="notif-btn" data-nact="cancel">${esc(rec.cancelLabel)}</button>
                </div>`;
        } else if (rec.type === 'action' && rec.actions.length) {
            body += `<div class="notif-actions">${rec.actions.map((a, i) =>
                `<button class="notif-btn${a.primary ? ' primary' : ''}" data-nact="action" data-idx="${i}">${esc(a.label)}</button>`
            ).join('')}</div>`;
        }
        el.innerHTML = body;

        el.querySelector('.notif-x').addEventListener('click', e => {
            e.stopPropagation();
            dismiss(rec.id, 'dismiss');
        });
        el.querySelectorAll('[data-nact="action"]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const a = rec.actions[parseInt(btn.dataset.idx, 10)] || {};
                if (rec.onAction) {
                    try { rec.onAction(a.value !== undefined ? a.value : a.label, rec.id); } catch (err) { /* noop */ }
                }
                dismiss(rec.id, 'action');
            });
        });
        const submitBtn = el.querySelector('[data-nact="submit"]');
        if (submitBtn) {
            submitBtn.addEventListener('click', e => {
                e.stopPropagation();
                const data = {};
                el.querySelectorAll('[data-nkey]').forEach(input => {
                    const k = input.dataset.nkey;
                    if (input.type === 'checkbox') data[k] = input.checked;
                    else data[k] = input.value;
                });
                if (rec.onSubmit) {
                    try { rec.onSubmit(data, rec.id); } catch (err) { /* noop */ }
                }
                dismiss(rec.id, 'submit');
            });
        }
        const cancelBtn = el.querySelector('[data-nact="cancel"]');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', e => {
                e.stopPropagation();
                dismiss(rec.id, 'dismiss');
            });
        }
        if (ctx === 'toast') {
            el.addEventListener('click', () => focusSender(rec));
        }
        if (!hasCallbacks && (rec.type !== 'info')) {
            el.querySelectorAll('.notif-btn').forEach(b => b.addEventListener('click', () => dismiss(rec.id, 'dismiss'), { once: true }));
        }
        return el;
    }
    function fieldHtml(f) {
        const key = esc(f.key || '');
        const label = esc(f.label || f.key || '');
        const val = f.value !== undefined ? String(f.value) : '';
        const ph = esc(f.placeholder || '');
        if (f.type === 'select' && Array.isArray(f.options)) {
            return `<label class="notif-field"><span>${label}</span><select data-nkey="${key}">${f.options.map(o => {
                const v = typeof o === 'string' ? o : o.value;
                const l = typeof o === 'string' ? o : (o.label || o.value);
                return `<option value="${esc(v)}"${String(v) === val ? ' selected' : ''}>${esc(l)}</option>`;
            }).join('')}</select></label>`;
        }
        if (f.type === 'checkbox') {
            return `<label class="notif-check"><input type="checkbox" data-nkey="${key}"${val === 'true' || val === true ? ' checked' : ''}><span>${label}</span></label>`;
        }
        if (f.type === 'textarea') {
            return `<label class="notif-field"><span>${label}</span><textarea data-nkey="${key}" placeholder="${ph}">${esc(val)}</textarea></label>`;
        }
        const type = ['text', 'number', 'password'].includes(f.type) ? f.type : 'text';
        return `<label class="notif-field"><span>${label}</span><input type="${type}" data-nkey="${key}" value="${esc(val)}" placeholder="${ph}"></label>`;
    }
    function focusSender(rec) {
        try {
            if (!rec.appId || rec.appId === 'system') return;
            const wins = WindowManager.getWindowsByApp(rec.appId);
            if (wins.length) WindowManager.focusWindow(wins[0].id);
        } catch (e) { /* noop */ }
    }

    // ---------------- panel ----------------
    const BELL_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;

    function ensurePanel() {
        if (panelEl && panelEl.isConnected) return panelEl;
        panelEl = document.createElement('div');
        panelEl.id = 'notif-panel';
        panelEl.className = 'hidden';
        panelEl.innerHTML = `
            <div class="notif-panel-head">
                <span>Notifications</span>
                <div class="notif-panel-headbtns">
                    <button class="notif-dnd" title="Focus assist (do not disturb)"></button>
                    <button class="notif-clearall" title="Clear all">Clear all</button>
                </div>
            </div>
            <div class="notif-list"></div>
            <div class="notif-quick"></div>`;
        document.body.appendChild(panelEl);
        listEl = panelEl.querySelector('.notif-list');
        panelEl.querySelector('.notif-clearall').addEventListener('click', e => {
            e.stopPropagation();
            clearAll();
        });
        panelEl.querySelector('.notif-dnd').addEventListener('click', e => {
            e.stopPropagation();
            setDoNotDisturb(!dnd);
        });
        panelEl.addEventListener('click', e => e.stopPropagation());
        renderQuick();
        renderDndBtn();
        return panelEl;
    }
    function renderDndBtn() {
        const btn = panelEl && panelEl.querySelector('.notif-dnd');
        if (!btn) return;
        btn.classList.toggle('on', dnd);
        btn.innerHTML = dnd
            ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/></svg><span class="notif-slash"></span>`
            : BELL_SVG.replace('width="16" height="16"', 'width="14" height="14"');
        btn.title = dnd ? 'Focus assist on — click to allow notifications' : 'Focus assist (do not disturb)';
    }
    function renderPanelList() {
        if (!panelEl || !panelEl.isConnected) return;
        listEl.innerHTML = '';
        const all = sortedItems();
        if (!all.length) {
            listEl.innerHTML = '<div class="notif-empty">No new notifications</div>';
            return;
        }
        all.forEach(rec => {
            listEl.appendChild(buildCard(rec, 'panel'));
        });
    }
    function tileSvg(kind) {
        const paths = {
            moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
            bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
            bellOff: '<path d="M8.7 3A6 6 0 0 1 18 8c0 4-.7 6.5-1.5 8M6.3 6.3C6.1 6.9 6 7.4 6 8c0 7-3 9-3 9h14"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><line x1="2" y1="2" x2="22" y2="22"/>',
            gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'
        };
        return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[kind] || ''}</svg>`;
    }
    function renderQuick() {
        const q = panelEl.querySelector('.notif-quick');
        let dark = true, alerts = true, bright = 80, vol = 75;
        try {
            dark = SystemConfig.get('darkMode') !== false;
            alerts = SystemConfig.get('notificationAlerts') !== false;
            bright = Number(SystemConfig.get('brightness')) || 80;
            vol = Number(SystemConfig.get('masterVolume')) || 75;
        } catch (e) { /* defaults */ }
        q.innerHTML = `
            <div class="notif-tiles">
                <button class="notif-tile${dark ? '' : ' off'}" data-qtile="dark">${tileSvg('moon')}<span>Dark mode</span></button>
                <button class="notif-tile${dnd ? '' : ' off'}" data-qtile="dnd">${tileSvg(dnd ? 'bellOff' : 'bell')}<span>Focus assist</span></button>
                <button class="notif-tile${alerts ? '' : ' off'}" data-qtile="alerts">${tileSvg('bell')}<span>Notifications</span></button>
                <button class="notif-tile off" data-qtile="settings">${tileSvg('gear')}<span>Settings</span></button>
            </div>
            <div class="notif-sliders">
                <label class="notif-slider"><span>☀</span><input type="range" min="30" max="100" value="${bright}" data-qslider="brightness"></label>
                <label class="notif-slider"><span>🔊</span><input type="range" min="0" max="100" value="${vol}" data-qslider="volume"></label>
            </div>`;
        q.querySelectorAll('[data-qtile]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const k = btn.dataset.qtile;
                if (k === 'dark') {
                    const v = !(SystemConfig.get('darkMode') !== false);
                    SystemConfig.set('darkMode', v);
                    renderQuick();
                } else if (k === 'dnd') {
                    setDoNotDisturb(!dnd);
                    renderQuick();
                } else if (k === 'alerts') {
                    const v = SystemConfig.get('notificationAlerts') !== false ? false : true;
                    SystemConfig.set('notificationAlerts', v);
                    renderQuick();
                } else if (k === 'settings') {
                    close();
                    try { Taskbar.openApp('settings'); } catch (err) { /* noop */ }
                }
            });
        });
        q.querySelectorAll('[data-qslider]').forEach(input => {
            input.addEventListener('click', e => e.stopPropagation());
            input.addEventListener('input', () => {
                const k = input.dataset.qslider;
                const v = parseInt(input.value, 10);
                if (k === 'brightness') SystemConfig.set('brightness', v);
                else if (k === 'volume') SystemConfig.set('masterVolume', v);
            });
        });
    }

    // ---------------- panel open/close + tray ----------------
    function updateBadge() {
        if (!badgeEl) return;
        badgeEl.style.display = unread > 0 ? 'flex' : 'none';
        badgeEl.textContent = unread > 9 ? '9+' : String(unread);
        const tray = document.getElementById('taskbar-tray');
        if (tray) tray.classList.toggle('has-unread', unread > 0);
    }
    function open() {
        ensurePanel();
        panelEl.classList.remove('hidden');
        panelOpen = true;
        unread = 0;
        updateBadge();
        if (bellBtn) bellBtn.classList.add('open');
        renderPanelList();
        renderQuick();
        renderDndBtn();
    }
    function close() {
        if (panelEl) panelEl.classList.add('hidden');
        panelOpen = false;
        if (bellBtn) bellBtn.classList.remove('open');
    }
    function toggle(force) {
        const want = force !== undefined ? !!force : !panelOpen;
        if (want) open();
        else close();
    }
    function isOpen() {
        return panelOpen;
    }
    function setDoNotDisturb(v) {
        dnd = !!v;
        renderDndBtn();
        if (panelEl && panelEl.isConnected) renderQuick();
        persist();
    }
    function isDoNotDisturb() {
        return dnd;
    }
    function wireTray() {
        const tray = document.getElementById('taskbar-tray');
        if (!tray) return;
        if (!document.getElementById('notif-bell')) {
            bellBtn = document.createElement('button');
            bellBtn.id = 'notif-bell';
            bellBtn.className = 'taskbar-btn';
            bellBtn.title = 'Notifications';
            bellBtn.innerHTML = `${BELL_SVG}<span id="notif-badge" class="notif-badge" style="display:none;">0</span>`;
            bellBtn.addEventListener('click', e => {
                e.stopPropagation();
                toggle();
            });
            const clock = document.getElementById('clock');
            if (clock) tray.insertBefore(bellBtn, clock);
            else tray.appendChild(bellBtn);
            badgeEl = document.getElementById('notif-badge');
        }
        const clock = document.getElementById('clock');
        if (clock && !clock.dataset.notifWired) {
            clock.dataset.notifWired = '1';
            clock.style.cursor = 'pointer';
            clock.addEventListener('click', e => {
                e.stopPropagation();
                toggle();
            });
        }
        document.addEventListener('click', e => {
            if (panelOpen && panelEl && !panelEl.contains(e.target) && !e.target.closest('#taskbar-tray')) {
                close();
            }
        });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && panelOpen) close();
        });
    }

    function init() {
        restore();
        ensureToastRoot();
        ensurePanel();
        wireTray();
        updateBadge();
        renderPanelList();
    }

    return {
        init, info, action, forum, dismiss, clearAll, getAll,
        open, close, toggle, isOpen,
        setDoNotDisturb, isDoNotDisturb
    };
})();

export default Notifications;
