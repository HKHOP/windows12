// Remote Desktop — client (controller) engine.
//
// The side that controls a remote device: discovers local hosts, runs
// the hello → (PIN) → consent handshake, exposes the command surface
// (window control, app launch, keyboard, clipboard, files) and forwards
// host events to the UI.
//
//   const client = new ClientEngine(app, hostEngine.identity());
//   client.on('state', snap => replica.applyState(snap));
//   const hosts = await client.discoverHosts();
//   await client.connectLocal(hosts[0]);       // resolves once approved
//   await client.request('launch-app', { appId: 'notepad' });
import { Session, PROTOCOL, CHANNEL_NAME, deviceInfo } from './protocol.js';

const OPEN_TIMEOUT_MS = 120000; // host consent prompt times out at 90s
const PING_INTERVAL_MS = 5000;

export class ClientEngine {
    /**
     * @param {object} app bound SDK context
     * @param {{deviceId: string, deviceName: string}} identity this device's identity
     */
    constructor(app, identity) {
        this.app = app;
        this.identity = identity || { deviceId: 'unknown', deviceName: 'Windows 12 device' };
        this.session = null;
        this.channel = null;
        this.transport = null;   // 'local' | 'webrtc'
        this.device = null;      // host device info once open
        this._handlers = new Map();
        this._waiter = null;     // handshake resolver
        this._pingTimer = null;
    }

    // ---------- events ----------

    /** on('state'|'apps'|'clipboard'|'ended'|'status'|'ping', cb) → unsubscribe */
    on(name, cb) {
        if (!this._handlers.has(name)) this._handlers.set(name, new Set());
        this._handlers.get(name).add(cb);
        return () => this._handlers.get(name).delete(cb);
    }

    _emit(name, data) {
        const set = this._handlers.get(name);
        if (!set) return;
        for (const cb of [...set]) {
            try { cb(data); } catch (e) { console.error('[RemoteDesktop] client handler threw', e); }
        }
    }

    // ---------- discovery ----------

    /** Local hosts visible in this browser (BroadcastChannel). */
    async discoverHosts() {
        const peers = await this.app.net.discover(CHANNEL_NAME, { timeout: 1000 });
        return peers
            .filter(p => p.meta && p.meta.role === 'host' && p.meta.proto === PROTOCOL)
            .map(p => ({
                id: p.id,
                name: p.meta.name || 'Windows 12 device',
                deviceId: p.meta.deviceId || null,
                mine: p.meta.deviceId === this.identity.deviceId
            }));
    }

    // ---------- connection ----------

    get isOpen() { return !!(this.session && this.session.isOpen); }

    _adopt(session) {
        this.session = session;
        session.onMessage((m) => this._onRaw(m));
        session.onEvent((name, data) => this._emit(name, data));
        session.onEnd((reason) => {
            this._teardown();
            this._emit('ended', { reason });
        });
    }

    _teardown() {
        if (this._pingTimer) { clearInterval(this._pingTimer); this._pingTimer = null; }
        if (this._waiter) {
            clearTimeout(this._waiter.timer);
            const w = this._waiter;
            this._waiter = null;
            w.reject(new Error('The connection closed before it finished opening.'));
        }
        this.session = null;
        this.channel = null;
        this.device = null;
        this.transport = null;
    }

