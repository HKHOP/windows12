// Windows 12 SDK — Net.
//
// App-to-app messaging between separate OS sessions ("devices"). Two
// transports ship built in:
//
//   local   — BroadcastChannel. Every tab running the OS in this browser
//             is a peer. Zero setup; peer presence + discovery built in.
//   webrtc  — a direct peer-to-peer DataChannel to another device over
//             the network, with MANUAL signaling: one side creates an
//             invite code, the other pastes it and returns an answer
//             code. No server is involved (public STUN only), so very
//             strict NATs may fail to connect — that is the price of
//             serverless. On a LAN or typical home network it just works.
//
//   // Same-browser: presence + messaging
//   const ch = Net.createChannel({ name: 'my-game', meta: { name: 'Desk PC' } });
//   ch.on('message', ({ from, msg }) => ch.send({ hello: 'back' }));
//   ch.on('peer-open', ({ id, meta }) => console.log('joined', meta));
//   const devices = await Net.discover('my-game');
//
//   // Cross-device: manual pairing
//   const invite = await Net.createInvite({ meta: { name: 'Desk PC' } });
//   // ... hand invite.code to the other device, get an answer code back:
//   const ch = await invite.accept(answerCode);
//   // ... and on the other side:
//   const pending = await Net.acceptInvite(inviteCode, { meta: { name: 'Laptop' } });
//   // ... hand pending.code back, then:
//   const ch2 = await pending.connected;
//
// Messages must be JSON-serializable objects. A Channel is a plain event
// source: on('message'|'peer-open'|'peer-close'|'error', cb) returns an
// unsubscribe function; close() releases the transport. WebRTC channels
// are point-to-point; local channels broadcast to every peer (use
// sendTo(peerId, msg) for directed sends).
import { ErrorCodes, SDKError, requireString } from './errors.js';

const NET_VERSION = 1;
// Public STUN only — serverless by design. Host candidates cover LAN;
// STUN covers most home/consumer NATs. No TURN: traffic must stay P2P.
const ICE_SERVERS = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
];
const DISCOVER_DEFAULT_MS = 900;   // how long discovery listens for acks
const ICE_GATHER_TIMEOUT_MS = 3500; // host candidates exist immediately; STUN may need a beat
const LINK_OPEN_TIMEOUT_MS = 20000;
const PING_MS = 5000;              // keep-alive so dead tabs are pruned
const PEER_STALE_MS = 14000;

/** @returns {string} random id (UUID when the platform has it) */
function uid() {
    try {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    } catch { /* fall through */ }
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function cleanMeta(meta) {
    if (meta === undefined || meta === null) return {};
    if (typeof meta !== 'object' || Array.isArray(meta)) {
        throw new SDKError(ErrorCodes.INVALID_ARGS, 'meta must be an object.');
    }
    return { ...meta };
}

// Minimal multi-event emitter shared by every transport.
function makeEvents() {
    const map = new Map();
    return {
        on(event, cb) {
            if (typeof event !== 'string' || typeof cb !== 'function') {
                throw new SDKError(ErrorCodes.INVALID_ARGS, 'on() needs an event name and a function.');
            }
            if (!map.has(event)) map.set(event, new Set());
            map.get(event).add(cb);
            return () => map.get(event) && map.get(event).delete(cb);
        },
        emit(event, detail) {
            const set = map.get(event);
            if (!set) return;
            for (const cb of [...set]) {
                try { cb(detail); } catch (e) { console.error('[Windows12 SDK] Net handler threw for "' + event + '"', e); }
            }
        },
        has(event) { return !!map.get(event) && map.get(event).size > 0; }
    };
}

// Safe code packing (invite/answer codes carry SDP + meta; may hold unicode).
function encodeCode(obj) {
    const json = JSON.stringify(obj);
    return btoa(encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))));
}

