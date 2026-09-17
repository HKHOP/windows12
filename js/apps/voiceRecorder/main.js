// Voice Recorder — MediaRecorder memos stored as data URLs in sandbox.
import { createApp } from '../../sdk/index.js';
import AppIcons from '../../modules/appIcons.js';

function load(app) {
    try {
        const raw = app.files.read('memos.json');
        if (raw) { const d = JSON.parse(raw); if (Array.isArray(d.memos)) return d; }
    } catch { /* corrupt -> empty */ }
    return { memos: [] };
}
function save(app, d) { app.files.write('memos.json', JSON.stringify(d)); }

function launch() {
    const app = createApp({ id: 'voiceRecorder', name: 'Voice Recorder' });
    let recorder = null, chunks = [], stream = null, recStart = 0, meterTimer = null, audioCtx = null, analyser = null;

    const win = app.window.create({
        title: 'Voice Recorder', icon: app.icon(),
        content: `<div style="display:flex;flex-direction:column;height:100%;background:#17131f;color:#fff;font-family:'Segoe UI',sans-serif;padding:16px;box-sizing:border-box;">
            <div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:10px 0 14px;">
                <button class="vr-rec" style="width:72px;height:72px;border-radius:50%;background:#dc2626;border:4px solid rgba(255,255,255,.15);cursor:pointer;font-size:26px;color:#fff;">●</button>
                <div class="vr-state" style="font-size:13px;color:#bbb;">Tap to record</div>
                <canvas class="vr-meter" width="260" height="36" style="width:260px;height:36px;background:#221c30;border-radius:8px;"></canvas>
            </div>
            <div style="font-size:11px;color:#888;text-transform:uppercase;">Memos</div>
            <div class="vr-list" style="flex:1;overflow:auto;margin-top:6px;display:flex;flex-direction:column;gap:6px;"></div>
        </div>`,
        width: 340, height: 520
    });
    const el = win.element;
    const recBtn = el.querySelector('.vr-rec');
    const state = el.querySelector('.vr-state');
    const meter = el.querySelector('.vr-meter');
    const mctx = meter.getContext('2d');

    function drawMeter(level) {
        mctx.clearRect(0, 0, 260, 36);
        const bars = 32;
        for (let i = 0; i < bars; i++) {
            const on = (i / bars) < level;
            mctx.fillStyle = on ? (i > bars * 0.8 ? '#f87171' : '#a78bfa') : '#3b3350';
            mctx.fillRect(i * 8 + 2, 6, 5, 24);
        }
    }
    drawMeter(0);

    function paint() {
        const d = load(app);
        el.querySelector('.vr-list').innerHTML = d.memos.length ? d.memos.map(m =>
            `<div data-id="${m.id}" style="background:rgba(255,255,255,.06);border-radius:8px;padding:8px 10px;">
                <div style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(m.name)}</div>
                <div style="font-size:11px;color:#888;">${new Date(m.created).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${m.secs}s</div>
                <div style="display:flex;gap:6px;margin-top:6px;">
                    <button class="vr-play" style="flex:1;background:#7c3aed;border:none;color:#fff;border-radius:5px;padding:5px;cursor:pointer;font-size:12px;">Play</button>
                    <button class="vr-ren" style="background:rgba(255,255,255,.1);border:none;color:#fff;border-radius:5px;padding:5px 9px;cursor:pointer;font-size:12px;">Rename</button>
                    <button class="vr-del" style="background:rgba(255,255,255,.1);border:none;color:#f87171;border-radius:5px;padding:5px 9px;cursor:pointer;font-size:12px;">Delete</button>
                </div>
                <audio class="vr-audio" style="width:100%;margin-top:6px;display:none;" controls src="${m.dataUrl}"></audio>
            </div>`).join('')
            : '<div style="color:#666;font-size:13px;text-align:center;margin-top:20px;">No memos yet.</div>';
        el.querySelectorAll('.vr-list [data-id]').forEach(card => {
            const id = Number(card.dataset.id);
            card.querySelector('.vr-play').addEventListener('click', () => {
                const a = card.querySelector('.vr-audio');
                a.style.display = a.style.display === 'none' ? 'block' : 'none';
                if (a.style.display === 'block') a.play(); else a.pause();
            });
            card.querySelector('.vr-ren').addEventListener('click', async () => {
                const dd = load(app); const m = dd.memos.find(x => x.id === id);
                const name = await app.dialogs.text('Rename memo', 'Name:', { value: m ? m.name : '' });
                if (name && name.trim() && m) { m.name = name.trim(); save(app, dd); paint(); }
            });
            card.querySelector('.vr-del').addEventListener('click', async () => {
                if (await app.dialogs.confirm('Delete memo', 'Delete this recording?')) {
                    const dd = load(app); dd.memos = dd.memos.filter(x => x.id !== id); save(app, dd); paint();
                }
            });
        });
    }

    async function startRec() {
        try {
            stream = await app.media.microphone();
        } catch (e) {
            if (e && e.code === 'PERMISSION_DENIED') {
                await app.dialogs.alert('Microphone blocked', 'Voice Recorder needs the microphone permission (revoked?) and the browser device prompt. Check Settings > Apps, then allow the mic and try again.');
            } else {
                await app.dialogs.alert('Microphone unavailable', 'No microphone capture API on this device.');
            }
            return;
        }
        chunks = [];
        recorder = new MediaRecorder(stream);
        recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
        recorder.onstop = () => {
            clearInterval(meterTimer);
            if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null; }
            drawMeter(0);
            const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
            const secs = Math.round((Date.now() - recStart) / 1000);
            const rd = new FileReader();
            rd.onload = () => {
                try {
                    const dd = load(app);
                    dd.memos.unshift({ id: Date.now(), name: `Memo ${dd.memos.length + 1}`, created: Date.now(), secs, dataUrl: rd.result });
                    save(app, dd); paint();
                    app.notify.info('Voice Recorder', 'Memo saved.');
                } catch {
                    app.dialogs.alert('Storage full', 'Memo is too large for the virtual filesystem and was discarded.');
                }
            };
            rd.readAsDataURL(blob);
            stream.getTracks().forEach(t => t.stop());
            stream = null; recorder = null;
            recBtn.textContent = '●'; recBtn.style.background = '#dc2626';
            state.textContent = 'Tap to record';
        };
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const srcNode = audioCtx.createMediaStreamSource(stream);
            analyser = audioCtx.createAnalyser(); analyser.fftSize = 64;
            srcNode.connect(analyser);
            const buf = new Uint8Array(analyser.frequencyBinCount);
            meterTimer = setInterval(() => {
                analyser.getByteFrequencyData(buf);
                const avg = buf.reduce((a, b) => a + b, 0) / buf.length / 255;
                drawMeter(Math.min(1, avg * 2.2));
                state.textContent = `Recording… ${Math.round((Date.now() - recStart) / 1000)}s — tap to stop`;
            }, 150);
        } catch { /* meter optional */ }
        recStart = Date.now();
        recorder.start();
        recBtn.textContent = '■'; recBtn.style.background = '#7c3aed';
        state.textContent = 'Recording… tap to stop';
    }

    recBtn.addEventListener('click', () => {
        if (recorder) recorder.stop();
        else startRec();
    });
    app.lifecycle.onClose(async () => {
        if (recorder) recorder.stop();
        return true;
    });
    paint();
    app.shell.activity.trackAppOpen('voiceRecorder');
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function open() { launch(); }

export default { launch, open, icon: AppIcons.get('voiceRecorder') };