    _waitOpen() {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                if (this._waiter && this._waiter.resolve === resolve) {
                    this._waiter = null;
                    if (this.session) this.session.end('timeout');
                    this._teardown();
                }
                reject(new Error('The remote device did not respond in time.'));
            }, OPEN_TIMEOUT_MS);
            this._waiter = { resolve, reject, timer };
        });
    }

    _onRaw(msg) {
        switch (msg.kind) {
            case 'auth-need':
                this._emit('status', { phase: 'pin', detail: msg.data || {} });
                break;
            case 'consent-wait':
                this._emit('status', { phase: 'consent' });
                break;
            case 'deny': {
                const reason = (msg.data && msg.data.reason) || 'denied';
                const message = (msg.data && msg.data.message) || `The remote device refused the connection (${reason}).`;
                if (this._waiter) {
                    clearTimeout(this._waiter.timer);
                    const w = this._waiter;
                    this._waiter = null;
                    w.reject(new Error(message));
                }
                if (this.session) this.session.end('denied');
                this._teardown();
                this._emit('status', { phase: 'denied', message });
                break;
            }
            case 'session-open': {
                this.device = (msg.data && msg.data.device) || null;
                const state = (msg.data && msg.data.state) || null;
                if (this._waiter) {
                    clearTimeout(this._waiter.timer);
                    const w = this._waiter;
                    this._waiter = null;
                    w.resolve({ device: this.device, state });
                }
                this._startPing();
                this._emit('status', { phase: 'open' });
                break;
            }
            default:
                break;
        }
    }

    async _connect(session, helloMeta) {
        if (this.session) throw new Error('Already connected — disconnect first.');
        this._adopt(session);
        const p = this._waitOpen();
        session.send('hello', { device: deviceInfo(this.identity), ...helloMeta });
        try {
            return await p;
        } catch (e) {
            if (this.session) this.session.end('failed');
            this._teardown();
            throw e;
        }
    }

    /** Connect to a discovered local host. Resolves once approved. */
    async connectLocal(hostEntry) {
        if (!hostEntry || typeof hostEntry.id !== 'string') {
            throw new Error('Pick a device to connect to.');
        }
        const channel = this.app.net.createChannel({
            name: CHANNEL_NAME,
            meta: { role: 'controller', deviceId: this.identity.deviceId, name: this.identity.deviceName, proto: PROTOCOL }
        });
        this.channel = channel;
        this.transport = 'local';
        const hostId = hostEntry.id;
        const link = {
            send: (msg) => channel.sendTo(hostId, msg),
            close: () => { try { channel.close(); } catch { /* noop */ } }
        };
        const session = new Session(link, hostId, { name: hostEntry.name });
        channel.on('message', ({ from, msg }) => {
            if (from === hostId) session.handleIncoming(from, msg);
        });
        channel.on('peer-close', ({ id }) => {
            if (id === hostId) session._remoteClosed('remote');
        });
        return this._connect(session, {});
    }

    /**
     * Join a device via invite code (WebRTC). Returns the answer code to
     * hand back to the host, plus `opened` resolving when the session is
     * approved and running.
     */
    async joinByInvite(inviteCode) {
        const pending = await this.app.net.acceptInvite(inviteCode, {
            meta: { role: 'controller', deviceId: this.identity.deviceId, name: this.identity.deviceName, proto: PROTOCOL }
        });
        const opened = this._adoptWebrtc(pending.connected);
        return { answerCode: pending.code, opened };
    }

    /**
     * Join a device via 6-character short code (rendezvous WebRTC). No
     * answer code to hand back — returns { opened } resolving when the
     * session is approved and running.
     */
    async joinByShortCode(code) {
        const pending = await this.app.net.acceptShortInvite(code, {
            meta: { role: 'controller', deviceId: this.identity.deviceId, name: this.identity.deviceName, proto: PROTOCOL }
        });
        const opened = this._adoptWebrtc(pending.connected);
        return { opened };
    }

    // Shared adoption for every WebRTC channel once the link is open.
    async _adoptWebrtc(connectedPromise) {
        const channel = await connectedPromise; // resolves once the host completes pairing
        this.channel = channel;
        this.transport = 'webrtc';
        const peerId = channel.peerId || 'webrtc-peer';
        const link = {
            send: (msg) => channel.send(msg),
            close: () => { try { channel.close(); } catch { /* noop */ } }
        };
        const session = new Session(link, peerId, {});
        channel.on('message', ({ from, msg }) => session.handleIncoming(from, msg));
        channel.on('peer-close', () => session._remoteClosed('remote'));
        return this._connect(session, {});
    }

    /** Answer a host's auth-need prompt. */
    submitPin(pin) {
        if (!this.session || !this.session.isOpen) throw new Error('No connection to authenticate.');
        this.session.send('auth', { pin: String(pin) });
        this._emit('status', { phase: 'auth-sent' });
    }

    /** Abort an in-flight handshake. */
    cancel() {
        if (this.session) this.session.end('cancelled');
        this._teardown();
    }

    /** Round-trip a command to the host. */
    request(cmd, args, timeoutMs) {
        if (!this.isOpen) return Promise.reject(new Error('Not connected.'));
        return this.session.request(cmd, args, timeoutMs);
    }

    /** Fire-and-forget command (keyboard streams use this). */
    post(cmd, args) {
        if (!this.isOpen) return;
        this.session.request(cmd, args, 4000).catch(() => { /* stale keys during a lag spike */ });
    }

    disconnect() {
        if (this.session && this.session.isOpen) {
            try { this.session.send('session-close', {}); } catch { /* link gone */ }
            this.session.end('local');
        } else {
            this._teardown();
        }
    }

    _startPing() {
        if (this._pingTimer) clearInterval(this._pingTimer);
        this._pingTimer = setInterval(async () => {
            if (!this.isOpen) return;
            const t0 = performance.now();
            try {
                await this.request('ping', {}, 4000);
                this._emit('ping', Math.round(performance.now() - t0));
            } catch { /* reported via ended */ }
        }, PING_INTERVAL_MS);
    }
}

export default ClientEngine;