function decodeCode(code) {
    let parsed;
    try {
        // Strip all whitespace: long codes pasted through chat apps or
        // wrapped textareas can pick up line breaks/spaces mid-code.
        const clean = String(code).replace(/\s+/g, '');
        const json = decodeURIComponent(atob(clean).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
        parsed = JSON.parse(json);
    } catch {
        throw new SDKError(ErrorCodes.INVALID_ARGS, 'That code is not valid — copy it exactly as it was shown.');
    }
    if (!parsed || parsed.app !== 'w12-net' || parsed.v !== NET_VERSION || !parsed.sdp) {
        throw new SDKError(ErrorCodes.INVALID_ARGS, 'That code is not a Windows 12 Net invite.');
    }
    return parsed;
}

// ---------- local transport (BroadcastChannel, many peers) ----------

function createLocalChannel(name, opts = {}) {
    if (typeof BroadcastChannel === 'undefined') {
        throw new SDKError(ErrorCodes.UNSUPPORTED, 'BroadcastChannel is not available in this browser.');
    }
    const meta = cleanMeta(opts.meta);
    const self = { id: uid(), meta };
    const events = makeEvents();
    const peers = new Map(); // id -> { id, meta, lastSeen }
    let closed = false;

    const bus = new BroadcastChannel('w12-net/' + name);

    function post(kind, payload, to) {
        if (closed) return;
        try {
            const env = { net: NET_VERSION, ch: name, kind, from: self.id, to: to || null };
            if (payload !== undefined) env.payload = payload;
            bus.postMessage(env);
        } catch (e) {
            events.emit('error', { error: e });
        }
    }

    function touchPeer(id, peerMeta) {
        const existing = peers.get(id);
        if (existing) {
            existing.lastSeen = Date.now();
            if (peerMeta) existing.meta = peerMeta;
            return existing;
        }
        const peer = { id, meta: peerMeta || {}, lastSeen: Date.now() };
        peers.set(id, peer);
        events.emit('peer-open', { id, meta: peer.meta });
        return peer;
    }

    function dropPeer(id, reason) {
        if (!peers.has(id)) return;
        peers.delete(id);
        events.emit('peer-close', { id, reason: reason || 'left' });
    }

    bus.onmessage = (e) => {
        const env = e.data;
        if (!env || env.net !== NET_VERSION || env.ch !== name) return;
        if (env.from === self.id) return;
        if (env.to && env.to !== self.id) return;
        switch (env.kind) {
            case 'hello':
                // Answer so the newcomer learns about us, too.
                touchPeer(env.from, env.payload);
                post('hello-back', self.meta, env.from);
                break;
            case 'hello-back':
                touchPeer(env.from, env.payload);
                break;
            case 'msg':
                touchPeer(env.from);
                events.emit('message', { from: env.from, msg: env.payload });
                break;
            case 'bye':
                dropPeer(env.from, 'left');
                break;
            case 'probe':
                post('ack', self.meta, env.from);
                break;
            case 'ack':
                // Discovery-only channels handle their own acks; live
                // channels just treat them as presence.
                touchPeer(env.from, env.payload);
                break;
            case 'ping':
                touchPeer(env.from);
                break;
            default:
                break;
        }
    };

    // Liveness: announce, then keep-alive so crashed tabs disappear.
    post('hello', self.meta);
    const pinger = setInterval(() => post('ping'), PING_MS);
    const pruner = setInterval(() => {
        const now = Date.now();
        for (const id of [...peers.keys()]) {
            if (now - peers.get(id).lastSeen > PEER_STALE_MS) dropPeer(id, 'timeout');
        }
    }, PING_MS);
    const bye = () => post('bye');
    window.addEventListener('beforeunload', bye);

    function close() {
        if (closed) return;
        closed = true;
        bye();
        clearInterval(pinger);
        clearInterval(pruner);
        window.removeEventListener('beforeunload', bye);
        try { bus.close(); } catch { /* already closed */ }
        for (const id of [...peers.keys()]) dropPeer(id, 'closed');
    }

    return {
        transport: 'local',
        localId: self.id,
        send(msg) { post('msg', msg); },
        sendTo(peerId, msg) {
            requireString(peerId, 'peerId');
            post('msg', msg, peerId);
        },
        peers() {
            return [...peers.values()].map(p => ({ id: p.id, meta: { ...p.meta } }));
        },
        on: events.on,
        close
    };
}

/**
 * Discover peers listening on a channel name in this browser.
 * @param {string} name channel name
 * @param {object} [opts] { timeout: ms (default ~900) }
 * @returns {Promise<Array<{id: string, meta: object}>>}
 */
function discover(name, opts = {}) {
    requireString(name, 'name');
    const timeout = Number.isFinite(opts.timeout) ? Math.max(100, opts.timeout) : DISCOVER_DEFAULT_MS;
    return new Promise((resolve) => {
        if (typeof BroadcastChannel === 'undefined') { resolve([]); return; }
        const bus = new BroadcastChannel('w12-net/' + name);
        const from = uid();
        const found = new Map();
        let done = false;

        const finish = () => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            try { bus.close(); } catch { /* already closed */ }
            resolve([...found.values()].map(p => ({ id: p.id, meta: { ...p.meta } })));
        };
        const timer = setTimeout(finish, timeout);

        bus.onmessage = (e) => {
            const env = e.data;
            if (!env || env.net !== NET_VERSION || env.ch !== name || env.kind !== 'ack') return;
            if (env.to !== from) return;
            found.set(env.from, { id: env.from, meta: env.payload || {} });
        };
        try {
            bus.postMessage({ net: NET_VERSION, ch: name, kind: 'probe', from, to: null });
        } catch {
            finish();
        }
    });
}

