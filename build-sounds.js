// Generates the built-in Windows 12 sound set.
//
//     node build-sounds.js
//
// Soft, tactile Windows 11-inspired palette: muffled cloth transients, rounded
// water-bubble glides and warm creamy pads. No bright bell partials, no sharp
// attacks and no big reverb. Zero dependencies, deterministic output.
const fs = require('fs');
const path = require('path');

const SR = 44100;
const TAU = Math.PI * 2;
const ROOT = __dirname;
const OUT_DIR = path.join(ROOT, 'assets', 'sounds');

// Deliberately simple spectra. The second/third partials are barely there;
// the low-pass in finish() removes the rest of the edge.
const TONE = [[1, 1, 1], [2, 0.04, 0.7]];
const CREAM = [[1, 1, 1], [2, 0.06, 1.2], [3, 0.015, 1.5]];

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function newBuffer(seconds) {
    const n = Math.ceil(seconds * SR);
    return { l: new Float32Array(n), r: new Float32Array(n), n };
}

function panGains(pan) {
    const p = Math.max(-1, Math.min(1, pan || 0));
    const angle = (p + 1) * Math.PI / 4;
    return [Math.cos(angle), Math.sin(angle)];
}

function mix(buf, index, left, right) {
    if (index < 0 || index >= buf.n) return;
    buf.l[index] += left;
    buf.r[index] += right;
}

function softAttack(t, attack) {
    if (attack <= 0) return 1;
    const x = Math.min(1, t / attack);
    return x * x * (3 - 2 * x);
}

// Every note gets a short smooth release before its declared end. Without this
// a note that is still audible at its duration boundary produces a broadband
// click - the single biggest reason a synthesized cue sounds cheap.
function softEnvelope(t, duration, attack, decay, release) {
    let env = softAttack(t, attack) * Math.exp(-t / decay);
    const r = Math.min(release == null ? 0.045 : release, duration * 0.45);
    if (r > 0 && t > duration - r) {
        const x = Math.max(0, (duration - t) / r);
        env *= x * x * (3 - 2 * x);
    }
    return env;
}

// A rounded bubble: the pitch starts low, rises quickly and settles while the
// amplitude blooms and fades. The tiny second harmonic keeps it from sounding
// like a pure test tone.
function addBubble(buf, start, f0, f1, duration, opts = {}) {
    const gain = opts.gain == null ? 0.14 : opts.gain;
    const decay = opts.decay == null ? 0.24 : opts.decay;
    const attack = opts.attack == null ? 0.009 : opts.attack;
    const glide = opts.glide == null ? 0.075 : opts.glide;
    const release = opts.release == null ? 0.05 : opts.release;
    const pan = panGains(opts.pan);
    const offset = Math.max(0, Math.round((start || 0) * SR));
    const count = Math.min(buf.n - offset, Math.ceil(duration * SR));
    let phase = 0;
    for (let i = 0; i < count; i++) {
        const t = i / SR;
        const f = f1 + (f0 - f1) * Math.exp(-t / glide);
        phase += TAU * f / SR;
        const env = softEnvelope(t, duration, attack, decay, release);
        const s = (Math.sin(phase) + Math.sin(phase * 2) * 0.04) * env * gain;
        mix(buf, offset + i, s * pan[0], s * pan[1]);
    }
}

// A muffled low thump. The pitch falls instead of clicking, which reads as
// weight rather than attack.
function addThump(buf, start, f0, f1, duration, opts = {}) {
    const gain = opts.gain == null ? 0.16 : opts.gain;
    const decay = opts.decay == null ? 0.14 : opts.decay;
    const attack = opts.attack == null ? 0.006 : opts.attack;
    const glide = opts.glide == null ? 0.07 : opts.glide;
    const release = opts.release == null ? 0.04 : opts.release;
    const pan = panGains(opts.pan);
    const offset = Math.max(0, Math.round((start || 0) * SR));
    const count = Math.min(buf.n - offset, Math.ceil(duration * SR));
    let phase = 0;
    for (let i = 0; i < count; i++) {
        const t = i / SR;
        const f = f1 + (f0 - f1) * Math.exp(-t / glide);
        phase += TAU * f / SR;
        const env = softEnvelope(t, duration, attack, decay, release);
        const s = Math.sin(phase) * env * gain;
        mix(buf, offset + i, s * pan[0], s * pan[1]);
    }
}

