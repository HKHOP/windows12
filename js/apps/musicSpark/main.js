import WindowManager from '../../modules/windowManager.js';
import AppIcons from '../../modules/appIcons.js';
import Popup from '../../modules/popup.js';
import FileSystem from '../../modules/fileSystem.js';
import SavePrompt from '../../modules/saveprompt.js';

const MusicSpark = (() => {
    const APP_ID = 'musicSpark';
    const DATA_DIR = ['/', 'system', 'programs data', 'musicSpark'];
    const DOCS_DIR = ['/', 'users', 'default', 'Documents'];
    const MUSIC_DIR = ['/', 'users', 'default', 'Music'];

    const DRUMS = [
        { id: 'kick', name: 'Kick', color: '#ff5252' },
        { id: 'snare', name: 'Snare', color: '#ffb74d' },
        { id: 'clap', name: 'Clap', color: '#ffee58' },
        { id: 'chat', name: 'Closed Hat', color: '#69f0ae' },
        { id: 'ohat', name: 'Open Hat', color: '#40c4ff' },
        { id: 'tom', name: 'Tom', color: '#b388ff' },
        { id: 'perc', name: 'Perc', color: '#f48fb1' },
        { id: 'shaker', name: 'Shaker', color: '#a1887f' }
    ];
    const ALL_TRACKS = [...DRUMS.map(t => t.id), 'lead', 'bass'];
    const TRACK_META = {};
    DRUMS.forEach(t => { TRACK_META[t.id] = { name: t.name, color: t.color }; });
    TRACK_META.lead = { name: 'Lead', color: '#7bff9e' };
    TRACK_META.bass = { name: '808 Bass', color: '#ff9100' };

    // Piano roll range: C4 (60) .. C6 (84), displayed high -> low.
    // Bass layer is entered here but sounds 2 octaves lower.
    const LOW_MIDI = 60;
    const HIGH_MIDI = 84;
    const BASS_OCTAVES_DOWN = 2;
    const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const VEL_STEPS = [0.8, 1.0, 0.45];

    // ---------------- drum kits ----------------
    const KIT_DEFAULT = {
        kick: { f0: 160, f1: 42, dur: 0.45, vol: 1 },
        snare: { tone: 190, noise: 1800, vol: 1 },
        clap: { freq: 1300, vol: 1 },
        chat: { freq: 7500, dur: 0.06, vol: 0.7 },
        ohat: { freq: 6800, dur: 0.35, vol: 0.7 },
        tom: { f0: 220, f1: 85, dur: 0.3, vol: 1 },
        perc: { f0: 840, f1: 420, dur: 0.09, vol: 0.8 },
        shaker: { freq: 6000, dur: 0.12, vol: 0.6 }
    };
    const KITS = {
        studio: { name: 'Studio', p: {} },
        tr808: {
            name: 'TR-808', p: {
                kick: { f0: 110, f1: 38, dur: 0.6 }, snare: { tone: 170, noise: 1500 },
                chat: { freq: 8000, dur: 0.05 }, ohat: { freq: 7500, dur: 0.5 },
                tom: { f0: 160, f1: 60, dur: 0.4 }
            }
        },
        lofi: {
            name: 'Lo-Fi', p: {
                kick: { f0: 130, f1: 45, dur: 0.35, vol: 0.9 }, snare: { tone: 180, noise: 1200, vol: 0.85 },
                chat: { freq: 5500, dur: 0.07, vol: 0.55 }, ohat: { freq: 5000, dur: 0.3, vol: 0.55 },
                perc: { f0: 700, f1: 380, vol: 0.7 }, shaker: { freq: 4800, vol: 0.5 }
            }
        },
        acoustic: {
            name: 'Acoustic', p: {
                kick: { f0: 150, f1: 50, dur: 0.3 }, snare: { tone: 220, noise: 2200 },
                clap: { freq: 1600 }, chat: { freq: 9000, dur: 0.045, vol: 0.6 },
                ohat: { freq: 8500, dur: 0.25, vol: 0.6 }, tom: { f0: 260, f1: 110, dur: 0.25 },
                perc: { f0: 900, f1: 500 }
            }
        }
    };
    function kitParams(id, kit) {
        return Object.assign({}, KIT_DEFAULT[id], ((KITS[kit] && KITS[kit].p[id]) || {}));
    }

    function noteName(midi) {
        return NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
    }
    function isBlack(midi) {
        return NOTE_NAMES[midi % 12].includes('#');
    }
    function midiToFreq(midi) {
        return 440 * Math.pow(2, (midi - 69) / 12);
    }
    function esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ---------------- state ----------------
    function emptyDrums() {
        const d = {};
        DRUMS.forEach(t => { d[t.id] = new Array(16).fill(false); });
        return d;
    }
    function emptyVel() {
        const v = {};
        DRUMS.forEach(t => { v[t.id] = new Array(16).fill(0.8); });
        return v;
    }
    function emptyLayer() {
        const p = {};
        for (let m = LOW_MIDI; m <= HIGH_MIDI; m++) p[m] = new Array(16).fill(false);
        return p;
    }
    function emptyPattern() {
        return { drums: emptyDrums(), vel: emptyVel(), lead: emptyLayer(), bass: emptyLayer(), len: { lead: {}, bass: {} } };
    }
    function defaultTrackVol() {
        const v = {};
        DRUMS.forEach(t => { v[t.id] = 0.8; });
        v.lead = 0.8;
        v.bass = 0.85;
        v.master = 0.9;
        return v;
    }
    function defaultFx() {
        const f = {};
        ALL_TRACKS.forEach(id => {
            f[id] = { delay: 0, reverb: (id === 'snare' || id === 'clap' || id === 'lead') ? 0.25 : 0.1, cutoff: 18000 };
        });
        return f;
    }
    function blankState() {
        return {
            name: 'Untitled Beat',
            path: null,
            bpm: 128,
            swing: 0,
            metronome: false,
            kit: 'studio',
            pianoWave: 'sawtooth',
            bassWave: 'sine',
            currentPattern: 0,
            patterns: [emptyPattern(), emptyPattern(), emptyPattern(), emptyPattern()],
            arrangement: [0],
            songMode: false,
            songLoop: true,
            trackVol: defaultTrackVol(),
            trackMute: {},
            trackSolo: {},
            fx: defaultFx(),
            playing: false,
            step: 0,
            view: 'step',
            pianoLayer: 'lead',
            dirty: false
        };
    }

    const PRESETS = {
        'Empty': () => ({ patterns: [emptyPattern(), emptyPattern(), emptyPattern(), emptyPattern()], bpm: 128, kit: 'studio' }),
        'Hip-Hop 90': () => {
            const p = emptyPattern();
            [0, 7, 8].forEach(s => { p.drums.kick[s] = true; });
            [4, 12].forEach(s => { p.drums.snare[s] = true; });
            for (let s = 0; s < 16; s += 2) p.drums.chat[s] = true;
            p.drums.ohat[14] = true;
            p.drums.perc[3] = true; p.drums.perc[11] = true;
            p.bass[69][0] = true; p.bass[69][7] = true; p.bass[65][8] = true;
            p.len.bass['69:0'] = 3; p.len.bass['65:8'] = 3;
            return { patterns: [p, emptyPattern(), emptyPattern(), emptyPattern()], bpm: 90, kit: 'studio' };
        },
        'Trap': () => {
            const p = emptyPattern();
            [0, 6, 8, 10].forEach(s => { p.drums.kick[s] = true; });
            [4, 12].forEach(s => { p.drums.snare[s] = true; });
            for (let s = 0; s < 16; s++) { if (s % 2 === 0 || s === 13 || s === 15) p.drums.chat[s] = true; }
            p.drums.ohat[7] = true;
            p.drums.tom[15] = true;
            p.drums.shaker[2] = true; p.drums.shaker[6] = true; p.drums.shaker[10] = true; p.drums.shaker[14] = true;
            p.bass[65][0] = true; p.bass[65][6] = true; p.bass[63][8] = true; p.bass[63][10] = true;
            p.len.bass['65:0'] = 2; p.len.bass['63:8'] = 2;
            return { patterns: [p, emptyPattern(), emptyPattern(), emptyPattern()], bpm: 140, kit: 'tr808' };
        },
        'House': () => {
            const p = emptyPattern();
            [0, 4, 8, 12].forEach(s => { p.drums.kick[s] = true; });
            [4, 12].forEach(s => { p.drums.clap[s] = true; });
            for (let s = 2; s < 16; s += 4) p.drums.ohat[s] = true;
            for (let s = 0; s < 16; s++) p.drums.chat[s] = s % 4 !== 2;
            p.drums.shaker[1] = true; p.drums.shaker[5] = true; p.drums.shaker[9] = true; p.drums.shaker[13] = true;
            [2, 6, 10, 14].forEach((s, i) => { const n = [69, 69, 67, 65][i]; p.bass[n][s] = true; });
            return { patterns: [p, emptyPattern(), emptyPattern(), emptyPattern()], bpm: 124, kit: 'studio' };
        },
        'Techno': () => {
            const p = emptyPattern();
            [0, 4, 8, 12].forEach(s => { p.drums.kick[s] = true; });
            [2, 6, 10, 14].forEach(s => { p.drums.chat[s] = true; });
            [4, 12].forEach(s => { p.drums.snare[s] = true; });
            p.drums.perc[3] = true; p.drums.perc[7] = true; p.drums.perc[11] = true; p.drums.perc[15] = true;
            p.drums.tom[0] = true; p.drums.tom[8] = true;
            for (let s = 0; s < 16; s += 2) p.bass[62][s] = true;
            p.drums.kick.forEach((v, s) => { if (v) p.vel.kick[s] = 1.0; });
            return { patterns: [p, emptyPattern(), emptyPattern(), emptyPattern()], bpm: 132, kit: 'tr808' };
        },
        'Boom Bap + Keys': () => {
            const p = emptyPattern();
            [0, 7, 8].forEach(s => { p.drums.kick[s] = true; });
            [4, 12].forEach(s => { p.drums.snare[s] = true; });
            for (let s = 0; s < 16; s += 2) p.drums.chat[s] = true;
            p.drums.shaker[4] = true; p.drums.shaker[12] = true;
            p.lead[69][0] = true; p.lead[72][0] = true; p.lead[76][0] = true;
            p.lead[65][4] = true; p.lead[69][4] = true; p.lead[72][4] = true;
            p.lead[72][8] = true; p.lead[76][8] = true; p.lead[79][8] = true;
            p.lead[67][12] = true; p.lead[71][12] = true; p.lead[74][12] = true;
            p.len.lead['69:0'] = 4; p.len.lead['72:0'] = 4; p.len.lead['76:0'] = 4;
            p.len.lead['65:4'] = 4; p.len.lead['69:4'] = 4; p.len.lead['72:4'] = 4;
            p.len.lead['72:8'] = 4; p.len.lead['76:8'] = 4; p.len.lead['79:8'] = 4;
            p.len.lead['67:12'] = 4; p.len.lead['71:12'] = 4; p.len.lead['74:12'] = 4;
            p.bass[69][0] = true; p.bass[65][4] = true; p.bass[72][8] = true; p.bass[67][12] = true;
            p.len.bass['69:0'] = 4; p.len.bass['65:4'] = 4; p.len.bass['72:8'] = 4; p.len.bass['67:12'] = 4;
            const q = emptyPattern();
            [0, 8].forEach(s => { q.drums.kick[s] = true; });
            [4, 12].forEach(s => { q.drums.snare[s] = true; });
            for (let s = 0; s < 16; s += 2) q.drums.chat[s] = true;
            return { patterns: [p, q, emptyPattern(), emptyPattern()], bpm: 96, kit: 'studio' };
        },
        'Drill': () => {
            const p = emptyPattern();
            [0, 8, 11].forEach(s => { p.drums.kick[s] = true; });
            [4, 12].forEach(s => { p.drums.snare[s] = true; });
            for (let s = 0; s < 16; s += 2) p.drums.chat[s] = true;
            p.drums.chat[13] = true; p.drums.chat[15] = true;
            p.drums.ohat[7] = true;
            p.bass[67][0] = true; p.bass[66][3] = true; p.bass[65][6] = true; p.bass[63][10] = true;
            p.len.bass['67:0'] = 3; p.len.bass['66:3'] = 2; p.len.bass['65:6'] = 3; p.len.bass['63:10'] = 4;
            return { patterns: [p, emptyPattern(), emptyPattern(), emptyPattern()], bpm: 140, kit: 'tr808' };
        },
        'Lo-Fi': () => {
            const p = emptyPattern();
            [0, 7, 8].forEach(s => { p.drums.kick[s] = true; });
            [4, 12].forEach(s => { p.drums.snare[s] = true; });
            for (let s = 0; s < 16; s += 2) { if (s % 4 !== 0) p.drums.chat[s] = true; }
            p.drums.shaker[6] = true; p.drums.shaker[14] = true;
            [62, 65, 69, 72].forEach(n => { p.lead[n][0] = true; p.len.lead[n + ':0'] = 6; });
            [67, 71, 74, 77].forEach(n => { if (n <= HIGH_MIDI) { p.lead[n][8] = true; p.len.lead[n + ':8'] = 6; } });
            p.bass[62][0] = true; p.bass[67][8] = true;
            p.len.bass['62:0'] = 6; p.len.bass['67:8'] = 6;
            return { patterns: [p, emptyPattern(), emptyPattern(), emptyPattern()], bpm: 80, kit: 'lofi' };
        }
    };

    // ---------------- audio engine (shared ctx) ----------------
    let actx = null;
    let masterGain = null;
    const noiseCache = new WeakMap();
    const impulseCache = new WeakMap();
    let clipboard = null;

    function ensureCtx() {
        if (!actx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            actx = new AC();
            masterGain = actx.createGain();
            masterGain.connect(actx.destination);
        }
        if (actx.state === 'suspended') actx.resume();
        return actx;
    }
    function getNoise(ctx) {
        let buf = noiseCache.get(ctx);
        if (!buf) {
            buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
            noiseCache.set(ctx, buf);
        }
        return buf;
    }
    function getImpulse(ctx) {
        let buf = impulseCache.get(ctx);
        if (!buf) {
            const dur = 1.8, rate = ctx.sampleRate, len = Math.floor(rate * dur);
            buf = ctx.createBuffer(2, len, rate);
            for (let c = 0; c < 2; c++) {
                const d = buf.getChannelData(c);
                for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
            }
            impulseCache.set(ctx, buf);
        }
        return buf;
    }
    function noiseHit(ctx, dest, t, vol, filterType, freq, dur, q) {
        const src = ctx.createBufferSource();
        src.buffer = getNoise(ctx);
        src.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = filterType; f.frequency.value = freq; f.Q.value = q || 0.8;
        const g = ctx.createGain();
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.connect(f); f.connect(g); g.connect(dest);
        src.start(t); src.stop(t + dur + 0.05);
    }
    function tone(ctx, dest, t, vol, type, f0, f1, dur) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(f0, t);
        if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur * 0.9);
        const g = ctx.createGain();
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g); g.connect(dest);
        o.start(t); o.stop(t + dur + 0.05);
    }
    function playDrumOn(ctx, dest, id, t, vol, kit) {
        if (vol <= 0.001) return;
        const kp = kitParams(id, kit || 'studio');
        switch (id) {
            case 'kick':
                tone(ctx, dest, t, vol * kp.vol, 'sine', kp.f0, kp.f1, kp.dur);
                break;
            case 'snare':
                noiseHit(ctx, dest, t, vol * 0.9 * kp.vol, 'bandpass', kp.noise, 0.2, 0.9);
                tone(ctx, dest, t, vol * 0.7 * kp.vol, 'triangle', kp.tone, 120, 0.12);
                break;
            case 'clap':
                for (let i = 0; i < 3; i++) noiseHit(ctx, dest, t + i * 0.012, vol * (0.6 + i * 0.2) * kp.vol, 'bandpass', kp.freq, 0.12, 1.2);
                break;
            case 'chat':
                noiseHit(ctx, dest, t, vol * kp.vol, 'highpass', kp.freq, kp.dur, 0.7);
                break;
            case 'ohat':
                noiseHit(ctx, dest, t, vol * kp.vol, 'highpass', kp.freq, kp.dur, 0.7);
                break;
            case 'tom':
                tone(ctx, dest, t, vol * kp.vol, 'sine', kp.f0, kp.f1, kp.dur);
                break;
            case 'perc':
                tone(ctx, dest, t, vol * kp.vol, 'square', kp.f0, kp.f1, kp.dur);
                noiseHit(ctx, dest, t, vol * 0.35 * kp.vol, 'highpass', 5000, 0.05, 0.7);
                break;
            case 'shaker':
                noiseHit(ctx, dest, t, vol * kp.vol, 'highpass', kp.freq, kp.dur, 0.7);
                break;
        }
    }
    function playPianoOn(ctx, dest, midi, t, dur, vol, wave) {
        if (vol <= 0.001) return;
        const o = ctx.createOscillator();
        o.type = wave || 'sawtooth';
        o.frequency.value = midiToFreq(midi);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 3800; f.Q.value = 0.5;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0011), t + 0.015);
        g.gain.setValueAtTime(Math.max(vol, 0.0011), t + Math.max(dur - 0.05, 0.02));
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(f); f.connect(g); g.connect(dest);
        o.start(t); o.stop(t + dur + 0.05);
    }
    function playBassOn(ctx, dest, midi, t, dur, vol, wave, fromFreq) {
        if (vol <= 0.001) return;
        const f = midiToFreq(midi - BASS_OCTAVES_DOWN * 12);
        const o = ctx.createOscillator();
        o.type = wave || 'sine';
        o.frequency.setValueAtTime(fromFreq || f * 1.6, t);
        o.frequency.exponentialRampToValueAtTime(Math.max(f, 1), t + 0.06);
        const sh = ctx.createWaveShaper();
        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) { const x = i / 255 * 2 - 1; curve[i] = Math.tanh(1.6 * x); }
        sh.curve = curve;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0011), t + 0.02);
        g.gain.setValueAtTime(Math.max(vol, 0.0011), t + Math.max(dur - 0.06, 0.02));
        g.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.08);
        o.connect(sh); sh.connect(g); g.connect(dest);
        o.start(t); o.stop(t + dur + 0.15);
    }
    function clickOn(ctx, dest, t, vol, high) {
        tone(ctx, dest, t, vol, 'square', high ? 2000 : 1400, high ? 2000 : 1400, 0.05);
    }

    // Per-window FX graph: track gain -> filter -> master, plus delay + reverb sends.
    function buildGraph(ctx, dest, st) {
        const win = ctx.createGain();
        win.gain.value = st.trackVol.master ?? 0.9;
        win.connect(dest);
        const delay = ctx.createDelay(2.0);
        delay.delayTime.value = (60 / st.bpm / 4) * 3;
        const fb = ctx.createGain(); fb.gain.value = 0.35;
        const delayWet = ctx.createGain(); delayWet.gain.value = 0.9;
        delay.connect(fb); fb.connect(delay); delay.connect(delayWet); delayWet.connect(win);
        const verb = ctx.createConvolver(); verb.buffer = getImpulse(ctx);
        const verbWet = ctx.createGain(); verbWet.gain.value = 1.0;
        verb.connect(verbWet); verbWet.connect(win);
        const inputs = {}, filters = {}, dSends = {}, rSends = {};
        ALL_TRACKS.forEach(id => {
            const fx = (st.fx && st.fx[id]) || { delay: 0, reverb: 0, cutoff: 18000 };
            const g = ctx.createGain();
            const f = ctx.createBiquadFilter();
            f.type = 'lowpass'; f.frequency.value = fx.cutoff || 18000;
            const ds = ctx.createGain(); ds.gain.value = fx.delay || 0;
            const rs = ctx.createGain(); rs.gain.value = fx.reverb || 0;
            g.connect(f); f.connect(win);
            g.connect(ds); ds.connect(delay);
            g.connect(rs); rs.connect(verb);
            inputs[id] = g; filters[id] = f; dSends[id] = ds; rSends[id] = rs;
        });
        return { win, inputs, filters, dSends, rSends, delay };
    }
    function ensureLiveGraph(win, st) {
        if (!st._graph) {
            ensureCtx();
            st._graph = buildGraph(actx, masterGain, st);
        }
        return st._graph;
    }
    function destroyGraph(st) {
        if (st._graph) {
            try { st._graph.win.disconnect(); } catch (e) { /* already gone */ }
            st._graph = null;
        }
    }
    function applyFxToGraph(st) {
        const g = st._graph;
        if (!g) return;
        ALL_TRACKS.forEach(id => {
            const fx = (st.fx && st.fx[id]) || { delay: 0, reverb: 0, cutoff: 18000 };
            try {
                g.filters[id].frequency.value = fx.cutoff || 18000;
                g.dSends[id].gain.value = fx.delay || 0;
                g.rSends[id].gain.value = fx.reverb || 0;
            } catch (e) { /* ctx may be closed */ }
        });
        try {
            g.win.gain.value = st.trackVol.master ?? 0.9;
            g.delay.delayTime.value = (60 / st.bpm / 4) * 3;
        } catch (e) { /* ignore */ }
    }

    function trackAudible(st, id) {
        const anySolo = ALL_TRACKS.some(t => st.trackSolo[t]);
        if (st.trackMute[id]) return false;
        if (anySolo) return !!st.trackSolo[id];
        return true;
    }

    // ---------------- persistence ----------------
    function ensureDataDir() {
        if (!FileSystem.itemExists(DATA_DIR)) {
            FileSystem.createFolder(['/', 'system', 'programs data'], 'musicSpark');
        }
    }
    function serialize(st) {
        return JSON.stringify({
            app: 'musicSpark', version: 2, name: st.name, bpm: st.bpm, swing: st.swing,
            metronome: st.metronome, kit: st.kit, pianoWave: st.pianoWave, bassWave: st.bassWave,
            arrangement: st.arrangement, songMode: st.songMode, songLoop: st.songLoop,
            trackVol: st.trackVol, trackMute: st.trackMute, trackSolo: st.trackSolo,
            fx: st.fx, patterns: st.patterns
        });
    }
    function normalizePattern(src) {
        const p = emptyPattern();
        if (!src) return p;
        DRUMS.forEach(t => {
            const arr = src.drums?.[t.id];
            if (Array.isArray(arr) && arr.length === 16) p.drums[t.id] = arr.map(Boolean);
            const vel = src.vel?.[t.id];
            if (Array.isArray(vel) && vel.length === 16) {
                p.vel[t.id] = vel.map(v => (Number.isFinite(v) ? Math.min(1, Math.max(0.1, v)) : 0.8));
            }
        });
        // v1 files stored the melody in `piano`; v2 splits lead/bass
        const leadSrc = src.lead || src.piano || {};
        const bassSrc = src.bass || {};
        for (let m = LOW_MIDI; m <= HIGH_MIDI; m++) {
            const la = leadSrc[m];
            if (Array.isArray(la) && la.length === 16) p.lead[m] = la.map(Boolean);
            const ba = bassSrc[m];
            if (Array.isArray(ba) && ba.length === 16) p.bass[m] = ba.map(Boolean);
        }
        ['lead', 'bass'].forEach(layer => {
            const l = (src.len && src.len[layer]) || {};
            Object.keys(l).forEach(k => {
                const n = parseInt(l[k], 10);
                if (Number.isFinite(n) && n > 1) p.len[layer][k] = Math.min(16, n);
            });
        });
        return p;
    }
    function deserialize(json) {
        const data = JSON.parse(json);
        const st = blankState();
        if (typeof data.name === 'string') st.name = data.name;
        if (Number.isFinite(data.bpm)) st.bpm = Math.min(220, Math.max(50, data.bpm));
        if (Number.isFinite(data.swing)) st.swing = Math.min(0.5, Math.max(0, data.swing));
        st.metronome = !!data.metronome;
        if (data.kit && KITS[data.kit]) st.kit = data.kit;
        if (typeof data.pianoWave === 'string') st.pianoWave = data.pianoWave;
        if (typeof data.bassWave === 'string') st.bassWave = data.bassWave;
        if (data.trackVol) {
            const tv = Object.assign(defaultTrackVol(), data.trackVol);
            if (tv.piano != null && tv.lead == null) tv.lead = tv.piano;
            delete tv.piano;
            st.trackVol = tv;
        }
        if (data.trackMute) st.trackMute = data.trackMute;
        if (data.trackSolo) st.trackSolo = data.trackSolo;
        if (data.fx) {
            Object.keys(st.fx).forEach(id => {
                if (data.fx[id]) st.fx[id] = Object.assign(st.fx[id], data.fx[id]);
            });
        }
        if (Array.isArray(data.patterns)) {
            for (let i = 0; i < 4; i++) {
                if (data.patterns[i]) st.patterns[i] = normalizePattern(data.patterns[i]);
            }
        }
        if (Array.isArray(data.arrangement) && data.arrangement.length > 0) {
            st.arrangement = data.arrangement
                .map(n => parseInt(n, 10))
                .filter(n => n >= 0 && n <= 3)
                .slice(0, 64);
            if (st.arrangement.length === 0) st.arrangement = [0];
        }
        st.songMode = !!data.songMode;
        if (data.songLoop != null) st.songLoop = !!data.songLoop;
        return st;
    }
    let autosaveTimer = null;
    function autosave(st) {
        clearTimeout(autosaveTimer);
        autosaveTimer = setTimeout(() => {
            try {
                ensureDataDir();
                const p = [...DATA_DIR, 'autosave.json'];
                if (FileSystem.itemExists(p)) FileSystem.writeFile(p, serialize(st));
                else FileSystem.createFile(DATA_DIR, 'autosave.json', serialize(st), 'json');
            } catch (e) { /* storage may be full; ignore */ }
        }, 800);
    }
    function loadAutosave() {
        try {
            const raw = FileSystem.readFile([...DATA_DIR, 'autosave.json']);
            if (raw) return deserialize(raw);
        } catch (e) { /* ignore */ }
        return null;
    }

    // ---------------- offline render / WAV export ----------------
    function encodeWav(buffers, sampleRate) {
        const ch0 = buffers[0], ch1 = buffers[1] || buffers[0];
        const n = ch0.length;
        const buf = new ArrayBuffer(44 + n * 4);
        const v = new DataView(buf);
        const wstr = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
        wstr(0, 'RIFF');
        v.setUint32(4, 36 + n * 4, true);
        wstr(8, 'WAVE'); wstr(12, 'fmt ');
        v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
        v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 4, true);
        v.setUint16(32, 4, true); v.setUint16(34, 16, true);
        wstr(36, 'data'); v.setUint32(40, n * 4, true);
        let o = 44;
        for (let i = 0; i < n; i++) {
            v.setInt16(o, Math.max(-1, Math.min(1, ch0[i])) * 32767, true); o += 2;
            v.setInt16(o, Math.max(-1, Math.min(1, ch1[i])) * 32767, true); o += 2;
        }
        return buf;
    }
    function wavToDataUrl(buf) {
        const bytes = new Uint8Array(buf);
        let bin = '';
        const CH = 8192;
        for (let i = 0; i < bytes.length; i += CH) {
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
        }
        return 'data:audio/wav;base64,' + btoa(bin);
    }
    function buildEventList(st, mode) {
        const events = [];
        if (mode === 'song') {
            st.arrangement.forEach((p, bar) => {
                for (let s = 0; s < 16; s++) events.push({ pat: p, step: s, bar });
            });
        } else {
            for (let l = 0; l < 4; l++) {
                for (let s = 0; s < 16; s++) events.push({ pat: st.currentPattern, step: s, bar: l });
            }
        }
        return events;
    }
    async function renderAudio(st, mode) {
        const sr = 44100;
        const stepDur = 60 / st.bpm / 4;
        let events = buildEventList(st, mode);
        const MAX_SEC = 150;
        if (events.length * stepDur > MAX_SEC) {
            events = events.slice(0, Math.floor(MAX_SEC / stepDur));
        }
        const totalDur = events.length * stepDur + 2.5;
        const off = new OfflineAudioContext(2, Math.ceil(sr * totalDur), sr);
        const g = buildGraph(off, off.destination, st);
        g.win.gain.value = st.trackVol.master ?? 0.9;
        let lastBass = null;
        events.forEach((ev, i) => {
            const t = i * stepDur + 0.05 + (ev.step % 2 === 1 ? st.swing * stepDur : 0);
            const pat = st.patterns[ev.pat];
            DRUMS.forEach(tr => {
                if (pat.drums[tr.id][ev.step] && trackAudible(st, tr.id)) {
                    const vel = (pat.vel[tr.id] && pat.vel[tr.id][ev.step]) || 0.8;
                    playDrumOn(off, g.inputs[tr.id], tr.id, t, (st.trackVol[tr.id] ?? 0.8) * vel, st.kit);
                }
            });
            ['lead', 'bass'].forEach(layer => {
                for (let m = LOW_MIDI; m <= HIGH_MIDI; m++) {
                    if (pat[layer][m][ev.step] && trackAudible(st, layer)) {
                        const len = (pat.len[layer][m + ':' + ev.step]) || 1;
                        const dur = len * stepDur * 0.9;
                        if (layer === 'lead') {
                            playPianoOn(off, g.inputs.lead, m, t, dur, st.trackVol.lead ?? 0.8, st.pianoWave);
                        } else {
                            const from = (lastBass && t - lastBass.t < 0.3) ? midiToFreq(lastBass.midi - BASS_OCTAVES_DOWN * 12) : null;
                            playBassOn(off, g.inputs.bass, m, t, dur, st.trackVol.bass ?? 0.85, st.bassWave, from);
                            lastBass = { midi: m, t };
                        }
                    }
                }
            });
        });
        const rendered = await off.startRendering();
        return encodeWav([rendered.getChannelData(0), rendered.getChannelData(1)], sr);
    }

    // ---------------- UI ----------------
    function shellHtml() {
        const kitOpts = Object.keys(KITS).map(k => `<option value="${k}">${KITS[k].name}</option>`).join('');
        return `
        <div class="ms" style="display:flex;flex-direction:column;height:100%;background:#141414;color:#eee;font-family:'Segoe UI',sans-serif;overflow:hidden;">
            <style>
                .ms button{font-family:inherit}
                .ms-transport{display:flex;align-items:center;gap:10px;padding:8px 12px;background:#1e1e1e;border-bottom:1px solid #333;flex-wrap:wrap}
                .ms-logo{display:flex;align-items:center;gap:8px;font-weight:700;font-size:14px;color:#7bff9e;white-space:nowrap}
                .ms-tbtn{background:#2b2b2b;border:1px solid #444;color:#fff;border-radius:6px;min-width:36px;height:30px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;padding:0 10px}
                .ms-tbtn:hover{background:#3a3a3a}
                .ms-tbtn.playing{background:#2e7d32;border-color:#4caf50}
                .ms-tbtn.song-on{background:#6a1b9a;border-color:#ab47bc}
                .ms-ctl{display:flex;align-items:center;gap:6px;font-size:12px;color:#bbb}
                .ms-ctl input[type=range]{width:90px;accent-color:#7bff9e}
                .ms-ctl input[type=number]{width:56px;background:#111;border:1px solid #444;color:#fff;border-radius:4px;padding:3px 6px}
                .ms-ctl select{background:#111;border:1px solid #444;color:#fff;border-radius:4px;padding:3px 6px;font-size:12px}
                .ms-pats{display:flex;gap:4px}
                .ms-pat{background:#2b2b2b;border:1px solid #444;color:#bbb;border-radius:6px;width:30px;height:30px;cursor:pointer;font-size:12px;font-weight:700}
                .ms-pat.active{background:#7bff9e;color:#0b2e16;border-color:#7bff9e}
                .ms-tabs{display:flex;gap:4px;padding:6px 12px 0;background:#141414}
                .ms-tab{background:transparent;border:none;border-bottom:2px solid transparent;color:#999;font-size:13px;font-weight:600;padding:8px 14px;cursor:pointer}
                .ms-tab.active{color:#7bff9e;border-color:#7bff9e}
                .ms-toolbar{display:flex;align-items:center;gap:8px;padding:6px 12px;background:#191919;border-bottom:1px solid #2c2c2c;flex-wrap:wrap;font-size:12px}
                .ms-tool{background:#262626;border:1px solid #3d3d3d;color:#ddd;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:12px}
                .ms-tool:hover{background:#333}
                .ms-main{flex:1;overflow:auto;padding:12px;min-height:0}
                .ms-row{display:flex;align-items:center;gap:8px;margin-bottom:6px}
                .ms-rlabel{width:118px;display:flex;align-items:center;gap:6px;font-size:12px;flex-shrink:0}
                .ms-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
                .ms-mini{background:#2b2b2b;border:1px solid #444;color:#ccc;border-radius:4px;font-size:10px;padding:2px 6px;cursor:pointer;min-width:24px}
                .ms-mini.on{background:#7bff9e;color:#0b2e16;border-color:#7bff9e;font-weight:700}
                .ms-mini.solo-on{background:#40c4ff;color:#06283a;border-color:#40c4ff;font-weight:700}
                .ms-grid16{display:grid;grid-template-columns:repeat(16,minmax(26px,1fr));gap:4px;flex:1}
                .ms-pad{aspect-ratio:1.4;border:none;border-radius:5px;background:#262626;cursor:pointer;border:1px solid #383838;min-height:28px}
                .ms-pad.beat{background:#2f2f2f}
                .ms-pad.on{background:var(--c,#7bff9e);box-shadow:0 0 8px var(--c,#7bff9e);border-color:transparent}
                .ms-pad.on.acc{box-shadow:0 0 12px var(--c,#7bff9e),inset 0 0 0 2px #fff}
                .ms-pad.on.ghost{filter:brightness(0.55);box-shadow:none}
                .ms-pad.now{outline:2px solid #fff;outline-offset:1px}
                .ms-prow{display:flex;gap:8px;align-items:center}
                .ms-key{width:118px;flex-shrink:0;font-size:11px;padding:4px 8px;border-radius:4px;text-align:right;cursor:default;border:1px solid #333}
                .ms-key.black{background:#0a0a0a;color:#888}
                .ms-key.white{background:#d7d7d7;color:#111}
                .ms-key.c{background:#1d3a26;color:#7bff9e;border-color:#2e7d32;font-weight:700}
                .ms-pcell{border:none;border-radius:4px;background:#222;cursor:pointer;border:1px solid #353535;min-height:22px}
                .ms-pcell.on{background:#7bff9e;box-shadow:0 0 6px #7bff9e}
                .ms-pcell.sus{background:#2e7d32;border-color:#2e7d32}
                .ms-pcell.now{outline:2px solid #fff;outline-offset:0}
                .ms-mixer{display:flex;gap:14px;align-items:stretch;flex-wrap:wrap}
                .ms-strip{background:#1e1e1e;border:1px solid #333;border-radius:8px;padding:10px;display:flex;flex-direction:column;align-items:center;gap:8px;min-width:86px}
                .ms-strip input[type=range]{writing-mode:vertical-lr;direction:rtl;height:120px;accent-color:#7bff9e}
                .ms-status{display:flex;align-items:center;gap:14px;padding:5px 12px;background:#1e1e1e;border-top:1px solid #333;font-size:11px;color:#999}
                .ms-hint{color:#666}
                .ms-bar{background:#2b2b2b;border:1px solid #444;border-radius:8px;min-width:64px;height:56px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;color:#bbb;font-size:12px;font-weight:700;position:relative}
                .ms-bar:hover{background:#3a3a3a}
                .ms-bar.now{outline:2px solid #fff;outline-offset:1px}
                .ms-bar .ms-del{position:absolute;top:2px;right:4px;background:none;border:none;color:#777;cursor:pointer;font-size:11px;padding:0 2px}
                .ms-bar .ms-del:hover{color:#ff5252}
                .ms-seg{display:flex;background:#111;border:1px solid #444;border-radius:6px;overflow:hidden}
                .ms-seg button{background:transparent;border:none;color:#999;font-size:12px;font-weight:600;padding:5px 12px;cursor:pointer}
                .ms-seg button.active{background:#7bff9e;color:#0b2e16}
                .ms-fxrow{display:flex;align-items:center;gap:10px;background:#1e1e1e;border:1px solid #333;border-radius:8px;padding:8px 12px;margin-bottom:8px;flex-wrap:wrap}
                .ms-fxrow input[type=range]{width:120px;accent-color:#7bff9e}
                .ms-fxval{font-size:11px;color:#999;min-width:44px}
            </style>
            <div class="ms-transport">
                <div class="ms-logo"><span style="font-size:18px;">&#9835;</span> Music Spark</div>
                <button class="ms-tbtn ms-play" title="Play / Pause (Space)">&#9654;</button>
                <button class="ms-tbtn ms-stop" title="Stop">&#9632;</button>
                <button class="ms-tbtn ms-mode" title="Pattern / Song mode" style="font-size:11px;">PAT</button>
                <button class="ms-tbtn ms-loop" title="Loop song" style="font-size:11px;">LOOP</button>
                <div class="ms-ctl">BPM <input type="number" class="ms-bpm" min="50" max="220" value="128"><input type="range" class="ms-bpm-s" min="50" max="220" value="128"></div>
                <div class="ms-ctl">Swing <input type="range" class="ms-swing" min="0" max="50" value="0" title="Swing amount"></div>
                <div class="ms-ctl">Vol <input type="range" class="ms-master" min="0" max="100" value="90"></div>
                <div class="ms-ctl">Kit <select class="ms-kit">${kitOpts}</select></div>
                <button class="ms-tbtn ms-metro" title="Metronome" style="font-size:11px;">CLICK</button>
                <div class="ms-pats">
                    <button class="ms-pat" data-pat="0">1</button>
                    <button class="ms-pat" data-pat="1">2</button>
                    <button class="ms-pat" data-pat="2">3</button>
                    <button class="ms-pat" data-pat="3">4</button>
                </div>
                <div class="ms-ctl ms-pos" style="margin-left:auto;font-variant-numeric:tabular-nums;">1:1 | Pat 1</div>
            </div>
            <div class="ms-tabs">
                <button class="ms-tab active" data-view="step">Step Sequencer</button>
                <button class="ms-tab" data-view="piano">Piano Roll</button>
                <button class="ms-tab" data-view="song">Song</button>
                <button class="ms-tab" data-view="mixer">Mixer</button>
                <button class="ms-tab" data-view="fx">FX</button>
            </div>
            <div class="ms-toolbar">
                <button class="ms-tool" data-act="new">New</button>
                <button class="ms-tool" data-act="open">Open</button>
                <button class="ms-tool" data-act="save">Save</button>
                <button class="ms-tool" data-act="saveas">Save As</button>
                <button class="ms-tool" data-act="export">Export WAV</button>
                <span style="width:1px;height:18px;background:#333;"></span>
                <select class="ms-preset">
                    <option value="">Presets...</option>
                    <option>Hip-Hop 90</option>
                    <option>Trap</option>
                    <option>House</option>
                    <option>Techno</option>
                    <option>Boom Bap + Keys</option>
                    <option>Drill</option>
                    <option>Lo-Fi</option>
                    <option>Empty</option>
                </select>
                <button class="ms-tool" data-act="random">Randomize</button>
                <button class="ms-tool" data-act="clear">Clear</button>
                <span style="width:1px;height:18px;background:#333;"></span>
                <button class="ms-tool" data-act="copy">Copy Pat</button>
                <button class="ms-tool" data-act="paste">Paste</button>
                <button class="ms-tool" data-act="clone">Clone &gt;</button>
                <button class="ms-tool" data-act="help" style="margin-left:auto;">?</button>
            </div>
            <div class="ms-main"></div>
            <div class="ms-status"><span class="ms-proj">Untitled Beat</span><span class="ms-dirty"></span><span class="ms-hint">Pads: click = toggle, right-click = velocity &bull; Piano: click = note, drag right = length &bull; Space = play</span></div>
        </div>`;
    }

    function markDirty(win, st) {
        st.dirty = true;
        const d = win.element.querySelector('.ms-dirty');
        if (d) d.textContent = '● unsaved';
        autosave(st);
    }
    function markClean(win, st) {
        st.dirty = false;
        const d = win.element.querySelector('.ms-dirty');
        if (d) d.textContent = '';
    }
    function setProjLabel(win, st) {
        const el = win.element.querySelector('.ms-proj');
        if (el) el.textContent = st.name;
    }

    function renderAll(win, st) {
        renderTransport(win, st);
        renderView(win, st);
        setProjLabel(win, st);
    }

    function renderTransport(win, st) {
        const q = s => win.element.querySelector(s);
        q('.ms-bpm').value = st.bpm;
        q('.ms-bpm-s').value = st.bpm;
        q('.ms-swing').value = Math.round(st.swing * 100);
        q('.ms-master').value = Math.round((st.trackVol.master ?? 0.9) * 100);
        q('.ms-kit').value = st.kit;
        q('.ms-metro').classList.toggle('playing', st.metronome);
        q('.ms-play').classList.toggle('playing', st.playing);
        q('.ms-play').innerHTML = st.playing ? '&#10074;&#10074;' : '&#9654;';
        const mode = q('.ms-mode');
        mode.textContent = st.songMode ? 'SONG' : 'PAT';
        mode.classList.toggle('song-on', st.songMode);
        q('.ms-loop').classList.toggle('playing', st.songLoop);
        win.element.querySelectorAll('.ms-pat').forEach(b => {
            b.classList.toggle('active', parseInt(b.dataset.pat, 10) === st.currentPattern);
        });
        win.element.querySelectorAll('.ms-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.view === st.view);
        });
        updatePos(win, st, st.step, 0);
    }

    function updatePos(win, st, step, bar) {
        const pos = win.element.querySelector('.ms-pos');
        if (!pos) return;
        if (st.songMode) {
            pos.textContent = `Bar ${bar + 1}/${st.arrangement.length} | ${Math.floor(step / 4) + 1}:${(step % 4) + 1} | Pat ${(st.arrangement[bar] ?? 0) + 1}`;
        } else {
            pos.textContent = `${Math.floor(step / 4) + 1}:${(step % 4) + 1} | Pat ${st.currentPattern + 1}`;
        }
    }

    function renderView(win, st) {
        const main = win.element.querySelector('.ms-main');
        if (st.view === 'step') renderStep(main, win, st);
        else if (st.view === 'piano') renderPiano(main, win, st);
        else if (st.view === 'song') renderSong(main, win, st);
        else if (st.view === 'fx') renderFx(main, win, st);
        else renderMixer(main, win, st);
    }

    function velClass(v) {
        if (v >= 1) return ' acc';
        if (v < 0.6) return ' ghost';
        return '';
    }

    function renderStep(main, win, st) {
        const pat = st.patterns[st.currentPattern];
        let html = `<div style="min-width:640px;">
            <div style="font-size:12px;color:#999;margin-bottom:8px;">Pattern ${st.currentPattern + 1} &bull; right-click a pad to cycle velocity (dim = soft, ring = accent)</div>`;
        DRUMS.forEach(tr => {
            const cells = pat.drums[tr.id].map((v, s) => {
                const beat = s % 4 === 0 ? ' beat' : '';
                const vc = v ? velClass((pat.vel[tr.id] && pat.vel[tr.id][s]) || 0.8) : '';
                const now = (v && st.step === s && st.playing && !st.songMode) ? ' now' : '';
                return `<button class="ms-pad${beat}${v ? ' on' : ''}${vc}${now}" data-track="${tr.id}" data-step="${s}" style="--c:${tr.color}" title="${esc(tr.name)} step ${s + 1}"></button>`;
            }).join('');
            const m = st.trackMute[tr.id] ? ' on' : '';
            const so = st.trackSolo[tr.id] ? ' solo-on' : '';
            html += `<div class="ms-row">
                <div class="ms-rlabel"><span class="ms-dot" style="background:${tr.color}"></span>
                    <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(tr.name)}</span>
                    <button class="ms-mini ms-preview" data-track="${tr.id}" title="Preview sound">&#9654;</button>
                </div>
                <button class="ms-mini ms-mute${m}" data-track="${tr.id}" title="Mute">M</button>
                <button class="ms-mini ms-solo${so}" data-track="${tr.id}" title="Solo">S</button>
                <div class="ms-grid16">${cells}</div>
            </div>`;
        });
        html += '<div class="ms-hint" style="font-size:11px;margin-top:8px;">Tip: drums here, melody in Piano Roll, arrangement in the Song tab. Patterns 1–4 loop live — switch them while playing.</div></div>';
        main.innerHTML = html;

        main.querySelectorAll('.ms-pad').forEach(p => {
            p.addEventListener('click', () => {
                const t = p.dataset.track, s = parseInt(p.dataset.step, 10);
                pat.drums[t][s] = !pat.drums[t][s];
                if (pat.drums[t][s] && !(pat.vel[t] && pat.vel[t][s])) pat.vel[t][s] = 0.8;
                renderView(win, st);
                markDirty(win, st);
            });
            p.addEventListener('contextmenu', e => {
                e.preventDefault();
                e.stopPropagation();
                const t = p.dataset.track, s = parseInt(p.dataset.step, 10);
                const cur = (pat.vel[t] && pat.vel[t][s]) || 0.8;
                const next = VEL_STEPS[(VEL_STEPS.indexOf(cur) + 1 + VEL_STEPS.length) % VEL_STEPS.length] ?? 0.8;
                pat.vel[t][s] = next;
                pat.drums[t][s] = true;
                renderView(win, st);
                markDirty(win, st);
            });
        });
        main.querySelectorAll('.ms-preview').forEach(b => {
            b.addEventListener('click', () => {
                ensureCtx();
                const g = ensureLiveGraph(win, st);
                playDrumOn(actx, g.inputs[b.dataset.track], b.dataset.track, actx.currentTime + 0.03, st.trackVol[b.dataset.track] ?? 0.8, st.kit);
            });
        });
        main.querySelectorAll('.ms-mute').forEach(b => {
            b.addEventListener('click', () => {
                const t = b.dataset.track;
                st.trackMute[t] = !st.trackMute[t];
                b.classList.toggle('on', st.trackMute[t]);
                markDirty(win, st);
            });
        });
        main.querySelectorAll('.ms-solo').forEach(b => {
            b.addEventListener('click', () => {
                const t = b.dataset.track;
                st.trackSolo[t] = !st.trackSolo[t];
                b.classList.toggle('solo-on', st.trackSolo[t]);
                markDirty(win, st);
            });
        });
    }

    function susCells(pat, layer, midi) {
        const out = new Set();
        for (let s = 0; s < 16; s++) {
            if (pat[layer][midi][s]) {
                const len = (pat.len[layer][midi + ':' + s]) || 1;
                for (let i = 1; i < len && s + i < 16; i++) out.add(s + i);
            }
        }
        return out;
    }

    function renderPiano(main, win, st) {
        const pat = st.patterns[st.currentPattern];
        const layer = st.pianoLayer;
        const waves = layer === 'bass' ? ['sine', 'triangle', 'sawtooth', 'square'] : ['sawtooth', 'square', 'triangle', 'sine'];
        const curWave = layer === 'bass' ? st.bassWave : st.pianoWave;
        const curVol = layer === 'bass' ? (st.trackVol.bass ?? 0.85) : (st.trackVol.lead ?? 0.8);
        let html = `<div style="min-width:640px;">
            <div class="ms-prow" style="margin-bottom:10px;flex-wrap:wrap;">
                <div class="ms-seg">
                    <button data-layer="lead" class="${layer === 'lead' ? 'active' : ''}">Lead</button>
                    <button data-layer="bass" class="${layer === 'bass' ? 'active' : ''}">808 Bass</button>
                </div>
                <span style="font-size:12px;color:#999;">Wave:</span>
                <select class="ms-wave" style="background:#111;border:1px solid #444;color:#fff;border-radius:4px;padding:3px 8px;font-size:12px;">
                    ${waves.map(w => `<option value="${w}"${curWave === w ? ' selected' : ''}>${w}</option>`).join('')}
                </select>
                <span style="font-size:12px;color:#999;">Vol</span>
                <input type="range" class="ms-pvol" min="0" max="100" value="${Math.round(curVol * 100)}" style="width:100px;accent-color:#7bff9e;">
                <button class="ms-mini ms-pclear" style="padding:4px 10px;">Clear ${layer === 'bass' ? 'bass' : 'melody'}</button>
                <button class="ms-mini ms-ppreview" style="padding:4px 10px;" title="Preview">&#9654; preview</button>
            </div>
            <div style="font-size:11px;color:#666;margin-bottom:8px;">${layer === 'bass' ? 'Bass sounds 2 octaves lower with glide. Click = note, drag right = longer note.' : 'Click = note, drag right = longer note (sustained cells are dark green).'}</div>`;
        for (let m = HIGH_MIDI; m >= LOW_MIDI; m--) {
            const black = isBlack(m);
            const isC = NOTE_NAMES[m % 12] === 'C';
            const cls = isC ? 'c' : (black ? 'black' : 'white');
            const sus = susCells(pat, layer, m);
            const cells = pat[layer][m].map((v, s) =>
                `<button class="ms-pcell${v ? ' on' : ''}${!v && sus.has(s) ? ' sus' : ''}" data-midi="${m}" data-step="${s}" title="${noteName(m)}${layer === 'bass' ? ' (sounds ' + noteName(m - 24) + ')' : ''} step ${s + 1}"></button>`
            ).join('');
            html += `<div class="ms-prow" style="margin-bottom:3px;"><div class="ms-key ${cls}">${noteName(m)}</div><div class="ms-grid16">${cells}</div></div>`;
        }
        html += '</div>';
        main.innerHTML = html;

        main.querySelectorAll('.ms-seg button').forEach(b => {
            b.addEventListener('click', () => {
                st.pianoLayer = b.dataset.layer;
                renderView(win, st);
            });
        });
        main.querySelector('.ms-wave').addEventListener('change', e => {
            if (st.pianoLayer === 'bass') st.bassWave = e.target.value;
            else st.pianoWave = e.target.value;
            markDirty(win, st);
        });
        main.querySelector('.ms-pvol').addEventListener('input', e => {
            if (st.pianoLayer === 'bass') st.trackVol.bass = parseInt(e.target.value, 10) / 100;
            else st.trackVol.lead = parseInt(e.target.value, 10) / 100;
            markDirty(win, st);
        });
        main.querySelector('.ms-pclear').addEventListener('click', () => {
            for (let m = LOW_MIDI; m <= HIGH_MIDI; m++) pat[layer][m] = new Array(16).fill(false);
            pat.len[layer] = {};
            renderView(win, st);
            markDirty(win, st);
        });
        main.querySelector('.ms-ppreview').addEventListener('click', () => {
            ensureCtx();
            const g = ensureLiveGraph(win, st);
            if (layer === 'bass') {
                [64, 64, 62, 60].forEach((m, i) => {
                    playBassOn(actx, g.inputs.bass, m, actx.currentTime + 0.05 + i * 0.22, 0.2, st.trackVol.bass ?? 0.85, st.bassWave, i ? midiToFreq([64, 64, 62, 60][i - 1] - 24) : null);
                });
            } else {
                [72, 74, 76, 77, 79, 81, 83, 84].forEach((m, i) => {
                    playPianoOn(actx, g.inputs.lead, m, actx.currentTime + 0.05 + i * 0.12, 0.11, st.trackVol.lead ?? 0.8, st.pianoWave);
                });
            }
        });

        // Note entry: click toggles, drag-right sets length
        let drag = null;
        const paintRow = (midi) => {
            main.querySelectorAll(`.ms-pcell[data-midi="${midi}"]`).forEach(c => {
                const s = parseInt(c.dataset.step, 10);
                const on = pat[layer][midi][s];
                const sus = susCells(pat, layer, midi);
                c.classList.toggle('on', !!on);
                c.classList.toggle('sus', !on && sus.has(s));
            });
        };
        main.querySelectorAll('.ms-pcell').forEach(c => {
            c.addEventListener('mousedown', e => {
                if (e.button !== 0) return;
                e.preventDefault();
                const m = parseInt(c.dataset.midi, 10), s = parseInt(c.dataset.step, 10);
                if (!pat[layer][m][s]) {
                    pat[layer][m][s] = true;
                    delete pat.len[layer][m + ':' + s];
                    paintRow(m);
                    previewNote(win, st, layer, m);
                    drag = { midi: m, step0: s, moved: false, fresh: true };
                } else {
                    drag = { midi: m, step0: s, moved: false, fresh: false };
                }
            });
            c.addEventListener('mouseover', e => {
                if (!drag || !(e.buttons & 1)) return;
                const m = parseInt(c.dataset.midi, 10), s = parseInt(c.dataset.step, 10);
                if (m !== drag.midi || s < drag.step0) return;
                const len = Math.min(16 - drag.step0, s - drag.step0 + 1);
                if (len >= 1) {
                    pat[layer][drag.midi][drag.step0] = true;
                    if (len <= 1) delete pat.len[layer][drag.midi + ':' + drag.step0];
                    else pat.len[layer][drag.midi + ':' + drag.step0] = len;
                    drag.moved = true;
                    paintRow(drag.midi);
                }
            });
        });
        const finishDrag = () => {
            if (!drag) return;
            const d = drag;
            drag = null;
            if (!d.moved && !d.fresh) {
                pat[layer][d.midi][d.step0] = false;
                delete pat.len[layer][d.midi + ':' + d.step0];
            }
            renderView(win, st);
            markDirty(win, st);
        };
        win.element.onmouseup = finishDrag;
        win.element.onmouseleave = () => { if (drag && drag.moved) finishDrag(); };
    }

    function previewNote(win, st, layer, midi) {
        ensureCtx();
        const g = ensureLiveGraph(win, st);
        if (layer === 'bass') playBassOn(actx, g.inputs.bass, midi, actx.currentTime + 0.02, 0.3, st.trackVol.bass ?? 0.85, st.bassWave, null);
        else playPianoOn(actx, g.inputs.lead, midi, actx.currentTime + 0.02, 0.25, st.trackVol.lead ?? 0.8, st.pianoWave);
    }

    function renderSong(main, win, st) {
        const bars = st.arrangement.map((p, i) => {
            const now = st.playing && st.songMode && st._bar === i ? ' now' : '';
            return `<div class="ms-bar${now}" data-bar="${i}" title="Click to change pattern, x to remove">
                <button class="ms-del" data-bar="${i}" title="Remove bar">x</button>
                <span>P${p + 1}</span><span style="font-size:10px;font-weight:400;color:#888;">bar ${i + 1}</span>
            </div>`;
        }).join('');
        main.innerHTML = `<div style="min-width:640px;">
            <div style="font-size:12px;color:#999;margin-bottom:10px;">Song arrangement &bull; click a bar to cycle its pattern &bull; press SONG in transport and play to hear the full arrangement.</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">${bars}</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button class="ms-tool ms-addbar">+ Add bar (P${st.currentPattern + 1})</button>
                <button class="ms-tool ms-songclear">Clear song</button>
            </div>
            <div class="ms-hint" style="font-size:11px;margin-top:10px;">Export WAV offers the full song. Loop toggle in transport repeats it.</div>
        </div>`;
        main.querySelectorAll('.ms-bar').forEach(b => {
            b.addEventListener('click', e => {
                if (e.target.closest('.ms-del')) return;
                const i = parseInt(b.dataset.bar, 10);
                st.arrangement[i] = (st.arrangement[i] + 1) % 4;
                renderView(win, st);
                markDirty(win, st);
            });
        });
        main.querySelectorAll('.ms-del').forEach(x => {
            x.addEventListener('click', e => {
                e.stopPropagation();
                if (st.arrangement.length <= 1) return;
                st.arrangement.splice(parseInt(x.dataset.bar, 10), 1);
                renderView(win, st);
                markDirty(win, st);
            });
        });
        main.querySelector('.ms-addbar').addEventListener('click', () => {
            if (st.arrangement.length >= 64) return;
            st.arrangement.push(st.currentPattern);
            renderView(win, st);
            markDirty(win, st);
        });
        main.querySelector('.ms-songclear').addEventListener('click', async () => {
            const ok = await Popup.confirm('Clear song', 'Reset the arrangement to a single bar?');
            if (ok) {
                st.arrangement = [st.currentPattern];
                renderView(win, st);
                markDirty(win, st);
            }
        });
    }

    function sliderToHz(v) {
        return Math.round(200 * Math.pow(90, v / 100));
    }
    function hzToSlider(hz) {
        return Math.round(100 * Math.log(Math.max(hz, 200) / 200) / Math.log(90));
    }
    function fmtHz(hz) {
        return hz >= 1000 ? (hz / 1000).toFixed(1) + 'k' : Math.round(hz) + '';
    }

    function renderFx(main, win, st) {
        const rows = ALL_TRACKS.map(id => {
            const meta = TRACK_META[id];
            const fx = st.fx[id] || { delay: 0, reverb: 0, cutoff: 18000 };
            return `<div class="ms-fxrow">
                <span class="ms-dot" style="background:${meta.color}"></span>
                <span style="font-size:12px;width:90px;">${esc(meta.name)}</span>
                <span style="font-size:11px;color:#888;">Echo</span>
                <input type="range" class="ms-fx" data-track="${id}" data-param="delay" min="0" max="100" value="${Math.round((fx.delay || 0) * 100)}">
                <span class="ms-fxval" data-track="${id}" data-param="delay">${Math.round((fx.delay || 0) * 100)}%</span>
                <span style="font-size:11px;color:#888;">Reverb</span>
                <input type="range" class="ms-fx" data-track="${id}" data-param="reverb" min="0" max="100" value="${Math.round((fx.reverb || 0) * 100)}">
                <span class="ms-fxval" data-track="${id}" data-param="reverb">${Math.round((fx.reverb || 0) * 100)}%</span>
                <span style="font-size:11px;color:#888;">Filter</span>
                <input type="range" class="ms-fx" data-track="${id}" data-param="cutoff" min="0" max="100" value="${hzToSlider(fx.cutoff || 18000)}">
                <span class="ms-fxval" data-track="${id}" data-param="cutoff">${fmtHz(fx.cutoff || 18000)}</span>
            </div>`;
        }).join('');
        main.innerHTML = `<div style="min-width:640px;">
            <div style="font-size:12px;color:#999;margin-bottom:10px;">Echo is tempo-synced (dotted 8th). Reverb is generated convolution. Filter is a per-track low-pass. All FX are baked into WAV export.</div>
            ${rows}
        </div>`;
        main.querySelectorAll('.ms-fx').forEach(f => {
            f.addEventListener('input', () => {
                const id = f.dataset.track, param = f.dataset.param;
                const raw = parseInt(f.value, 10);
                if (!st.fx[id]) st.fx[id] = { delay: 0, reverb: 0, cutoff: 18000 };
                if (param === 'cutoff') st.fx[id].cutoff = sliderToHz(raw);
                else st.fx[id][param] = raw / 100;
                const lab = main.querySelector(`.ms-fxval[data-track="${id}"][data-param="${param}"]`);
                if (lab) lab.textContent = param === 'cutoff' ? fmtHz(st.fx[id].cutoff) : raw + '%';
                applyFxToGraph(st);
                markDirty(win, st);
            });
        });
    }

    function renderMixer(main, win, st) {
        const strips = [...DRUMS.map(t => t.id), 'lead', 'bass'].map(id => {
            const meta = TRACK_META[id];
            return mixerStrip(st, id, meta.name, meta.color, false);
        }).join('') + mixerStrip(st, 'master', 'Master', '#ffffff', true);
        main.innerHTML = `<div class="ms-mixer">${strips}</div>
            <div class="ms-hint" style="font-size:11px;margin-top:10px;">M = mute, S = solo. Mixer + FX levels are saved with your project and used in WAV export.</div>`;
        main.querySelectorAll('.ms-fader').forEach(f => {
            f.addEventListener('input', () => {
                st.trackVol[f.dataset.strip] = parseInt(f.value, 10) / 100;
                const lab = main.querySelector(`.ms-fval[data-strip="${f.dataset.strip}"]`);
                if (lab) lab.textContent = f.value;
                applyFxToGraph(st);
                if (f.dataset.strip === 'master') renderTransport(win, st);
                markDirty(win, st);
            });
        });
        main.querySelectorAll('.ms-mute').forEach(b => {
            b.addEventListener('click', () => {
                const t = b.dataset.track;
                if (t === 'master') return;
                st.trackMute[t] = !st.trackMute[t];
                renderView(win, st);
                markDirty(win, st);
            });
        });
        main.querySelectorAll('.ms-solo').forEach(b => {
            b.addEventListener('click', () => {
                const t = b.dataset.track;
                if (t === 'master') return;
                st.trackSolo[t] = !st.trackSolo[t];
                renderView(win, st);
                markDirty(win, st);
            });
        });
    }
    function mixerStrip(st, id, name, color, isMaster) {
        const v = Math.round((st.trackVol[id] ?? 0.8) * 100);
        const m = st.trackMute[id] ? ' on' : '';
        const so = st.trackSolo[id] ? ' solo-on' : '';
        return `<div class="ms-strip">
            <span class="ms-dot" style="background:${color}"></span>
            <span style="font-size:12px;">${esc(name)}</span>
            <input type="range" class="ms-fader" data-strip="${id}" min="0" max="100" value="${v}">
            <span class="ms-fval" data-strip="${id}" style="font-size:11px;color:#999;">${v}</span>
            ${isMaster ? '<span style="font-size:10px;color:#666;">MASTER</span>' : `<div style="display:flex;gap:4px;"><button class="ms-mini ms-mute${m}" data-track="${id}">M</button><button class="ms-mini ms-solo${so}" data-track="${id}">S</button></div>`}
        </div>`;
    }

    // ---------------- transport / scheduler ----------------
    function posToLoc(st, pos) {
        if (!st.songMode) {
            return { pat: st.currentPattern, step: ((pos % 16) + 16) % 16, bar: 0 };
        }
        const bars = Math.max(st.arrangement.length, 1);
        const total = bars * 16;
        const p = ((pos % total) + total) % total;
        const bar = Math.floor(p / 16);
        return { pat: st.arrangement[bar] ?? 0, step: p % 16, bar };
    }
    function highlight(win, st, loc) {
        st.step = loc.step;
        st._bar = loc.bar;
        win.element.querySelectorAll('.ms-pad.now, .ms-pcell.now, .ms-bar.now').forEach(el => el.classList.remove('now'));
        if (st.songMode) {
            const bar = win.element.querySelector(`.ms-bar[data-bar="${loc.bar}"]`);
            if (bar) bar.classList.add('now');
            win.element.querySelectorAll('.ms-pat').forEach(b => {
                b.classList.toggle('active', parseInt(b.dataset.pat, 10) === loc.pat);
            });
        } else {
            win.element.querySelectorAll(`.ms-pad[data-step="${loc.step}"], .ms-pcell[data-step="${loc.step}"]`).forEach(el => el.classList.add('now'));
        }
        updatePos(win, st, loc.step, loc.bar);
    }
    function scheduleStep(win, st, loc, t) {
        const g = st._graph;
        const out = id => (g ? g.inputs[id] : masterGain);
        const pat = st.patterns[loc.pat];
        const stepDur = 60 / st.bpm / 4;
        DRUMS.forEach(tr => {
            if (pat.drums[tr.id][loc.step] && trackAudible(st, tr.id)) {
                const vel = (pat.vel[tr.id] && pat.vel[tr.id][loc.step]) || 0.8;
                playDrumOn(actx, out(tr.id), tr.id, t, (st.trackVol[tr.id] ?? 0.8) * vel, st.kit);
            }
        });
        ['lead', 'bass'].forEach(layer => {
            for (let m = LOW_MIDI; m <= HIGH_MIDI; m++) {
                if (pat[layer][m][loc.step] && trackAudible(st, layer)) {
                    const len = (pat.len[layer][m + ':' + loc.step]) || 1;
                    const dur = len * stepDur * 0.9;
                    if (layer === 'lead') {
                        playPianoOn(actx, out('lead'), m, t, dur, st.trackVol.lead ?? 0.8, st.pianoWave);
                    } else {
                        const lb = st._lastBass;
                        const from = (lb && t - lb.t < 0.3) ? midiToFreq(lb.midi - BASS_OCTAVES_DOWN * 12) : null;
                        playBassOn(actx, out('bass'), m, t, dur, st.trackVol.bass ?? 0.85, st.bassWave, from);
                        st._lastBass = { midi: m, t };
                    }
                }
            }
        });
        if (st.metronome && loc.step % 4 === 0) clickOn(actx, g ? g.win : masterGain, t, 0.25, loc.step === 0);
        const delay = Math.max((t - actx.currentTime) * 1000, 0);
        const at = st._posCounter;
        setTimeout(() => {
            if (win.element.isConnected && st.playing && st._posCounter === at) highlight(win, st, loc);
        }, delay);
    }
    function startPlayback(win, st) {
        ensureCtx();
        ensureLiveGraph(win, st);
        applyFxToGraph(st);
        st.playing = true;
        st._pos = 0;
        st._lastBass = null;
        st._posCounter = (st._posCounter || 0) + 1;
        st._next = actx.currentTime + 0.06;
        renderTransport(win, st);
        if (st.view === 'song' || st.view === 'step') renderView(win, st);
        clearInterval(st._timer);
        st._timer = setInterval(() => {
            if (!win.element.isConnected) { stopPlayback(win, st); return; }
            applyFxToGraph(st);
            const stepDur = 60 / st.bpm / 4;
            if (st.songMode && !st.songLoop && st._pos >= st.arrangement.length * 16) {
                stopPlayback(win, st, true);
                return;
            }
            while (st._next < actx.currentTime + 0.14) {
                const loc = posToLoc(st, st._pos);
                const t = st._next + (loc.step % 2 === 1 ? st.swing * stepDur : 0);
                scheduleStep(win, st, loc, t);
                st._pos++;
                st._next += stepDur;
            }
        }, 25);
    }
    function stopPlayback(win, st, reset) {
        st.playing = false;
        clearInterval(st._timer);
        if (reset) {
            st._pos = 0;
            highlight(win, st, posToLoc(st, 0));
        }
        renderTransport(win, st);
        if (st.view === 'song' || st.view === 'step') renderView(win, st);
    }

    // ---------------- file ops ----------------
    async function doSave(win, st) {
        if (st.path) {
            const ok = FileSystem.writeFile(st.path, serialize(st));
            if (ok === false) {
                await Popup.error('Save failed', 'Could not write the project file.');
                return;
            }
            markClean(win, st);
        } else {
            await doSaveAs(win, st);
        }
    }
    async function doSaveAs(win, st) {
        const name = await Popup.textbox('Save project', 'Project name:', { value: st.name || 'My Beat', placeholder: 'My Beat' });
        if (!name) return;
        const res = await SavePrompt.show({
            defaultName: name.replace(/[\\/:*?"<>|]/g, '').slice(0, 40) + '.mspark',
            defaultPath: DOCS_DIR,
            extensions: [{ value: 'mspark', label: 'Music Spark project' }],
            parentApp: APP_ID
        });
        if (!res) return;
        const content = serialize(st);
        let ok;
        if (FileSystem.itemExists([...res.path, res.fullName])) ok = FileSystem.writeFile([...res.path, res.fullName], content);
        else ok = FileSystem.createFile(res.path, res.fullName, content, res.ext || 'mspark');
        if (ok === false) {
            await Popup.error('Save failed', 'Could not write the project file.');
            return;
        }
        st.name = name;
        st.path = [...res.path, res.fullName];
        setProjLabel(win, st);
        markClean(win, st);
        await Popup.info('Saved', `Project saved as ${res.fullName}.`);
    }
    async function doOpen(win, st) {
        const projects = [];
        const scan = (dir, prefix) => {
            let kids = [];
            try { kids = FileSystem.getChildren(dir) || []; } catch (e) { kids = []; }
            kids.forEach(k => {
                if (k.type === 'file' && k.name.endsWith('.mspark')) projects.push({ label: prefix + k.name, path: [...dir, k.name] });
            });
        };
        scan(DOCS_DIR, '');
        scan(MUSIC_DIR, 'Music/');
        ensureDataDir();
        scan(DATA_DIR, '(autosave dir) ');
        if (projects.length === 0) {
            await Popup.info('Open project', 'No saved .mspark projects found yet. Save one first!');
            return;
        }
        const pick = await Popup.pick('Open project', 'Choose a project:', projects.map(p => p.label));
        if (!pick) return;
        const found = projects.find(p => p.label === (pick.label || pick));
        if (!found) return;
        const raw = FileSystem.readFile(found.path);
        if (!raw) {
            await Popup.error('Open failed', 'Could not read that file.');
            return;
        }
        try {
            const next = deserialize(raw);
            stopPlayback(win, st);
            destroyGraph(st);
            const view = st.view, layer = st.pianoLayer;
            Object.keys(st).forEach(k => delete st[k]);
            Object.assign(st, next, { path: found.path, playing: false, step: 0, view, pianoLayer: layer, dirty: false });
            st._pos = 0;
            setProjLabel(win, st);
            markClean(win, st);
            renderAll(win, st);
        } catch (e) {
            await Popup.error('Open failed', 'That file is not a valid Music Spark project.');
        }
    }
    async function doExportWav(win, st) {
        const which = await Popup.pick('Export WAV', 'What to export?', ['Current pattern (x4 loop)', `Full song (${st.arrangement.length} bar${st.arrangement.length > 1 ? 's' : ''})`]);
        if (!which) return;
        const label = which.label || which;
        const mode = label.startsWith('Full') ? 'song' : 'pattern';
        const name = await Popup.textbox('Export WAV', 'File name:', { value: (st.name || 'beat') + (mode === 'song' ? ' - song' : ' - loop x4'), placeholder: 'my-beat' });
        if (!name) return;
        await Popup.info('Rendering', 'Rendering audio to WAV (mixer + FX included). This takes a few seconds...');
        try {
            const buf = await renderAudio(st, mode);
            const url = wavToDataUrl(buf);
            const safe = name.replace(/[\\/:*?"<>|]/g, '').slice(0, 40) || 'beat';
            const fileName = safe.endsWith('.wav') ? safe : safe + '.wav';
            // Base64 inflates ~4/3 on top of the raw bytes (plus JSON overhead).
            const approxBytes = Math.ceil(buf.byteLength * 4 / 3) + 256;
            const target = [...MUSIC_DIR, fileName];
            if (!FileSystem.wouldFit(approxBytes)) {
                const dl = await Popup.confirm('Too large for Music folder',
                    `"${fileName}" is about ${(approxBytes / 1048576).toFixed(1)} MB — larger than the virtual disk budget. Download it straight to your device instead?`);
                if (dl) downloadWav(buf, fileName);
                return;
            }
            if (FileSystem.itemExists(target)) FileSystem.writeFile(target, url);
            else FileSystem.createFile(MUSIC_DIR, fileName, url, 'wav');
            if (!FileSystem.flush()) {
                // Roll back the in-memory entry (permanent: never park a
                // multi-MB file in the Recycle Bin) and report honestly.
                FileSystem.permanentDelete(target);
                await Popup.error('Export failed', 'The virtual disk is full — nothing was saved. Try the download option or delete files to free space.');
                return;
            }
            await Popup.info('Exported', `Saved to Music/${fileName}. Open it from File Explorer.`);
        } catch (e) {
            await Popup.error('Export failed', 'Rendering failed: ' + (e && e.message ? e.message : e));
        }
    }
    function downloadWav(buf, fileName) {
        try {
            const blob = new Blob([buf], { type: 'audio/wav' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
        } catch (e) {
            Popup.error('Download failed', 'Could not start the download: ' + (e && e.message ? e.message : e));
        }
    }
    function randomize(st) {
        const pat = st.patterns[st.currentPattern];
        const density = { kick: 0.3, snare: 0.2, clap: 0.12, chat: 0.55, ohat: 0.15, tom: 0.08, perc: 0.18, shaker: 0.3 };
        DRUMS.forEach(tr => {
            for (let s = 0; s < 16; s++) pat.drums[tr.id][s] = Math.random() < (density[tr.id] ?? 0.2);
        });
        pat.drums.kick[0] = true;
        pat.drums.snare[4] = true; pat.drums.snare[12] = true;
        const penta = [60, 63, 65, 67, 70, 72, 75, 76, 79, 84];
        for (let s = 0; s < 16; s++) {
            if (Math.random() < 0.25) {
                const m = penta[Math.floor(Math.random() * penta.length)];
                pat.lead[m][s] = true;
            }
        }
        [0, 4, 8, 12].forEach(s => {
            const roots = [69, 65, 72, 67];
            const m = roots[Math.floor(Math.random() * roots.length)];
            pat.bass[m][s] = true;
            pat.len.bass[m + ':' + s] = 3;
        });
    }
    function clearPattern(st) {
        st.patterns[st.currentPattern] = emptyPattern();
    }
    function clonePattern(src) {
        return JSON.parse(JSON.stringify(src));
    }

    // ---------------- window wiring ----------------
    function bindWindow(win, st) {
        const q = s => win.element.querySelector(s);

        renderAll(win, st);

        q('.ms-play').addEventListener('click', () => {
            if (st.playing) stopPlayback(win, st);
            else startPlayback(win, st);
        });
        q('.ms-stop').addEventListener('click', () => stopPlayback(win, st, true));
        q('.ms-mode').addEventListener('click', () => {
            const was = st.playing;
            if (was) stopPlayback(win, st, true);
            st.songMode = !st.songMode;
            renderTransport(win, st);
            if (st.songMode) {
                st.view = 'song';
                renderView(win, st);
            }
            markDirty(win, st);
            if (was) startPlayback(win, st);
        });
        q('.ms-loop').addEventListener('click', () => {
            st.songLoop = !st.songLoop;
            renderTransport(win, st);
            markDirty(win, st);
        });

        const bpmNum = q('.ms-bpm'), bpmRange = q('.ms-bpm-s');
        const setBpm = v => {
            v = Math.min(220, Math.max(50, Math.round(v) || 128));
            st.bpm = v; bpmNum.value = v; bpmRange.value = v;
            applyFxToGraph(st);
            markDirty(win, st);
        };
        bpmNum.addEventListener('change', () => setBpm(parseInt(bpmNum.value, 10)));
        bpmRange.addEventListener('input', () => setBpm(parseInt(bpmRange.value, 10)));
        q('.ms-swing').addEventListener('input', e => {
            st.swing = parseInt(e.target.value, 10) / 100;
            markDirty(win, st);
        });
        q('.ms-master').addEventListener('input', e => {
            st.trackVol.master = parseInt(e.target.value, 10) / 100;
            applyFxToGraph(st);
            markDirty(win, st);
        });
        q('.ms-kit').addEventListener('change', e => {
            if (KITS[e.target.value]) {
                st.kit = e.target.value;
                markDirty(win, st);
            }
        });
        q('.ms-metro').addEventListener('click', () => {
            st.metronome = !st.metronome;
            renderTransport(win, st);
            markDirty(win, st);
        });
        win.element.querySelectorAll('.ms-pat').forEach(b => {
            b.addEventListener('click', () => {
                const idx = parseInt(b.dataset.pat, 10);
                if (st.songMode) {
                    // Take over: drop to pattern mode on the chosen pattern
                    const was = st.playing;
                    if (was) stopPlayback(win, st, true);
                    st.songMode = false;
                    st.currentPattern = idx;
                    renderTransport(win, st);
                    markDirty(win, st);
                    if (was) startPlayback(win, st);
                } else {
                    st.currentPattern = idx;
                    renderAll(win, st);
                    markDirty(win, st);
                }
            });
        });
        win.element.querySelectorAll('.ms-tab').forEach(t => {
            t.addEventListener('click', () => {
                st.view = t.dataset.view;
                renderAll(win, st);
            });
        });
        q('.ms-preset').addEventListener('change', async e => {
            const name = e.target.value;
            e.target.value = '';
            if (!name || !PRESETS[name]) return;
            if (st.dirty) {
                const ok = await Popup.confirm('Load preset', `Replace all patterns with "${name}"? Unsaved changes will be lost.`);
                if (!ok) return;
            }
            const fresh = PRESETS[name]();
            st.patterns = fresh.patterns;
            st.bpm = fresh.bpm;
            st.kit = fresh.kit;
            st.arrangement = name === 'Boom Bap + Keys' ? [0, 0, 1, 0] : [0];
            stopPlayback(win, st, true);
            renderAll(win, st);
            markDirty(win, st);
        });
        win.element.querySelector('.ms-toolbar').addEventListener('click', async e => {
            const btn = e.target.closest('[data-act]');
            if (!btn) return;
            const act = btn.dataset.act;
            if (act === 'new') {
                if (st.dirty) {
                    const ok = await Popup.confirm('New project', 'Discard unsaved changes and start fresh?');
                    if (!ok) return;
                }
                stopPlayback(win, st, true);
                destroyGraph(st);
                const next = blankState();
                const view = st.view, layer = st.pianoLayer;
                Object.keys(st).forEach(k => delete st[k]);
                Object.assign(st, next, { view, pianoLayer: layer });
                renderAll(win, st);
            } else if (act === 'open') {
                await doOpen(win, st);
            } else if (act === 'save') {
                await doSave(win, st);
            } else if (act === 'saveas') {
                await doSaveAs(win, st);
            } else if (act === 'export') {
                await doExportWav(win, st);
            } else if (act === 'random') {
                randomize(st);
                renderView(win, st);
                markDirty(win, st);
            } else if (act === 'clear') {
                const ok = await Popup.confirm('Clear pattern', `Clear all steps in pattern ${st.currentPattern + 1}?`);
                if (ok) {
                    clearPattern(st);
                    renderView(win, st);
                    markDirty(win, st);
                }
            } else if (act === 'copy') {
                clipboard = clonePattern(st.patterns[st.currentPattern]);
                await Popup.info('Copied', `Pattern ${st.currentPattern + 1} copied. Use Paste on another pattern.`);
            } else if (act === 'paste') {
                if (!clipboard) {
                    await Popup.info('Paste', 'Clipboard is empty — Copy a pattern first.');
                    return;
                }
                st.patterns[st.currentPattern] = clonePattern(clipboard);
                renderView(win, st);
                markDirty(win, st);
            } else if (act === 'clone') {
                const target = (st.currentPattern + 1) % 4;
                st.patterns[target] = clonePattern(st.patterns[st.currentPattern]);
                st.currentPattern = target;
                renderAll(win, st);
                markDirty(win, st);
            } else if (act === 'help') {
                await Popup.info('Music Spark',
                    'TRANSPORT: PAT = loop one pattern, SONG = play the arrangement from the Song tab. LOOP repeats the song. Kit changes the drum sound.\n\n' +
                    'STEP SEQUENCER: click pads to toggle, right-click to cycle velocity (dim = soft, ring = accent).\n\n' +
                    'PIANO ROLL: Lead and 808 Bass layers (bass sounds 2 octaves lower with glide). Click = note, drag right = longer note.\n\n' +
                    'SONG: build the arrangement bar by bar — click a bar to change its pattern.\n\n' +
                    'MIXER + FX: volume/mute/solo plus tempo-synced echo, convolution reverb, and per-track filters. Everything is baked into WAV export.\n\n' +
                    'Space = play/pause. Projects save as .mspark files.');
            }
        });

        win.element.addEventListener('keydown', e => {
            if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')) {
                e.preventDefault();
                if (st.playing) stopPlayback(win, st);
                else startPlayback(win, st);
            }
        });

        const iv = setInterval(() => {
            if (!win.element.isConnected) {
                clearInterval(iv);
                clearInterval(st._timer);
                destroyGraph(st);
            }
        }, 2000);
    }

    function openWithState(initial) {
        const icon = AppIcons.get(APP_ID);
        const win = WindowManager.createWindow(APP_ID, 'Music Spark', icon, shellHtml(), {
            width: 1020, height: 640, minWidth: 760, minHeight: 480
        });
        bindWindow(win, initial);
        return win;
    }

    function open(path, content) {
        try {
            const st = deserialize(content);
            st.path = path;
            const win = openWithState(st);
            markClean(win, st);
            setProjLabel(win, st);
        } catch (e) {
            Popup.error('Music Spark', 'Could not open that project file.');
        }
    }

    function launch() {
        const saved = loadAutosave();
        const st = saved || blankState();
        if (!saved) {
            const fresh = PRESETS['Boom Bap + Keys']();
            st.patterns = fresh.patterns;
            st.arrangement = [0, 0, 1, 0];
            st.name = 'My First Beat';
            st.bpm = fresh.bpm;
            st.kit = fresh.kit;
        }
        const win = openWithState(st);
        markClean(win, st);
    }

    return { launch, open };
})();

export default MusicSpark;