// ---------- webrtc transport (manual signaling, one peer) ----------

function makePeerConnection() {
    if (typeof RTCPeerConnection === 'undefined') {
        throw new SDKError(ErrorCodes.UNSUPPORTED, 'WebRTC is not available in this browser.');
    }
    return new RTCPeerConnection({ iceServers: ICE_SERVERS });
}

// Resolve once local candidates are in the SDP (or the timeout hits —
// host candidates usually arrive instantly, STUN may add a beat).
function gatherIce(pc) {
    return new Promise((resolve) => {
        if (pc.iceGatheringState === 'complete') { resolve(); return; }
        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            try { pc.removeEventListener('icegatheringstatechange', check); } catch { /* noop */ }
            resolve();
        };
        const timer = setTimeout(finish, ICE_GATHER_TIMEOUT_MS);
        const check = () => { if (pc.iceGatheringState === 'complete') finish(); };
        pc.addEventListener('icegatheringstatechange', check);
    });
}

// Wrap an open DataChannel in the standard Channel surface. `pc` is the
// owning RTCPeerConnection (watched for connection death).
function wrapDataChannel(dc, selfId, remoteId, remoteMeta, pc, teardown) {
    const events = makeEvents();
    // whenOpen() may resolve after the open event already fired — seed
    // the state from readyState so peers() works immediately.
    let open = dc.readyState === 'open';
    let closed = false;

    const close = (reason) => {
        if (closed) return;
        closed = true;
        try { dc.close(); } catch { /* noop */ }
        try { teardown(); } catch { /* noop */ }
        events.emit('peer-close', { id: remoteId, reason: reason || 'closed' });
    };

    dc.onopen = () => {
        open = true;
        events.emit('peer-open', { id: remoteId, meta: remoteMeta });
    };
    dc.onmessage = (e) => {
        let msg = e.data;
        if (typeof msg === 'string') {
            try { msg = JSON.parse(msg); } catch { /* keep raw string */ }
        }
        events.emit('message', { from: remoteId, msg });
    };
    dc.onclose = () => close('closed');
    dc.onerror = () => { if (!open) close('error'); };

    if (pc) {
        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'failed' || pc.connectionState === 'closed') close(pc.connectionState);
        };
    }

    return {
        transport: 'webrtc',
        localId: selfId,
        peerId: remoteId,
        send(msg) {
            if (closed || dc.readyState !== 'open') {
                throw new SDKError(ErrorCodes.UNSUPPORTED, 'The WebRTC link is not open.');
            }
            dc.send(JSON.stringify(msg === undefined ? null : msg));
        },
        sendTo(peerId, msg) {
            if (peerId && peerId !== remoteId) {
                throw new SDKError(ErrorCodes.NOT_FOUND, 'A WebRTC channel has exactly one peer.');
            }
            this.send(msg);
        },
        peers() { return open ? [{ id: remoteId, meta: { ...remoteMeta } }] : []; },
        on: events.on,
        close: () => close('closed')
    };
}

