// Remote Desktop — app entry.
//
// Two roles in one app:
//   HOST    a background daemon (manifest "background": true). It starts
//           at boot via onBackground() when "Allow remote connections"
//           is on, and keeps running after the window closes
//           (close → BackgroundApps.requestBackground).
//   CONTROLLER the window UI: discover devices on this network, join by
//           invite code, then drive the remote desktop through an
//           interactive replica (scripts/replica.js).
//
// Transports (SDK Net): BroadcastChannel for same-browser devices,
// WebRTC with manual invite/answer codes for real devices.
import { createApp } from '../../sdk/index.js';
import BackgroundApps from '../../modules/backgroundApps.js';
import { HostEngine } from './scripts/hostEngine.js';
import { ClientEngine } from './scripts/clientEngine.js';
import { createReplica } from './scripts/replica.js';

const APP_ID = 'remoteDesktop';

let app = null;      // bound SDK context (created lazily — never at module scope)
let host = null;     // HostEngine singleton
let client = null;   // ClientEngine while controlling
let replica = null;  // replica renderer
let ui = null;       // live DOM refs while a window is open

function ctx() {
    if (!app) app = createApp({ id: APP_ID, name: 'Remote Desktop' });
    return app;
}

function hostEngine() {
    if (!host) {
        host = new HostEngine(ctx());
        // Surface host-side session changes in the UI when open.
        host.on('status', () => { if (ui && ui.renderStatus) ui.renderStatus(); });
        host.on('session-open', () => {
            if (ui && ui.renderStatus) ui.renderStatus();
            ctx().notify.info('Remote Desktop', 'A device is now controlling this computer.');
        });
        host.on('session-close', ({ device }) => {
            if (ui && ui.renderStatus) ui.renderStatus();
            ctx().notify.info('Remote Desktop', `"${(device && device.name) || 'The remote device'}" disconnected.`);
        });
    }
    return host;
}

// ---------- background service lifecycle ----------

async function onBackground() {
    const h = hostEngine();
    if (h.allowConnections) h.start();
}

function onForeground() { /* the window takes over below */ }

async function onShutdown() {
    try { hostEngine().stop(); } catch { /* noop */ }
}

// ---------- window + UI ----------

function launch() {
    const a = ctx();
    const h = hostEngine();
    if (h.allowConnections && !h.status().listening) h.start();

    const existing = a.window.all();
    if (existing.length > 0) {
        a.window.focus(existing[0].id);
        return;
    }

    const win = a.window.create({
        title: 'Remote Desktop',
        icon: a.icon(),
        content: buildHtml(),
        width: 1000,
        height: 660,
        minWidth: 760,
        minHeight: 520
    });

    buildUi(win);

    // Closing the window does NOT stop hosting — the daemon goes
    // headless so this device stays controllable.
    a.window.onClosed((appId) => {
        if (appId !== APP_ID) return;
        if (client && client.isOpen) client.disconnect();
        if (hostEngine().allowConnections) {
            BackgroundApps.requestBackground(APP_ID).catch(() => { /* stays foreground */ });
        }
    });
}

