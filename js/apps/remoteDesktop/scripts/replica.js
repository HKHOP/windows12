// Remote Desktop — replica renderer.
//
// Draws the remote desktop from host snapshots inside a container and
// turns local gestures into host commands:
//   - window replicas (real icon/title, live bounds, z-order, focus)
//   - drag / 8-way resize (throttled live set-bounds), dblclick maximize,
//     minimize / maximize / close buttons, click-to-focus
//   - taskbar + start menu replica (launch apps on the host)
//   - keyboard forwarding while the stage holds focus
//   - live text preview of the host's focused text field (what you type)
//
// The stage renders at the host's native resolution. Zoom modes:
//   native — 1:1, fixed to the remote screen size (the stage keeps the
//            remote's pixel dimensions no matter how big the controller
//            window is; scroll when it overflows). This is the default,
//            so window sizes on screen always match the remote.
//   fit    — CSS-scaled to fit the controller window (whole desktop
//            visible at once, sizes shrink/grow with the window).
// Pointer math always divides back through the effective scale, so both
// modes drive the host with exact desktop coordinates.
const TASKBAR_H = 40;
const LIVE_SEND_MS = 90; // throttle for in-gesture set-bounds

function el(tag, cls, parent) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
}

// Stage-local pointer position in HOST layout px.
function hostPoint(stage, areaW, e) {
    const rect = stage.getBoundingClientRect();
    const scale = rect.width / areaW || 1;
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale, scale };
}

const GENERIC_ICON = `<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="2" fill="#556"/></svg>`;