// Wait for the DataChannel to open (or the link/timeout to fail).
function whenOpen(pc, dcPromise, remoteMeta) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            cleanup();
            reject(new SDKError(ErrorCodes.UNSUPPORTED, 'The WebRTC link did not open in time. Check both devices are online and try again.'));
        }, LINK_OPEN_TIMEOUT_MS);
        function cleanup() { clearTimeout(timer); try { pc.removeEventListener('connectionstatechange', onState); } catch { /* noop */ } }
        function onState() {
            if (pc.connectionState === 'failed') {
                cleanup();
                reject(new SDKError(ErrorCodes.UNSUPPORTED, 'The WebRTC link failed to connect (network blocked peer-to-peer?).'));
            }
        }
        pc.addEventListener('connectionstatechange', onState);
        dcPromise.then((dc) => {
            if (dc.readyState === 'open') {
                cleanup();
                resolve({ dc, meta: remoteMeta });
                return;
            }
            dc.addEventListener('open', () => { cleanup(); resolve({ dc, meta: remoteMeta }); }, { once: true });
        }).catch((e) => { cleanup(); reject(e); });
    });
}

/**
 * Create an invite for a point-to-point WebRTC link (the "host" side of
 * pairing). Share `code` with the other device; when it returns an answer
 * code, call `accept(answerCode)` — resolves with the open Channel.
 * @param {object} [opts] { meta: object }
 * @returns {Promise<{code: string, accept: (answerCode: string) => Promise<object>}>}
 */
async function createInvite(opts = {}) {
    const meta = cleanMeta(opts.meta);
    const selfId = uid();
    const pc = makePeerConnection();
    const dc = pc.createDataChannel('w12-net', { ordered: true });
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await gatherIce(pc);
    // `pid` carries our peer id across the manual handshake so both ends
    // address each other consistently.
    const code = encodeCode({ app: 'w12-net', v: NET_VERSION, type: 'offer', sdp: pc.localDescription.sdp, pid: selfId, meta });

    return {
        code,
        async accept(answerCode) {
            requireString(answerCode, 'answerCode');
            const ans = decodeCode(answerCode);
            if (ans.type !== 'answer') {
                throw new SDKError(ErrorCodes.INVALID_ARGS, 'Expected an answer code here (this side created the invite).');
            }
            await pc.setRemoteDescription({ type: 'answer', sdp: ans.sdp });
            const opened = await whenOpen(pc, Promise.resolve(dc), ans.meta || {});
            return wrapDataChannel(dc, selfId, ans.pid || uid(), opened.meta, pc, () => { try { pc.close(); } catch { /* noop */ } });
        }
    };
}

/**
 * Accept an invite code (the "join" side of pairing). Returns the answer
 * `code` to hand back, plus a `connected` promise for the open Channel.
 * @param {string} inviteCode the code from Net.createInvite()
 * @param {object} [opts] { meta: object }
 * @returns {Promise<{code: string, connected: Promise<object>}>}
 */
