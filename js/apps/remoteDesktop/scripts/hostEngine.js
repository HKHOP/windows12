// Remote Desktop — host engine.
//
// The daemon that lets OTHER devices control THIS one. Runs headless
// (onBackground) so the desktop stays controllable with no window open.
//
//   listen  — a Net channel named 'w12-remote-desktop' (local transport,
//             so every tab in this browser can discover us) plus any
//             number of accepted WebRTC links (manual invite codes).
//   session — hello → optional PIN check → consent notification →
//             session-open with a full desktop snapshot. Exactly one
//             active controller; everyone else is told we're busy.
//   stream  — a desktop snapshot event whenever state changes (window
//             events + a 500ms poll that also catches live drags and the
//             focused text field). The controller drives the desktop
//             back through RPC commands served here.
//
// Nothing outside the user's home folder is touched, and the OS-level
// fsGuard zones stay off limits — file commands resolve strictly inside
// the signed-in user's home.
import WindowManager from '../../../modules/windowManager.js';
import { Taskbar, AppMetadata } from '../../../modules/taskbar.js';
import FileSystem from '../../../modules/fileSystem.js';
import ClipboardManager from '../../../modules/clipboardManager.js';
import Notifications from '../../../modules/notifications.js';
import BackgroundApps from '../../../modules/backgroundApps.js';
import Users from '../../../modules/users.js';
import { Inject } from '../../../sdk/inject.js';
import { Session, PROTOCOL, CHANNEL_NAME, deviceInfo } from './protocol.js';

const STATE_POLL_MS = 500;
const CONSENT_TIMEOUT_MS = 90000;
const PIN_ATTEMPTS = 3;
const MAX_TEXT_FILE_CHARS = 2 * 1024 * 1024;   // inline text transfer cap
const MAX_BINARY_BYTES = 6 * 1024 * 1024;      // blob transfer cap
const INVITE_TTL_MS = 10 * 60000;

function uid() {
    try { if (crypto.randomUUID) return crypto.randomUUID(); } catch { /* fall through */ }
    return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export async function hashPin(pin) {
    const salted = 'w12-remote-desktop:' + String(pin);
    try {
        if (crypto.subtle && crypto.subtle.digest) {
            const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salted));
            return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
        }
    } catch { /* non-secure context — fall through */ }
    // djb2 fallback for contexts without WebCrypto.
    let h = 5381;
    for (let i = 0; i < salted.length; i++) h = ((h << 5) + h + salted.charCodeAt(i)) >>> 0;
    return 'djb2-' + h.toString(16);
}

// Relative home path validation: array or 'a/b' string -> clean segments.
function homeRelSegments(rel) {
    const segs = Array.isArray(rel) ? rel.slice() : String(rel || '').split('/');
    const clean = [];
    for (const s of segs) {
        const seg = String(s).trim();
        if (!seg || seg === '.') continue;
        if (seg === '..' || seg.includes('\\') || seg.includes('/')) {
            throw new Error('Paths must stay inside the home folder.');
        }
        clean.push(seg);
    }
    return clean;
}

function base64ToBlob(b64, mime = 'application/octet-stream') {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
}

async function blobToBase64(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return btoa(bin);
}

export class HostEngine {
    /**
     * @param {object} app bound SDK context (createApp) for remoteDesktop
     */
    constructor(app) {
        this.app = app;
        this.channel = null;          // Net local channel (or null when stopped)
        this.sessions = new Map();    // peerId -> Session (handshaking or active)
        this.active = null;           // the one fully-open session
        this._pendingInvite = null;   // { invite, timer }
        this._unsubs = [];
        this._stateTimer = null;
        this._lastStateJson = '';
        this._lastClipId = null;
        this._bannerId = null;
        this._consent = null;         // { cancel() } while a consent prompt is up
        this._uiHandlers = new Map(); // status event name -> Set<cb>
        this._settings = null;
        this._loadSettings();
    }

    // ---------- settings + identity ----------