export function createReplica(container, client) {
    container.classList.add('rd-replica');
    container.innerHTML = '';
    const stage = el('div', 'rd-stage', container);
    stage.tabIndex = 0;
    const startMenu = el('div', 'rd-startmenu', stage);
    startMenu.style.display = 'none';
    const taskbar = el('div', 'rd-taskbar', stage);
    const startBtn = el('button', 'rd-startbtn', taskbar);
    startBtn.title = 'Start';
    startBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="8" height="8" rx="1" fill="#4FC3F7"/><rect x="13" y="3" width="8" height="8" rx="1" fill="#4FC3F7"/><rect x="3" y="13" width="8" height="8" rx="1" fill="#4FC3F7"/><rect x="13" y="13" width="8" height="8" rx="1" fill="#4FC3F7"/></svg>`;

    let snap = null;        // last snapshot
    let catalog = [];       // app catalog (start menu)
    let winEls = new Map(); // window id -> {root, titleEl, bodyEl, textEl, lastIcon}
    let destroyed = false;
    let suppressState = false; // during local gestures, don't re-apply host state
    let zoom = 'native';    // 'native' (fixed to remote px) | 'fit' (scale to window)

    // ---------- layout ----------

    function layout() {
        if (!snap || destroyed) return;
        const area = snap.area || { w: 1280, h: 720 };
        const totalH = area.h + TASKBAR_H;
        container.style.overflow = zoom === 'fit' ? 'hidden' : 'auto';
        const wp = snap.wallpaper || {};
        stage.style.background = wp.image && wp.image !== 'none'
            ? `${wp.image} ${wp.color || '#111'} center/cover no-repeat`
            : (wp.color || '#111');
        if (zoom === 'fit') {
            const cw = container.clientWidth || 1;
            const ch = container.clientHeight || 1;
            const s = Math.min(cw / area.w, ch / totalH);
            stage.style.width = area.w + 'px';
            stage.style.height = totalH + 'px';
            stage.style.transformOrigin = '0 0';
            stage.style.transform = `scale(${s})`;
            stage.style.left = Math.max(0, (cw - area.w * s) / 2) + 'px';
            stage.style.top = Math.max(0, (ch - totalH * s) / 2) + 'px';
            return;
        }
        // native: fixed to the remote screen size — no scaling, so the
        // controller's window size never distorts remote geometry.
        stage.style.width = area.w + 'px';
        stage.style.height = totalH + 'px';
        stage.style.transform = 'none';
        stage.style.left = '0px';
        stage.style.top = '0px';
    }

    function setZoom(mode) {
        zoom = mode === 'fit' ? 'fit' : 'native';
        layout();
        return zoom;
    }

    const ro = (typeof ResizeObserver === 'function')
        ? new ResizeObserver(() => layout())
        : null;
    if (ro) ro.observe(container);
    window.addEventListener('resize', layout);

    // ---------- windows ----------

    function syncWindow(w) {
        let entry = winEls.get(w.id);
        if (!entry) {
            const root = el('div', 'rd-rwin', stage);
            root.dataset.wid = w.id;
            const title = el('div', 'rd-rtitle', root);
            const icon = el('span', 'rd-ricon', title);
            const label = el('span', 'rd-rlabel', title);
            const controls = el('div', 'rd-rcontrols', title);
            const bMin = el('button', 'rd-rbtn', controls); bMin.textContent = '—'; bMin.title = 'Minimize';
            const bMax = el('button', 'rd-rbtn', controls); bMax.textContent = '□'; bMax.title = 'Maximize';
            const bClose = el('button', 'rd-rbtn rd-rclose', controls); bClose.textContent = '✕'; bClose.title = 'Close';
            const body = el('div', 'rd-rbody', root);
            const placeholder = el('div', 'rd-rph', body);
            const text = el('pre', 'rd-rtext', body);
            // 8 resize handles
            const handles = {};
            for (const dir of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
                handles[dir] = el('div', `rd-rhandle rd-h-${dir}`, root);
                handles[dir].dataset.dir = dir;
            }
            entry = { root, icon, label, body, placeholder, text, handles, lastIcon: '' };
            winEls.set(w.id, entry);

            bMin.addEventListener('click', (e) => { e.stopPropagation(); client.post('minimize', { id: w.id }); });
            bMax.addEventListener('click', (e) => { e.stopPropagation(); client.post('maximize', { id: w.id, flag: !w.maximized }); });
            bClose.addEventListener('click', (e) => { e.stopPropagation(); client.post('close', { id: w.id }); });
            root.addEventListener('pointerdown', () => {
                stage.focus();
                client.post('focus', { id: w.id });
                bringToFrontLocally(w.id);
            });
            title.addEventListener('dblclick', (e) => {
                if (e.target.closest('.rd-rbtn')) return;
                client.post('maximize', { id: w.id, flag: !w.maximized });
            });
            setupDrag(w.id, entry, title);
            setupResize(w.id, entry);
        }
        const b = w.bounds || { x: 0, y: 0, width: 400, height: 300 };
        entry.root.style.left = b.x + 'px';
        entry.root.style.top = b.y + 'px';
        entry.root.style.width = b.width + 'px';
        entry.root.style.height = b.height + 'px';
        entry.root.style.zIndex = String(Math.max(1, w.z || 1));
        entry.root.classList.toggle('rd-focused', snap.focusedId === w.id);
        entry.root.classList.toggle('rd-maximized', !!w.maximized);
        entry.root.style.display = w.minimized ? 'none' : 'flex';
        entry.label.textContent = w.title || w.appId;
        if (w.icon && w.icon !== entry.lastIcon) {
            entry.icon.innerHTML = w.icon;
            entry.lastIcon = w.icon;
        } else if (!w.icon && entry.lastIcon !== GENERIC_ICON) {
            entry.icon.innerHTML = GENERIC_ICON;
            entry.lastIcon = GENERIC_ICON;
        }
        // Live text preview only on the focused window that owns the text.
        const ft = snap.focusText;
        const showText = ft && ft.appId === w.appId && snap.focusedId === w.id && ft.text;
        entry.text.style.display = showText ? 'block' : 'none';
        entry.placeholder.style.display = showText ? 'none' : 'flex';
        if (showText) entry.text.textContent = ft.text + '▏';
        entry.placeholder.innerHTML = `<span class="rd-rph-icon">${w.icon || GENERIC_ICON}</span><span>${escapeHtml(w.title || w.appId)}</span>`;
    }

    function escapeHtml(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function bringToFrontLocally(id) {
        let top = 0;
        for (const w of (snap.windows || [])) top = Math.max(top, w.z || 1);
        const entry = winEls.get(id);
        if (entry) entry.root.style.zIndex = String(top + 1);
        snap.windows = (snap.windows || []).map(w => ({ ...w, z: w.id === id ? top + 1 : w.z, focused: w.id === id }));
        snap.focusedId = id;
        for (const [wid, e] of winEls) e.root.classList.toggle('rd-focused', wid === id);
    }

    // ---------- gestures ----------

    function setupDrag(id, entry, title) {
        let dragging = false;
        let sx = 0, sy = 0, ox = 0, oy = 0;
        let lastSent = 0;
        let sentFinal = null;

        const send = (x, y, width, height, force) => {
            const now = performance.now();
            if (force || now - lastSent > LIVE_SEND_MS) {
                lastSent = now;
                client.post('set-bounds', { id, bounds: { x, y, width, height } });
            }
        };
        title.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.rd-rbtn')) return;
            if (e.button !== 0) return;
            dragging = true;
            suppressState = true;
            sx = e.clientX; sy = e.clientY;
            ox = entry.root.offsetLeft; oy = entry.root.offsetTop;
            title.setPointerCapture(e.pointerId);
            e.preventDefault();
        });
        title.addEventListener('pointermove', (e) => {
            if (!dragging || !snap) return;
            const p = hostPoint(stage, snap.area.w, e);
            const p0 = hostPoint(stage, snap.area.w, { clientX: sx, clientY: sy });
            const x = Math.max(0, Math.round(ox + p.x - p0.x));
            const y = Math.max(0, Math.round(oy + p.y - p0.y));
            entry.root.style.left = x + 'px';
            entry.root.style.top = y + 'px';
            sentFinal = { x, y };
            send(x, y, entry.root.offsetWidth, entry.root.offsetHeight, false);
        });
        const stop = () => {
            if (!dragging) return;
            dragging = false;
            suppressState = false;
            if (sentFinal) {
                send(sentFinal.x, sentFinal.y, entry.root.offsetWidth, entry.root.offsetHeight, true);
                sentFinal = null;
            }
        };
        title.addEventListener('pointerup', stop);
        title.addEventListener('pointercancel', stop);
    }

    function setupResize(id, entry) {
        let resizing = false;
        let dir = null;
        let sx = 0, sy = 0, ox = 0, oy = 0, ow = 0, oh = 0;
        let minW = 400, minH = 300;
        let lastSent = 0;

        const send = (x, y, width, height, force) => {
            const now = performance.now();
            if (force || now - lastSent > LIVE_SEND_MS) {
                lastSent = now;
                client.post('set-bounds', { id, bounds: { x, y, width, height } });
            }
        };
        for (const h of Object.values(entry.handles)) {
            h.addEventListener('pointerdown', (e) => {
                if (e.button !== 0) return;
                const win = (snap.windows || []).find(w => w.id === id);
                if (!win || win.maximized) return;
                resizing = true;
                suppressState = true;
                dir = h.dataset.dir;
                sx = e.clientX; sy = e.clientY;
                ox = entry.root.offsetLeft; oy = entry.root.offsetTop;
                ow = entry.root.offsetWidth; oh = entry.root.offsetHeight;
                minW = win.minWidth || 400; minH = win.minHeight || 300;
                h.setPointerCapture(e.pointerId);
                e.preventDefault();
                e.stopPropagation();
            });
            const move = (e) => {
                if (!resizing || !snap) return;
                const p = hostPoint(stage, snap.area.w, e);
                const p0 = hostPoint(stage, snap.area.w, { clientX: sx, clientY: sy });
                let dx = Math.round(p.x - p0.x);
                let dy = Math.round(p.y - p0.y);
                let x = ox, y = oy, w = ow, h2 = oh;
                if (dir.includes('e')) w = Math.max(minW, ow + dx);
                if (dir.includes('s')) h2 = Math.max(minH, oh + dy);
                if (dir.includes('w')) { w = Math.max(minW, ow - dx); x = ox + (ow - w); }
                if (dir.includes('n')) { h2 = Math.max(minH, oh - dy); y = Math.max(0, oy + (oh - h2)); }
                entry.root.style.left = x + 'px';
                entry.root.style.top = y + 'px';
                entry.root.style.width = w + 'px';
                entry.root.style.height = h2 + 'px';
                send(x, y, w, h2, false);
            };
            const stop = () => {
                if (!resizing) return;
                resizing = false;
                suppressState = false;
                send(entry.root.offsetLeft, entry.root.offsetTop, entry.root.offsetWidth, entry.root.offsetHeight, true);
            };
            h.addEventListener('pointermove', move);
            h.addEventListener('pointerup', stop);
            h.addEventListener('pointercancel', stop);
        }
    }

    // ---------- taskbar + start menu ----------

    function catalogIcon(appId) {
        const c = catalog.find(a => a.id === appId);
        return (c && c.icon) || (winEls.size && findWinIcon(appId)) || GENERIC_ICON;
    }

    function findWinIcon(appId) {
        const w = (snap.windows || []).find(w => w.appId === appId);
        return w ? w.icon : '';
    }

    function syncTaskbar() {
        taskbar.querySelectorAll('.rd-tbtn').forEach(b => b.remove());
        // The device label is re-created below — drop the stale one or it
        // piles up (one extra label per snapshot).
        taskbar.querySelectorAll('.rd-tlabel').forEach(l => l.remove());
        const seen = new Set();
        const pins = (snap.taskbarPins || []).filter(p => typeof p === 'string');
        const running = [...new Set((snap.windows || []).map(w => w.appId))];
        const focusedApp = (() => {
            const w = (snap.windows || []).find(w => w.id === snap.focusedId);
            return w ? w.appId : null;
        })();
        for (const appId of [...pins, ...running]) {
            if (seen.has(appId)) continue;
            seen.add(appId);
            const btn = el('button', 'rd-tbtn', taskbar);
            btn.dataset.app = appId;
            btn.title = appId;
            btn.innerHTML = catalogIcon(appId);
            const hasWin = running.includes(appId);
            btn.classList.toggle('rd-t-running', hasWin);
            btn.classList.toggle('rd-t-active', hasWin && focusedApp === appId);
            btn.addEventListener('click', () => {
                stage.focus();
                const wins = (snap.windows || []).filter(w => w.appId === appId);
                if (wins.length === 0) {
                    client.post('launch-app', { appId });
                } else {
                    const top = wins.reduce((a, b) => ((b.z || 0) > (a.z || 0) ? b : a), wins[0]);
                    if (focusedApp === appId && !top.minimized) {
                        client.post('minimize', { id: top.id });
                    } else {
                        client.post('focus', { id: top.id });
                    }
                }
            });
        }
        const label = el('span', 'rd-tlabel', taskbar);
        label.textContent = (client.device && client.device.name) || 'Remote device';
    }

    function toggleStartMenu(force) {
        const show = force !== undefined ? force : startMenu.style.display === 'none';
        startMenu.style.display = show ? 'flex' : 'none';
        if (show && catalog.length === 0 && client.isOpen) {
            client.request('apps', {}).then((res) => {
                if (res && Array.isArray(res.apps)) {
                    catalog = res.apps;
                    renderStartMenu();
                }
            }).catch(() => { /* host busy */ });
        }
    }

    function renderStartMenu() {
        startMenu.innerHTML = '';
        const grid = el('div', 'rd-smgrid', startMenu);
        const sorted = [...catalog].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        for (const app of sorted) {
            const item = el('button', 'rd-smitem', grid);
            item.innerHTML = `<span class="rd-smicon">${app.icon || GENERIC_ICON}</span><span class="rd-smname">${escapeHtml(app.name || app.id)}</span>`;
            item.addEventListener('click', () => {
                toggleStartMenu(false);
                client.post('launch-app', { appId: app.id });
            });
        }
    }

    startBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        stage.focus();
        toggleStartMenu();
    });
    stage.addEventListener('pointerdown', (e) => {
        if (!e.target.closest('.rd-startmenu') && !e.target.closest('.rd-startbtn')) {
            toggleStartMenu(false);
        }
    });

    // ---------- keyboard ----------

    const RESERVED = new Set(['F5', 'F11', 'F12']);
    const RESERVED_COMBOS = new Set(['w', 't', 'n', 'l', 'r']);

    function keyEvent(type, e) {
        if (e.key === 'Escape' && startMenu.style.display !== 'none') {
            toggleStartMenu(false);
            e.preventDefault();
            return;
        }
        const combo = (e.ctrlKey || e.metaKey) && RESERVED_COMBOS.has((e.key || '').toLowerCase());
        if (RESERVED.has(e.key) || combo) return; // browser-reserved: don't hijack
        e.preventDefault();
        e.stopPropagation();
        client.post('key', {
            event: {
                type,
                key: e.key,
                code: e.code,
                ctrlKey: e.ctrlKey,
                shiftKey: e.shiftKey,
                altKey: e.altKey,
                metaKey: e.metaKey
            }
        });
    }
    stage.addEventListener('keydown', (e) => keyEvent('keydown', e));
    stage.addEventListener('keyup', (e) => keyEvent('keyup', e));

    // ---------- controller pointer presence ----------
    //
    // Streams the controller's mouse position (in host desktop px) so the
    // remote screen can show where the controller is pointing. Throttled;
    // the host auto-hides the marker when updates stop.

    let lastPointerSent = 0;
    stage.addEventListener('pointermove', (e) => {
        if (!snap || !client.isOpen) return;
        const now = performance.now();
        if (now - lastPointerSent < 120) return;
        lastPointerSent = now;
        const p = hostPoint(stage, (snap.area || {}).w || 1280, e);
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
        client.post('pointer', { x: Math.round(p.x), y: Math.round(p.y) });
    });
    stage.addEventListener('pointerleave', () => {
        if (client.isOpen) client.post('pointer-hide', {});
    });

    // ---------- public ----------

    function applyState(next) {
        if (destroyed || !next) return;
        snap = next;
        if (suppressState) return; // our own gesture owns the geometry right now
        const alive = new Set((next.windows || []).map(w => w.id));
        for (const [id, entry] of [...winEls]) {
            if (!alive.has(id)) {
                entry.root.remove();
                winEls.delete(id);
            }
        }
        const sorted = [...(next.windows || [])].sort((a, b) => (a.z || 0) - (b.z || 0));
        for (const w of sorted) syncWindow(w);
        syncTaskbar();
        layout();
    }

    function setApps(apps) {
        catalog = Array.isArray(apps) ? apps : [];
        renderStartMenu();
        if (snap) syncTaskbar();
    }

    function destroy() {
        destroyed = true;
        if (ro) ro.disconnect();
        window.removeEventListener('resize', layout);
        container.innerHTML = '';
        container.classList.remove('rd-replica');
        winEls.clear();
    }

    return { applyState, setApps, setZoom, getZoom: () => zoom, destroy, focus: () => stage.focus() };
}

export default createReplica;