async function acceptInvite(inviteCode, opts = {}) {
    requireString(inviteCode, 'inviteCode');
    const meta = cleanMeta(opts.meta);
    const offer = decodeCode(inviteCode);
    if (offer.type !== 'offer') {
        throw new SDKError(ErrorCodes.INVALID_ARGS, 'Expected an invite code here (not an answer code).');
    }
    const pc = makePeerConnection();
    const selfId = uid();
    let dcResolve;
    const dcPromise = new Promise((resolve) => { dcResolve = resolve; });
    pc.ondatachannel = (e) => dcResolve(e.channel);

    await pc.setRemoteDescription({ type: 'offer', sdp: offer.sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await gatherIce(pc);
    const code = encodeCode({ app: 'w12-net', v: NET_VERSION, type: 'answer', sdp: pc.localDescription.sdp, pid: selfId, meta });

    const connected = whenOpen(pc, dcPromise, offer.meta || {}).then((opened) => {
        return wrapDataChannel(opened.dc, selfId, offer.pid || uid(), opened.meta, pc, () => { try { pc.close(); } catch { /* noop */ } });
    });
    return { code, connected };
}

// ---------- short codes (6-character rendezvous pairing) ----------
//
// A 6-character code cannot physically carry kilobytes of SDP, so short
// codes are lookup keys: both devices swap their offer/answer envelopes
// through a public MQTT rendezvous (hand-rolled MQTT 3.1.1 over
// WebSocket — our own code, no libraries, same dependency class as the
// STUN servers). The peer link itself stays direct WebRTC. Manual
// full-length codes keep working with no relay (the offline fallback).

const SHORT_CODE_LEN = 6;
const SHORT_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // unambiguous: no 0/O/1/I/L
const SHORT_TTL_MS = 10 * 60000;
const OFFER_WAIT_MS = 60000;
const RENDEZVOUS_BROKERS = [
    'wss://broker.emqx.io:8084/mqtt',
    'wss://test.mosquitto.org:8081/mqtt'
];
const RELAY_WS_TIMEOUT_MS = 15000;

function makeShortCode() {
    const out = [];
    try {
        const rnd = new Uint8Array(SHORT_CODE_LEN);
        crypto.getRandomValues(rnd);
        for (const b of rnd) out.push(SHORT_ALPHABET[b % SHORT_ALPHABET.length]);
    } catch {
        for (let i = 0; i < SHORT_CODE_LEN; i++) {
            out.push(SHORT_ALPHABET[Math.floor(Math.random() * SHORT_ALPHABET.length)]);
        }
    }
    return out.join('');
}

function normalizeShortCode(code) {
    const clean = String(code).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.length !== SHORT_CODE_LEN || [...clean].some(c => !SHORT_ALPHABET.includes(c))) {
        throw new SDKError(ErrorCodes.INVALID_ARGS,
            'That short code doesn\'t look right — 6 characters, no 0/O/1/I/L. Check for typos.');
    }
    return clean;
}

function relayUnreachable() {
    return new SDKError(ErrorCodes.UNSUPPORTED,
        'Short-code pairing can\'t reach its relay — check your internet connection, or use a full invite code instead.');
}

// --- minimal MQTT 3.1.1 codec (QoS 0, no auth; exact-topic only) ---

function encodeVarint(n) {
    const out = [];
    do {
        let b = n % 128;
        n = Math.floor(n / 128);
        if (n > 0) b |= 0x80;
        out.push(b);
    } while (n > 0);
    return out;
}

function decodeVarint(buf, offset) {
    let value = 0;
    let mult = 1;
    for (let i = 0; i < 4; i++) {
        if (offset + i >= buf.length) return null;
        const b = buf[offset + i];
        value += (b & 0x7F) * mult;
        mult *= 128;
        if ((b & 0x80) === 0) return { value, bytes: i + 1 };
    }
    return null;
}

function encodeStr(s) {
    const bytes = new TextEncoder().encode(s);
    return [bytes.length >> 8, bytes.length & 0xFF, ...bytes];
}

function buildConnect(clientId) {
    const body = [0x00, 0x04, 0x4D, 0x51, 0x54, 0x54, 0x04, 0x02, 0x00, 0x3C, ...encodeStr(clientId)];
    return new Uint8Array([0x10, ...encodeVarint(body.length), ...body]);
}

let mqttPktId = 0;

function buildSubscribe(topic) {
    mqttPktId = (mqttPktId % 65535) + 1;
    const body = [mqttPktId >> 8, mqttPktId & 0xFF, ...encodeStr(topic), 0x00];
    return new Uint8Array([0x82, ...encodeVarint(body.length), ...body]);
}

function buildPublish(topic, payloadBytes, retain) {
    const body = [...encodeStr(topic), ...payloadBytes];
    return new Uint8Array([0x30 | (retain ? 0x01 : 0), ...encodeVarint(body.length), ...body]);
}

// Connect to the first reachable rendezvous broker.
// Resolves { publish(topic, text, retain), subscribe(topic), onMessage(cb)->off, close() }.
function mqttRelay() {
    return new Promise((resolve, reject) => {
        if (typeof WebSocket === 'undefined') { reject(relayUnreachable()); return; }
        let i = 0;
        const tryNext = () => {
            if (i >= RENDEZVOUS_BROKERS.length) { reject(relayUnreachable()); return; }
            const url = RENDEZVOUS_BROKERS[i++];
            let ws;
            try {
                ws = new WebSocket(url);
            } catch {
                tryNext();
                return;
            }
            ws.binaryType = 'arraybuffer';
            let settled = false;
            let buf = new Uint8Array(0);
            let handler = null;
            let pingTimer = null;
            const send = (bytes) => ws.send(bytes);
            const api = {
                publish(topic, text, retain) {
                    send(buildPublish(topic, new TextEncoder().encode(text), !!retain));
                },
                subscribe(topic) {
                    send(buildSubscribe(topic));
                },
                onMessage(cb) {
                    handler = cb;
                    return () => { if (handler === cb) handler = null; };
                },
                close() {
                    if (pingTimer) clearTimeout(pingTimer);
                    try { send(new Uint8Array([0xE0, 0x00])); } catch { /* closing */ }
                    try { ws.close(); } catch { /* already closed */ }
                }
            };
            const fail = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                try { ws.close(); } catch { /* noop */ }
                tryNext();
            };
            const timer = setTimeout(fail, RELAY_WS_TIMEOUT_MS);
            const feed = (chunk) => {
                const next = new Uint8Array(buf.length + chunk.length);
                next.set(buf);
                next.set(chunk, buf.length);
                buf = next;
                for (;;) {
                    if (buf.length < 2) return;
                    const rl = decodeVarint(buf, 1);
                    if (!rl) return;
                    const total = 1 + rl.bytes + rl.value;
                    if (buf.length < total) return;
                    const packet = buf.slice(0, total);
                    buf = buf.slice(total);
                    const type = packet[0] & 0xF0;
                    if (type === 0x20) { // CONNACK
                        if (packet.length < 4 || packet[3] !== 0) { fail(); return; }
                        if (!settled) {
                            settled = true;
                            clearTimeout(timer);
                            pingTimer = setInterval(() => {
                                try { send(new Uint8Array([0xC0, 0x00])); } catch { /* dying */ }
                            }, 30000);
                            resolve(api);
                        }
                    } else if (type === 0x30) { // PUBLISH (QoS 0)
                        const off = 1 + rl.bytes;
                        if (packet.length < off + 2) continue;
                        const tlen = (packet[off] << 8) | packet[off + 1];
                        const topic = new TextDecoder().decode(packet.slice(off + 2, off + 2 + tlen));
                        const payload = new TextDecoder().decode(packet.slice(off + 2 + tlen));
                        if (handler) {
                            try { handler(topic, payload); } catch (e) { console.error('[Windows12 SDK] Net relay handler threw', e); }
                        }
                    }
                    // SUBACK / PINGRESP / anything else: safely ignored.
                }
            };
            ws.onopen = () => {
                try { send(buildConnect('w12-' + uid().replace(/[^a-zA-Z0-9]/g, '').slice(0, 12))); }
                catch { fail(); }
            };
            ws.onmessage = (e) => {
                const data = e.data;
                if (data instanceof ArrayBuffer) {
                    feed(new Uint8Array(data));
                } else if (typeof Blob !== 'undefined' && data instanceof Blob) {
                    data.arrayBuffer().then((ab) => feed(new Uint8Array(ab))).catch(() => { /* drop */ });
                }
            };
            ws.onerror = fail;
            ws.onclose = () => { if (!settled) fail(); };
        };
        tryNext();
    });
}