    _loadSettings() {
        let s = {};
        try { s = this.app.files.settings.all(); } catch { /* fresh profile */ }
        this._settings = {
            allowConnections: s.allowConnections !== false,
            deviceName: typeof s.deviceName === 'string' && s.deviceName.trim() ? s.deviceName.trim() : this._defaultDeviceName(),
            deviceId: (typeof s.deviceId === 'string' && s.deviceId) || null,
            pinHash: (typeof s.pinHash === 'string' && s.pinHash) || null,
            autoAllowKnown: s.autoAllowKnown !== false,
            knownDevices: Array.isArray(s.knownDevices) ? s.knownDevices.filter(d => d && typeof d.id === 'string') : []
        };
        if (!this._settings.deviceId) {
            this._settings.deviceId = uid();
            this._persistSettings();
        }
    }

    _defaultDeviceName() {
        try {
            const user = Users.getCurrent();
            if (user && user.name) return `${user.name}'s device`;
        } catch { /* boot order — fall through */ }
        return 'Windows 12 device';
    }

    _persistSettings() {
        try { this.app.files.settings.set('settings', { ...this._settings }); } catch { /* session-only */ }
    }

    get settings() { return this._settings; }

    /** Get/set one setting key (deviceName, autoAllowKnown, ...). */
    setSetting(key, value) {
        this._settings[key] = value;
        this._persistSettings();
        if (key === 'deviceName' && this.channel) {
            // Refresh discovery meta so controllers see the new name.
            try { this.stop(); this.start(); } catch { /* noop */ }
        }
        this._emit('status', this.status());
    }

    async setPin(pin) {
        if (pin === null || pin === undefined || pin === '') {
            this._settings.pinHash = null;
        } else {
            this._settings.pinHash = await hashPin(pin);
        }
        this._persistSettings();
        this._emit('status', this.status());
    }

    forgetDevice(deviceId) {
        this._settings.knownDevices = this._settings.knownDevices.filter(d => d.id !== deviceId);
        this._persistSettings();
        this._emit('status', this.status());
    }

    // ---------- lifecycle ----------

    /** Start listening (idempotent). Called on boot/background/toggle-on. */
    start() {
        if (this.channel) return;
        const identity = this.identity();
        this.channel = this.app.net.createChannel({
            name: CHANNEL_NAME,
            meta: { role: 'host', deviceId: identity.deviceId, name: identity.deviceName, proto: PROTOCOL }
        });
        this._unsubs.push(this.channel.on('message', ({ from, msg }) => {
            this._handleLinkMessage(from, msg, () => this._localLink(from));
        }));
        this._unsubs.push(this.channel.on('peer-close', ({ id }) => {
            const session = this.sessions.get(id);
            if (session) session._remoteClosed('remote');
        }));
        this._startStateStream();
        this._emit('status', this.status());
    }

    /** Stop listening and drop every session. */
    stop() {
        if (this._consent) { try { this._consent.cancel(); } catch { /* noop */ } this._consent = null; }
        for (const session of [...this.sessions.values()]) {
            try { session.end('host-stopped'); } catch { /* noop */ }
        }
        this.sessions.clear();
        this.active = null;
        for (const unsub of this._unsubs) { try { unsub(); } catch { /* noop */ } }
        this._unsubs = [];
        if (this._stateTimer) { clearInterval(this._stateTimer); this._stateTimer = null; }
        if (this.channel) { try { this.channel.close(); } catch { /* noop */ } this.channel = null; }
        this._clearInvite();
        this._hideBanner();
        this._emit('status', this.status());
    }

    /** Master switch (Settings pane). Also drives startup autostart. */
    async setAllowConnections(on) {
        this._settings.allowConnections = !!on;
        this._persistSettings();
        try { await BackgroundApps.setAutostartEnabled(this.app.id, !!on); } catch { /* cosmetic */ }
        if (on) this.start(); else this.stop();
        this._emit('status', this.status());
    }

    /** Whether the host should currently be reachable. */
    get allowConnections() { return !!this._settings.allowConnections; }

    identity() {
        return { deviceId: this._settings.deviceId, deviceName: this._settings.deviceName };
    }