// A soft, low-passed cloth/air transient. Grain makes it rustle instead of
// hiss; cutoff stays low so it never becomes a click.
function addCloth(buf, start, duration, opts = {}) {
    const rand = opts.rand || Math.random;
    const gain = opts.gain == null ? 0.12 : opts.gain;
    const decay = opts.decay == null ? 0.09 : opts.decay;
    const attack = opts.attack == null ? 0.004 : opts.attack;
    const cutoff = opts.cutoff || 1200;
    const highpass = opts.highpass || 180;
    const release = opts.release == null ? 0.03 : opts.release;
    const pan = panGains(opts.pan);
    const offset = Math.max(0, Math.round((start || 0) * SR));
    const count = Math.min(buf.n - offset, Math.ceil(duration * SR));
    const lpCoeff = 1 - Math.exp(-TAU * cutoff / SR);
    const hpCoeff = 1 - Math.exp(-TAU * highpass / SR);
    let lp1 = 0;
    let lp2 = 0;
    let hp = 0;
    let grain = 1;
    const grainStep = Math.max(1, Math.round(0.014 * SR));
    for (let i = 0; i < count; i++) {
        const t = i / SR;
        if (i % grainStep === 0) grain = 0.35 + rand() * 0.65;
        const white = rand() * 2 - 1;
        // Two cascaded low-passes keep cloth muffled instead of hissy.
        lp1 += lpCoeff * (white - lp1);
        lp2 += lpCoeff * (lp1 - lp2);
        hp += hpCoeff * (lp2 - hp);
        const env = softEnvelope(t, duration, attack, decay, release);
        const s = (lp2 - hp) * env * gain * grain;
        mix(buf, offset + i, s * pan[0], s * pan[1]);
    }
}

// Warm pad. Two slightly detuned layers create a gentle chorus without any
// high-frequency shimmer.
function addPad(buf, freq, duration, opts = {}) {
    const gain = opts.gain == null ? 0.03 : opts.gain;
    const attack = opts.attack == null ? 0.26 : opts.attack;
    const decay = opts.decay == null ? 1.3 : opts.decay;
    const pan = opts.pan == null ? 0 : opts.pan;
    const detune = opts.detune == null ? 0.0012 : opts.detune;
    const release = opts.release == null ? 0.15 : opts.release;
    const partials = opts.partials || CREAM;
    addTone(buf, 0, freq, duration, { gain: gain / 2, attack, decay, release, pan, detune: -detune, partials });
    addTone(buf, 0, freq, duration, { gain: gain / 2, attack, decay, release, pan, detune, partials });
}

function addTone(buf, start, freq, duration, opts = {}) {
    const partials = opts.partials || TONE;
    const gain = opts.gain == null ? 0.15 : opts.gain;
    const attack = opts.attack == null ? 0.02 : opts.attack;
    const decay = opts.decay == null ? 0.6 : opts.decay;
    const release = opts.release == null ? 0.06 : opts.release;
    const detune = opts.detune || 0;
    const pan = panGains(opts.pan);
    const offset = Math.max(0, Math.round((start || 0) * SR));
    const count = Math.min(buf.n - offset, Math.ceil(duration * SR));
    for (const [ratio, amp, scale] of partials) {
        const phase = ratio * 0.61;
        const f = freq * (1 + detune) * ratio;
        const d = decay * scale;
        for (let i = 0; i < count; i++) {
            const t = i / SR;
            const env = softEnvelope(t, duration, attack, d, release);
            const s = Math.sin(TAU * f * t + phase) * amp * env * gain;
            mix(buf, offset + i, s * pan[0], s * pan[1]);
        }
    }
}

// Short, quiet reflections. Deliberately no feedback: system sounds should sit
// close to the listener, not wash into a hall.
function addRoom(buf, amount) {
    if (!amount || amount <= 0) return;
    const dryL = buf.l.slice();
    const dryR = buf.r.slice();
    const taps = [
        { delay: 0.031, gain: 0.18, cross: 0.7 },
        { delay: 0.053, gain: 0.11, cross: 0.35 },
        { delay: 0.081, gain: 0.07, cross: 0.55 }
    ];
    for (const tap of taps) {
        const offset = Math.round(tap.delay * SR);
        for (let i = offset; i < buf.n; i++) {
            const l = dryL[i - offset];
            const r = dryR[i - offset];
            buf.l[i] += (l * (1 - tap.cross) + r * tap.cross) * tap.gain * amount;
            buf.r[i] += (r * (1 - tap.cross) + l * tap.cross) * tap.gain * amount;
        }
    }
}

function lowpass(buf, cutoff, passes = 2) {
    if (!cutoff || cutoff >= SR / 2) return;
    const a = 1 - Math.exp(-TAU * cutoff / SR);
    for (let p = 0; p < passes; p++) {
        let l = 0;
        let r = 0;
        for (let i = 0; i < buf.n; i++) {
            l += a * (buf.l[i] - l);
            r += a * (buf.r[i] - r);
            buf.l[i] = l;
            buf.r[i] = r;
        }
    }
}

