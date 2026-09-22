// Remote Desktop — session protocol.
//
// One layer above the SDK Net channel: turns a point-to-point link into
// a request/response + event session, with transparent chunking so big
// payloads (file contents) survive the ~256KB DataChannel message limit.
//
// Wire format — every message is an object with `rd: PROTOCOL` so foreign
// channel traffic is ignored:
//   { rd, kind: 'rpc',  id, cmd, args }          request (either side)
//   { rd, kind: 'res',  id, ok, result?|error? } response to a request
//   { rd, kind: 'event', name, data }            one-way notification
//   { rd, kind: '<raw>', data }                  handshake/status messages
//   { rd, kind: 'chunk', cid, i, n, part }       slice of a serialized big message
//
// Handshake (raw messages, driven by hostEngine/clientEngine):
//   hello → auth-need → auth → consent-wait → session-open | deny
export const PROTOCOL = 1;
export const CHANNEL_NAME = 'w12-remote-desktop';

const CHUNK_CHARS = 60000;                 // serialized chars per chunk
const CHUNK_TOTAL_CAP = 12 * 1024 * 1024;  // reassembly safety cap
const CHUNK_STALE_MS = 30000;
const DEFAULT_RPC_TIMEOUT = 12000;

function chunkId() {
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * A control session over one peer link. `link` is anything with
 * send(msg) and close() — hostEngine/clientEngine adapt Net channels.
 */
export class Session {
    /**
     * @param {{send: Function, close: Function}} link
     * @param {string} peerId remote peer id on the underlying channel
     * @param {object} [meta] remote meta (device name, etc.)
     */
    constructor(link, peerId, meta = {}) {
        this.link = link;
        this.peerId = peerId;
        this.meta = meta || {};
        this._reqId = 0;
        this._pending = new Map();   // rpc id -> { resolve, reject, timer }
        this._chunks = new Map();    // cid -> { parts, got, n, at }
        this._onRequest = null;
        this._onMessage = null;
        this._onEvent = null;
        this._endCbs = new Set();
        this._ended = false;
        this._gcTimer = setInterval(() => this._pruneChunks(), 10000);
    }

    /** Feed one message from the underlying channel (engine-level routing). */
    handleIncoming(from, msg) {
        if (this._ended || from !== this.peerId) return;
        if (!msg || msg.rd !== PROTOCOL) return;
        if (msg.kind === 'chunk') {
            this._assemble(msg);
            return;
        }
        this._route(msg);
    }

    _assemble(msg) {
        const cid = msg.cid;
        if (typeof cid !== 'string' || typeof msg.part !== 'string'
            || !Number.isFinite(msg.i) || !Number.isFinite(msg.n) || msg.n < 2 || msg.n > 4096) return;
        let entry = this._chunks.get(cid);
        if (!entry) {
            entry = { parts: new Array(msg.n).fill(null), got: 0, n: msg.n, at: Date.now(), bytes: 0 };
            this._chunks.set(cid, entry);
        }
        if (entry.parts[msg.i] === null && msg.i < entry.n) {
            entry.parts[msg.i] = msg.part;
            entry.got++;
            entry.bytes += msg.part.length;
            if (entry.bytes > CHUNK_TOTAL_CAP) { this._chunks.delete(cid); return; }
        }
        if (entry.got === entry.n) {
            this._chunks.delete(cid);
            try {
                this._route(JSON.parse(entry.parts.join('')));
            } catch { /* corrupt assembly — drop */ }
        }
    }

    _pruneChunks() {
        const now = Date.now();
        for (const [cid, entry] of this._chunks) {
            if (now - entry.at > CHUNK_STALE_MS) this._chunks.delete(cid);
        }
    }

    _route(msg) {
        switch (msg.kind) {
            case 'rpc':
                this._handleRpc(msg);
                break;
            case 'res': {
                const pending = this._pending.get(msg.id);
                if (pending) {
                    this._pending.delete(msg.id);
                    clearTimeout(pending.timer);
                    if (msg.ok) pending.resolve(msg.result);
                    else pending.reject(new Error(msg.error || 'Request failed on the remote device.'));
                }
                break;
            }
            case 'event':
                if (this._onEvent) {
                    try { this._onEvent(msg.name, msg.data); } catch (e) { console.error('[RemoteDesktop] event handler threw', e); }
                }
                break;
            default:
                if (this._onMessage) {
                    try { this._onMessage(msg); } catch (e) { console.error('[RemoteDesktop] message handler threw', e); }
                }
                break;
        }
    }

    async _handleRpc(msg) {
        let ok = true;
        let result = null;
        let error = null;
        if (typeof this._onRequest !== 'function') {
            ok = false;
            error = 'The remote session cannot serve requests right now.';
        } else {
            try {
                result = await this._onRequest(msg.cmd, msg.args);
            } catch (e) {
                ok = false;
                error = (e && e.message) ? e.message : String(e);
            }
        }
        const res = { rd: PROTOCOL, kind: 'res', id: msg.id, ok };
        if (ok) res.result = result;
        else res.error = error;
        this._post(res);
    }

    _post(obj) {
        let json;
        try { json = JSON.stringify(obj); } catch (e) {
            console.error('[RemoteDesktop] message not serializable', e);
            return;
        }
        try {
            if (json.length <= CHUNK_CHARS) {
                this.link.send(obj);
                return;
            }
            const cid = chunkId();
            const n = Math.ceil(json.length / CHUNK_CHARS);
            for (let i = 0; i < n; i++) {
                this.link.send({ rd: PROTOCOL, kind: 'chunk', cid, i, n, part: json.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS) });
            }
        } catch (e) {
            // A failed send means the link is gone — end the session.
            console.error('[RemoteDesktop] send failed, ending session', e);
            this.end();
        }
    }

    /** Fire-and-forget raw message: { kind, data }. */
    send(kind, data) {
        this._post({ rd: PROTOCOL, kind, data });
    }

    /** One-way notification (host → controller, mostly). */
    event(name, data) {
        this._post({ rd: PROTOCOL, kind: 'event', name, data });
    }

    /**
     * Round-trip request. Rejects on timeout or remote error.
     * @returns {Promise<any>}
     */
    request(cmd, args, timeoutMs = DEFAULT_RPC_TIMEOUT) {
        if (this._ended) return Promise.reject(new Error('The session has ended.'));
        const id = ++this._reqId;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this._pending.delete(id);
                reject(new Error(`"${cmd}" timed out — the other device stopped responding.`));
            }, timeoutMs);
            this._pending.set(id, { resolve, reject, timer });
            this._post({ rd: PROTOCOL, kind: 'rpc', id, cmd, args: args === undefined ? {} : args });
        });
    }

    /** Set the handler serving incoming requests: (cmd, args) => result (may be a Promise). */
    onRequest(handler) { this._onRequest = handler; }

    /** Raw (handshake/status) message handler: (msg) => void. */
    onMessage(cb) { this._onMessage = cb; }

    /** Event handler: (name, data) => void. */
    onEvent(cb) { this._onEvent = cb; }

    /** Session ended (locally or remotely). Returns unsubscribe. */
    onEnd(cb) {
        this._endCbs.add(cb);
        if (this._ended) cb(this._endReason);
        return () => this._endCbs.delete(cb);
    }

    /** Close locally. */
    end(reason = 'local') {
        if (this._ended) return;
        this._ended = true;
        this._endReason = reason;
        clearInterval(this._gcTimer);
        for (const pending of this._pending.values()) {
            clearTimeout(pending.timer);
            pending.reject(new Error('The session has ended.'));
        }
        this._pending.clear();
        try { this.link.close(); } catch { /* noop */ }
        for (const cb of [...this._endCbs]) {
            try { cb(reason); } catch (e) { console.error('[RemoteDesktop] end handler threw', e); }
        }
    }

    /** Called by the engine when the underlying link died remotely. */
    _remoteClosed(reason = 'remote') {
        if (this._ended) return;
        this._ended = true;
        this._endReason = reason;
        clearInterval(this._gcTimer);
        for (const pending of this._pending.values()) {
            clearTimeout(pending.timer);
            pending.reject(new Error('The other device disconnected.'));
        }
        this._pending.clear();
        for (const cb of [...this._endCbs]) {
            try { cb(reason); } catch (e) { console.error('[RemoteDesktop] end handler threw', e); }
        }
    }

    get isOpen() { return !this._ended; }
}

/** The device descriptor exchanged during hello. */
export function deviceInfo(identity) {
    return {
        id: identity.deviceId,
        name: identity.deviceName,
        proto: PROTOCOL
    };
}