function validEnvelope(parsed, type) {
    return !!parsed && parsed.app === 'w12-net' && parsed.v === NET_VERSION
        && parsed.type === type && typeof parsed.sdp === 'string' && !!parsed.sdp;
}

/**
 * Create a 6-character short code for a point-to-point WebRTC link. Share
 * `code`; the other device types it into Net.acceptShortInvite() — no
 * answer code to pass back. `waitForController()` resolves with the open
 * Channel once the controller joins (rejects after ~10 minutes).
 * @param {object} [opts] { meta: object }
 * @returns {Promise<{code: string, waitForController: () => Promise<object>}>}
 */
async function createShortInvite(opts = {}) {
    const meta = cleanMeta(opts.meta);
    const selfId = uid();
    const code = makeShortCode();
    const pc = makePeerConnection();
    const dc = pc.createDataChannel('w12-net', { ordered: true });
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await gatherIce(pc);
    const base = 'w12rd/v1/' + code;
    let relay;
    try {
        relay = await mqttRelay();
    } catch (e) {
        try { pc.close(); } catch { /* noop */ }
        throw e;
    }
    try {
        relay.subscribe(base + '/answer');
        relay.publish(base + '/offer',
            JSON.stringify({ app: 'w12-net', v: NET_VERSION, type: 'offer', sdp: pc.localDescription.sdp, pid: selfId, meta }),
            true);
    } catch (e) {
        try { relay.close(); } catch { /* noop */ }
        try { pc.close(); } catch { /* noop */ }
        throw new SDKError(ErrorCodes.UNSUPPORTED, 'Short-code pairing failed — use a full invite code instead.');
    }
    // Answers arriving before waitForController() is called are stashed.
    let stashedAnswer = null;
    const waiters = new Set();
    relay.onMessage((topic, text) => {
        if (topic !== base + '/answer') return;
        let parsed;
        try { parsed = JSON.parse(text); } catch { return; }
        if (!validEnvelope(parsed, 'answer')) return;
        stashedAnswer = parsed;
        for (const w of [...waiters]) {
            try { w(parsed); } catch { /* waiter gone */ }
        }
        waiters.clear();
    });

    async function waitForController() {
        if (!stashedAnswer) {
            stashedAnswer = await new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    waiters.delete(res);
                    reject(new SDKError(ErrorCodes.UNSUPPORTED, 'No device joined with this code in time.'));
                }, SHORT_TTL_MS);
                const res = (p) => { clearTimeout(timer); resolve(p); };
                waiters.add(res);
            });
        }
        const ans = stashedAnswer;
        await pc.setRemoteDescription({ type: 'answer', sdp: ans.sdp });
        const opened = await whenOpen(pc, Promise.resolve(dc), ans.meta || {});
        // Tidy the room so the code can't be replayed later.
        try {
            relay.publish(base + '/offer', '', true);
            relay.publish(base + '/answer', '', true);
        } catch { /* best effort */ }
        try { relay.close(); } catch { /* noop */ }
        return wrapDataChannel(dc, selfId, ans.pid || uid(), opened.meta, pc, () => { try { pc.close(); } catch { /* noop */ } });
    }

    return { code, waitForController };
}

