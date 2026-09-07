import WindowManager from '../modules/windowManager.js';
import AppIcons from '../modules/appIcons.js';
import Popup from '../modules/popup.js';
import FileSystem from '../modules/fileSystem.js';
import SavePrompt from '../modules/saveprompt.js';
import FileAssociations from '../modules/fileAssociations.js';

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

    // Piano roll range: C4 (60) .. C6 (84), displayed high -> low
    const LOW_MIDI = 60;
    const HIGH_MIDI = 84;
    const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

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
    function emptyPiano() {
        const p = {};
        for (let m = LOW_MIDI; m <= HIGH_MIDI; m++) p[m] = new Array(16).fill(false);
        return p;
    }
    function emptyPattern() {
        return { drums: emptyDrums(), piano: emptyPiano() };
    }
    function defaultTrackVol() {
        const v = {};
        DRUMS.forEach(t => { v[t.id] = 0.8; });
        v.piano = 0.8;
        v.master = 0.9;
        return v;
    }
    function blankState() {
        return {
            name: 'Untitled Beat',
            path: null,
            bpm: 128,
            swing: 0,
            metronome: false,
            pianoWave: 'sawtooth',
            currentPattern: 0,
            patterns: [emptyPattern(), emptyPattern(), emptyPattern(), emptyPattern()],
            trackVol: defaultTrackVol(),
            trackMute: {},
            trackSolo: {},
            playing: false,
            step: 0,
            view: 'step',
            dirty: false
        };
    }

    const PRESETS = {
        'Empty': () => [emptyPattern(), emptyPattern(), emptyPattern(), emptyPattern()],
        'Hip-Hop 90': () => {
            const p = emptyPattern();
            [0, 7, 8].forEach(s => { p.drums.kick[s] = true; });
            [4, 12].forEach(s => { p.drums.snare[s] = true; });
            for (let s = 0; s < 16; s += 2) p.drums.chat[s] = true;
            p.drums.ohat[14] = true;
            p.drums.perc[3] = true; p.drums.perc[11] = true;
            return [p, emptyPattern(), emptyPattern(), emptyPattern()];
        },
        'Trap': () => {
            const p = emptyPattern();
            [0, 6, 8, 10].forEach(s => { p.drums.kick[s] = true; });
            [4, 12].forEach(s => { p.drums.snare[s] = true; });
            for (let s = 0; s < 16; s++) { if (s % 2 === 0 || s === 13 || s === 15) p.drums.chat[s] = true; }
            p.drums.ohat[7] = true;
            p.drums.tom[15] = true;
            p.drums.shaker[2] = true; p.drums.shaker[6] = true; p.drums.shaker[10] = true; p.drums.shaker[14] = true;
            return [p, emptyPattern(), emptyPattern(), emptyPattern()];
        },
        'House': () => {
            const p = emptyPattern();
            [0, 4, 8, 12].forEach(s => { p.drums.kick[s] = true; });
            [4, 12].forEach(s => { p.drums.clap[s] = true; });
            for (let s = 2; s < 16; s += 4) p.drums.ohat[s] = true;
            for (let s = 0; s < 16; s++) p.drums.chat[s] = s % 4 !== 2;
            p.drums.shaker[1] = true; p.drums.shaker[5] = true; p.drums.shaker[9] = true; p.drums.shaker[13] = true;
            return [p, emptyPattern(), emptyPattern(), emptyPattern()];
        },
        'Techno': () => {
            const p = emptyPattern();
            [0, 4, 8, 12].forEach(s => { p.drums.kick[s] = true; });
            [2, 6, 10, 14].forEach(s => { p.drums.chat[s] = true; });
            [4, 12].forEach(s => { p.drums.snare[s] = true; });
            p.drums.perc[3] = true; p.drums.perc[7] = true; p.drums.perc[11] = true; p.drums.perc[15] = true;
            p.drums.tom[0] = true; p.drums.tom[8] = true;
            return [p, emptyPattern(), emptyPattern(), emptyPattern()];
        },
        'Boom Bap + Keys': () => {
            const p = emptyPattern();
            [0, 7, 8].forEach(s => { p.drums.kick[s] = true; });
            [4, 12].forEach(s => { p.drums.snare[s] = true; });
            for (let s = 0; s < 16; s += 2) p.drums.chat[s] = true;
            p.drums.shaker[4] = true; p.drums.shaker[12] = true;
            // Am - F - C - G-ish stab (A3=57? roll starts at C4=60; use A4=69, F4=65, C5=72.. keep in range)
            p.piano[69][0] = true; p.piano[72][0] = true; p.piano[76][0] = true;
            p.piano[65][4] = true; p.piano[69][4] = true; p.piano[72][4] = true;
            p.piano[72][8] = true; p.piano[76][8] = true; p.piano[79][8] = true;
            p.piano[67][12] = true; p.piano[71][12] = true; p.piano[74][12] = true;
            return [p, emptyPattern(), emptyPattern(), emptyPattern()];
        }
    };

    // ---------------- audio engine (shared ctx) ----------------
    let actx = null;
    let masterGain = null;
    const noiseCache = new WeakMap();

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
    function playDrumOn(ctx, dest, id, t, vol) {
        if (vol <= 0.001) return;
        switch (id) {
            case 'kick':
                tone(ctx, dest, t, vol, 'sine', 160, 42, 0.45);
                break;
            case 'snare':
                noiseHit(ctx, dest, t, vol * 0.9, 'bandpass', 1800, 0.2, 0.9);
                tone(ctx, dest, t, vol * 0.7, 'triangle', 190, 120, 0.12);
                break;
            case 'clap':
                for (let i = 0; i < 3; i++) noiseHit(ctx, dest, t + i * 0.012, vol * (0.6 + i * 0.2), 'bandpass', 1300, 0.12, 1.2);
                break;
            case 'chat':
                noiseHit(ctx, dest, t, vol * 0.7, 'highpass', 7500, 0.06, 0.7);
                break;
            case 'ohat':
                noiseHit(ctx, dest, t, vol * 0.7, 'highpass', 6800, 0.35, 0.7);
                break;
            case 'tom':
                tone(ctx, dest, t, vol, 'sine', 220, 85, 0.3);
                break;
            case 'perc':
                tone(ctx, dest, t, vol * 0.8, 'square', 840, 420, 0.09);
                noiseHit(ctx, dest, t, vol * 0.35, 'highpass', 5000, 0.05, 0.7);
                break;
            case 'shaker':
                noiseHit(ctx, dest, t, vol * 0.6, 'highpass', 6000, 0.12, 0.7);
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
    function clickOn(ctx, dest, t, vol, high) {
        tone(ctx, dest, t, vol, 'square', high ? 2000 : 1400, high ? 2000 : 1400, 0.05);
    }

    function trackAudible(st, id) {
        const anySolo = DRUMS.some(t => st.trackSolo[t.id]) || st.trackSolo.piano;
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
            app: 'musicSpark', version: 1, name: st.name, bpm: st.bpm, swing: st.swing,
            metronome: st.metronome, pianoWave: st.pianoWave,
            trackVol: st.trackVol, trackMute: st.trackMute, trackSolo: st.trackSolo,
            patterns: st.patterns
        });
    }
    function deserialize(json) {
        const data = JSON.parse(json);
        const st = blankState();
        if (typeof data.name === 'string') st.name = data.name;
        if (Number.isFinite(data.bpm)) st.bpm = Math.min(220, Math.max(50, data.bpm));
        if (Number.isFinite(data.swing)) st.swing = Math.min(0.5, Math.max(0, data.swing));
        st.metronome = !!data.metronome;
        if (typeof data.pianoWave === 'string') st.pianoWave = data.pianoWave;
        if (data.trackVol) st.trackVol = Object.assign(defaultTrackVol(), data.trackVol);
        if (data.trackMute) st.trackMute = data.trackMute;
        if (data.trackSolo) st.trackSolo = data.trackSolo;
        if (Array.isArray(data.patterns)) {
            for (let i = 0; i < 4; i++) {
                const src = data.patterns[i];
                if (!src) continue;
                DRUMS.forEach(t => {
                    if (Array.isArray(src.drums?.[t.id]) && src.drums[t.id].length === 16) {
                        st.patterns[i].drums[t.id] = src.drums[t.id].map(Boolean);
                    }
                });
                for (let m = LOW_MIDI; m <= HIGH_MIDI; m++) {
                    const arr = src.piano?.[m];
                    if (Array.isArray(arr) && arr.length === 16) st.patterns[i].piano[m] = arr.map(Boolean);
                }
            }
        }
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

    // ---------------- WAV export ----------------
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
    async function renderWav(st, loops) {
        const sr = 44100;
        const stepDur = 60 / st.bpm / 4;
        const totalSteps = 16 * loops;
        const totalDur = totalSteps * stepDur + 1.2;
        const off = new OfflineAudioContext(2, Math.ceil(sr * totalDur), sr);
        const out = off.createGain();
        out.gain.value = st.trackVol.master ?? 0.9;
        out.connect(off.destination);
        const pat = st.patterns[st.currentPattern];
        for (let s = 0; s < totalSteps; s++) {
            const step = s % 16;
            const t = s * stepDur + (step % 2 === 1 ? st.swing * stepDur : 0) + 0.05;
            DRUMS.forEach(tr => {
                if (pat.drums[tr.id][step] && trackAudible(st, tr.id)) {
                    playDrumOn(off, out, tr.id, t, st.trackVol[tr.id] ?? 0.8);
                }
            });
            for (let m = LOW_MIDI; m <= HIGH_MIDI; m++) {
                if (pat.piano[m][step] && trackAudible(st, 'piano')) {
                    playPianoOn(off, out, m, t, stepDur * 0.9, st.trackVol.piano ?? 0.8, st.pianoWave);
                }
            }
        }
        const rendered = await off.startRendering();
        return encodeWav([rendered.getChannelData(0), rendered.getChannelData(1)], sr);
    }

    // ---------------- UI ----------------
    function shellHtml() {
        return `
        <div class="ms" style="display:flex;flex-direction:column;height:100%;background:#141414;color:#eee;font-family:'Segoe UI',sans-serif;overflow:hidden;">
            <style>
                .ms button{font-family:inherit}
                .ms-transport{display:flex;align-items:center;gap:10px;padding:8px 12px;background:#1e1e1e;border-bottom:1px solid #333;flex-wrap:wrap}
                .ms-logo{display:flex;align-items:center;gap:8px;font-weight:700;font-size:14px;color:#7bff9e;white-space:nowrap}
                .ms-tbtn{background:#2b2b2b;border:1px solid #444;color:#fff;border-radius:6px;min-width:36px;height:30px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;padding:0 10px}
                .ms-tbtn:hover{background:#3a3a3a}
                .ms-tbtn.playing{background:#2e7d32;border-color:#4caf50}
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
                .ms-pad.now{outline:2px solid #fff;outline-offset:1px}
                .ms-prow{display:flex;gap:8px;align-items:center}
                .ms-key{width:118px;flex-shrink:0;font-size:11px;padding:4px 8px;border-radius:4px;text-align:right;cursor:default;border:1px solid #333}
                .ms-key.black{background:#0a0a0a;color:#888}
                .ms-key.white{background:#d7d7d7;color:#111}
                .ms-key.c{background:#1d3a26;color:#7bff9e;border-color:#2e7d32;font-weight:700}
                .ms-pcell{border:none;border-radius:4px;background:#222;cursor:pointer;border:1px solid #353535;min-height:22px}
                .ms-pcell.on{background:#7bff9e;box-shadow:0 0 6px #7bff9e}
                .ms-pcell.now{outline:2px solid #fff;outline-offset:0}
                .ms-mixer{display:flex;gap:14px;align-items:stretch;flex-wrap:wrap}
                .ms-strip{background:#1e1e1e;border:1px solid #333;border-radius:8px;padding:10px;display:flex;flex-direction:column;align-items:center;gap:8px;min-width:86px}
                .ms-strip input[type=range]{writing-mode:vertical-lr;direction:rtl;height:120px;accent-color:#7bff9e}
                .ms-status{display:flex;align-items:center;gap:14px;padding:5px 12px;background:#1e1e1e;border-top:1px solid #333;font-size:11px;color:#999}
                .ms-hint{color:#666}
            </style>
            <div class="ms-transport">
                <div class="ms-logo"><span style="font-size:18px;">&#9835;</span> Music Spark</div>
                <button class="ms-tbtn ms-play" title="Play / Stop (Space)">&#9654;</button>
                <button class="ms-tbtn ms-stop" title="Stop">&#9632;</button>
                <div class="ms-ctl">BPM <input type="number" class="ms-bpm" min="50" max="220" value="128"><input type="range" class="ms-bpm-s" min="50" max="220" value="128"></div>
                <div class="ms-ctl">Swing <input type="range" class="ms-swing" min="0" max="50" value="0" title="Swing amount"></div>
                <div class="ms-ctl">Vol <input type="range" class="ms-master" min="0" max="100" value="90"></div>
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
                <button class="ms-tab" data-view="mixer">Mixer</button>
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
                    <option>Empty</option>
                </select>
                <button class="ms-tool" data-act="random">Randomize</button>
                <button class="ms-tool" data-act="clear">Clear</button>
                <button class="ms-tool" data-act="help" style="margin-left:auto;">?</button>
            </div>
            <div class="ms-main"></div>
            <div class="ms-status"><span class="ms-proj">Untitled Beat</span><span class="ms-dirty"></span><span class="ms-hint">Click pads to toggle &bull; Space = play/stop &bull; Patterns loop live</span></div>
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
        if (el) el.textContent = st.name + (st.path ? '' : '');
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
        q('.ms-metro').classList.toggle('playing', st.metronome);
        q('.ms-play').classList.toggle('playing', st.playing);
        q('.ms-play').innerHTML = st.playing ? '&#10074;&#10074;' : '&#9654;';
        win.element.querySelectorAll('.ms-pat').forEach(b => {
            b.classList.toggle('active', parseInt(b.dataset.pat, 10) === st.currentPattern);
        });
        win.element.querySelectorAll('.ms-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.view === st.view);
        });
        const pos = q('.ms-pos');
        if (pos) pos.textContent = `${Math.floor(st.step / 4) + 1}:${(st.step % 4) + 1} | Pat ${st.currentPattern + 1}`;
    }

    function renderView(win, st) {
        const main = win.element.querySelector('.ms-main');
        if (st.view === 'step') renderStep(main, win, st);
        else if (st.view === 'piano') renderPiano(main, win, st);
        else renderMixer(main, win, st);
    }

    function renderStep(main, win, st) {
        const pat = st.patterns[st.currentPattern];
        let html = '<div style="min-width:640px;">';
        DRUMS.forEach(tr => {
            const cells = pat.drums[tr.id].map((v, s) => {
                const beat = s % 4 === 0 ? ' beat' : '';
                return `<button class="ms-pad${beat}${v ? ' on' : ''}${st.step === s && st.playing ? ' now' : ''}" data-track="${tr.id}" data-step="${s}" style="--c:${tr.color}" title="${esc(tr.name)} step ${s + 1}"></button>`;
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
        html += '<div class="ms-hint" style="font-size:11px;margin-top:8px;">Tip: build drums here, then add melody in the Piano Roll tab. Each of the 4 patterns loops — switch patterns while playing.</div></div>';
        main.innerHTML = html;

        main.querySelectorAll('.ms-pad').forEach(p => {
            p.addEventListener('click', () => {
                const t = p.dataset.track, s = parseInt(p.dataset.step, 10);
                pat.drums[t][s] = !pat.drums[t][s];
                p.classList.toggle('on', pat.drums[t][s]);
                markDirty(win, st);
            });
        });
        main.querySelectorAll('.ms-preview').forEach(b => {
            b.addEventListener('click', () => {
                ensureCtx();
                const t = 0.03;
                playDrumOn(actx, masterGain, b.dataset.track, actx.currentTime + t, st.trackVol[b.dataset.track] ?? 0.8);
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

    function renderPiano(main, win, st) {
        const pat = st.patterns[st.currentPattern];
        const waves = ['sawtooth', 'square', 'triangle', 'sine'];
        let html = `<div style="min-width:640px;">
            <div class="ms-prow" style="margin-bottom:10px;">
                <span style="font-size:12px;color:#999;">Lead synth:</span>
                <select class="ms-wave" style="background:#111;border:1px solid #444;color:#fff;border-radius:4px;padding:3px 8px;font-size:12px;">
                    ${waves.map(w => `<option value="${w}"${st.pianoWave === w ? ' selected' : ''}>${w}</option>`).join('')}
                </select>
                <span style="font-size:12px;color:#999;">Synth vol</span>
                <input type="range" class="ms-pvol" min="0" max="100" value="${Math.round((st.trackVol.piano ?? 0.8) * 100)}" style="width:100px;accent-color:#7bff9e;">
                <button class="ms-mini ms-pclear" style="padding:4px 10px;">Clear melody</button>
                <button class="ms-mini ms-ppreview" style="padding:4px 10px;" title="Preview scale">&#9654; scale</button>
            </div>`;
        for (let m = HIGH_MIDI; m >= LOW_MIDI; m--) {
            const black = isBlack(m);
            const isC = NOTE_NAMES[m % 12] === 'C';
            const cls = isC ? 'c' : (black ? 'black' : 'white');
            const cells = pat.piano[m].map((v, s) =>
                `<button class="ms-pcell${v ? ' on' : ''}${st.step === s && st.playing ? ' now' : ''}" data-midi="${m}" data-step="${s}" title="${noteName(m)} step ${s + 1}"></button>`
            ).join('');
            html += `<div class="ms-prow" style="margin-bottom:3px;"><div class="ms-key ${cls}">${noteName(m)}</div><div class="ms-grid16">${cells}</div></div>`;
        }
        html += '</div>';
        main.innerHTML = html;

        main.querySelector('.ms-wave').addEventListener('change', e => {
            st.pianoWave = e.target.value;
            markDirty(win, st);
        });
        main.querySelector('.ms-pvol').addEventListener('input', e => {
            st.trackVol.piano = parseInt(e.target.value, 10) / 100;
            markDirty(win, st);
        });
        main.querySelector('.ms-pclear').addEventListener('click', () => {
            for (let m = LOW_MIDI; m <= HIGH_MIDI; m++) pat.piano[m] = new Array(16).fill(false);
            renderView(win, st);
            markDirty(win, st);
        });
        main.querySelector('.ms-ppreview').addEventListener('click', () => {
            ensureCtx();
            const scale = [72, 74, 76, 77, 79, 81, 83, 84];
            scale.forEach((m, i) => {
                playPianoOn(actx, masterGain, m, actx.currentTime + 0.05 + i * 0.12, 0.11, st.trackVol.piano ?? 0.8, st.pianoWave);
            });
        });
        main.querySelectorAll('.ms-pcell').forEach(c => {
            c.addEventListener('click', () => {
                const m = parseInt(c.dataset.midi, 10), s = parseInt(c.dataset.step, 10);
                pat.piano[m][s] = !pat.piano[m][s];
                c.classList.toggle('on', pat.piano[m][s]);
                if (pat.piano[m][s]) {
                    ensureCtx();
                    playPianoOn(actx, masterGain, m, actx.currentTime + 0.02, 0.25, st.trackVol.piano ?? 0.8, st.pianoWave);
                }
                markDirty(win, st);
            });
        });
    }

    function renderMixer(main, win, st) {
        const strips = DRUMS.map(tr => mixerStrip(win, st, tr.id, tr.name, tr.color)).join('')
            + mixerStrip(win, st, 'piano', 'Lead', '#7bff9e')
            + mixerStrip(win, st, 'master', 'Master', '#ffffff', true);
        main.innerHTML = `<div class="ms-mixer">${strips}</div>
            <div class="ms-hint" style="font-size:11px;margin-top:10px;">M = mute, S = solo. Mixer levels are saved with your project and used in WAV export.</div>`;
        main.querySelectorAll('.ms-fader').forEach(f => {
            f.addEventListener('input', () => {
                st.trackVol[f.dataset.strip] = parseInt(f.value, 10) / 100;
                const lab = main.querySelector(`.ms-fval[data-strip="${f.dataset.strip}"]`);
                if (lab) lab.textContent = f.value;
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
    function mixerStrip(win, st, id, name, color, isMaster) {
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
    function highlight(win, st, step) {
        st.step = step;
        win.element.querySelectorAll('.ms-pad.now, .ms-pcell.now').forEach(el => el.classList.remove('now'));
        win.element.querySelectorAll(`.ms-pad[data-step="${step}"], .ms-pcell[data-step="${step}"]`).forEach(el => el.classList.add('now'));
        const pos = win.element.querySelector('.ms-pos');
        if (pos) pos.textContent = `${Math.floor(step / 4) + 1}:${(step % 4) + 1} | Pat ${st.currentPattern + 1}`;
    }
    function scheduleStep(win, st, step, t) {
        const pat = st.patterns[st.currentPattern];
        const stepDur = 60 / st.bpm / 4;
        DRUMS.forEach(tr => {
            if (pat.drums[tr.id][step] && trackAudible(st, tr.id)) {
                playDrumOn(actx, masterGain, tr.id, t, st.trackVol[tr.id] ?? 0.8);
            }
        });
        for (let m = LOW_MIDI; m <= HIGH_MIDI; m++) {
            if (pat.piano[m][step] && trackAudible(st, 'piano')) {
                playPianoOn(actx, masterGain, m, t, stepDur * 0.9, st.trackVol.piano ?? 0.8, st.pianoWave);
            }
        }
        if (st.metronome && step % 4 === 0) clickOn(actx, masterGain, t, 0.25, step === 0);
        const delay = Math.max((t - actx.currentTime) * 1000, 0);
        setTimeout(() => { if (win.element.isConnected && st.playing) highlight(win, st, step); }, delay);
    }
    function startPlayback(win, st) {
        ensureCtx();
        if (masterGain) masterGain.gain.value = st.trackVol.master ?? 0.9;
        st.playing = true;
        st._step = st._step ?? 0;
        st._next = actx.currentTime + 0.06;
        renderTransport(win, st);
        clearInterval(st._timer);
        st._timer = setInterval(() => {
            if (!win.element.isConnected) { stopPlayback(win, st); return; }
            if (masterGain) masterGain.gain.value = st.trackVol.master ?? 0.9;
            const stepDur = 60 / st.bpm / 4;
            while (st._next < actx.currentTime + 0.14) {
                const s = st._step % 16;
                const t = st._next + (s % 2 === 1 ? st.swing * stepDur : 0);
                scheduleStep(win, st, s, t);
                st._step++;
                st._next += stepDur;
            }
        }, 25);
    }
    function stopPlayback(win, st, reset) {
        st.playing = false;
        clearInterval(st._timer);
        if (reset) {
            st._step = 0;
            highlight(win, st, 0);
        }
        renderTransport(win, st);
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
        const scan = (dir) => {
            let kids = [];
            try { kids = FileSystem.getChildren(dir) || []; } catch (e) { kids = []; }
            kids.forEach(k => {
                if (k.type === 'file' && k.name.endsWith('.mspark')) projects.push({ label: k.name, path: [...dir, k.name] });
            });
        };
        scan(DOCS_DIR);
        try {
            const mus = FileSystem.getChildren(MUSIC_DIR) || [];
            mus.forEach(k => { if (k.type === 'file' && k.name.endsWith('.mspark')) projects.push({ label: 'Music/' + k.name, path: [...MUSIC_DIR, k.name] }); });
        } catch (e) { /* ignore */ }
        ensureDataDir();
        try {
            const own = FileSystem.getChildren(DATA_DIR) || [];
            own.forEach(k => { if (k.type === 'file' && k.name.endsWith('.mspark')) projects.push({ label: k.name, path: [...DATA_DIR, k.name] }); });
        } catch (e) { /* ignore */ }
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
            Object.keys(st).forEach(k => delete st[k]);
            Object.assign(st, next, { path: found.path, playing: false, step: 0, view: st.view || 'step', dirty: false });
            st._step = 0;
            setProjLabel(win, st);
            markClean(win, st);
            renderAll(win, st);
        } catch (e) {
            await Popup.error('Open failed', 'That file is not a valid Music Spark project.');
        }
    }
    async function doExportWav(win, st) {
        const name = await Popup.textbox('Export WAV', 'File name:', { value: (st.name || 'beat') + ' - loop x4', placeholder: 'my-beat' });
        if (!name) return;
        await Popup.info('Rendering', 'Rendering 4 loops to WAV. This takes a few seconds...');
        try {
            const buf = await renderWav(st, 4);
            const url = wavToDataUrl(buf);
            const safe = name.replace(/[\\/:*?"<>|]/g, '').slice(0, 40) || 'beat';
            const fileName = safe.endsWith('.wav') ? safe : safe + '.wav';
            let ok;
            if (FileSystem.itemExists([...MUSIC_DIR, fileName])) ok = FileSystem.writeFile([...MUSIC_DIR, fileName], url);
            else ok = FileSystem.createFile(MUSIC_DIR, fileName, url, 'wav');
            if (ok === false) {
                await Popup.error('Export failed', 'Could not write the WAV file (storage may be full).');
                return;
            }
            await Popup.info('Exported', `Saved to Music/${fileName}. Open it from File Explorer.`);
        } catch (e) {
            await Popup.error('Export failed', 'Rendering failed: ' + (e && e.message ? e.message : e));
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
        // random minor-pentatonic sprinkles
        const penta = [60, 63, 65, 67, 70, 72, 75, 76, 79, 84];
        for (let s = 0; s < 16; s++) {
            if (Math.random() < 0.25) {
                const m = penta[Math.floor(Math.random() * penta.length)];
                pat.piano[m][s] = true;
            }
        }
    }
    function clearPattern(st) {
        st.patterns[st.currentPattern] = emptyPattern();
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

        const bpmNum = q('.ms-bpm'), bpmRange = q('.ms-bpm-s');
        const setBpm = v => {
            v = Math.min(220, Math.max(50, Math.round(v) || 128));
            st.bpm = v; bpmNum.value = v; bpmRange.value = v;
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
            markDirty(win, st);
        });
        q('.ms-metro').addEventListener('click', () => {
            st.metronome = !st.metronome;
            renderTransport(win, st);
            markDirty(win, st);
        });
        win.element.querySelectorAll('.ms-pat').forEach(b => {
            b.addEventListener('click', () => {
                st.currentPattern = parseInt(b.dataset.pat, 10);
                st._step = st._step != null ? st._step : 0;
                renderAll(win, st);
                markDirty(win, st);
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
                const ok = await Popup.confirm('Load preset', `Replace pattern ${st.currentPattern + 1} with "${name}"? Unsaved changes will be lost.`);
                if (!ok) return;
            }
            const fresh = PRESETS[name]();
            st.patterns = fresh;
            if (name !== 'Empty') st.bpm = name === 'Hip-Hop 90' ? 90 : name === 'Trap' ? 140 : name === 'House' ? 124 : name === 'Techno' ? 132 : 96;
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
                const next = blankState();
                Object.keys(st).forEach(k => delete st[k]);
                Object.assign(st, next);
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
            } else if (act === 'help') {
                await Popup.info('Music Spark',
                    'Step Sequencer: click pads to toggle drums. M = mute, S = solo, play icon previews.\n\n' +
                    'Piano Roll: click cells to add synth notes. Choose waveform, preview the scale.\n\n' +
                    'Patterns 1-4 loop — switch them live while playing. Space toggles play.\n\n' +
                    'Save projects as .mspark files, export loops to WAV in your Music folder.');
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
                if (actx && !document.querySelector('.ms-play.playing')) { /* keep shared ctx alive */ }
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

    function launch() {
        FileAssociations.register(APP_ID, ['mspark'], (path, content) => {
            try {
                const st = deserialize(content);
                st.path = path;
                const win = openWithState(st);
                markClean(win, st);
                setProjLabel(win, st);
            } catch (e) {
                Popup.error('Music Spark', 'Could not open that project file.');
            }
        });
        const saved = loadAutosave();
        const st = saved || blankState();
        if (!saved) {
            st.patterns = PRESETS['Boom Bap + Keys']();
            st.name = 'My First Beat';
            st.bpm = 96;
        }
        const win = openWithState(st);
        markClean(win, st);
    }

    return { launch };
})();

export default MusicSpark;
