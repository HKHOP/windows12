// QR Studio — generate via qrserver API, scan via BarcodeDetector/camera.
import { createApp } from '../../sdk/index.js';
import AppIcons from '../../modules/appIcons.js';

function loadHist(app) {
    try { const raw = app.files.read('history.json'); if (raw) return JSON.parse(raw).hist || []; } catch { /* empty */ }
    return [];
}
function saveHist(app, h) { try { app.files.write('history.json', JSON.stringify({ hist: h.slice(0, 30) })); } catch { /* ignore */ } }

function launch() {
    const app = createApp({ id: 'qrStudio', name: 'QR Studio' });
    const win = app.window.create({
        title: 'QR Studio', icon: app.icon(),
        content: `<div style="display:flex;flex-direction:column;height:100%;background:#111827;color:#fff;font-family:'Segoe UI',sans-serif;">
            <div style="display:flex;gap:6px;padding:10px;border-bottom:1px solid #374151;">
                <button class="qr-t" data-t="gen" style="flex:1;background:#4b5563;border:none;color:#fff;border-radius:6px;padding:8px;cursor:pointer;font-weight:600;">Generate</button>
                <button class="qr-t" data-t="scan" style="flex:1;background:rgba(255,255,255,.08);border:none;color:#fff;border-radius:6px;padding:8px;cursor:pointer;font-weight:600;">Scan</button>
            </div>
            <div class="qr-body" style="flex:1;overflow:auto;padding:14px;"></div>
        </div>`,
        width: 400, height: 560
    });
    const el = win.element;
    const body = el.querySelector('.qr-body');
    let tab = 'gen';
    let hist = loadHist(app);

    function paintGen() {
        body.innerHTML = `
            <textarea class="qr-text" placeholder="Text or URL…" style="width:100%;height:80px;background:#1f2937;border:1px solid #374151;color:#fff;border-radius:8px;padding:10px;font-size:13px;box-sizing:border-box;resize:vertical;outline:none;"></textarea>
            <div style="display:flex;gap:8px;margin:10px 0;align-items:center;font-size:13px;">
                <label>Size <select class="qr-size" style="background:#1f2937;border:1px solid #374151;color:#fff;border-radius:6px;padding:6px;">
                    <option>200</option><option selected>300</option><option>400</option><option>600</option>
                </select></label>
                <button class="qr-go" style="flex:1;background:#4b5563;border:none;color:#fff;border-radius:8px;padding:9px;cursor:pointer;font-weight:700;">Generate</button>
            </div>
            <div class="qr-img" style="text-align:center;min-height:120px;"></div>
            <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;margin:12px 0 6px;">History</div>
            <div class="qr-hist" style="display:flex;flex-direction:column;gap:4px;"></div>`;
        const drawHist = () => {
            body.querySelector('.qr-hist').innerHTML = hist.length
                ? hist.map((h, i) => `<div style="display:flex;gap:6px;align-items:center;background:rgba(255,255,255,.05);border-radius:6px;padding:6px 9px;font-size:12px;">
                    <span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(h)}</span>
                    <button data-i="${i}" class="qr-re" style="background:none;border:none;color:#9ca3af;cursor:pointer;">Open</button>
                </div>`).join('') : '<div style="color:#6b7280;font-size:12px;">Nothing yet.</div>';
            body.querySelectorAll('.qr-re').forEach(b => b.addEventListener('click', () => {
                body.querySelector('.qr-text').value = hist[Number(b.dataset.i)];
                gen();
            }));
        };
        const gen = () => {
            const text = body.querySelector('.qr-text').value.trim();
            if (!text) return;
            const size = body.querySelector('.qr-size').value;
            const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}`;
            body.querySelector('.qr-img').innerHTML = `<img src="${url}" alt="QR" style="border-radius:8px;background:#fff;padding:8px;max-width:100%;">`;
            hist.unshift(text); hist = hist.slice(0, 30); saveHist(app, hist); drawHist();
        };
        body.querySelector('.qr-go').addEventListener('click', gen);
        drawHist();
    }

    function paintScan() {
        const supported = typeof window.BarcodeDetector !== 'undefined';
        body.innerHTML = `
            <div style="font-size:13px;color:#d1d5db;margin-bottom:8px;">${supported ? 'Scan with camera or upload an image:' : 'This browser has no BarcodeDetector — upload may not decode here. Try Chrome/Edge.'}</div>
            <div style="display:flex;gap:8px;margin-bottom:10px;">
                <button class="qr-cam" ${supported ? '' : 'disabled'} style="flex:1;background:#4b5563;border:none;color:#fff;border-radius:8px;padding:9px;cursor:pointer;font-weight:600;${supported ? '' : 'opacity:.4;'}">Camera scan</button>
                <label style="flex:1;background:rgba(255,255,255,.08);border-radius:8px;padding:9px;cursor:pointer;font-weight:600;text-align:center;font-size:13px;">Upload image<input type="file" accept="image/*" class="qr-file" style="display:none;"></label>
            </div>
            <video class="qr-video" playsinline style="width:100%;border-radius:8px;display:none;background:#000;"></video>
            <canvas class="qr-canvas" style="display:none;"></canvas>
            <div class="qr-out" style="font-size:13px;margin-top:10px;word-break:break-all;"></div>`;
        const out = body.querySelector('.qr-out');
        async function decode(source) {
            try {
                const det = new window.BarcodeDetector({ formats: ['qr_code'] });
                const codes = await det.detect(source);
                if (codes.length) {
                    out.innerHTML = `<div style="background:rgba(74,222,128,.12);border:1px solid rgba(74,222,128,.4);border-radius:8px;padding:10px;">${escapeHtml(codes[0].rawValue)}</div>`;
                    hist.unshift(codes[0].rawValue); hist = hist.slice(0, 30); saveHist(app, hist);
                    try { await app.clipboard.writeText(codes[0].rawValue); out.innerHTML += '<div style="font-size:11px;color:#9ca3af;margin-top:4px;">Copied to clipboard.</div>'; } catch { /* clipboard optional */ }
                } else out.textContent = 'No QR code found in that image.';
            } catch { out.textContent = 'Decoding failed in this browser.'; }
        }
        body.querySelector('.qr-file').addEventListener('change', (e) => {
            const f = e.target.files[0];
            if (!f) return;
            const img = new Image();
            img.onload = () => { decode(img); URL.revokeObjectURL(img.src); };
            img.src = URL.createObjectURL(f);
        });
        const video = body.querySelector('.qr-video');
        let live = false, stream = null;
        body.querySelector('.qr-cam').addEventListener('click', async () => {
            if (live) {
                live = false;
                if (stream) stream.getTracks().forEach(t => t.stop());
                video.style.display = 'none';
                body.querySelector('.qr-cam').textContent = 'Camera scan';
                return;
            }
            try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); }
            catch { out.textContent = 'Camera blocked.'; return; }
            video.srcObject = stream;
            await video.play();
            video.style.display = 'block';
            body.querySelector('.qr-cam').textContent = 'Stop';
            live = true;
            const canvas = body.querySelector('.qr-canvas');
            const tick = async () => {
                if (!live) return;
                if (video.readyState === video.HAVE_ENOUGH_DATA) {
                    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
                    canvas.getContext('2d').drawImage(video, 0, 0);
                    try {
                        const det = new window.BarcodeDetector({ formats: ['qr_code'] });
                        const codes = await det.detect(canvas);
                        if (codes.length && live) {
                            body.querySelector('.qr-cam').click();
                            out.innerHTML = `<div style="background:rgba(74,222,128,.12);border:1px solid rgba(74,222,128,.4);border-radius:8px;padding:10px;">${escapeHtml(codes[0].rawValue)}</div>`;
                            hist.unshift(codes[0].rawValue); hist = hist.slice(0, 30); saveHist(app, hist);
                            return;
                        }
                    } catch { /* keep polling */ }
                }
                setTimeout(tick, 400);
            };
            tick();
        });
        app.lifecycle.onClose(async () => {
            live = false;
            if (stream) stream.getTracks().forEach(t => t.stop());
            return true;
        });
    }

    function paint() {
        el.querySelectorAll('.qr-t').forEach(b => b.style.background = b.dataset.t === tab ? '#4b5563' : 'rgba(255,255,255,.08)');
        if (tab === 'gen') paintGen(); else paintScan();
    }
    el.querySelectorAll('.qr-t').forEach(b => b.addEventListener('click', () => { tab = b.dataset.t; paint(); }));
    paint();
    app.shell.activity.trackAppOpen('qrStudio');
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

export default { launch, icon: AppIcons.get('qrStudio') };