/**
 * Join via a 6-character short code (the "join" side of rendezvous
 * pairing). No answer code to hand back — `connected` resolves with the
 * open Channel once the link is up.
 * @param {string} code the 6-character code from Net.createShortInvite()
 * @param {object} [opts] { meta: object }
 * @returns {Promise<{connected: Promise<object>}>}
 */
async function acceptShortInvite(code, opts = {}) {
    requireString(code, 'code');
    const meta = cleanMeta(opts.meta);
    const clean = normalizeShortCode(code);
    const selfId = uid();
    const base = 'w12rd/v1/' + clean;
    const relay = await mqttRelay();
    const offer = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            cleanup();
            reject(new SDKError(ErrorCodes.UNSUPPORTED,
                'No host is waiting on that code — check it, or ask for a fresh one.'));
        }, OFFER_WAIT_MS);
        const off = relay.onMessage((topic, text) => {
            if (topic !== base + '/offer') return;
            let parsed;
            try { parsed = JSON.parse(text); } catch { return; } // cleared rooms send '' — ignore
            if (!validEnvelope(parsed, 'offer')) return;
            cleanup();
            resolve(parsed);
        });
        function cleanup() { clearTimeout(timer); try { off(); } catch { /* noop */ } }
        try {
            relay.subscribe(base + '/offer');
        } catch (e) {
            cleanup();
            reject(e);
        }
    });
    const pc = makePeerConnection();
    let dcResolve;
    const dcPromise = new Promise((resolve) => { dcResolve = resolve; });
    pc.ondatachannel = (e) => dcResolve(e.channel);

    await pc.setRemoteDescription({ type: 'offer', sdp: offer.sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await gatherIce(pc);
    relay.publish(base + '/answer',
        JSON.stringify({ app: 'w12-net', v: NET_VERSION, type: 'answer', sdp: pc.localDescription.sdp, pid: selfId, meta }),
        true);

    const connected = whenOpen(pc, dcPromise, offer.meta || {}).then((opened) => {
        try { relay.close(); } catch { /* noop */ }
        return wrapDataChannel(opened.dc, selfId, offer.pid || uid(), opened.meta, pc, () => { try { pc.close(); } catch { /* noop */ } });
    });
    return { connected };
}

export const Net = {
    transports: { local: 'local', webrtc: 'webrtc' },
    createChannel(opts) {
        const o = opts || {};
        requireString(o.name, 'opts.name');
        const transport = o.transport || 'local';
        if (transport === 'local') return createLocalChannel(o.name, o);
        if (transport === 'webrtc') {
            throw new SDKError(ErrorCodes.INVALID_ARGS,
                "WebRTC channels are created via Net.createInvite()/Net.acceptInvite() — manual signaling needs the two of you to exchange codes first.");
        }
        throw new SDKError(ErrorCodes.INVALID_ARGS, `Unknown transport "${transport}" (use 'local' or 'webrtc').`);
    },
    discover,
    createInvite,
    acceptInvite,
    createShortInvite,
    acceptShortInvite
};

export default Net;