function buildHtml() {
    return `
    <div class="rd-app">
        <nav class="rd-nav">
            <div class="rd-nav-title">Remote Desktop</div>
            <button class="rd-nav-btn active" data-view="connect">
                ${ico('plug')}<span>Connect</span>
            </button>
            <button class="rd-nav-btn" data-view="session" style="display:none;">
                ${ico('monitor')}<span>Session</span>
            </button>
            <button class="rd-nav-btn" data-view="settings">
                ${ico('gear')}<span>Settings</span>
            </button>
            <div class="rd-nav-status" id="rd-nav-status"></div>
        </nav>
        <div class="rd-main">

            <section class="rd-view active" data-view="connect">
                <div class="rd-scroll">
                    <div class="rd-card">
                        <div class="rd-card-head">
                            <h3>Devices nearby</h3>
                            <button class="rd-btn" id="rd-refresh">${ico('refresh')} Refresh</button>
                        </div>
                        <p class="rd-hint">Devices running Windows 12 in this browser appear here. To reach devices on other computers, use invite codes below.</p>
                        <div class="rd-devices" id="rd-devices">
                            <div class="rd-empty">Searching…</div>
                        </div>
                    </div>

                    <div class="rd-card">
                        <div class="rd-card-head"><h3>Control another device</h3></div>
                        <p class="rd-hint">On the other device's Remote Desktop → Settings → <b>Create short code</b> (just type the 6 characters) or <b>Create invite code</b> (paste the full text, works offline).</p>
                        <textarea class="rd-code" id="rd-join-invite" rows="3" placeholder="Short code or full invite code…" spellcheck="false"></textarea>
                        <div class="rd-row">
                            <button class="rd-btn primary" id="rd-join">Join device</button>
                            <span class="rd-inline-status" id="rd-join-status"></span>
                        </div>
                        <div class="rd-answer" id="rd-join-answer" style="display:none;">
                            <p class="rd-hint">Give this answer code back to the other device:</p>
                            <textarea class="rd-code" id="rd-join-answer-code" rows="3" readonly spellcheck="false"></textarea>
                            <div class="rd-row">
                                <button class="rd-btn" id="rd-copy-answer">${ico('copy')} Copy answer</button>
                                <span class="rd-inline-status">Waiting for the other device…</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section class="rd-view" data-view="session">
                <div class="rd-toolbar">
                    <span class="rd-tb-name" id="rd-tb-name">Remote device</span>
                    <span class="rd-badge" id="rd-tb-transport"></span>
                    <span class="rd-badge" id="rd-tb-ping"></span>
                    <span class="rd-spacer"></span>
                    <button class="rd-btn" id="rd-tb-clipboard" title="Send your clipboard to the device">${ico('clip')} Clipboard</button>
                    <button class="rd-btn" id="rd-tb-files" title="Browse and transfer files">${ico('folder')} Files</button>
                    <button class="rd-btn" id="rd-tb-zoom" title="Toggle between actual size (fixed to the remote screen) and fit-to-window">1:1</button>
                    <button class="rd-btn" id="rd-tb-fullscreen" title="Fullscreen">${ico('expand')}</button>
                    <button class="rd-btn danger" id="rd-tb-disconnect">${ico('power')} Disconnect</button>
                </div>
                <div class="rd-session-body">
                    <div class="rd-replica-host" id="rd-replica-host"></div>
                    <aside class="rd-files" id="rd-files" style="display:none;"></aside>
                </div>
            </section>

            <section class="rd-view" data-view="settings">
                <div class="rd-scroll">
                    <div class="rd-card">
                        <div class="rd-card-head"><h3>This device</h3></div>
                        <label class="rd-field">
                            <span>Device name</span>
                            <div class="rd-row">
                                <input type="text" class="rd-input" id="rd-name" placeholder="My device">
                                <button class="rd-btn" id="rd-name-save">Save</button>
                            </div>
                        </label>
                        <label class="rd-toggle">
                            <input type="checkbox" id="rd-allow">
                            <span>Allow remote connections <small>Keeps running in the background after you close this window.</small></span>
                        </label>
                        <label class="rd-toggle">
                            <input type="checkbox" id="rd-autoallow">
                            <span>Auto-allow known devices <small>Paired devices connect without a prompt.</small></span>
                        </label>
                        <div class="rd-row rd-pin-row">
                            <span id="rd-pin-state">No PIN set</span>
                            <button class="rd-btn" id="rd-pin-set">Set PIN</button>
                            <button class="rd-btn danger" id="rd-pin-remove" style="display:none;">Remove PIN</button>
                        </div>
                    </div>

                    <div class="rd-card">
                        <div class="rd-card-head"><h3>Invite a device with a code</h3></div>
                        <p class="rd-hint">Short code: the other device just types 6 characters (needs internet for the relay). Full code: paste both ways, works fully offline.</p>
                        <div class="rd-row">
                            <button class="rd-btn primary" id="rd-short-create">Create short code</button>
                            <span class="rd-inline-status" id="rd-short-status"></span>
                        </div>
                        <div class="rd-answer" id="rd-short-out" style="display:none;">
                            <p class="rd-hint">The other device just types this in — no answer code needed:</p>
                            <div class="rd-short-code" id="rd-short-code"></div>
                            <div class="rd-row">
                                <button class="rd-btn" id="rd-short-copy">${ico('copy')} Copy code</button>
                            </div>
                        </div>
                        <div class="rd-row">
                            <button class="rd-btn primary" id="rd-invite-create">Create invite code</button>
                            <span class="rd-inline-status" id="rd-invite-status"></span>
                        </div>
                        <div class="rd-answer" id="rd-invite-out" style="display:none;">
                            <textarea class="rd-code" id="rd-invite-code" rows="3" readonly spellcheck="false"></textarea>
                            <div class="rd-row">
                                <button class="rd-btn" id="rd-invite-copy">${ico('copy')} Copy code</button>
                            </div>
                            <textarea class="rd-code" id="rd-invite-answer" rows="3" placeholder="Paste the answer code from the other device…" spellcheck="false"></textarea>
                            <div class="rd-row">
                                <button class="rd-btn primary" id="rd-invite-pair">Complete pairing</button>
                            </div>
                        </div>
                    </div>

                    <div class="rd-card">
                        <div class="rd-card-head"><h3>Known devices</h3></div>
                        <div id="rd-known"><div class="rd-empty">No paired devices yet.</div></div>
                    </div>
                </div>
            </section>
        </div>
    </div>`;
}

// Small inline SVG icons for buttons.
function ico(name) {
    const icons = {
        plug: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-5 5 5 5 0 0 1-5-5V7zM12 16v5"/></svg>',
        monitor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M9 21h6M12 17v4"/></svg>',
        gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M16.9 16.9l2.1 2.1M4.9 19.1l2.1-2.1M16.9 7.1l2.1-2.1"/></svg>',
        refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 11a8 8 0 1 0-2.3 6.3M20 5v6h-6"/></svg>',
        copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
        clip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 4H8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><path d="M9 12h6M9 8h6"/></svg>',
        folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>',
        expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5"/></svg>',
        power: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v8M6.3 6.3a8 8 0 1 0 11.4 0"/></svg>',
        up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
        file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z"/><path d="M14 3v6h6"/></svg>',
        newFolder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/><path d="M12 11v6M9 14h6"/></svg>',
        download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>',
        trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/></svg>',
        x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>'
    };
    return `<span class="rd-ico">${icons[name] || ''}</span>`;
}