function highpass(buf, cutoff) {
    if (!cutoff) return;
    const a = 1 - Math.exp(-TAU * cutoff / SR);
    let l = 0;
    let r = 0;
    for (let i = 0; i < buf.n; i++) {
        l += a * (buf.l[i] - l);
        r += a * (buf.r[i] - r);
        buf.l[i] -= l;
        buf.r[i] -= r;
    }
}

function finish(buf, peak, opts = {}) {
    addRoom(buf, opts.room || 0);
    lowpass(buf, opts.lowpass || 3000, 2);
    highpass(buf, 55);

    let max = 0;
    for (let i = 0; i < buf.n; i++) {
        max = Math.max(max, Math.abs(buf.l[i]), Math.abs(buf.r[i]));
    }
    const target = peak == null ? 0.45 : peak;
    const scale = max > 0 ? target / max : 0;
    const fadeIn = Math.round(0.004 * SR);
    const fadeOut = Math.round((opts.fadeOut || 0.05) * SR);
    for (let i = 0; i < buf.n; i++) {
        let gain = scale;
        if (i < fadeIn) gain *= i / fadeIn;
        if (i > buf.n - fadeOut) gain *= (buf.n - i) / fadeOut;
        buf.l[i] *= gain;
        buf.r[i] *= gain;
    }
    return buf;
}

function writeWav(name, buf) {
    const size = 44 + buf.n * 4;
    const out = Buffer.alloc(size);
    out.write('RIFF', 0);
    out.writeUInt32LE(size - 8, 4);
    out.write('WAVE', 8);
    out.write('fmt ', 12);
    out.writeUInt32LE(16, 16);
    out.writeUInt16LE(1, 20);
    out.writeUInt16LE(2, 22);
    out.writeUInt32LE(SR, 24);
    out.writeUInt32LE(SR * 4, 28);
    out.writeUInt16LE(4, 32);
    out.writeUInt16LE(16, 34);
    out.write('data', 36);
    out.writeUInt32LE(buf.n * 4, 40);
    for (let i = 0; i < buf.n; i++) {
        const l = Math.max(-1, Math.min(1, buf.l[i]));
        const r = Math.max(-1, Math.min(1, buf.r[i]));
        out.writeInt16LE(Math.round(l * 32767), 44 + i * 4);
        out.writeInt16LE(Math.round(r * 32767), 46 + i * 4);
    }
    fs.writeFileSync(path.join(OUT_DIR, name + '.wav'), out);
    console.log(`${name}.wav  ${(size / 1024).toFixed(0)} KB`);
}

