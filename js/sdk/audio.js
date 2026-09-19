// Windows 12 SDK — Audio.
//
// One lazily-created AudioContext per app process, wired into the OS:
// every sound passes through the user's Settings > Sound master volume,
// and the context auto-suspends when the browser tab is hidden so
// backgrounded OS sessions stay silent. The context is created lazily —
// browsers start it suspended until a user gesture, so call unlock() from
// a click/keydown (or just let beep() do it).
//
//   const app = createApp({ id: 'myGame' });
//   app.audio.beep({ freq: 180, type: 'triangle', duration: 0.1 });  // dig!
//
// For anything richer (decoders, streaming, spatial audio) take the raw
// context with Audio.context() and build your graph on it — volume and
// tab-suspend still apply to everything routed through masterGain().
import InternalConfig from '../modules/systemConfig.js';
import { ErrorCodes, SDKError } from './errors.js';

let ctx = null;
let master = null;
let manualSuspend = false;

function supported() {
    try {
        return !!(typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext));
    } catch { return false; }
}

function ensureAutoSuspend() {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', () => {
        if (!ctx) return;
        try {
            if (document.hidden) ctx.suspend();
            else if (!manualSuspend) ctx.resume();
        } catch { /* stub environments */ }
    });
}

/**
 * The shared AudioContext (created on first call; may start 'suspended'
 * until a user gesture — pair with unlock()).
 * @returns {AudioContext}
 * @throws {SDKError} UNSUPPORTED when the device has no Web Audio
 */
function context() {
    if (ctx) return ctx;
    if (!supported()) {
        throw new SDKError(ErrorCodes.UNSUPPORTED, 'This device has no Web Audio API.');
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    ensureAutoSuspend();
    return ctx;
}

/**
 * The context-wide gain node that tracks the OS master volume. Route your
 * sounds through it (or just use beep(), which does) so the user's volume
 * setting applies.
 * @returns {GainNode}
 */
function masterGain() {
    const c = context();
    if (!master) {
        master = c.createGain();
        master.connect(c.destination);
    }
    try { master.gain.value = masterVolume(); } catch { /* keep last value */ }
    return master;
}

/**
 * The OS master volume (Settings > Sound) as 0..1.
 * @returns {number}
 */
function masterVolume() {
    try {
        const v = Number(InternalConfig.get('masterVolume'));
        return Number.isFinite(v) ? Math.max(0, Math.min(1, v / 100)) : 0.75;
    } catch { return 0.75; }
}

/**
 * Resume the shared context from a user gesture. Safe to call always.
 * @returns {Promise<string>} the resulting state ('running', ...)
 */
async function unlock() {
    const c = context();
    manualSuspend = false;
    if (c.state === 'suspended') {
        try { await c.resume(); } catch { /* gesture requirement */ }
    }
    return c.state;
}

/**
 * Suspend the shared context (games: call from your pause menu).
 * Auto-resumes on visibilitychange unless suspended again manually.
 */
function suspend() {
    if (!ctx) return;
    manualSuspend = true;
    try { ctx.suspend(); } catch { /* ignore */ }
}

/** Current state without creating the context ('closed' before first use). */
function state() {
    return ctx ? ctx.state : 'closed';
}

/**
 * One synthesized tone through the master volume — cover beep / UI blip /
 * simple game SFX without building a graph.
 * @param {object} [opts] { freq=440, endFreq (slide), duration=0.15,
 *   type='sine'|'square'|'sawtooth'|'triangle', volume=0.2 (0..1, before
 *   master volume), delay=0 (seconds from now) }
 */
function beep(opts) {
    const o = opts || {};
    const c = context();
    const t0 = c.currentTime + Math.max(0, Number(o.delay) || 0);
    const dur = Math.max(0.01, Number(o.duration) || 0.15);
    const vol = Math.max(0, Math.min(1, Number(o.volume) || 0.2));

    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(Number(o.freq) || 440, t0);
    if (o.endFreq !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, Number(o.endFreq)), t0 + dur);
    }
    gain.gain.setValueAtTime(vol * masterVolume(), t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(masterGain());
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
}

export const Audio = {
    supported,
    isSupported: supported,
    context,
    masterGain,
    masterVolume,
    unlock,
    suspend,
    state,
    beep
};
export default Audio;
