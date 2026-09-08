import WindowManager from '../../modules/windowManager.js';
import AppIcons from '../../modules/appIcons.js';
import Popup from '../../modules/popup.js';
import FileSystem from '../../modules/fileSystem.js';
import SystemConfig from '../../modules/systemConfig.js';
import ContextMenu from '../../modules/contextMenu.js';

const MediaPlayer = (() => {
    const APP_ID = 'mediaPlayer';
    const DATA_DIR = ['/', 'system', 'programs data', 'mediaPlayer'];
    const MUSIC_DIR = ['/', 'users', 'default', 'Music'];
    const VIDEO_DIR = ['/', 'users', 'default', 'Videos'];
    const AUDIO_EXTS = ['mp3', 'wav', 'ogg', 'oga', 'm4a'];
    const VIDEO_EXTS = ['mp4', 'webm'];
    const PLAYABLE = [...AUDIO_EXTS, ...VIDEO_EXTS];

    function esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function fmtTime(sec) {
        if (!Number.isFinite(sec) || sec < 0) return '0:00';
        const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
        return m + ':' + String(s).padStart(2, '0');
    }
    function extOf(name) {
        const i = name.lastIndexOf('.');
        return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
    }
    function kindOf(ext) {
        if (AUDIO_EXTS.includes(ext)) return 'audio';
        if (VIDEO_EXTS.includes(ext)) return 'video';
        return null;
    }
    function midiHz(m) {
        return 440 * Math.pow(2, (m - 69) / 12);
    }

    // ---------------- persistence ----------------
    function ensureDataDir() {
        if (!FileSystem.itemExists(DATA_DIR)) {
            FileSystem.createFolder(['/', 'system', 'programs data'], 'mediaPlayer');
        }
    }
    function blankState() {
        return {
            view: 'library', section: 'music', mini: false,
            queue: [], qi: -1, order: [], shuffle: false, repeat: 'all',
            volume: 0.8, muted: false, speed: 1, viz: 'bars',
            playlists: [], durations: {}, resume: {}, seeded: false, search: ''
        };
    }
    function loadState() {
        const st = blankState();
        try {
            ensureDataDir();
            const raw = FileSystem.readFile([...DATA_DIR, 'player.json']);
            if (!raw) return st;
            const d = JSON.parse(raw);
            ['view', 'section', 'shuffle', 'repeat', 'volume', 'muted', 'speed', 'viz', 'seeded'].forEach(k => {
                if (d[k] !== undefined) st[k] = d[k];
            });
            if (d.volume != null) st.volume = Math.min(1, Math.max(0, Number(d.volume) || 0.8));
            if (![0.5, 1, 1.25, 1.5, 2].includes(Number(d.speed))) st.speed = 1;
            if (!['off', 'all', 'one'].includes(d.repeat)) st.repeat = 'all';
            if (!['bars', 'wave', 'orbs'].includes(d.viz)) st.viz = 'bars';
            if (Array.isArray(d.playlists)) {
                st.playlists = d.playlists.filter(p => p && typeof p.name === 'string' && Array.isArray(p.items))
                    .map(p => ({ name: p.name.slice(0, 60), items: p.items.filter(plainItem).slice(0, 500) }));
            }
            if (d.durations && typeof d.durations === 'object') st.durations = d.durations;
            if (d.resume && typeof d.resume === 'object') st.resume = d.resume;
            if (Array.isArray(d.queue)) {
                st.queue = d.queue.filter(plainItem);
                st.qi = Number.isInteger(d.qi) && d.qi >= -1 && d.qi < st.queue.length ? d.qi : (st.queue.length ? 0 : -1);
            }
        } catch (e) { /* corrupt save -> fresh state */ }
        return st;
    }
    function plainItem(it) {
        return it && typeof it.name === 'string' && typeof it.kind === 'string' && (typeof it.key === 'string' || typeof it.url === 'string');
    }
    let saveTimer = null;
    function saveState(st) {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            try {
                ensureDataDir();
                const slim = q => q.map(it => ({ key: it.key, url: it.url, name: it.name, kind: it.kind }));
                const data = JSON.stringify({
                    view: st.view === 'nowplaying' ? 'library' : st.view,
                    section: st.section, shuffle: st.shuffle, repeat: st.repeat,
                    volume: st.volume, muted: st.muted, speed: st.speed, viz: st.viz,
                    playlists: st.playlists.map(p => ({ name: p.name, items: slim(p.items) })),
                    durations: st.durations, resume: st.resume, seeded: st.seeded,
                    queue: slim(st.queue), qi: st.qi
                });
                const p = [...DATA_DIR, 'player.json'];
                if (FileSystem.itemExists(p)) FileSystem.writeFile(p, data);
                else FileSystem.createFile(DATA_DIR, 'player.json', data, 'json');
            } catch (e) { /* quota etc — session continues in memory */ }
        }, 600);
    }

    // ---------------- library scan ----------------
    function walkPlayable(dir, out) {
        let kids = [];
        try { kids = FileSystem.getChildren(dir) || []; } catch (e) { return; }
        kids.forEach(k => {
            const p = [...dir, k.name];
            if (k.type === 'folder') { walkPlayable(p, out); return; }
            const ext = extOf(k.name);
            const kind = kindOf(ext);
            if (!kind) return;
            const content = FileSystem.readFile(p);
            if (content == null) return;
            out.push({ key: p.join('/'), name: k.name.replace(/\.[^.]+$/, ''), src: content, kind });
        });
    }
    function scanLibrary() {
        const out = [];
        walkPlayable(MUSIC_DIR, out);
        walkPlayable(VIDEO_DIR, out);
        out.sort((a, b) => a.name.localeCompare(b.name));
        return out;
    }
    function resolveItems(st, slimList) {
        // Re-attach src to persisted items (library files may have changed).
        const lib = scanLibrary();
        const byKey = {};
        lib.forEach(it => { byKey[it.key] = it; });
        const out = [];
        (slimList || []).forEach(s => {
            if (s.url) {
                const ext = extOf(s.url.split('?')[0]);
                out.push({ key: 'url:' + s.url, name: s.name || s.url, kind: kindOf(ext) || 'audio', url: s.url, src: s.url });
            } else if (s.key && byKey[s.key]) {
                out.push(byKey[s.key]);
            }
        });
        return out;
    }
    function probeDuration(item, st, onDone) {
        if (!item || item.url) { onDone(null); return; }
        if (st.durations[item.key]) { onDone(st.durations[item.key]); return; }
        try {
            const el = document.createElement(item.kind === 'video' ? 'video' : 'audio');
            el.preload = 'metadata';
            const to = setTimeout(() => { el.src = ''; onDone(null); }, 8000);
            el.onloadedmetadata = () => {
                clearTimeout(to);
                const d = Number.isFinite(el.duration) ? Math.round(el.duration) : null;
                if (d) { st.durations[item.key] = d; saveState(st); }
                el.src = '';
                onDone(d);
            };
            el.onerror = () => { clearTimeout(to); onDone(null); };
            el.src = item.src;
        } catch (e) { onDone(null); }
    }

    // ---------------- sample music (generative demo tracks) ----------------
    function encodeWavMono(samples, sampleRate) {
        const n = samples.length;
        const buf = new ArrayBuffer(44 + n * 2);
        const v = new DataView(buf);
        const wstr = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
        wstr(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); wstr(8, 'WAVE'); wstr(12, 'fmt ');
        v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
        v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
        v.setUint16(32, 2, true); v.setUint16(34, 16, true); wstr(36, 'data'); v.setUint32(40, n * 2, true);
        for (let i = 0; i < n; i++) {
            v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
        }
        return buf;
    }
    function wavDataUrl(buf) {
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i += 8192) {
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
        }
        return 'data:audio/wav;base64,' + btoa(bin);
    }
    function renderDemoTrack(opts) {
        // opts: { bpm, bars, bass[], arp[], leadWave, bassVol, leadVol, hatVol }
        const sr = 22050;
        const stepDur = 60 / opts.bpm / 4;
        const total = Math.ceil(stepDur * 16 * opts.bars * sr);
        const out = new Float32Array(total);
        const ctx = new OfflineAudioContext(1, total, sr);
        const master = ctx.createGain();
        master.gain.value = 0.8;
        master.connect(ctx.destination);
        const noiseBuf = ctx.createBuffer(1, sr, sr);
        const nd = noiseBuf.getChannelData(0);
        for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
        function tone(t, f, dur, vol, type) {
            const o = ctx.createOscillator(); o.type = type || 'square'; o.frequency.value = f;
            const g = ctx.createGain();
            g.gain.setValueAtTime(vol, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + dur);
            o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
        }
        function hat(t, vol) {
            const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
            const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
            const g = ctx.createGain();
            g.gain.setValueAtTime(vol, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
            s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + 0.08);
        }
        function bass(t, f, dur, vol) {
            const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
            const g = ctx.createGain();
            g.gain.setValueAtTime(vol, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + dur);
            o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
        }
        const steps = 16 * opts.bars;
        for (let s = 0; s < steps; s++) {
            const t = 0.05 + s * stepDur;
            const bar16 = s % 16;
            if (opts.bassPattern[bar16] != null) {
                bass(t, midiHz(opts.bassPattern[bar16]), stepDur * 3, opts.bassVol);
            }
            if (opts.arpPattern[bar16] != null) {
                tone(t, midiHz(opts.arpPattern[bar16]), stepDur * 1.8, opts.leadVol, opts.leadWave);
            }
            if (bar16 % 2 === 0) hat(t, opts.hatVol);
            if (bar16 % 4 === 2) tone(t, 1200, 0.03, opts.hatVol * 0.5, 'sine');
        }
        return ctx.startRendering().then(rendered => {
            const ch = rendered.getChannelData(0);
            const mixed = new Float32Array(ch.length);
            for (let i = 0; i < ch.length; i++) mixed[i] = Math.tanh(ch[i]);
            return wavDataUrl(encodeWavMono(mixed, sr));
        });
    }
    const DEMOS = [
        {
            file: 'Sample Music - Midnight Drive.wav', title: 'Midnight Drive (Sample)',
            opts: {
                bpm: 100, bars: 8, leadWave: 'square', bassVol: 0.5, leadVol: 0.16, hatVol: 0.12,
                bassPattern: { 0: 45, 3: 45, 6: 48, 8: 43, 11: 43, 14: 47 },
                arpPattern: { 0: 69, 2: 72, 4: 76, 6: 72, 8: 67, 10: 71, 12: 74, 14: 71 }
            }
        },
        {
            file: 'Sample Music - Neon Skyline.wav', title: 'Neon Skyline (Sample)',
            opts: {
                bpm: 122, bars: 8, leadWave: 'sawtooth', bassVol: 0.42, leadVol: 0.12, hatVol: 0.1,
                bassPattern: { 0: 48, 4: 48, 8: 45, 12: 43 },
                arpPattern: { 0: 72, 2: 76, 4: 79, 6: 84, 8: 81, 10: 79, 12: 76, 14: 74 }
            }
        }
    ];
    async function seedSampleMusic(st, onDone) {
        if (st.seeded) { onDone(false); return; }
        st.seeded = true; saveState(st);
        let created = 0;
        for (const d of DEMOS) {
            try {
                if (FileSystem.itemExists([...MUSIC_DIR, d.file])) continue;
                const url = await renderDemoTrack(d.opts);
                if (FileSystem.createFile(MUSIC_DIR, d.file, url, 'wav')) created++;
            } catch (e) { /* quota or render failure — skip silently */ }
        }
        onDone(created > 0);
    }

    // ---------------- UI ----------------
    function shellHtml(accent) {
        return `
        <div class="wmp" style="display:flex;flex-direction:column;height:100%;background:linear-gradient(180deg,#0d1526 0%,#060a14 60%,#04060d 100%);color:#e8eef7;font-family:'Segoe UI',sans-serif;overflow:hidden;user-select:none;">
            <style>
                .wmp button{font-family:inherit}
                .wmp-top{display:flex;align-items:center;gap:8px;padding:8px 12px;background:linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.02));border-bottom:1px solid rgba(255,255,255,0.08)}
                .wmp-navbtn{width:30px;height:26px;border-radius:13px;border:1px solid rgba(255,255,255,0.18);background:linear-gradient(180deg,#3a4a63,#1c2637);color:#cfe0f5;cursor:pointer;font-size:13px;line-height:1}
                .wmp-navbtn:hover{background:linear-gradient(180deg,#4a5d7d,#26344a)}
                .wmp-menu{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#dce7f7;border-radius:6px;padding:5px 12px;font-size:12px;cursor:pointer}
                .wmp-menu:hover{background:rgba(255,255,255,0.13)}
                .wmp-search{margin-left:auto;display:flex;align-items:center;background:rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.16);border-radius:12px;padding:3px 10px;gap:6px}
                .wmp-search input{background:none;border:none;color:#fff;outline:none;font-size:12px;width:150px}
                .wmp-body{flex:1;display:flex;min-height:0}
                .wmp-side{width:172px;flex-shrink:0;background:rgba(0,0,0,0.28);border-right:1px solid rgba(255,255,255,0.07);padding:10px 6px;overflow:auto}
                .wmp-sect{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#7d8ea8;padding:8px 10px 4px}
                .wmp-nav{display:flex;align-items:center;gap:9px;padding:7px 10px;border-radius:6px;font-size:13px;color:#c6d4e8;cursor:pointer;border:1px solid transparent}
                .wmp-nav:hover{background:rgba(255,255,255,0.06)}
                .wmp-nav.active{background:linear-gradient(180deg,rgba(77,178,255,0.28),rgba(77,178,255,0.12));border-color:rgba(77,178,255,0.45);color:#fff}
                .wmp-main{flex:1;display:flex;flex-direction:column;min-width:0}
                .wmp-listhead{display:flex;gap:8px;padding:8px 16px;font-size:11px;color:#8fa1bb;border-bottom:1px solid rgba(255,255,255,0.08);text-transform:uppercase;letter-spacing:0.5px}
                .wmp-list{flex:1;overflow:auto;padding:4px 8px 12px}
                .wmp-row{display:flex;gap:8px;align-items:center;padding:6px 8px;border-radius:5px;font-size:13px;color:#dbe6f5;cursor:default}
                .wmp-row:hover{background:rgba(77,178,255,0.12)}
                .wmp-row.playing{background:linear-gradient(180deg,rgba(77,178,255,0.32),rgba(77,178,255,0.14));color:#fff}
                .wmp-row .t{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
                .wmp-row .m{color:#8fa1bb;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
                .wmp-empty{padding:40px 20px;text-align:center;color:#7d8ea8;font-size:13px;line-height:1.8}
                .wmp-stage{flex:1;display:flex;min-height:0;position:relative;background:#000}
                .wmp-viz{position:absolute;inset:0;width:100%;height:100%}
                .wmp-tracktitle{position:absolute;left:0;right:0;bottom:0;padding:28px 20px 14px;background:linear-gradient(0deg,rgba(0,0,0,0.75),transparent);font-size:15px;color:#fff;pointer-events:none}
                .wmp-queue{width:250px;flex-shrink:0;background:rgba(0,0,0,0.4);border-left:1px solid rgba(255,255,255,0.07);display:flex;flex-direction:column;min-height:0}
                .wmp-qhead{padding:9px 12px;font-size:12px;color:#9db1cc;border-bottom:1px solid rgba(255,255,255,0.07);display:flex;justify-content:space-between;align-items:center}
                .wmp-qlist{flex:1;overflow:auto;padding:4px}
                .wmp-qrow{display:flex;gap:8px;align-items:center;padding:6px 8px;border-radius:5px;font-size:12px;color:#c6d4e8;cursor:pointer}
                .wmp-qrow:hover{background:rgba(255,255,255,0.07)}
                .wmp-qrow.cur{background:rgba(77,178,255,0.2);color:#fff}
                .wmp-ctrl{background:linear-gradient(180deg,#232f45 0%,#141c2d 55%,#0c1220 100%);border-top:1px solid rgba(255,255,255,0.12);padding:8px 14px 10px;box-shadow:0 -1px 12px rgba(0,0,0,0.5)}
                .wmp-progress{display:flex;align-items:center;gap:10px;font-size:11px;color:#9db1cc;font-variant-numeric:tabular-nums;margin-bottom:8px}
                .wmp-seek{flex:1;height:14px;position:relative;cursor:pointer}
                .wmp-seek .tr{position:absolute;left:0;right:0;top:5px;height:4px;border-radius:2px;background:rgba(255,255,255,0.16);box-shadow:inset 0 1px 2px rgba(0,0,0,0.6)}
                .wmp-seek .fl{position:absolute;left:0;top:5px;height:4px;border-radius:2px;background:linear-gradient(180deg,#8fd0ff,#3d9bff);box-shadow:0 0 6px ${accent}}
                .wmp-seek .kn{position:absolute;top:1px;width:12px;height:12px;margin-left:-6px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,#bcd9ff 45%,#2f7fd0 100%);box-shadow:0 0 8px ${accent};border:1px solid rgba(255,255,255,0.6)}
                .wmp-btns{display:flex;align-items:center;gap:6px}
                .wmp-cbtn{background:linear-gradient(180deg,rgba(255,255,255,0.14),rgba(255,255,255,0.03));border:1px solid rgba(255,255,255,0.16);color:#dce7f7;border-radius:6px;min-width:34px;height:30px;cursor:pointer;font-size:12px;padding:0 8px}
                .wmp-cbtn:hover{background:linear-gradient(180deg,rgba(255,255,255,0.24),rgba(255,255,255,0.08))}
                .wmp-cbtn.on{background:linear-gradient(180deg,rgba(77,178,255,0.5),rgba(40,110,190,0.5));border-color:#6db9ff;color:#fff}
                .wmp-play{width:46px;height:46px;border-radius:50%;border:1px solid rgba(200,230,255,0.7);cursor:pointer;font-size:17px;color:#fff;background:radial-gradient(circle at 50% 32%,#9fd6ff 0%,#4aa3f0 38%,#1663b8 72%,#0b3a75 100%);box-shadow:0 0 14px ${accent},inset 0 1px 2px rgba(255,255,255,0.6);display:flex;align-items:center;justify-content:center}
                .wmp-play:hover{filter:brightness(1.12)}
                .wmp-play small{font-size:11px}
                .wmp-vol{display:flex;align-items:center;gap:6px;margin-left:auto}
                .wmp-vol input{width:90px;accent-color:#4db2ff}
                .wmp-status{font-size:11px;color:#8fa1bb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px}
                .wmp.mini .wmp-body,.wmp.mini .wmp-top{display:none}
            </style>
            <div class="wmp-top">
                <button class="wmp-navbtn" data-nav="back" title="Back">&#9664;</button>
                <button class="wmp-navbtn" data-nav="fwd" title="Forward">&#9654;</button>
                <button class="wmp-menu" data-menu="organize">Organize &#9662;</button>
                <button class="wmp-menu" data-menu="playurl">Play URL</button>
                <button class="wmp-menu" data-menu="newpl">Create playlist</button>
                <div class="wmp-search"><span style="color:#7d8ea8;">&#8981;</span><input class="wmp-q" placeholder="Search library"></div>
            </div>
            <div class="wmp-body">
                <div class="wmp-side"></div>
                <div class="wmp-main"></div>
            </div>
            <div class="wmp-ctrl">
                <div class="wmp-progress"><span class="wmp-tcur">0:00</span><div class="wmp-seek"><div class="tr"></div><div class="fl" style="width:0%"></div><div class="kn" style="left:0%"></div></div><span class="wmp-tdur">0:00</span></div>
                <div class="wmp-btns">
                    <button class="wmp-cbtn wmp-shuffle" title="Shuffle (S)">&#8646;</button>
                    <button class="wmp-cbtn wmp-prev" title="Previous (P)">&#9198;</button>
                    <button class="wmp-play" title="Play / Pause (Space)">&#9654;</button>
                    <button class="wmp-cbtn wmp-stop" title="Stop">&#9632;</button>
                    <button class="wmp-cbtn wmp-next" title="Next (N)">&#9197;</button>
                    <button class="wmp-cbtn wmp-repeat" title="Repeat (R)">&#8635;</button>
                    <button class="wmp-cbtn wmp-speed" title="Playback speed">1x</button>
                    <button class="wmp-cbtn wmp-vizbtn" title="Visualization">&#9783;</button>
                    <button class="wmp-cbtn wmp-viewbtn" title="Switch view">&#9782;</button>
                    <button class="wmp-cbtn wmp-minibtn" title="Mini player">&#95;</button>
                    <span class="wmp-status"></span>
                    <div class="wmp-vol"><button class="wmp-cbtn wmp-mute" title="Mute (M)">&#128266;</button><input type="range" class="wmp-volr" min="0" max="100" value="80"></div>
                </div>
            </div>
        </div>`;
    }

    // ---------------- per-window session ----------------
    function newSession(win, st) {
        const media = document.createElement('video');
        media.preload = 'auto';
        return {
            win, st, media,
            actx: null, analyser: null, freqData: null,
            lib: [], currentKey: null, errorShown: false,
            raf: 0, lastSave: 0, dead: false, errStreak: 0,
            navHist: ['library'], navPos: 0
        };
    }
    function ensureAudioGraph(s) {
        if (s.actx) return;
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            s.actx = new AC();
            const src = s.actx.createMediaElementSource(s.media);
            s.analyser = s.actx.createAnalyser();
            s.analyser.fftSize = 128;
            s.freqData = new Uint8Array(s.analyser.frequencyBinCount);
            src.connect(s.analyser);
            s.analyser.connect(s.actx.destination);
        } catch (e) { s.actx = null; }
        if (s.actx && s.actx.state === 'suspended') s.actx.resume();
    }
    function cur(s) {
        return (s.st.qi >= 0 && s.st.qi < s.st.queue.length) ? s.st.queue[s.st.qi] : null;
    }
    function pickOrder(s) {
        const n = s.st.queue.length;
        const idx = [...Array(n).keys()];
        if (s.st.shuffle) {
            for (let i = n - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [idx[i], idx[j]] = [idx[j], idx[i]];
            }
        }
        s.st.order = idx;
    }
    function stepIndex(s, dir) {
        const n = s.st.queue.length;
        if (!n) return -1;
        if (s.st.shuffle && s.st.order.length !== n) pickOrder(s);
        if (!s.st.shuffle) {
            let i = s.st.qi + dir;
            if (i < 0 || i >= n) return s.st.repeat === 'all' ? (dir > 0 ? 0 : n - 1) : -1;
            return i;
        }
        const pos = s.st.order.indexOf(s.st.qi);
        let np = pos + dir;
        if (np < 0 || np >= n) {
            if (s.st.repeat !== 'all') return -1;
            np = dir > 0 ? 0 : n - 1;
        }
        return s.st.order[np];
    }

    function setStatus(s, msg) {
        const el = s.win.element.querySelector('.wmp-status');
        if (el) el.textContent = msg;
    }

    function playIndex(s, i, opts) {
        if (s.dead) return;
        opts = opts || {};
        const st = s.st;
        if (i < 0 || i >= st.queue.length) return;
        st.qi = i;
        const it = st.queue[i];
        ensureAudioGraph(s);
        try { s.media.pause(); } catch (e) { /* noop */ }
        s.media.playbackRate = st.speed;
        s.media.src = it.src;
        const resumeAt = (!opts.fresh && it.key && st.resume[it.key]) ? st.resume[it.key] : 0;
        const go = () => {
            if (resumeAt > 5) {
                try { s.media.currentTime = resumeAt; } catch (e) { /* noop */ }
            }
            const pr = s.media.play();
            if (pr && pr.catch) pr.catch(() => { /* autoplay policy: wait for gesture */ });
        };
        if (resumeAt > 5) {
            s.media.onloadedmetadata = () => {
                try { s.media.currentTime = Math.min(resumeAt, (s.media.duration || 99) - 3); } catch (e) { /* noop */ }
            };
            go();
        } else {
            s.media.onloadedmetadata = null;
            go();
        }
        s.currentKey = it.key || it.url;
        setStatus(s, it.name);
        saveState(st);
        renderAll(s);
    }
    function togglePlay(s) {
        if (s.dead) return;
        const c = cur(s);
        if (!c) {
            if (s.st.queue.length) playIndex(s, 0);
            return;
        }
        if (s.media.paused) {
            ensureAudioGraph(s);
            const pr = s.media.play();
            if (pr && pr.catch) pr.catch(() => { /* noop */ });
        } else {
            s.media.pause();
        }
    }
    function playNext(s, dir) {
        if (s.dead) return;
        dir = dir || 1;
        const i = stepIndex(s, dir);
        if (i < 0) {
            try { s.media.pause(); } catch (e) { /* noop */ }
            return;
        }
        playIndex(s, i, { fresh: true });
    }

    // ---------------- rendering ----------------
    function sectionItems(s) {
        const q = s.st.search.trim().toLowerCase();
        const match = it => !q || it.name.toLowerCase().includes(q);
        if (s.st.section === 'music') return s.lib.filter(it => it.kind === 'audio' && match(it));
        if (s.st.section === 'videos') return s.lib.filter(it => it.kind === 'video' && match(it));
        if (s.st.section === 'queue') return s.st.queue.filter(match);
        if (s.st.section.startsWith('pl:')) {
            const pl = s.st.playlists.find(p => 'pl:' + p.name === s.st.section);
            return (pl ? pl.items : []).filter(match);
        }
        return [];
    }
    function durLabel(s, it) {
        if (it.url) return '--:--';
        const d = s.st.durations[it.key];
        return d ? fmtTime(d) : '--:--';
    }
    function renderSide(s) {
        const st = s.st;
        const pls = st.playlists.map(p => `
            <div class="wmp-nav${st.section === 'pl:' + p.name ? ' active' : ''}" data-sec="pl:${esc(p.name)}">
                <span style="color:#7bff9e;">&#9835;</span><span class="t" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(p.name)}</span>
            </div>`).join('');
        s.win.element.querySelector('.wmp-side').innerHTML = `
            <div class="wmp-sect">Library</div>
            <div class="wmp-nav${st.section === 'music' ? ' active' : ''}" data-sec="music"><span>&#9836;</span>Music</div>
            <div class="wmp-nav${st.section === 'videos' ? ' active' : ''}" data-sec="videos"><span>&#127916;</span>Videos</div>
            <div class="wmp-nav${st.section === 'queue' ? ' active' : ''}" data-sec="queue"><span>&#9776;</span>Now Playing List</div>
            <div class="wmp-sect">Playlists</div>
            ${pls || '<div style="padding:4px 10px;font-size:12px;color:#5b6a84;">None yet</div>'}
            <div class="wmp-sect">Player</div>
            <div class="wmp-nav" data-goto="nowplaying"><span>&#9673;</span>Now Playing</div>`;
        s.win.element.querySelectorAll('.wmp-side .wmp-nav').forEach(el => {
            el.addEventListener('click', () => {
                if (el.dataset.goto === 'nowplaying') { st.view = 'nowplaying'; renderAll(s); saveState(st); return; }
                st.section = el.dataset.sec; st.view = 'library'; renderAll(s); saveState(st);
            });
            el.addEventListener('contextmenu', e => {
                if (!el.dataset.sec || !el.dataset.sec.startsWith('pl:')) return;
                e.preventDefault();
                const name = el.dataset.sec.slice(3);
                ContextMenu.show(e.clientX, e.clientY, [
                    { label: 'Rename playlist', action: async () => {
                        const nn = await Popup.textbox('Rename playlist', 'Name:', { value: name });
                        if (nn && nn.trim()) {
                            const p = st.playlists.find(p => p.name === name);
                            if (p) { p.name = nn.trim().slice(0, 60); st.section = 'pl:' + p.name; renderAll(s); saveState(st); }
                        }
                    }},
                    { label: 'Delete playlist', action: async () => {
                        const ok = await Popup.confirm('Delete playlist', `Delete "${name}"? (Files stay in the library.)`);
                        if (ok) {
                            st.playlists = st.playlists.filter(p => p.name !== name);
                            if (st.section === 'pl:' + name) st.section = 'music';
                            renderAll(s); saveState(st);
                        }
                    }}
                ]);
            });
        });
    }
    function renderMain(s) {
        const st = s.st;
        const main = s.win.element.querySelector('.wmp-main');
        if (st.view === 'nowplaying') { renderNowPlaying(s, main); return; }
        const items = sectionItems(s);
        const isPl = st.section.startsWith('pl:');
        const head = `
            <div class="wmp-listhead"><span style="flex:1;">Title</span><span style="width:120px;">Length</span><span style="width:90px;"></span></div>
            <div class="wmp-list"></div>`;
        main.innerHTML = head;
        const list = main.querySelector('.wmp-list');
        if (!items.length) {
            list.innerHTML = `<div class="wmp-empty">
                ${st.section === 'music' ? 'No music yet.<br>Use <b>Ex/port</b> to import audio files,<br>or press <b>Play URL</b> to stream.' : ''}
                ${st.section === 'videos' ? 'No videos yet.<br>Use <b>Ex/port</b> to import video files.' : ''}
                ${st.section === 'queue' ? 'Queue is empty.<br>Double-click any track to play it.' : ''}
                ${isPl ? 'This playlist is empty.<br>Right-click tracks to add them here.' : ''}
            </div>`;
            return;
        }
        items.forEach(it => {
            const row = document.createElement('div');
            row.className = 'wmp-row' + ((cur(s) && (cur(s).key || cur(s).url) === (it.key || it.url)) ? ' playing' : '');
            row.innerHTML = `
                <span style="color:${it.kind === 'video' ? '#40c4ff' : '#7bff9e'};">${it.kind === 'video' ? '&#127916;' : '&#9835;'}</span>
                <span class="t">${esc(it.name)}</span>
                <span class="m" style="width:120px;">${durLabel(s, it)}</span>
                <button class="wmp-cbtn wmp-addq" style="min-width:28px;height:24px;" title="Add to queue">+</button>`;
            row.addEventListener('dblclick', () => enqueueAndPlay(s, it));
            row.querySelector('.wmp-addq').addEventListener('click', e => {
                e.stopPropagation();
                st.queue.push(it);
                pickOrder(s);
                if (st.qi < 0) st.qi = 0;
                saveState(st); renderAll(s);
            });
            row.addEventListener('contextmenu', e => {
                e.preventDefault();
                const menu = [
                    { label: 'Play', action: () => enqueueAndPlay(s, it) },
                    { label: 'Play next', action: () => {
                        st.queue.splice(st.qi + 1, 0, it);
                        pickOrder(s); saveState(st); renderAll(s);
                    }},
                    { label: 'Add to queue', action: () => {
                        st.queue.push(it); pickOrder(s);
                        if (st.qi < 0) st.qi = 0;
                        saveState(st); renderAll(s);
                    }}
                ];
                if (st.playlists.length) {
                    menu.push({ label: 'Add to playlist…', action: async () => {
                        const pick = await Popup.pick('Add to playlist', it.name, st.playlists.map(p => p.name));
                        if (pick) {
                            const label = pick.label || pick;
                            const p = st.playlists.find(p => p.name === label);
                            if (p && !p.items.some(x => (x.key || x.url) === (it.key || it.url))) {
                                p.items.push({ key: it.key, url: it.url, name: it.name, kind: it.kind });
                                saveState(st); renderAll(s);
                            }
                        }
                    }});
                }
                if (isPl) {
                    menu.push({ label: 'Remove from playlist', action: () => {
                        const p = st.playlists.find(p => 'pl:' + p.name === st.section);
                        if (p) {
                            p.items = p.items.filter(x => (x.key || x.url) !== (it.key || it.url));
                            saveState(st); renderAll(s);
                        }
                    }});
                }
                ContextMenu.show(e.clientX, e.clientY, menu);
            });
            list.appendChild(row);
            if (!it.url && !st.durations[it.key]) {
                probeDuration(it, st, d => {
                    if (d && s.win.element.isConnected) renderMain(s);
                });
            }
        });
    }
    function renderNowPlaying(s, main) {
        const st = s.st;
        const c = cur(s);
        main.innerHTML = `
            <div class="wmp-stage">
                <canvas class="wmp-viz"></canvas>
                <div class="wmp-holder" style="position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:#000;"></div>
                <div class="wmp-tracktitle">${c ? esc(c.name) : 'Nothing playing — double-click a track in the library'}</div>
            </div>
            <div class="wmp-queue">
                <div class="wmp-qhead"><span>Now Playing</span><button class="wmp-cbtn wmp-qclear" style="min-width:24px;height:22px;font-size:11px;" title="Clear queue">Clear</button></div>
                <div class="wmp-qlist"></div>
            </div>`;
        const ql = main.querySelector('.wmp-qlist');
        if (!st.queue.length) {
            ql.innerHTML = '<div style="padding:16px;font-size:12px;color:#5b6a84;">Queue is empty.</div>';
        } else {
            st.queue.forEach((it, i) => {
                const r = document.createElement('div');
                r.className = 'wmp-qrow' + (i === st.qi ? ' cur' : '');
                r.innerHTML = `<span style="color:#4db2ff;">${i === st.qi ? '&#9654;' : (i + 1)}</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(it.name)}</span>`;
                r.addEventListener('click', () => playIndex(s, i, { fresh: true }));
                r.addEventListener('contextmenu', e => {
                    e.preventDefault();
                    ContextMenu.show(e.clientX, e.clientY, [
                        { label: 'Remove from queue', action: () => {
                            st.queue.splice(i, 1);
                            if (st.qi >= st.queue.length) st.qi = st.queue.length - 1;
                            if (!st.queue.length) { try { s.media.pause(); } catch (e2) { /* noop */ } }
                            pickOrder(s); saveState(st); renderAll(s);
                        }}
                    ]);
                });
                ql.appendChild(r);
            });
            const curEl = ql.querySelector('.cur');
            if (curEl) curEl.scrollIntoView({ block: 'nearest' });
        }
        main.querySelector('.wmp-qclear').addEventListener('click', async () => {
            const ok = await Popup.confirm('Clear queue', 'Remove all items from the Now Playing list?');
            if (ok) {
                try { s.media.pause(); } catch (e) { /* noop */ }
                st.queue = []; st.qi = -1; st.order = [];
                try { s.media.removeAttribute('src'); s.media.load(); } catch (e2) { /* noop */ }
                saveState(st); renderAll(s);
            }
        });
        placeMedia(s);
        startViz(s);
    }
    function placeMedia(s) {
        const holder = s.win.element.querySelector('.wmp-holder');
        const canvas = s.win.element.querySelector('.wmp-viz');
        const c = cur(s);
        const isVid = c && c.kind === 'video' && s.st.view === 'nowplaying';
        if (holder) {
            holder.style.display = isVid ? 'flex' : 'none';
            if (isVid && s.media.parentElement !== holder) {
                holder.appendChild(s.media);
                s.media.style.cssText = 'max-width:100%;max-height:100%;outline:none;background:#000;';
                s.media.controls = false;
            }
        }
        if (canvas) canvas.style.display = isVid ? 'none' : 'block';
    }
    function renderTransport(s) {
        const st = s.st;
        const q = sel => s.win.element.querySelector(sel);
        const playing = cur(s) && !s.media.paused;
        q('.wmp-play').innerHTML = playing ? '&#10074;&#10074;' : '&#9654;';
        q('.wmp-shuffle').classList.toggle('on', st.shuffle);
        const rep = q('.wmp-repeat');
        rep.classList.toggle('on', st.repeat !== 'off');
        rep.innerHTML = st.repeat === 'one' ? '&#8635;<small>1</small>' : '&#8635;';
        q('.wmp-speed').textContent = String(st.speed).replace('.0', '') + 'x';
        q('.wmp-vizbtn').classList.toggle('on', st.view === 'nowplaying');
        q('.wmp-viewbtn').innerHTML = st.view === 'nowplaying' ? '&#9782;' : '&#9783;';
        q('.wmp-volr').value = Math.round(st.muted ? 0 : st.volume * 100);
        q('.wmp-mute').innerHTML = (st.muted || st.volume === 0) ? '&#128263;' : '&#128266;';
        const dur = Number.isFinite(s.media.duration) ? s.media.duration : 0;
        const t = Number.isFinite(s.media.currentTime) ? s.media.currentTime : 0;
        q('.wmp-tcur').textContent = fmtTime(t);
        q('.wmp-tdur').textContent = fmtTime(dur);
        const pct = dur > 0 ? (t / dur) * 100 : 0;
        q('.wmp-seek .fl').style.width = pct + '%';
        q('.wmp-seek .kn').style.left = pct + '%';
        s.win.element.querySelector('.wmp').classList.toggle('mini', !!st.mini);
        if (!cur(s)) setStatus(s, st.queue.length ? 'Paused' : 'Ready');
    }
    function renderAll(s) {
        if (!s.win.element.isConnected) return;
        renderSide(s);
        renderMain(s);
        renderTransport(s);
    }
    function enqueueAndPlay(s, it) {
        const st = s.st;
        const at = st.queue.findIndex(x => (x.key || x.url) === (it.key || it.url));
        if (at >= 0) {
            playIndex(s, at);
            return;
        }
        st.queue.push(it);
        pickOrder(s);
        playIndex(s, st.queue.length - 1, { fresh: true });
    }

    // ---------------- visualization ----------------
    function startViz(s) {
        cancelAnimationFrame(s.raf);
        const canvas = s.win.element.querySelector('.wmp-viz');
        if (!canvas) return;
        const ctx2d = canvas.getContext('2d');
        const draw = () => {
            if (!s.win.element.isConnected) return;
            const cv = s.win.element.querySelector('.wmp-viz');
            if (!cv || s.st.view !== 'nowplaying' || (cur(s) && cur(s).kind === 'video')) return;
            s.raf = requestAnimationFrame(draw);
            const w = cv.clientWidth || 600, h = cv.clientHeight || 300;
            if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
            const playing = cur(s) && !s.media.paused;
            let vals = null;
            if (s.analyser && playing) {
                s.analyser.getByteFrequencyData(s.freqData);
                vals = s.freqData;
            }
            const t = performance.now() / 1000;
            if (s.st.viz === 'wave') drawWave(ctx2d, w, h, vals, t, playing);
            else if (s.st.viz === 'orbs') drawOrbs(ctx2d, w, h, vals, t, playing);
            else drawBars(ctx2d, w, h, vals, t, playing);
        };
        s.raf = requestAnimationFrame(draw);
    }
    function energy(vals, from, to) {
        if (!vals) return 0;
        let sum = 0, n = 0;
        for (let i = from; i < Math.min(to, vals.length); i++) { sum += vals[i]; n++; }
        return n ? sum / n / 255 : 0;
    }
    function drawBars(c, w, h, vals, t, playing) {
        const g = c.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#02040a'); g.addColorStop(1, '#0a1626');
        c.fillStyle = g; c.fillRect(0, 0, w, h);
        const N = 48, bw = w / N;
        for (let i = 0; i < N; i++) {
            let v;
            if (vals) v = vals[Math.floor(i / N * vals.length * 0.7)] / 255;
            else v = playing ? 0.08 : 0.03 + 0.02 * Math.sin(t * 1.5 + i * 0.4);
            const bh = Math.max(3, v * h * 0.9);
            const x = i * bw + 1, y = h - bh;
            const bg = c.createLinearGradient(0, y, 0, h);
            bg.addColorStop(0, '#bfe4ff'); bg.addColorStop(0.4, '#4db2ff'); bg.addColorStop(1, '#0b3a75');
            c.fillStyle = bg;
            c.fillRect(x, y, bw - 2, bh);
        }
    }
    function drawWave(c, w, h, vals, t, playing) {
        c.fillStyle = '#02040a'; c.fillRect(0, 0, w, h);
        c.lineWidth = 2.5;
        for (let k = 0; k < 3; k++) {
            c.strokeStyle = ['#4db2ff', '#ff9d45', '#7bff9e'][k];
            c.globalAlpha = 0.85 - k * 0.22;
            c.beginPath();
            for (let x = 0; x <= w; x += 4) {
                let y = h / 2;
                if (vals) {
                    const v = vals[Math.floor(x / w * vals.length * 0.7)] / 255;
                    y += (v - 0.5) * h * 0.7;
                } else {
                    y += Math.sin(x * 0.02 + t * (2 + k) + k * 2) * (playing ? 26 : 8);
                }
                if (x === 0) c.moveTo(x, y); else c.lineTo(x, y);
            }
            c.stroke();
        }
        c.globalAlpha = 1;
    }
    function drawOrbs(c, w, h, vals, t, playing) {
        c.fillStyle = '#02040a'; c.fillRect(0, 0, w, h);
        const e = vals ? (energy(vals, 2, 12) * 0.8 + energy(vals, 12, 40) * 0.5) : (playing ? 0.25 : 0.08);
        const cx = w / 2, cy = h / 2;
        for (let k = 4; k >= 1; k--) {
            const r = (Math.min(w, h) * 0.08) * k * (1 + e * 1.6) + 8 * Math.sin(t * 1.3 + k);
            if (r <= 0) continue;
            const g = c.createRadialGradient(cx, cy, 0, cx, cy, r);
            const cols = [['#4db2ff', 0.5], ['#ff9d45', 0.35], ['#7bff9e', 0.3], ['#b388ff', 0.28]][k - 1];
            g.addColorStop(0, cols[0]);
            g.addColorStop(1, 'rgba(0,0,0,0)');
            c.globalAlpha = cols[1] + e * 0.5;
            c.fillStyle = g;
            c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
        }
        c.globalAlpha = 1;
    }

    // ---------------- wiring ----------------
    function bindSession(s) {
        const st = s.st;
        const el = s.win.element;
        const q = sel => el.querySelector(sel);

        s.lib = scanLibrary();
        if (!st.queue.length) { st.qi = -1; }
        st.queue = resolveItems(st, st.queue.map(it => ({ key: it.key, url: it.url, name: it.name, kind: it.kind })));
        if (st.queue.length && (st.qi < 0 || st.qi >= st.queue.length)) st.qi = 0;
        pickOrder(s);

        // seed demo tracks on first run when the library is empty
        if (!s.lib.length) {
            seedSampleMusic(st, made => {
                if (!made || !s.win.element.isConnected) return;
                s.lib = scanLibrary();
                renderAll(s);
                setStatus(s, 'Sample music added to your Music folder');
            });
        }

        s.media.volume = st.volume;
        s.media.muted = st.muted;
        s.media.playbackRate = st.speed;

        s.media.ontimeupdate = () => {
            renderTransport(s);
            const c = cur(s);
            const now = Date.now();
            if (c && c.key && Number.isFinite(s.media.currentTime) && now - s.lastSave > 5000) {
                s.lastSave = now;
                st.resume[c.key] = Math.floor(s.media.currentTime);
                saveState(st);
            }
        };
        s.media.onplay = () => { s.errStreak = 0; s.errorShown = false; renderTransport(s); };
        s.media.onpause = () => {
            renderTransport(s);
            const c = cur(s);
            if (c && c.key && Number.isFinite(s.media.currentTime)) {
                st.resume[c.key] = Math.floor(s.media.currentTime);
                saveState(st);
            }
        };
        s.media.onended = () => {
            if (s.dead || !s.win.element.isConnected) return;
            const c = cur(s);
            if (c && c.key) delete st.resume[c.key];
            if (st.repeat === 'one' && cur(s)) {
                try { s.media.currentTime = 0; } catch (e) { /* noop */ }
                const pr = s.media.play();
                if (pr && pr.catch) pr.catch(() => { /* noop */ });
                return;
            }
            playNext(s, 1);
        };
        s.media.onerror = () => {
            // Dead/detached sessions must never auto-advance: clearing src
            // during teardown fires error asynchronously, which used to
            // resurrect playback after the window was closed.
            if (s.dead || !s.win.element.isConnected || !s.media.src) return;
            s.errStreak++;
            const c = cur(s);
            // A full pass over the queue with nothing playable: stop instead
            // of looping errors forever (Stop previously couldn't win).
            if (s.errStreak > s.st.queue.length) {
                s.errStreak = 0;
                try { s.media.pause(); } catch (e) { /* noop */ }
                Popup.error('Playback failed', 'None of the queued files could be played. They may be corrupt or unsupported.');
                renderTransport(s);
                return;
            }
            if (!s.errorShown) {
                s.errorShown = true;
                Popup.error('Playback failed', `Could not play "${c ? c.name : 'this file'}". It may be corrupt or an unsupported format. Skipping.`);
            }
            playNext(s, 1);
        };

        // transport
        q('.wmp-play').addEventListener('click', () => togglePlay(s));
        q('.wmp-stop').addEventListener('click', () => {
            try { s.media.pause(); s.media.currentTime = 0; } catch (e) { /* noop */ }
            renderTransport(s);
        });
        q('.wmp-next').addEventListener('click', () => playNext(s, 1));
        q('.wmp-prev').addEventListener('click', () => {
            if (s.media.currentTime > 4) {
                try { s.media.currentTime = 0; } catch (e) { /* noop */ }
            } else playNext(s, -1);
        });
        q('.wmp-shuffle').addEventListener('click', () => {
            st.shuffle = !st.shuffle; pickOrder(s); renderTransport(s); saveState(st);
        });
        q('.wmp-repeat').addEventListener('click', () => {
            st.repeat = st.repeat === 'off' ? 'all' : st.repeat === 'all' ? 'one' : 'off';
            renderTransport(s); saveState(st);
        });
        const speeds = [0.5, 1, 1.25, 1.5, 2];
        q('.wmp-speed').addEventListener('click', () => {
            st.speed = speeds[(speeds.indexOf(st.speed) + 1) % speeds.length];
            s.media.playbackRate = st.speed;
            renderTransport(s); saveState(st);
        });
        q('.wmp-vizbtn').addEventListener('click', () => {
            const modes = ['bars', 'wave', 'orbs'];
            st.viz = modes[(modes.indexOf(st.viz) + 1) % modes.length];
            renderTransport(s); saveState(st);
            setStatus(s, 'Visualization: ' + st.viz);
        });
        q('.wmp-viewbtn').addEventListener('click', () => {
            st.view = st.view === 'nowplaying' ? 'library' : 'nowplaying';
            renderAll(s); saveState(st);
        });
        q('.wmp-minibtn').addEventListener('click', () => {
            st.mini = !st.mini; renderTransport(s); saveState(st);
        });
        q('.wmp-mute').addEventListener('click', () => {
            st.muted = !st.muted; s.media.muted = st.muted;
            renderTransport(s); saveState(st);
        });
        q('.wmp-volr').addEventListener('input', e => {
            st.volume = parseInt(e.target.value, 10) / 100;
            st.muted = st.volume === 0 ? st.muted : false;
            s.media.volume = st.volume;
            s.media.muted = st.muted;
            renderTransport(s); saveState(st);
        });
        const seek = q('.wmp-seek');
        seek.addEventListener('click', e => {
            const dur = s.media.duration;
            if (!Number.isFinite(dur) || dur <= 0) return;
            const r = seek.getBoundingClientRect();
            const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
            try { s.media.currentTime = ratio * dur; } catch (err) { /* noop */ }
            renderTransport(s);
        });

        // top bar
        q('.wmp-q').value = st.search || '';
        q('.wmp-q').addEventListener('input', e => {
            st.search = e.target.value;
            if (st.view !== 'library') st.view = 'library';
            renderMain(s);
        });
        el.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => {
            setStatus(s, b.dataset.nav === 'back' ? 'Back' : 'Forward');
        }));
        el.querySelectorAll('[data-menu]').forEach(b => b.addEventListener('click', async () => {
            const m = b.dataset.menu;
            if (m === 'playurl') {
                const url = await Popup.textbox('Play URL', 'Stream audio or video from a web address:', { placeholder: 'https://…' });
                if (!url || !/^https?:\/\//i.test(url.trim())) return;
                const clean = url.trim();
                const ext = extOf(clean.split('?')[0]);
                const kind = kindOf(ext) || 'audio';
                enqueueAndPlay(s, { key: 'url:' + clean, name: clean.split('/').pop() || clean, kind, url: clean, src: clean });
            } else if (m === 'newpl') {
                const name = await Popup.textbox('Create playlist', 'Playlist name:', { placeholder: 'My playlist' });
                if (name && name.trim()) {
                    st.playlists.push({ name: name.trim().slice(0, 60), items: [] });
                    st.section = 'pl:' + name.trim().slice(0, 60);
                    st.view = 'library';
                    renderAll(s); saveState(s);
                }
            } else if (m === 'organize') {
                const pick = await Popup.pick('Organize', 'Library options:', ['Rescan library', 'Create sample music', 'Clear resume data']);
                const label = pick && (pick.label || pick);
                if (label === 'Rescan library') {
                    s.lib = scanLibrary();
                    st.queue = resolveItems(st, st.queue.map(it => ({ key: it.key, url: it.url, name: it.name, kind: it.kind })));
                    renderAll(s); setStatus(s, `Library: ${s.lib.length} files`);
                } else if (label === 'Create sample music') {
                    st.seeded = false;
                    seedSampleMusic(st, made => {
                        s.lib = scanLibrary(); renderAll(s);
                        setStatus(s, made ? 'Sample music added' : 'Sample music is already there');
                    });
                } else if (label === 'Clear resume data') {
                    st.resume = {}; saveState(st);
                    setStatus(s, 'Resume data cleared');
                }
            }
        }));

        // keyboard shortcuts
        el.addEventListener('keydown', e => {
            const tag = (document.activeElement && document.activeElement.tagName) || '';
            if (/INPUT|SELECT|TEXTAREA/.test(tag)) return;
            if (e.code === 'Space') { e.preventDefault(); togglePlay(s); }
            else if (e.key === 'ArrowRight') { try { s.media.currentTime += 5; } catch (err) { /* noop */ } }
            else if (e.key === 'ArrowLeft') { try { s.media.currentTime -= 5; } catch (err) { /* noop */ } }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setVol(s, st.volume + 0.05); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); setVol(s, st.volume - 0.05); }
            else if (e.key === 'n' || e.key === 'N') playNext(s, 1);
            else if (e.key === 'p' || e.key === 'P') playNext(s, -1);
            else if (e.key === 'm' || e.key === 'M') {
                st.muted = !st.muted; s.media.muted = st.muted; renderTransport(s); saveState(st);
            }
            else if (e.key === 's' || e.key === 'S') {
                st.shuffle = !st.shuffle; pickOrder(s); renderTransport(s); saveState(st);
            }
            else if (e.key === 'r' || e.key === 'R') {
                st.repeat = st.repeat === 'off' ? 'all' : st.repeat === 'all' ? 'one' : 'off';
                renderTransport(s); saveState(st);
            }
        });

        // Instant teardown when the window closes (MutationObserver) with the
        // interval as a fallback. teardown() is idempotent via s.dead.
        const mo = new MutationObserver(() => {
            if (!s.win.element.isConnected) {
                mo.disconnect();
                clearInterval(iv);
                teardown(s);
            }
        });
        const wc = document.getElementById('windows-container');
        if (wc) mo.observe(wc, { childList: true });
        const iv = setInterval(() => {
            if (!s.win.element.isConnected) {
                mo.disconnect();
                clearInterval(iv);
                teardown(s);
            }
        }, 2000);

        renderAll(s);
    }
    // teardown() MUST null the media handlers before pausing/clearing:
    // assigning src='' fires an async error event, which previously slipped
    // through onerror -> playNext -> play() and resurrected audio after close.
    function teardown(s) {
        if (s.dead) return;
        s.dead = true;
        cancelAnimationFrame(s.raf);
        try {
            s.media.onerror = null;
            s.media.onended = null;
            s.media.onplay = null;
            s.media.onpause = null;
            s.media.ontimeupdate = null;
            s.media.onloadedmetadata = null;
            s.media.pause();
            s.media.removeAttribute('src');
            s.media.load();
        } catch (e) { /* noop */ }
        if (s.actx) {
            try { s.actx.close().catch(() => { /* noop */ }); } catch (e) { /* noop */ }
            s.actx = null;
        }
    }
    function setVol(s, v) {
        const st = s.st;
        st.volume = Math.min(1, Math.max(0, v));
        if (st.volume > 0) st.muted = false;
        s.media.volume = st.volume;
        s.media.muted = st.muted;
        renderTransport(s); saveState(st);
    }

    function open(path, content) {
        const name = path[path.length - 1];
        const ext = extOf(name);
        const kind = kindOf(ext);
        if (!kind) {
            Popup.error('Media Player', `"${name}" is not a supported audio or video file.`);
            return;
        }
        const st = loadState();
        const item = { key: path.join('/'), name: name.replace(/\.[^.]+$/, ''), src: content, kind };
        const win = openWindow(st);
        const s = win._mp;
        s.lib = scanLibrary();
        if (!s.lib.some(x => x.key === item.key)) s.lib.unshift(item);
        enqueueAndPlay(s, item);
        if (kind === 'video') { s.st.view = 'nowplaying'; renderAll(s); }
    }

    function openWindow(st) {
        const icon = AppIcons.get(APP_ID);
        const accent = SystemConfig.get('accentColor') || '#4db2ff';
        const win = WindowManager.createWindow(APP_ID, 'Media Player', icon, shellHtml(accent), {
            width: 960, height: 620, minWidth: 720, minHeight: 480
        });
        const s = newSession(win, st);
        win._mp = s;
        bindSession(s);
        return win;
    }

    function launch() {
        const st = loadState();
        openWindow(st);
    }

    return { launch, open };
})();

export default MediaPlayer;