const RENDERERS = {
    error(buf, rand) {
        addThump(buf, 0, 150, 65, 0.36, { gain: 0.2, decay: 0.16 });
        addCloth(buf, 0.01, 0.2, { gain: 0.09, cutoff: 700, highpass: 120, decay: 0.08, rand });
        addBubble(buf, 0.12, 330, 220, 0.68, { gain: 0.15, decay: 0.3, pan: -0.04 });
    },
    warning(buf, rand) {
        addCloth(buf, 0, 0.24, { gain: 0.1, cutoff: 900, highpass: 160, decay: 0.1, pan: -0.1, rand });
        addBubble(buf, 0.03, 520, 390, 0.72, { gain: 0.15, decay: 0.3, pan: 0.04 });
        addPad(buf, 130.81, 0.95, { gain: 0.03, attack: 0.08, decay: 0.6 });
    },
    info(buf, rand) {
        addBubble(buf, 0, 420, 540, 0.38, { gain: 0.15, decay: 0.2, pan: -0.04 });
        addBubble(buf, 0.16, 540, 680, 0.48, { gain: 0.13, decay: 0.28, pan: 0.04 });
        addPad(buf, 261.63, 1.0, { gain: 0.022, attack: 0.08, decay: 0.8 });
        addCloth(buf, 0, 0.03, { gain: 0.014, cutoff: 900, highpass: 180, decay: 0.009, attack: 0.001, rand });
    },
    confirm(buf, rand) {
        addBubble(buf, 0, 520, 650, 0.4, { gain: 0.16, decay: 0.2, pan: -0.04 });
        addBubble(buf, 0.12, 650, 820, 0.5, { gain: 0.14, decay: 0.28, pan: 0.04 });
        addPad(buf, 261.63, 0.9, { gain: 0.02, attack: 0.08, decay: 0.7 });
        addCloth(buf, 0, 0.03, { gain: 0.014, cutoff: 900, highpass: 180, decay: 0.009, attack: 0.001, rand });
    },
    notification(buf, rand) {
        addPad(buf, 440, 1.15, { gain: 0.045, attack: 0.05, decay: 0.9, pan: -0.05 });
        addBubble(buf, 0.02, 620, 760, 0.6, { gain: 0.15, decay: 0.28, pan: 0.03 });
        addBubble(buf, 0.2, 760, 900, 0.38, { gain: 0.045, decay: 0.2, pan: 0.08 });
        addCloth(buf, 0.02, 0.035, { gain: 0.012, cutoff: 1000, highpass: 200, decay: 0.01, rand });
    },
    login(buf) {
        [130.81, 196, 261.63, 329.63].forEach((freq, i) => {
            addPad(buf, freq, 1.7, { gain: 0.035 - i * 0.005, attack: 0.3, decay: 1.4 });
        });
        addBubble(buf, 0.18, 523.25, 587.33, 0.55, { gain: 0.1, decay: 0.3, pan: -0.06 });
        addBubble(buf, 0.34, 659.25, 739.99, 0.6, { gain: 0.09, decay: 0.32, pan: 0.03 });
        addBubble(buf, 0.5, 783.99, 880, 0.65, { gain: 0.08, decay: 0.34, pan: 0.08 });
    },
    logout(buf) {
        [130.81, 196, 261.63].forEach((freq, i) => {
            addPad(buf, freq, 1.55, { gain: 0.032 - i * 0.005, attack: 0.32, decay: 1.3 });
        });
        addBubble(buf, 0, 783.99, 659.25, 0.58, { gain: 0.09, decay: 0.3, pan: 0.06 });
        addBubble(buf, 0.18, 659.25, 523.25, 0.6, { gain: 0.085, decay: 0.32, pan: -0.03 });
        addBubble(buf, 0.36, 523.25, 392, 0.65, { gain: 0.08, decay: 0.34, pan: -0.08 });
    },
    recycle(buf, rand) {
        addCloth(buf, 0, 0.4, { gain: 0.28, cutoff: 1200, highpass: 200, decay: 0.13, pan: -0.12, rand });
        addCloth(buf, 0.14, 0.2, { gain: 0.12, cutoff: 800, highpass: 150, decay: 0.08, pan: 0.15, rand });
        addThump(buf, 0.02, 120, 60, 0.3, { gain: 0.15, decay: 0.12 });
        addBubble(buf, 0.1, 300, 220, 0.3, { gain: 0.05, decay: 0.12, pan: 0.1 });
    },
    keyboard(buf, rand) {
        addCloth(buf, 0, 0.055, { gain: 0.25, cutoff: 1100, highpass: 150, decay: 0.016, attack: 0.001, rand });
        addCloth(buf, 0.028, 0.025, { gain: 0.08, cutoff: 900, highpass: 200, decay: 0.008, pan: 0.08, rand });
        addThump(buf, 0, 180, 150, 0.04, { gain: 0.04, decay: 0.01 });
    },
    click(buf, rand) {
        addCloth(buf, 0, 0.04, { gain: 0.18, cutoff: 900, highpass: 140, decay: 0.01, attack: 0.001, rand });
        addThump(buf, 0, 160, 140, 0.03, { gain: 0.025, decay: 0.008 });
    }
};

const SOUNDS = [
    { name: 'error', seconds: 1.15, peak: 0.52, room: 0.1, lowpass: 1800 },
    { name: 'warning', seconds: 1.1, peak: 0.46, room: 0.15, lowpass: 2200 },
    { name: 'info', seconds: 1.05, peak: 0.42, room: 0.15, lowpass: 2800 },
    { name: 'confirm', seconds: 1.05, peak: 0.44, room: 0.15, lowpass: 3000 },
    { name: 'notification', seconds: 1.15, peak: 0.4, room: 0.2, lowpass: 2600 },
    { name: 'login', seconds: 1.75, peak: 0.5, room: 0.2, lowpass: 3000 },
    { name: 'logout', seconds: 1.6, peak: 0.44, room: 0.2, lowpass: 2600 },
    { name: 'recycle', seconds: 0.7, peak: 0.4, room: 0.1, lowpass: 2000 },
    { name: 'keyboard', seconds: 0.08, peak: 0.14, room: 0, lowpass: 2000, fadeOut: 0.02 },
    { name: 'click', seconds: 0.06, peak: 0.08, room: 0, lowpass: 1800, fadeOut: 0.015 }
];

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const spec of SOUNDS) {
    const buf = newBuffer(spec.seconds);
    const rand = mulberry32(spec.name.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7));
    RENDERERS[spec.name](buf, rand);
    finish(buf, spec.peak, spec);
    writeWav(spec.name, buf);
}
console.log('\nWrote ' + SOUNDS.length + ' soft tactile presets to assets/sounds.');