function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtSize(n) {
    if (!Number.isFinite(n) || n <= 0) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

function buildUi(win) {
    const root = win.element;
    injectStyles();
    const $ = (sel) => root.querySelector(sel);

    ui = {
        win,
        root,
        view: 'connect',
        discoverTimer: null,
        path: [],
        pathNames: ['Home']
    };

    // ----- navigation -----
    root.querySelectorAll('.rd-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    function switchView(name) {
        ui.view = name;
        root.querySelectorAll('.rd-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
        root.querySelectorAll('.rd-view').forEach(v => v.classList.toggle('active', v.dataset.view === name));
        if (name === 'connect') { refreshDevices(); startDiscovery(); } else stopDiscovery();
        if (name === 'session' && replica) replica.focus();
    }
    ui.switchView = switchView;

    // ----- connect: nearby devices -----
    function startDiscovery() {
        stopDiscovery();
        refreshDevices();
        ui.discoverTimer = setInterval(refreshDevices, 4000);
    }
    function stopDiscovery() {
        if (ui.discoverTimer) { clearInterval(ui.discoverTimer); ui.discoverTimer = null; }
    }

    async function refreshDevices() {
        if (!ensureClient()) return;
        const box = $('#rd-devices');
        if (!box) return;
        let hosts = [];
        try { hosts = await client.discoverHosts(); } catch { hosts = []; }
        hosts = hosts.filter(h => !h.mine);
        if (hosts.length === 0) {
            box.innerHTML = `<div class="rd-empty">No other devices found in this browser.<br>Open Windows 12 in another tab — or use invite codes for other computers.</div>`;
            return;
        }
        box.innerHTML = '';
        for (const h of hosts) {
            const row = document.createElement('div');
            row.className = 'rd-device';
            row.innerHTML = `
                <span class="rd-device-ico">${ico('monitor')}</span>
                <span class="rd-device-name">${esc(h.name)}</span>
                <span class="rd-badge">local</span>
                <button class="rd-btn primary">Connect</button>`;
            row.querySelector('button').addEventListener('click', () => connectLocal(h));
            box.appendChild(row);
        }
    }
    ui.refreshDevices = refreshDevices;
    $('#rd-refresh').addEventListener('click', refreshDevices);

    async function connectLocal(hostEntry) {
        if (!ensureClient()) return;
        setJoinStatus('Connecting…');
        try {
            const res = await client.connectLocal(hostEntry);
            ui.onOpen(res);
        } catch (e) {
            setJoinStatus('');
            app.dialogs.error('Remote Desktop', e.message || 'Could not connect.');
        }
    }

    function setJoinStatus(text, isError) {
        const el = $('#rd-join-status');
        if (el) { el.textContent = text || ''; el.classList.toggle('err', !!isError); }
    }

    // ----- connect: join by invite -----
    $('#rd-join').addEventListener('click', async () => {
        if (!ensureClient()) return;
        const code = ($('#rd-join-invite').value || '').trim();
        if (!code) { setJoinStatus('Paste an invite code first.', true); return; }
        // Short (≤10 chars, whitespace ignored) → rendezvous pairing with
        // no answer step. Anything longer → manual full-length code.
        if (code.replace(/\s+/g, '').length <= 10) {
            setJoinStatus('Reaching the host…');
            let out;
            try {
                out = await client.joinByShortCode(code);
            } catch (e) {
                setJoinStatus('');
                app.dialogs.error('Remote Desktop', e.message || 'That short code did not work.');
                return;
            }
            setJoinStatus('Waiting for the other device to allow the connection…');
            out.opened.then((res) => ui.onOpen(res)).catch((e) => {
                app.dialogs.error('Remote Desktop', e.message || 'The connection failed.');
                setJoinStatus('');
                $('#rd-join-invite').value = '';
            });
            return;
        }
        let out;
        try {
            out = await client.joinByInvite(code);
        } catch (e) {
            app.dialogs.error('Remote Desktop', e.message || 'That invite code did not work.');
            return;
        }
        $('#rd-join-answer').style.display = 'block';
        $('#rd-join-answer-code').value = out.answerCode;
        setJoinStatus('Waiting for the other device…');
        out.opened.then((res) => ui.onOpen(res)).catch((e) => {
            app.dialogs.error('Remote Desktop', e.message || 'The connection failed.');
            $('#rd-join-answer').style.display = 'none';
            $('#rd-join-invite').value = '';
        });
    });
    $('#rd-copy-answer').addEventListener('click', async () => {
        const code = $('#rd-join-answer-code').value;
        try { await app.clipboard.writeText(code); app.notify.info('Remote Desktop', 'Answer code copied.'); }
        catch { /* selection fallback */ $('#rd-join-answer-code').select(); }
    });

    // ----- session -----
    $('#rd-tb-disconnect').addEventListener('click', () => {
        if (client && client.isOpen) client.disconnect();
    });
    $('#rd-tb-fullscreen').addEventListener('click', () => {
        try {
            if (app.window.isFullscreen(ui.win.id)) app.window.exitFullscreen(ui.win.id);
            else app.window.setFullscreen(ui.win.id);
        } catch { /* fullscreen unavailable */ }
    });
    $('#rd-tb-clipboard').addEventListener('click', sendClipboardDialog);
    $('#rd-tb-zoom').addEventListener('click', () => {
        if (!replica) return;
        const next = replica.getZoom() === 'fit' ? 'native' : 'fit';
        replica.setZoom(next);
        $('#rd-tb-zoom').textContent = next === 'fit' ? 'Fit' : '1:1';
    });
    $('#rd-tb-files').addEventListener('click', () => {
        const panel = $('#rd-files');
        const show = panel.style.display === 'none';
        panel.style.display = show ? 'flex' : 'none';
        if (show) { ui.path = []; ui.pathNames = ['Home']; refreshFiles(); }
    });

    buildFilesPanel();

    // ----- settings -----
    renderSettings();
    $('#rd-name-save').addEventListener('click', () => {
        const name = ($('#rd-name').value || '').trim();
        if (!name) return;
        hostEngine().setSetting('deviceName', name);
        renderStatus();
        app.notify.info('Remote Desktop', 'Device name saved.');
    });
    $('#rd-allow').addEventListener('change', async (e) => {
        await hostEngine().setAllowConnections(e.target.checked);
        renderStatus();
    });
    $('#rd-autoallow').addEventListener('change', (e) => {
        hostEngine().setSetting('autoAllowKnown', e.target.checked);
    });
    $('#rd-pin-set').addEventListener('click', async () => {
        const pin = await app.dialogs.text('Set PIN', 'Enter a 6-digit PIN remote devices must type before connecting.', { placeholder: 'e.g. 482913' });
        if (pin === null) return;
        const clean = pin.trim();
        if (!/^\d{6}$/.test(clean)) {
            app.dialogs.warn('Remote Desktop', 'The PIN must be exactly 6 digits.');
            return;
        }
        await hostEngine().setPin(clean);
        renderSettings();
        app.notify.info('Remote Desktop', 'PIN set. Controllers will be asked for it.');
    });
    $('#rd-pin-remove').addEventListener('click', async () => {
        const ok = await app.dialogs.confirm('Remove PIN', 'Anyone accepted on this screen will be able to connect without a PIN. Continue?');
        if (!ok) return;
        await hostEngine().setPin(null);
        renderSettings();
    });
    $('#rd-short-create').addEventListener('click', async () => {
        const status = $('#rd-short-status');
        status.textContent = 'Creating code…';
        try {
            const code = await hostEngine().createShortInviteCode();
            $('#rd-short-out').style.display = 'block';
            $('#rd-short-code').textContent = code;
            status.textContent = 'Waiting for a device… (valid 10 minutes)';
        } catch (e) {
            status.textContent = '';
            app.dialogs.error('Remote Desktop', e.message || 'Could not create a short code.');
        }
    });
    $('#rd-short-copy').addEventListener('click', async () => {
        const code = $('#rd-short-code').textContent;
        try { await app.clipboard.writeText(code); app.notify.info('Remote Desktop', 'Short code copied.'); }
        catch { /* clipboard needs focus — the code is visible to type */ }
    });
    $('#rd-invite-create').addEventListener('click', async () => {
        const status = $('#rd-invite-status');
        status.textContent = 'Creating code…';
        try {
            const code = await hostEngine().createInviteCode();
            $('#rd-invite-out').style.display = 'block';
            $('#rd-invite-code').value = code;
            status.textContent = 'Valid for 10 minutes.';
        } catch (e) {
            status.textContent = '';
            app.dialogs.error('Remote Desktop', e.message || 'Could not create an invite.');
        }
    });
    $('#rd-invite-copy').addEventListener('click', async () => {
        try { await app.clipboard.writeText($('#rd-invite-code').value); app.notify.info('Remote Desktop', 'Invite code copied.'); }
        catch { $('#rd-invite-code').select(); }
    });
    $('#rd-invite-pair').addEventListener('click', async () => {
        const answer = ($('#rd-invite-answer').value || '').trim();
        if (!answer) return;
        const status = $('#rd-invite-status');
        status.textContent = 'Completing pairing…';
        try {
            await hostEngine().completeInvite(answer);
            status.textContent = 'Paired. Waiting for the controller…';
        } catch (e) {
            status.textContent = '';
            app.dialogs.error('Remote Desktop', e.message || 'Pairing failed.');
        }
    });

    // ----- client engine events -----
    ensureClient();
    client.on('status', ({ phase, message }) => {
        if (phase === 'pin') askPin();
        else if (phase === 'consent') setJoinStatus('Waiting for the other device to allow the connection…');
        else if (phase === 'denied') setJoinStatus(message || 'Connection refused.', true);
        else if (phase === 'open') setJoinStatus('');
    });
    client.on('ping', (ms) => {
        const el = $('#rd-tb-ping');
        if (el) el.textContent = ms + ' ms';
    });
    client.on('state', (snap) => { if (replica) replica.applyState(snap); });
    client.on('apps', ({ apps }) => { if (replica) replica.setApps(apps); });
    client.on('clipboard', async ({ text }) => {
        try {
            await app.clipboard.writeText(text);
            app.notify.info('Remote Desktop', 'Remote clipboard copied to yours.');
        } catch {
            app.notify.info('Remote Desktop', 'The device copied: ' + (text.length > 60 ? text.slice(0, 60) + '…' : text));
        }
    });
    client.on('ended', ({ reason }) => {
        teardownSession();
        const msg = reason === 'local' ? null
            : `The session ended (${reason.replace(/-/g, ' ')}).`;
        if (msg) app.notify.info('Remote Desktop', msg);
        switchView('connect');
    });

    let pinAsked = false;
    async function askPin() {
        if (pinAsked) return;
        pinAsked = true;
        const pin = await app.dialogs.text('Remote Desktop PIN', 'Enter the PIN of the device you are connecting to.', { placeholder: '6-digit PIN' });
        pinAsked = false;
        if (pin === null) { client.cancel(); setJoinStatus('Cancelled.', true); return; }
        try { client.submitPin(pin.trim()); setJoinStatus('Checking PIN…'); }
        catch (e) { setJoinStatus(e.message, true); }
    }

    function onOpen({ device, state }) {
        $('#rd-tb-name').textContent = (device && device.name) || 'Remote device';
        $('#rd-tb-transport').textContent = client.transport === 'webrtc' ? 'WebRTC' : 'Local';
        $('#rd-tb-ping').textContent = '';
        $('#rd-files').style.display = 'none';
        // The session view is only reachable while connected — without
        // this the connection looks "gone" after visiting other panes.
        root.querySelector('.rd-nav-btn[data-view="session"]').style.display = '';
        const host9 = $('#rd-replica-host');
        replica = createReplica(host9, client);
        $('#rd-tb-zoom').textContent = '1:1';
        if (state) replica.applyState(state);
        client.request('apps', {}).then((res) => {
            if (res && res.apps && replica) replica.setApps(res.apps);
        }).catch(() => { /* catalog arrives via event */ });
        switchView('session');
        setTimeout(() => replica && replica.focus(), 50);
        $('#rd-join-answer').style.display = 'none';
        $('#rd-join-invite').value = '';
    }
    ui.onOpen = onOpen;
    // Re-run open flow if a session is already active (UI reopened).
    if (client.isOpen) onOpen({ device: client.device, state: null });

    function teardownSession() {
        if (replica) { replica.destroy(); replica = null; }
        root.querySelector('.rd-nav-btn[data-view="session"]').style.display = 'none';
    }

    // ----- clipboard send -----
    async function sendClipboardDialog() {
        let current = '';
        try { current = await app.clipboard.readText(); } catch { current = ''; }
        const text = await app.dialogs.text('Send clipboard', 'This text will be placed on the remote device\'s clipboard.', { value: current });
        if (text === null || text === '') return;
        try {
            await client.request('clipboard-set', { text });
            app.notify.info('Remote Desktop', 'Clipboard sent to the device.');
        } catch (e) {
            app.dialogs.error('Remote Desktop', e.message || 'Could not send the clipboard.');
        }
    }

    // ----- files panel -----
    function buildFilesPanel() {
        const panel = $('#rd-files');
        panel.innerHTML = `
            <div class="rd-files-head">
                <button class="rd-icon-btn" id="rd-f-up" title="Up">${ico('up')}</button>
                <span class="rd-files-path" id="rd-f-path">Home</span>
                <span class="rd-spacer"></span>
                <button class="rd-icon-btn" id="rd-f-newfolder" title="New folder">${ico('newFolder')}</button>
                <button class="rd-icon-btn" id="rd-f-upload" title="Upload">${ico('download')}</button>
                <button class="rd-icon-btn" id="rd-f-refresh" title="Refresh">${ico('refresh')}</button>
                <input type="file" id="rd-f-input" multiple style="display:none;">
            </div>
            <div class="rd-files-list" id="rd-f-list"></div>`;
        panel.querySelector('#rd-f-up').addEventListener('click', () => {
            if (ui.path.length === 0) return;
            ui.path.pop();
            ui.pathNames.pop();
            refreshFiles();
        });
        panel.querySelector('#rd-f-refresh').addEventListener('click', refreshFiles);
        panel.querySelector('#rd-f-newfolder').addEventListener('click', async () => {
            const name = await app.dialogs.text('New folder', 'Folder name on the remote device.', { placeholder: 'New folder' });
            if (!name || !name.trim()) return;
            try {
                await client.request('file-mkdir', { path: ui.path, name: name.trim() });
                refreshFiles();
            } catch (e) { app.dialogs.error('Remote Desktop', e.message); }
        });
        panel.querySelector('#rd-f-upload').addEventListener('click', () => panel.querySelector('#rd-f-input').click());
        panel.querySelector('#rd-f-input').addEventListener('change', async (e) => {
            const files = [...e.target.files];
            e.target.value = '';
            for (const f of files) await uploadFile(f);
            refreshFiles();
        });
    }

    async function uploadFile(f) {
        if (f.size > 6 * 1024 * 1024) {
            app.dialogs.warn('Remote Desktop', `"${f.name}" is larger than the 6 MB transfer limit.`);
            return;
        }
        const buf = await f.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) {
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        }
        const b64 = btoa(bin);
        const ext = f.name.includes('.') ? f.name.split('.').pop() : '';
        try {
            await client.request('file-write', { path: ui.path, name: f.name, base64: b64, ext }, 60000);
            app.notify.info('Remote Desktop', `Uploaded "${f.name}".`);
        } catch (e) {
            app.dialogs.error('Remote Desktop', `Upload of "${f.name}" failed: ${e.message}`);
        }
    }

    async function refreshFiles() {
        if (!client || !client.isOpen) return;
        const list = $('#rd-f-list');
        const pathEl = $('#rd-f-path');
        if (!list) return;
        pathEl.textContent = ui.pathNames.join(' › ');
        list.innerHTML = '<div class="rd-empty">Loading…</div>';
        let res;
        try {
            res = await client.request('file-list', { path: ui.path });
        } catch (e) {
            list.innerHTML = `<div class="rd-empty">${esc(e.message)}</div>`;
            return;
        }
        list.innerHTML = '';
        if (res.folders.length === 0 && res.files.length === 0) {
            list.innerHTML = '<div class="rd-empty">Empty folder.</div>';
            return;
        }
        for (const name of res.folders) {
            const row = document.createElement('div');
            row.className = 'rd-frow';
            row.innerHTML = `<span class="rd-fico">${ico('folder')}</span><span class="rd-fname">${esc(name)}</span><span class="rd-spacer"></span>`;
            row.addEventListener('click', () => { ui.path.push(name); ui.pathNames.push(name); refreshFiles(); });
            list.appendChild(row);
        }
        for (const f of res.files) {
            const row = document.createElement('div');
            row.className = 'rd-frow';
            row.innerHTML = `<span class="rd-fico">${ico('file')}</span><span class="rd-fname">${esc(f.name)}</span><span class="rd-fsize">${fmtSize(f.size)}</span>
                <button class="rd-icon-btn" title="Download">${ico('download')}</button>
                <button class="rd-icon-btn rd-danger" title="Delete">${ico('trash')}</button>`;
            const [dl, del] = row.querySelectorAll('button');
            dl.addEventListener('click', (e) => { e.stopPropagation(); downloadFile(f.name); });
            del.addEventListener('click', async (e) => {
                e.stopPropagation();
                const ok = await app.dialogs.confirm('Delete file', `Delete "${f.name}" on the remote device?`);
                if (!ok) return;
                try { await client.request('file-delete', { path: ui.path, name: f.name }); refreshFiles(); }
                catch (err) { app.dialogs.error('Remote Desktop', err.message); }
            });
            list.appendChild(row);
        }
    }
    ui.refreshFiles = refreshFiles;

    async function downloadFile(name) {
        let res;
        try {
            res = await client.request('file-read', { path: ui.path, name }, 60000);
        } catch (e) {
            app.dialogs.error('Remote Desktop', e.message);
            return;
        }
        let blob;
        if (res.encoding === 'base64') {
            const bin = atob(res.content);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            blob = new Blob([bytes]);
        } else {
            blob = new Blob([res.content], { type: 'text/plain' });
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    // ----- status + settings rendering -----

    function renderStatus() {
        const el = $('#rd-nav-status');
        if (!el) return;
        const s = hostEngine().status();
        const bits = [];
        bits.push(s.listening ? `<span class="rd-dot on"></span> Accepting connections` : `<span class="rd-dot off"></span> Not accepting connections`);
        if (s.pinProtected) bits.push('PIN on');
        if (s.activePeer) bits.push(`Controlled by <b>${esc(s.activePeer.name || 'a device')}</b>`);
        el.innerHTML = bits.join('<br>');
    }

    function renderSettings() {
        const s = hostEngine().status();
        $('#rd-name').value = s.deviceName || '';
        $('#rd-allow').checked = s.allowConnections;
        $('#rd-autoallow').checked = s.autoAllowKnown;
        $('#rd-pin-state').textContent = s.pinProtected ? 'PIN protected — controllers must enter it.' : 'No PIN set — connections only need approval.';
        $('#rd-pin-set').textContent = s.pinProtected ? 'Change PIN' : 'Set PIN';
        $('#rd-pin-remove').style.display = s.pinProtected ? '' : 'none';
        const known = $('#rd-known');
        if (s.knownDevices.length === 0) {
            known.innerHTML = '<div class="rd-empty">No paired devices yet.</div>';
        } else {
            known.innerHTML = '';
            for (const d of s.knownDevices) {
                const row = document.createElement('div');
                row.className = 'rd-device';
                row.innerHTML = `<span class="rd-device-ico">${ico('monitor')}</span><span class="rd-device-name">${esc(d.name || d.id)}</span><span class="rd-spacer"></span><button class="rd-btn danger">Forget</button>`;
                row.querySelector('button').addEventListener('click', () => {
                    hostEngine().forgetDevice(d.id);
                    renderSettings();
                });
                known.appendChild(row);
            }
        }
        renderStatus();
    }
    ui.renderStatus = renderStatus;
    ui.renderSettings = renderSettings;

    // initial state
    startDiscovery();
    renderStatus();
}

function ensureClient() {
    if (!client) client = new ClientEngine(ctx(), hostEngine().identity());
    return client;
}

// Inject the app + replica stylesheet once per document.
let stylesInjected = false;
function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.id = 'rd-styles';
    style.textContent = `
.rd-app { display:flex; height:100%; background:var(--window-bg); color:var(--text-primary); font-size:13px; }
.rd-nav { width:180px; flex:none; border-right:1px solid var(--window-border); padding:14px 10px; display:flex; flex-direction:column; gap:4px; background:rgba(0,0,0,0.12); }
.rd-nav-title { font-weight:600; font-size:14px; margin:2px 8px 14px; }
.rd-nav-btn { display:flex; align-items:center; gap:10px; width:100%; padding:8px 10px; border:none; border-radius:6px; background:transparent; color:var(--text-primary); font-size:13px; cursor:pointer; text-align:left; }
.rd-nav-btn:hover { background:var(--hover-bg); }
.rd-nav-btn.active { background:var(--active-bg); font-weight:600; }
.rd-nav-status { margin-top:auto; padding:10px 8px; font-size:11.5px; color:var(--text-secondary); line-height:1.7; }
.rd-dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; }
.rd-dot.on { background:#4caf50; } .rd-dot.off { background:#666; }
.rd-main { flex:1; position:relative; overflow:hidden; }
.rd-view { position:absolute; inset:0; display:none; }
.rd-view.active { display:flex; flex-direction:column; }
.rd-scroll { flex:1; overflow-y:auto; padding:18px 22px; display:flex; flex-direction:column; gap:16px; }
.rd-card { background:rgba(255,255,255,0.03); border:1px solid var(--window-border); border-radius:10px; padding:16px 18px; }
.rd-card-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
.rd-card-head h3 { margin:0; font-size:14px; font-weight:600; }
.rd-hint { color:var(--text-secondary); font-size:12px; margin:4px 0 10px; line-height:1.5; }
.rd-row { display:flex; align-items:center; gap:8px; margin:6px 0; flex-wrap:wrap; }
.rd-inline-status { color:var(--text-secondary); font-size:12px; }
.rd-inline-status.err { color:#f66; }
.rd-btn { display:inline-flex; align-items:center; gap:6px; padding:6px 12px; border-radius:6px; border:1px solid var(--window-border); background:var(--button-bg); color:var(--text-primary); font-size:12.5px; cursor:pointer; }
.rd-btn:hover { background:var(--hover-bg); }
.rd-btn.primary { background:var(--accent-color); border-color:transparent; }
.rd-btn.primary:hover { background:var(--accent-hover); }
.rd-btn.danger:hover { background:rgba(220,50,50,0.25); border-color:rgba(220,80,80,0.5); }
.rd-icon-btn { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border:none; border-radius:6px; background:transparent; color:var(--text-secondary); cursor:pointer; }
.rd-icon-btn:hover { background:var(--hover-bg); color:var(--text-primary); }
.rd-icon-btn.rd-danger:hover { color:#f88; }
.rd-ico { display:inline-flex; width:16px; height:16px; } .rd-ico svg { width:100%; height:100%; }
.rd-input { flex:1; min-width:120px; max-width:320px; padding:7px 10px; border-radius:6px; border:1px solid var(--window-border); background:rgba(0,0,0,0.25); color:var(--text-primary); font-size:13px; outline:none; }
.rd-input:focus { border-color:var(--accent-color); }
.rd-field > span { display:block; font-size:12.5px; margin-bottom:6px; }
.rd-toggle { display:flex; align-items:flex-start; gap:10px; padding:10px 0; cursor:pointer; }
.rd-toggle input { margin-top:2px; accent-color:var(--accent-color); }
.rd-toggle small { display:block; color:var(--text-secondary); font-size:11.5px; margin-top:2px; }
.rd-pin-row { border-top:1px solid var(--window-border); margin-top:8px; padding-top:12px; color:var(--text-secondary); }
.rd-code { width:100%; box-sizing:border-box; padding:8px 10px; border-radius:6px; border:1px solid var(--window-border); background:rgba(0,0,0,0.25); color:var(--text-primary); font-family:Consolas,monospace; font-size:11px; resize:vertical; outline:none; word-break:break-all; }
.rd-short-code { padding:10px; text-align:center; font:28px/1.4 Consolas,monospace; letter-spacing:10px; text-indent:10px; color:var(--text-primary); background:rgba(0,0,0,0.25); border:1px solid var(--window-border); border-radius:8px; user-select:all; }
.rd-answer { margin-top:10px; display:flex; flex-direction:column; gap:6px; }
.rd-devices { display:flex; flex-direction:column; gap:6px; }
.rd-device { display:flex; align-items:center; gap:10px; padding:9px 12px; border-radius:8px; background:rgba(255,255,255,0.04); border:1px solid transparent; }
.rd-device:hover { border-color:var(--window-border); }
.rd-device-ico { display:flex; width:20px; height:20px; color:var(--accent-color); } .rd-device-ico svg { width:100%; height:100%; }
.rd-device-name { font-weight:600; }
.rd-badge { padding:2px 8px; border-radius:10px; background:rgba(255,255,255,0.08); color:var(--text-secondary); font-size:10.5px; text-transform:uppercase; letter-spacing:0.4px; }
.rd-empty { padding:14px; text-align:center; color:var(--text-secondary); font-size:12px; line-height:1.6; }

/* session */
.rd-toolbar { display:flex; align-items:center; gap:10px; padding:8px 14px; border-bottom:1px solid var(--window-border); }
.rd-tb-name { font-weight:600; font-size:13px; }
.rd-spacer { flex:1; }
.rd-session-body { flex:1; display:flex; min-height:0; position:relative; }
.rd-replica-host { flex:1; position:relative; overflow:hidden; background:#000; min-width:0; }

/* files panel */
.rd-files { width:270px; flex:none; border-left:1px solid var(--window-border); background:rgba(0,0,0,0.18); display:flex; flex-direction:column; min-height:0; }
.rd-files-head { display:flex; align-items:center; gap:4px; padding:6px 8px; border-bottom:1px solid var(--window-border); }
.rd-files-path { font-size:12px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rd-files-list { flex:1; overflow-y:auto; padding:6px; }
.rd-frow { display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:6px; cursor:pointer; }
.rd-frow:hover { background:var(--hover-bg); }
.rd-fico { display:flex; width:16px; height:16px; color:var(--accent-color); } .rd-fico svg { width:100%; height:100%; }
.rd-fname { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rd-fsize { color:var(--text-secondary); font-size:11px; flex:none; }

/* replica */
.rd-replica { position:relative; overflow:auto; background:#000; }
.rd-replica:focus, .rd-stage:focus { outline:none; }
.rd-stage { position:absolute; background:#111; }
.rd-rwin { position:absolute; display:flex; flex-direction:column; border-radius:8px; overflow:hidden; background:var(--window-bg); border:1px solid var(--window-border); box-shadow:0 8px 28px rgba(0,0,0,0.5); min-width:80px; min-height:40px; }
.rd-rwin.rd-focused { border-color:rgba(255,255,255,0.45); box-shadow:0 10px 34px rgba(0,0,0,0.65); }
.rd-rtitle { display:flex; align-items:center; gap:8px; height:32px; flex:none; padding:0 8px; background:var(--window-header); cursor:grab; user-select:none; touch-action:none; }
.rd-rwin.rd-focused .rd-rtitle { background:#383838; }
.rd-ricon { display:flex; width:14px; height:14px; } .rd-ricon svg { width:100%; height:100%; }
.rd-rlabel { flex:1; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--text-primary); opacity:0.9; }
.rd-rcontrols { display:flex; gap:2px; }
.rd-rbtn { width:30px; height:26px; border:none; border-radius:4px; background:transparent; color:var(--text-primary); cursor:pointer; font-size:10px; display:flex; align-items:center; justify-content:center; }
.rd-rbtn:hover { background:var(--hover-bg); }
.rd-rclose:hover { background:#c42b1c; }
.rd-rbody { flex:1; position:relative; overflow:hidden; background:#181818; }
.rd-rph { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; color:var(--text-secondary); font-size:13px; background:repeating-linear-gradient(45deg, transparent, transparent 12px, rgba(255,255,255,0.015) 12px, rgba(255,255,255,0.015) 24px); }
.rd-rph-icon { display:flex; width:40px; height:40px; opacity:0.5; } .rd-rph-icon svg { width:100%; height:100%; }
.rd-rtext { position:absolute; inset:0; margin:0; padding:10px 12px; color:var(--text-primary); font:12px/1.55 Consolas,'Courier New',monospace; white-space:pre-wrap; word-break:break-word; overflow:auto; }
.rd-rmirror { position:absolute; inset:0; overflow:auto; background:#1b1b1b; }
.rd-rmirror input, .rd-rmirror textarea { caret-color:transparent; }
.rd-mirror-frame { margin:12px; padding:16px; border:1px dashed var(--window-border); border-radius:8px; color:var(--text-secondary); font-size:12px; text-align:center; }
.rd-mirror-trunc { padding:8px; color:var(--text-secondary); font-size:11px; text-align:center; }
.rd-rhandle { position:absolute; z-index:5; touch-action:none; }
.rd-h-n { top:-4px; left:8px; right:8px; height:8px; cursor:ns-resize; }
.rd-h-s { bottom:-4px; left:8px; right:8px; height:8px; cursor:ns-resize; }
.rd-h-e { right:-4px; top:8px; bottom:8px; width:8px; cursor:ew-resize; }
.rd-h-w { left:-4px; top:8px; bottom:8px; width:8px; cursor:ew-resize; }
.rd-h-ne { top:-4px; right:-4px; width:12px; height:12px; cursor:nesw-resize; }
.rd-h-nw { top:-4px; left:-4px; width:12px; height:12px; cursor:nwse-resize; }
.rd-h-se { bottom:-4px; right:-4px; width:12px; height:12px; cursor:nwse-resize; }
.rd-h-sw { bottom:-4px; left:-4px; width:12px; height:12px; cursor:nesw-resize; }
.rd-taskbar { position:absolute; left:0; right:0; bottom:0; height:40px; display:flex; align-items:center; gap:4px; padding:0 8px; background:var(--taskbar-bg); backdrop-filter:blur(12px); border-top:1px solid rgba(255,255,255,0.08); }
.rd-startbtn { width:34px; height:32px; border:none; border-radius:6px; background:transparent; cursor:pointer; display:flex; align-items:center; justify-content:center; }
.rd-startbtn svg { width:18px; height:18px; }
.rd-startbtn:hover { background:var(--hover-bg); }
.rd-tbtn { position:relative; width:36px; height:32px; border:none; border-radius:6px; background:transparent; cursor:pointer; display:flex; align-items:center; justify-content:center; }
.rd-tbtn svg { width:20px; height:20px; }
.rd-tbtn:hover { background:var(--hover-bg); }
.rd-tbtn.rd-t-running::after { content:''; position:absolute; bottom:2px; left:50%; transform:translateX(-50%); width:14px; height:3px; border-radius:2px; background:var(--text-secondary); }
.rd-tbtn.rd-t-active::after { width:18px; background:var(--accent-color); }
.rd-tlabel { margin-left:auto; font-size:11px; color:var(--text-secondary); padding:0 6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:200px; }
.rd-startmenu { position:absolute; left:8px; bottom:48px; width:360px; max-width:calc(100% - 16px); max-height:480px; overflow-y:auto; background:var(--start-menu-bg); backdrop-filter:blur(40px); -webkit-backdrop-filter:blur(40px); border:1px solid var(--window-border); border-radius:12px; box-shadow:0 20px 60px rgba(0,0,0,0.5); z-index:9999; }
.rd-sm-search { padding:16px 20px 8px; display:flex; align-items:center; gap:10px; background:rgba(0,0,0,0.2); border-radius:12px 12px 0 0; }
.rd-sm-search input { flex:1; background:rgba(255,255,255,0.07); border:1px solid rgba(255,255,255,0.1); border-radius:6px; padding:8px 12px; color:var(--text-primary); font-size:14px; outline:none; font-family:inherit; }
.rd-sm-search input:focus { border-color:var(--accent-color); }
.rd-sm-search input::placeholder { color:var(--text-secondary); }
.rd-sm-main { padding:8px 16px; }
.rd-sm-sec-head { display:flex; justify-content:space-between; align-items:center; padding:8px 4px; font-size:14px; font-weight:600; }
.rd-sm-all-btn { background:none; border:none; color:var(--text-secondary); cursor:pointer; font-size:12px; padding:4px 8px; border-radius:4px; }
.rd-sm-all-btn:hover { background:var(--hover-bg); color:var(--text-primary); }
.rd-sm-grid { display:grid; grid-template-columns:repeat(6, 1fr); gap:2px; padding:4px 0; }
.rd-sm-item { display:flex; flex-direction:column; align-items:center; gap:6px; padding:12px 4px; border:none; border-radius:6px; background:transparent; color:var(--text-primary); cursor:pointer; font-family:inherit; }
.rd-sm-item:hover { background:var(--hover-bg); }
.rd-sm-appicon { display:flex; width:32px; height:32px; align-items:center; justify-content:center; } .rd-sm-appicon svg { width:24px; height:24px; }
.rd-sm-appname { font-size:12px; text-align:center; line-height:1.2; max-width:100%; overflow:hidden; text-overflow:ellipsis; }
.rd-sm-list { display:flex; flex-direction:column; gap:1px; }
.rd-sm-row { display:flex; align-items:center; gap:12px; width:100%; padding:8px 12px; border:none; border-radius:6px; background:transparent; color:var(--text-primary); cursor:pointer; text-align:left; font-family:inherit; }
.rd-sm-row:hover { background:var(--hover-bg); }
.rd-sm-rowicon { display:flex; width:28px; height:28px; align-items:center; justify-content:center; flex:none; } .rd-sm-rowicon svg { width:22px; height:22px; }
.rd-sm-rowinfo { display:flex; flex-direction:column; min-width:0; }
.rd-sm-rowname { font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rd-sm-rowdetail { font-size:11px; color:var(--text-secondary); }
.rd-sm-empty { padding:20px; text-align:center; color:var(--text-secondary); font-size:13px; }
.rd-sm-all { max-height:420px; overflow-y:auto; }
.rd-sm-all-head { display:flex; align-items:center; gap:12px; padding:8px 0 12px; border-bottom:1px solid var(--window-border); margin-bottom:8px; position:sticky; top:0; background:var(--start-menu-bg); z-index:1; }
.rd-sm-back { background:none; border:none; color:var(--text-primary); cursor:pointer; font-size:16px; padding:4px 8px; border-radius:4px; }
.rd-sm-back:hover { background:var(--hover-bg); }
.rd-sm-all-title { font-size:14px; font-weight:600; }
.rd-sm-letter { font-size:13px; font-weight:600; color:var(--accent-color); padding:8px 4px 4px; }
.rd-sm-footer { display:flex; align-items:center; padding:12px 20px; border-top:1px solid rgba(255,255,255,0.06); }
.rd-sm-user { display:flex; align-items:center; gap:10px; padding:6px 10px; border-radius:6px; font-size:13px; }
.rd-sm-avatar { width:28px; height:28px; background:var(--accent-color); border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:600; }
.rd-dicons { position:absolute; inset:0; z-index:0; }
.rd-dicon { position:absolute; width:80px; display:flex; flex-direction:column; align-items:center; gap:4px; padding:6px 2px; border:none; border-radius:6px; background:transparent; color:#fff; cursor:pointer; font-family:inherit; }
.rd-dicon:hover { background:rgba(255,255,255,0.12); }
.rd-dicon.selected { background:rgba(255,255,255,0.18); outline:1px dotted rgba(255,255,255,0.5); }
.rd-dicon-img { display:flex; width:36px; height:36px; filter:drop-shadow(0 1px 2px rgba(0,0,0,0.6)); } .rd-dicon-img svg { width:100%; height:100%; }
.rd-dicon-label { font-size:11px; text-align:center; line-height:1.25; text-shadow:0 1px 3px rgba(0,0,0,0.9); overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
`;
    document.head.appendChild(style);
}

export default { launch, onBackground, onForeground, onShutdown };