    // ---------- status for the UI ----------

    status() {
        return {
            listening: !!this.channel,
            allowConnections: this.allowConnections,
            deviceName: this._settings.deviceName,
            deviceId: this._settings.deviceId,
            pinProtected: !!this._settings.pinHash,
            autoAllowKnown: this._settings.autoAllowKnown,
            knownDevices: [...this._settings.knownDevices],
            activePeer: this.active ? (this.active._peerDevice || { name: 'Remote device' }) : null
        };
    }

    /** UI subscription: on('status' | 'session-open' | 'session-close', cb). */
    on(name, cb) {
        if (!this._uiHandlers.has(name)) this._uiHandlers.set(name, new Set());
        this._uiHandlers.get(name).add(cb);
        return () => this._uiHandlers.get(name).delete(cb);
    }

    _emit(name, data) {
        const set = this._uiHandlers.get(name);
        if (!set) return;
        for (const cb of [...set]) {
            try { cb(data); } catch (e) { console.error('[RemoteDesktop] UI handler threw', e); }
        }
    }

    // ---------- transports ----------

    _localLink(peerId) {
        const channel = this.channel;
        return {
            send: (msg) => channel.sendTo(peerId, msg),
            close: () => { /* the shared bus stays open */ }
        };
    }

    _handleLinkMessage(from, msg, makeLink) {
        if (!msg || msg.rd !== PROTOCOL) return;
        const existing = this.sessions.get(from);
        if (existing) {
            existing.handleIncoming(from, msg);
            return;
        }
        if (msg.kind === 'hello') {
            this._acceptHello(from, msg, makeLink());
        }
        // Anything else from an unknown peer is ignored.
    }

    _acceptHello(from, msg, link) {
        const session = new Session(link, from, {});
        this._wireSession(session);
        this._greet(session, msg.data);
    }

    // Shared wiring for every session (local hello + WebRTC invite).
    _wireSession(session) {
        session._awaitingAuth = false;
        session._authTries = 0;
        this.sessions.set(session.peerId, session);
        session.onEnd(() => {
            this.sessions.delete(session.peerId);
            if (this._consent && this._consent.session === session) {
                try { this._consent.cancel(); } catch { /* noop */ }
            }
            if (this.active === session) {
                this.active = null;
                this._hideBanner();
                this._emit('session-close', {
                    device: session._peerDevice || { name: 'Remote device' },
                    reason: session._endReason || 'ended'
                });
            }
            this._emit('status', this.status());
        });
        session.onMessage((m) => this._onSessionMessage(session, m));
        session.onRequest((cmd, args) => this._serve(session, cmd, args));
    }

    // After hello: PIN gate, then consent, then open.
    _greet(session, helloData) {
        const device = helloData && helloData.device;
        if (!device || device.proto !== PROTOCOL || !device.id) {
            session.send('deny', { reason: 'incompatible', message: 'Protocol version mismatch.' });
            session.end('incompatible');
            return;
        }
        if (this.active) {
            session.send('deny', { reason: 'busy', message: 'A remote session is already active on this device.' });
            session.end('busy');
            return;
        }
        session._peerDevice = device;
        if (this._settings.pinHash) {
            session._awaitingAuth = true;
            session.send('auth-need', { triesLeft: PIN_ATTEMPTS });
        } else {
            this._consentGate(session);
        }
    }

    _onSessionMessage(session, msg) {
        switch (msg.kind) {
            case 'hello':
                // Pre-created WebRTC sessions get their hello here.
                if (!session._peerDevice) this._greet(session, msg.data);
                break;
            case 'auth': {
                if (!session._awaitingAuth) return;
                this._verifyPin(msg.data && msg.data.pin).then((ok) => {
                    if (!session.isOpen) return;
                    if (ok) {
                        session._awaitingAuth = false;
                        this._consentGate(session);
                    } else {
                        session._authTries++;
                        if (session._authTries >= PIN_ATTEMPTS) {
                            session.send('deny', { reason: 'auth', message: 'Too many wrong PIN attempts.' });
                            session.end('auth-failed');
                        } else {
                            session.send('auth-need', { retry: true, triesLeft: PIN_ATTEMPTS - session._authTries });
                        }
                    }
                });
                break;
            }
            case 'session-close': {
                // Controller hangs up; end from our side too.
                if (this.active === session) session.end('controller-closed');
                else session.end('aborted');
                break;
            }
            default:
                break;
        }
    }

