// Remote Desktop — replica renderer.
//
// Draws the remote desktop from host snapshots inside a container and
// turns local gestures into host commands:
//   - window replicas (real icon/title, live bounds, z-order, focus)
//   - LIVE app content: the host mirrors sanitized window HTML (+ page
//     CSS, sent once) so native apps render for real; clicks/dblclicks/
//     right-clicks inside mirrored content replay on the live host window
//     (text fields focus the host field — keystrokes already forward)
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

// Prefix every style-rule selector with `scope` so host CSS only paints
// inside the replica. Conditional group rules (@media/@supports/…) are
// recursed into; keyframes/fonts/imports stay global (harmless names).
// Quote- and comment-aware brace matching keeps embedded `{`/`}` safe.
function scopeCss(css, scope) {
    const text = String(css).replace(/\/\*[\s\S]*?\*\//g, '');
    function blockEnd(str, from) {
        let depth = 0;
        let quote = null;
        for (let k = from; k < str.length; k++) {
            const c = str[k];
            if (quote) {
                if (c === quote && str[k - 1] !== '\\') quote = null;
            } else if (c === '"' || c === "'") {
                quote = c;
            } else if (c === '{') {
                depth++;
            } else if (c === '}') {
                depth--;
                if (depth === 0) return k + 1;
            }
        }
        return str.length;
    }
    function scopeBody(src) {
        let out = '';
        let i = 0;
        while (i < src.length) {
            while (i < src.length && /\s/.test(src[i])) i++;
            if (i >= src.length) break;
            if (src[i] === '@') {
                let j = i;
                while (j < src.length && src[j] !== '{' && src[j] !== ';') j++;
                const header = src.slice(i, j).trim();
                if (j >= src.length || src[j] === ';') { out += src.slice(i, j + 1); i = j + 1; continue; }
                const end = blockEnd(src, j);
                if (/^@(?:media|supports|layer|container|scope)\b/i.test(header)) {
                    out += header + '{' + scopeBody(src.slice(j + 1, end - 1)) + '}';
                } else {
                    out += src.slice(i, end);
                }
                i = end;
            } else {
                let j = i;
                while (j < src.length && src[j] !== '{') j++;
                if (j >= src.length) break;
                const sel = src.slice(i, j).trim();
                const end = blockEnd(src, j);
                const body = src.slice(j, end);
                if (sel) {
                    out += sel.split(',').map(s => {
                        s = s.trim();
                        if (!s) return s;
                        if (/^(?:html|body|:root)\b/i.test(s)) {
                            return (scope + s.replace(/^(?:html|body|:root)\b/i, '')).trim() || scope;
                        }
                        return scope + ' ' + s;
                    }).join(', ') + body;
                }
                i = end;
            }
        }
        return out;
    }
    return scopeBody(text);
}

export function createReplica(container, client) {
    container.classList.add('rd-replica');
    container.innerHTML = '';
    const stage = el('div', 'rd-stage', container);
    stage.tabIndex = 0;
    // Desktop icons sit under windows (z-order mirrors the real desktop).
    const iconsLayer = el('div', 'rd-dicons', stage);
    const startMenu = el('div', 'rd-startmenu', stage);
    startMenu.style.display = 'none';
    buildStartMenu(startMenu);
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
    let cssEl = null;       // cached host stylesheet for mirrored content

    // Host page CSS (sent once per session, refreshed on change) so
    // mirrored app content looks like the real thing. Selectors are
    // scoped under the replica container — a <style> element would
    // otherwise restyle the controller's own desktop too.
    function setCss(css) {
        if (!cssEl) {
            cssEl = document.createElement('style');
            cssEl.setAttribute('data-rd-css', '');
            container.appendChild(cssEl);
        }
        const scoped = scopeCss(String(css), '.rd-replica');
        if (cssEl.textContent !== scoped) cssEl.textContent = scoped;
    }

    // ---------- layout ----------

    function layout() {
        if (!snap || destroyed) return;
        const area = snap.area || { w: 1280, h: 720 };
        const totalH = area.h + TASKBAR_H;
        container.style.overflow = zoom === 'fit' ? 'hidden' : 'auto';
        // The remote desktop backdrop stays solid black by design —
        // wallpaper is not mirrored, only windows, icons and chrome.
        stage.style.background = '#000';
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
            const mirror = el('div', 'rd-rmirror', body);
            mirror.style.display = 'none';
            // 8 resize handles
            const handles = {};
            for (const dir of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
                handles[dir] = el('div', `rd-rhandle rd-h-${dir}`, root);
                handles[dir].dataset.dir = dir;
            }
            entry = { root, icon, label, body, placeholder, text, mirror, lastContent: null, handles, lastIcon: '' };
            winEls.set(w.id, entry);
            setupMirrorInput(w.id, entry, mirror);

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
        // Live content mirror wins over the placeholder/text preview.
        // innerHTML is only rewritten when the host HTML actually changed,
        // so local scroll and selection inside the mirror survive polls.
        if (typeof w.content === 'string' && w.content) {
            if (entry.lastContent !== w.content) {
                entry.lastContent = w.content;
                entry.mirror.innerHTML = w.content;
            }
            entry.mirror.style.display = 'block';
            entry.text.style.display = 'none';
            entry.placeholder.style.display = 'none';
        } else {
            entry.lastContent = null;
            entry.mirror.style.display = 'none';
            entry.mirror.innerHTML = '';
            // Live text preview only on the focused window that owns the text.
            const ft = snap.focusText;
            const showText = ft && ft.appId === w.appId && snap.focusedId === w.id && ft.text;
            entry.text.style.display = showText ? 'block' : 'none';
            entry.placeholder.style.display = showText ? 'none' : 'flex';
            if (showText) entry.text.textContent = ft.text + '▏';
            entry.placeholder.innerHTML = `<span class="rd-rph-icon">${w.icon || GENERIC_ICON}</span><span>${escapeHtml(w.title || w.appId)}</span>`;
        }
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

    // Clicks inside mirrored app content replay on the live host window:
    // coordinates map back to host desktop px through the stage scale.
    // Navigation is kept local (preventDefault) — the host performs it.
    function setupMirrorInput(id, entry, mirror) {
        const toHost = (e) => {
            if (!snap) return null;
            const p = hostPoint(stage, (snap.area || {}).w || 1280, e);
            if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
            return { x: Math.round(p.x), y: Math.round(p.y) };
        };
        mirror.addEventListener('click', (e) => {
            if (e.target.closest('a')) e.preventDefault();
            const pt = toHost(e);
            if (pt) client.post('click-at', { id, ...pt });
        });
        mirror.addEventListener('dblclick', (e) => {
            if (e.target.closest('a')) e.preventDefault();
            const pt = toHost(e);
            if (pt) client.post('dblclick-at', { id, ...pt });
        });
        mirror.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const pt = toHost(e);
            if (pt) client.post('click-at', { id, ...pt, button: 2 });
        });
        mirror.addEventListener('submit', (e) => {
            // Never navigate the controller document; the host click above
            // already drove the real form.
            e.preventDefault();
        });
    }

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

    // ---------- desktop icons ----------

    let lastIconsJson = null;

    function syncDesktopIcons() {
        const icons = Array.isArray(snap && snap.desktopIcons) ? snap.desktopIcons : [];
        const json = JSON.stringify(icons.map(i => [i.name, i.x, i.y, i.dir, i.ext]));
        if (json === lastIconsJson) return;
        lastIconsJson = json;
        iconsLayer.innerHTML = '';
        for (const icon of icons) {
            const d = el('button', 'rd-dicon', iconsLayer);
            d.style.left = (icon.x || 0) + 'px';
            d.style.top = (icon.y || 0) + 'px';
            d.title = icon.name;
            d.innerHTML = `<span class="rd-dicon-img">${icon.icon || GENERIC_ICON}</span><span class="rd-dicon-label">${escapeHtml(icon.name)}</span>`;
            d.addEventListener('click', (e) => {
                e.stopPropagation();
                stage.focus();
                iconsLayer.querySelectorAll('.rd-dicon').forEach(o => o.classList.remove('selected'));
                d.classList.add('selected');
            });
            d.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                client.post('icon-open', { name: icon.name });
            });
        }
    }

    // ---------- taskbar ----------

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
        startMenu.style.display = show ? 'block' : 'none';
        if (show) {
            smState.query = '';
            if (smInput) smInput.value = '';
            showSmMain();
            renderStartMenu();
            if (catalog.length === 0 && client.isOpen) {
                client.request('apps', {}).then((res) => {
                    if (res && Array.isArray(res.apps)) {
                        catalog = res.apps;
                        renderStartMenu();
                    }
                }).catch(() => { /* host busy */ });
            }
        }
    }

    // Start menu state + static skeleton (mirrors the real menu: search,
    // Pinned grid, Recommended list, user footer, All-apps drawer).
    const smState = { query: '', view: 'main' };
    let smInput = null;
    let smMain = null;
    let smAll = null;
    let smGrid = null;
    let smList = null;
    let smFooterUser = null;

    function buildStartMenu(menu) {
        const search = el('div', 'rd-sm-search', menu);
        search.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="#888" stroke="#888" stroke-width="2"><circle cx="10.5" cy="10.5" r="7"/><line x1="15.5" y1="15.5" x2="21" y2="21"/></svg>`;
        smInput = document.createElement('input');
        smInput.type = 'text';
        smInput.placeholder = 'Type here to search';
        smInput.setAttribute('aria-label', 'Search apps');
        smInput.addEventListener('input', () => {
            smState.query = smInput.value.trim().toLowerCase();
            showSmMain();
            renderStartMenu();
        });
        // Typing in search must not leak keystrokes to the host desktop.
        smInput.addEventListener('keydown', (e) => e.stopPropagation());
        smInput.addEventListener('keyup', (e) => e.stopPropagation());
        search.appendChild(smInput);

        smMain = el('div', 'rd-sm-main', menu);

        const pinHead = el('div', 'rd-sm-sec-head', smMain);
        pinHead.innerHTML = `<span>Pinned</span>`;
        const allBtn = el('button', 'rd-sm-all-btn', pinHead);
        allBtn.textContent = 'All apps >';
        allBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            smState.view = 'all';
            renderStartMenu();
        });
        smGrid = el('div', 'rd-sm-grid', smMain);

        const recHead = el('div', 'rd-sm-sec-head', smMain);
        recHead.innerHTML = `<span>Recommended</span>`;
        smList = el('div', 'rd-sm-list', smMain);

        smAll = el('div', 'rd-sm-all', smMain);
        smAll.style.display = 'none';

        const footer = el('div', 'rd-sm-footer', menu);
        smFooterUser = el('div', 'rd-sm-user', footer);
    }

    function showSmMain() {
        smState.view = 'main';
    }

    function catalogById(appId) {
        return catalog.find(a => a.id === appId);
    }

    function pinnedApps() {
        const pins = Array.isArray(snap && snap.startPins) ? snap.startPins : [];
        const out = [];
        for (const id of pins) {
            const app = catalogById(id);
            if (app) out.push(app);
        }
        // Pins referencing unknown ids still get a generic tile so the
        // grid order matches the host.
        if (out.length === 0) {
            return [...catalog].sort((a, b) => (a.name || '').localeCompare(b.name || '')).slice(0, 6);
        }
        return out;
    }

    function launchFromMenu(appId) {
        toggleStartMenu(false);
        stage.focus();
        client.post('launch-app', { appId });
    }

    function renderStartMenu() {
        if (!smGrid) return;
        const q = smState.query;
        if (smState.view === 'all') {
            renderSmAll(q);
            return;
        }
        smAll.style.display = 'none';
        smMain.querySelectorAll(':scope > :not(.rd-sm-all)').forEach(n => { n.style.display = ''; });
        // Pinned grid (or search results across the whole catalog).
        smGrid.innerHTML = '';
        const items = q
            ? [...catalog]
                .filter(a => ((a.name || '') + ' ' + a.id).toLowerCase().includes(q))
                .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
            : pinnedApps();
        if (items.length === 0) {
            smGrid.innerHTML = `<div class="rd-sm-empty">${q ? 'No apps found' : 'Nothing pinned'}</div>`;
        }
        for (const app of items) {
            const item = el('button', 'rd-sm-item', smGrid);
            item.innerHTML = `<span class="rd-sm-appicon">${app.icon || GENERIC_ICON}</span><span class="rd-sm-appname">${escapeHtml(app.name || app.id)}</span>`;
            item.addEventListener('click', () => launchFromMenu(app.id));
        }
        // Recommended (hidden while searching, like the real menu).
        smList.innerHTML = '';
        const recHead = smList.previousElementSibling;
        if (q) {
            if (recHead) recHead.style.display = 'none';
            smList.style.display = 'none';
        } else {
            if (recHead) recHead.style.display = '';
            smList.style.display = '';
            const recs = Array.isArray(snap && snap.recommended) ? snap.recommended : [];
            if (recs.length === 0) {
                smList.innerHTML = '<div class="rd-sm-empty">No recent activity</div>';
            }
            for (const r of recs.slice(0, 6)) {
                const row = el('button', 'rd-sm-row', smList);
                row.innerHTML = `<span class="rd-sm-rowicon">${r.icon || GENERIC_ICON}</span>`
                    + `<span class="rd-sm-rowinfo"><span class="rd-sm-rowname">${escapeHtml(r.name || '')}</span>`
                    + (r.detail ? `<span class="rd-sm-rowdetail">${escapeHtml(r.detail)}</span>` : '') + `</span>`;
                row.addEventListener('click', () => {
                    toggleStartMenu(false);
                    stage.focus();
                    if (r.type === 'app' && r.id) client.post('launch-app', { appId: r.id });
                    else if (r.type === 'file' && r.path) client.post('recent-open', { type: 'file', path: r.path });
                });
            }
        }
        // Footer user.
        if (smFooterUser && snap && snap.user) {
            const name = snap.user.name || 'User';
            smFooterUser.innerHTML = `<span class="rd-sm-avatar">${escapeHtml(name.charAt(0).toUpperCase() || 'U')}</span><span>${escapeHtml(name)}</span>`;
        }
    }

    function renderSmAll(q) {
        smMain.querySelectorAll(':scope > :not(.rd-sm-all)').forEach(n => { n.style.display = 'none'; });
        smAll.style.display = 'block';
        smAll.innerHTML = '';
        const head = el('div', 'rd-sm-all-head', smAll);
        const back = el('button', 'rd-sm-back', head);
        back.innerHTML = '&#9664;';
        back.addEventListener('click', (e) => { e.stopPropagation(); showSmMain(); renderStartMenu(); });
        const title = el('span', 'rd-sm-all-title', head);
        title.textContent = 'All apps';
        const sorted = [...catalog]
            .filter(a => !q || ((a.name || '') + ' ' + a.id).toLowerCase().includes(q))
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        const groups = new Map();
        for (const app of sorted) {
            const letter = ((app.name || app.id || '?').charAt(0) || '?').toUpperCase();
            if (!groups.has(letter)) groups.set(letter, []);
            groups.get(letter).push(app);
        }
        if (sorted.length === 0) {
            smAll.innerHTML += `<div class="rd-sm-empty">No apps found</div>`;
        }
        for (const [letter, apps] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
            const lh = el('div', 'rd-sm-letter', smAll);
            lh.textContent = letter;
            for (const app of apps) {
                const row = el('button', 'rd-sm-row', smAll);
                row.innerHTML = `<span class="rd-sm-rowicon">${app.icon || GENERIC_ICON}</span>`
                    + `<span class="rd-sm-rowinfo"><span class="rd-sm-rowname">${escapeHtml(app.name || app.id)}</span></span>`;
                row.addEventListener('click', () => launchFromMenu(app.id));
            }
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
        if (typeof next.css === 'string' && next.css) setCss(next.css);
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
        syncDesktopIcons();
        syncTaskbar();
        // Keep an open menu live (pins/recommended/user), but don't churn
        // its DOM when closed.
        if (startMenu.style.display !== 'none') renderStartMenu();
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

    return { applyState, setApps, setCss, setZoom, getZoom: () => zoom, destroy, focus: () => stage.focus() };
}

export default createReplica;