    async _verifyPin(pin) {
        if (!this._settings.pinHash) return true;
        return (await hashPin(pin)) === this._settings.pinHash;
    }

    async _consentGate(session) {
        const device = session._peerDevice;
        const known = this._settings.knownDevices.some(d => d.id === device.id);
        let allowed = false;

        if (known && this._settings.autoAllowKnown) {
            allowed = true;
        } else {
            session.send('consent-wait', {});
            allowed = await this._askConsent(device, session);
        }

        if (!session.isOpen) return;
        if (!allowed) {
            session.send('deny', { data: { reason: 'denied', message: 'The request was denied on this device.' } });
            session.end('denied');
            return;
        }
        if (!known) {
            this._settings.knownDevices.push({ id: device.id, name: device.name, at: Date.now() });
            this._persistSettings();
        }
        this._openSession(session);
    }

    _askConsent(device, session) {
        return new Promise((resolve) => {
            let settled = false;
            const finish = (allowed) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                this._consent = null;
                try { Notifications.dismiss(noticeId); } catch { /* already gone */ }
                resolve(allowed);
            };
            const noticeId = this.app.notify.action(
                'Remote Desktop',
                `"${device.name || 'A device'}" wants to control this device.`,
                {
                    actions: [
                        { label: 'Allow', value: 'allow', primary: true },
                        { label: 'Deny', value: 'deny' }
                    ],
                    sticky: true,
                    critical: true,
                    tag: 'rd-consent',
                    onAction: (value) => finish(value === 'allow'),
                    onDismiss: (reason) => { if (reason !== 'action') finish(false); }
                }
            );
            const timer = setTimeout(() => finish(false), CONSENT_TIMEOUT_MS);
            this._consent = {
                cancel: () => finish(false),
                // Cancel when the asking peer disappears mid-prompt.
                session
            };
        });
    }

    _openSession(session) {
        if (this.active) {
            session.send('deny', { data: { reason: 'busy', message: 'A remote session is already active on this device.' } });
            session.end('busy');
            return;
        }
        this.active = session;
        this._markClipboardBaseline();
        session.send('session-open', {
            device: deviceInfo(this.identity()),
            state: this.snapshot()
        });
        this._showBanner();
        this._emit('session-open', { device: session._peerDevice });
        this._emit('status', this.status());
    }

    _showBanner() {
        const name = (this.active && this.active._peerDevice && this.active._peerDevice.name) || 'A remote device';
        this._bannerId = this.app.notify.action(
            'Remote Desktop',
            `"${name}" is controlling this device.`,
            {
                actions: [{ label: 'Disconnect', value: 'disconnect', primary: true }],
                sticky: true,
                tag: 'rd-session',
                onAction: () => { if (this.active) this.active.end('host-disconnect'); }
            }
        );
    }

    _hideBanner() {
        if (this._bannerId) {
            try { Notifications.dismiss(this._bannerId); } catch { /* noop */ }
            this._bannerId = null;
        }
    }

    // ---------- WebRTC invites (host side) ----------

    /** Create an invite code the controller can join with. */
    async createInviteCode() {
        this._clearInvite();
        const invite = await this.app.net.createInvite({
            meta: { role: 'host', deviceId: this._settings.deviceId, name: this._settings.deviceName, proto: PROTOCOL }
        });
        this._pendingInvite = { invite };
        this._pendingInvite.timer = setTimeout(() => this._clearInvite(), INVITE_TTL_MS);
        return invite.code;
    }

    /** Complete pairing with the answer code the controller shows. */
    async completeInvite(answerCode) {
        if (!this._pendingInvite) {
            throw new Error('No pending invite — create one first.');
        }
        const invite = this._pendingInvite.invite;
        this._clearInvite();
        const channel = await invite.accept(answerCode);
        const peerId = channel.peerId || 'webrtc-peer';
        const link = {
            send: (msg) => channel.send(msg),
            close: () => { try { channel.close(); } catch { /* noop */ } }
        };
        const session = new Session(link, peerId, {});
        this._wireSession(session);
        const unsubMsg = channel.on('message', ({ from, msg }) => {
            if (from !== peerId) return;
            if (!session._peerDevice && msg && msg.kind === 'hello') {
                this._greet(session, msg.data);
                return;
            }
            session.handleIncoming(from, msg);
        });
        const unsubClose = channel.on('peer-close', () => session._remoteClosed('remote'));
        session.onEnd(() => { unsubMsg(); unsubClose(); });
        // The controller says hello over the data channel; _greet takes
        // over (PIN gate → consent → session-open).
    }

    _clearInvite() {
        if (this._pendingInvite) {
            clearTimeout(this._pendingInvite.timer);
            this._pendingInvite = null;
        }
    }

    // ---------- state streaming ----------

    _activeDesktopId() {
        try {
            const vd = window._modules && window._modules.VirtualDesktops;
            if (vd && typeof vd.getActiveId === 'function') return vd.getActiveId();
        } catch { /* no virtual desktops — all windows count */ }
        return null;
    }

    _wallpaper() {
        try {
            const cs = getComputedStyle(document.body);
            return { image: cs.backgroundImage || 'none', color: cs.backgroundColor || '#0a0e14' };
        } catch {
            return { image: 'none', color: '#0a0e14' };
        }
    }

    // Peek at the focused window's text field so the controller can see
    // what it types. Generic probe — no per-app cooperation needed.
    _textProbe(winData) {
        try {
            const el = winData.element.querySelector(
                'textarea, input[type="text"], input:not([type]), input[type="search"], input[type="email"], input[type="url"], input[type="number"], [contenteditable="true"]'
            );
            if (!el) return null;
            const value = el.isContentEditable ? (el.textContent || '') : (typeof el.value === 'string' ? el.value : null);
            if (value === null) return null;
            return { appId: winData.appId, text: value.slice(0, 20000), truncated: value.length > 20000 };
        } catch {
            return null;
        }
    }

    snapshot() {
        const area = WindowManager.getDesktopArea();
        const focused = WindowManager.getFocused();
        const activeDesktop = this._activeDesktopId();
        const windows = [];
        for (const w of WindowManager.getAllWindows()) {
            if (activeDesktop && w.desktopId && w.desktopId !== activeDesktop) continue;
            let z = 0;
            try { z = parseInt(w.element.style.zIndex, 10) || 0; } catch { /* noop */ }
            windows.push({
                id: w.id,
                appId: w.appId,
                title: w.title || w.appId,
                icon: w.icon || '',
                bounds: WindowManager.getBounds(w.id),
                z,
                minimized: !!w.minimized,
                maximized: !!w.isMaximized,
                resizable: w.resizable !== false,
                minWidth: w.minWidth || 400,
                minHeight: w.minHeight || 300
            });
        }
        return {
            proto: PROTOCOL,
            area,
            wallpaper: this._wallpaper(),
            focusedId: focused ? focused.id : null,
            focusText: focused ? this._textProbe(focused) : null,
            windows,
            taskbarPins: (() => { try { return Taskbar.getPinnedApps(); } catch { return []; } })()
        };
    }

    _startStateStream() {
        const push = () => {
            if (!this.channel || !this.active || !this.active.isOpen) return;
            try {
                const snap = this.snapshot();
                const json = JSON.stringify(snap);
                if (json === this._lastStateJson) return;
                this._lastStateJson = json;
                this.active.event('state', snap);
            } catch (e) {
                console.error('[RemoteDesktop] state stream error', e);
            }
        };
        for (const name of ['window-closed', 'window-minimized', 'window-restored', 'window-focus-changed', 'virtual-desktop-changed', 'apps-changed']) {
            window.addEventListener(name, push);
            this._unsubs.push(() => window.removeEventListener(name, push));
        }
        // Apps catalog goes once per session (icons are static).
        const pushApps = () => {
            if (this.active && this.active.isOpen) {
                try { this.active.event('apps', { apps: this.appCatalog() }); } catch { /* noop */ }
            }
        };
        window.addEventListener('apps-changed', pushApps);
        this._unsubs.push(() => window.removeEventListener('apps-changed', pushApps));

        // Poll covers window creation, live drags/resizes, text probe.
        this._stateTimer = setInterval(() => {
            push();
            this._pushClipboardIfNew();
        }, STATE_POLL_MS);
    }

    // Push copies made AFTER the session opened — never a stale item on
    // connect — so the controller's clipboard mirrors the host's.
    _pushClipboardIfNew() {
        if (!this.active || !this.active.isOpen) return;
        try {
            const top = ClipboardManager.getHistory()[0];
            const id = top ? top.id : null;
            if (id === this._lastClipId) return;
            this._lastClipId = id;
            if (top && top.type === 'text' && top.time > this._sessionStartTime) {
                this.active.event('clipboard', { text: top.text });
            }
        } catch { /* noop */ }
    }

    _markClipboardBaseline() {
        try {
            const top = ClipboardManager.getHistory()[0];
            this._lastClipId = top ? top.id : null;
            this._sessionStartTime = Date.now();
        } catch { /* noop */ }
    }

    /** Launchable apps on this device (catalog for the replica start menu). */
    appCatalog() {
        const out = [];
        try {
            for (const m of this.app.apps.getAll()) {
                if (m.service === true) continue;
                if (!this.app.apps.isInstalled(m.id)) continue;
                const meta = this.app.apps.getMetadata(m.id);
                out.push({ id: m.id, name: (meta && meta.name) || m.name || m.id, icon: (meta && meta.icon) || '' });
            }
        } catch (e) {
            console.error('[RemoteDesktop] app catalog failed', e);
        }
        return out;
    }

    // ---------- command serving (RPC from the controller) ----------

    async _serve(session, cmd, args) {
        const a = args || {};
        switch (cmd) {
            case 'ping':
                return { t: Date.now() };

            case 'state':
                return this.snapshot();

            case 'apps':
                return { apps: this.appCatalog() };

            case 'focus': {
                const w = this._win(a.id);
                if (w.minimized) WindowManager.setMinimized(a.id, false);
                WindowManager.focusWindow(a.id);
                return true;
            }
            case 'minimize':
                WindowManager.setMinimized(this._win(a.id).id, true);
                return true;
            case 'restore': {
                const w = this._win(a.id);
                if (w.minimized) WindowManager.setMinimized(a.id, false);
                WindowManager.focusWindow(a.id);
                return true;
            }
            case 'maximize':
                WindowManager.setMaximized(this._win(a.id).id, !!a.flag);
                return true;
            case 'set-bounds': {
                const b = a.bounds || {};
                const num = (v) => Number.isFinite(v) ? v : undefined;
                WindowManager.setBounds(this._win(a.id).id, {
                    x: num(b.x), y: num(b.y), width: num(b.width), height: num(b.height)
                });
                return true;
            }
            case 'close':
                await WindowManager.requestClose(this._win(a.id).id);
                return true;

            case 'launch-app': {
                if (typeof a.appId !== 'string') throw new Error('appId required.');
                const ok = this.app.apps.launch(a.appId);
                if (!ok) throw new Error(`App "${a.appId}" could not be launched.`);
                return true;
            }

            case 'key': {
                if (!a.event || typeof a.event !== 'object') throw new Error('event required.');
                Inject.key(a.event);
                return true;
            }
            case 'type': {
                if (typeof a.text !== 'string') throw new Error('text required.');
                Inject.type(a.text);
                return true;
            }

            case 'clipboard-get': {
                const hist = ClipboardManager.getHistory();
                const item = hist.find(h => h.type === 'text');
                return { text: item ? item.text : null };
            }
            case 'clipboard-set': {
                if (typeof a.text !== 'string') throw new Error('text required.');
                const added = ClipboardManager.addItem({ type: 'text', text: a.text });
                // Best effort mirror into the live system clipboard too.
                try { await navigator.clipboard.writeText(a.text); } catch { /* needs focus/permission */ }
                return { added };
            }

            case 'file-list': {
                const dir = this._homePath(a.path);
                if (!FileSystem.itemExists(dir)) throw new Error('Folder not found.');
                const children = FileSystem.getChildren(dir);
                return {
                    path: homeRelSegments(a.path),
                    folders: children.filter(c => c.type === 'folder').map(c => c.name),
                    files: children.filter(c => c.type === 'file').map(c => ({ name: c.name, ext: c.ext || '', size: c.size || 0, blob: !!c.blob, modified: c.modified || 0 }))
                };
            }
            case 'file-read': {
                const dir = this._homePath(a.path);
                const name = this._fileName(a.name);
                const full = [...dir, name];
                if (!FileSystem.itemExists(full)) throw new Error('File not found.');
                if (FileSystem.isBlobFile(full)) {
                    const blob = await FileSystem.readFileBlob(full);
                    if (!blob) throw new Error('File content unavailable.');
                    if (blob.size > MAX_BINARY_BYTES) throw new Error('File too large to transfer (6 MB limit).');
                    return { name, encoding: 'base64', content: await blobToBase64(blob), size: blob.size };
                }
                const text = FileSystem.readFile(full);
                if (text === null) throw new Error('File content unavailable.');
                return {
                    name,
                    encoding: 'text',
                    content: text.length > MAX_TEXT_FILE_CHARS ? text.slice(0, MAX_TEXT_FILE_CHARS) : text,
                    truncated: text.length > MAX_TEXT_FILE_CHARS,
                    size: text.length
                };
            }
            case 'file-write': {
                const dir = this._homePath(a.path);
                const name = this._fileName(a.name);
                if (!FileSystem.itemExists(dir)) throw new Error('Target folder not found.');
                if (typeof a.base64 === 'string') {
                    if ((a.base64.length * 3) / 4 > MAX_BINARY_BYTES) throw new Error('File too large to transfer (6 MB limit).');
                    const ok = await FileSystem.writeFileBlob(dir, name, base64ToBlob(a.base64), (a.ext || ''));
                    if (!ok) throw new Error('Could not write the file.');
                    return { name };
                }
                if (typeof a.content !== 'string') throw new Error('content or base64 required.');
                const full = [...dir, name];
                const ext = (a.ext || (name.includes('.') ? name.split('.').pop() : '') || '');
                const node = FileSystem.getNode(full);
                if (node && node.type === 'file' && !node.blobRef) {
                    if (!FileSystem.writeFile(full, a.content)) throw new Error('Could not write the file.');
                } else if (!FileSystem.createFile(dir, name, a.content, ext)) {
                    throw new Error('Could not create the file.');
                }
                return { name };
            }
            case 'file-mkdir': {
                const dir = this._homePath(a.path);
                const name = this._fileName(a.name);
                if (FileSystem.itemExists([...dir, name])) return { name };
                if (!FileSystem.createFolder(dir, name)) throw new Error('Could not create the folder.');
                return { name };
            }
            case 'file-delete': {
                const dir = this._homePath(a.path);
                const name = this._fileName(a.name);
                if (!FileSystem.deleteItem([...dir, name])) throw new Error('Could not delete the item.');
                return { name };
            }

            default:
                throw new Error(`Unknown command "${cmd}".`);
        }
    }

    _win(id) {
        const w = id ? WindowManager._getWindow(id) : null;
        if (!w) throw new Error('That window no longer exists.');
        return w;
    }

    // Everything below resolves strictly inside the user's home folder.
    _homePath(rel) {
        return [...Users.home(), ...homeRelSegments(rel)];
    }

    _fileName(name) {
        const n = String(name || '').trim();
        if (!n || n === '.' || n === '..' || n.includes('/') || n.includes('\\')) {
            throw new Error('Invalid file name.');
        }
        return n;
    }
}

export default HostEngine;
