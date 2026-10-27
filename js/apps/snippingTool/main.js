// Snipping Tool — capture the screen, keep a region, annotate it, save or copy.
//
// Screen capture uses the browser's own getDisplayMedia picker, so the user
// always chooses what is shared (browser tabs, a window or the whole screen).
// The video stream is stopped the moment a frame is grabbed; nothing is
// recorded or uploaded. Desktop browsers only — iOS has no getDisplayMedia,
// and the app says so instead of pretending.
import { createApp, FileSystem } from '../../sdk/index.js';
import AppIcons from '../../modules/appIcons.js';
import Users from '../../modules/users.js';
import Scaling from '../../modules/scaling.js';

const PICTURES = () => Users.home(['Pictures']);
const RED = '#f43f5e';
const HIGHLIGHT = 'rgba(250, 204, 21, 0.38)';

function pad(n) {
    return String(n).padStart(2, '0');
}

function stampName() {
    const d = new Date();
    return `Snip ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
}

function getContent() {
    const btn = 'background:rgba(255,255,255,0.08);border:1px solid #35394a;border-radius:5px;color:#e6e6ea;padding:6px 10px;font-size:12px;cursor:pointer;';
    return `
        <div class="sn-root" style="display:flex;flex-direction:column;height:100%;background:#15171c;color:#e6e6ea;font-family:'Segoe UI',sans-serif;">
            <div style="display:flex;align-items:center;gap:6px;padding:8px 12px;background:#1c1f26;border-bottom:1px solid #2b2f39;flex-wrap:wrap;">
                <button class="sn-new" style="background:var(--accent-color);border:none;border-radius:5px;color:#fff;padding:6px 14px;font-size:12px;cursor:pointer;">New snip</button>
                <div style="width:1px;height:22px;background:#333846;margin:0 4px;"></div>
                <button class="sn-tool" data-tool="pen" title="Pen" style="${btn}">Pen</button>
                <button class="sn-tool" data-tool="highlight" title="Highlighter" style="${btn}">Highlight</button>
                <button class="sn-tool" data-tool="rect" title="Rectangle" style="${btn}">Rectangle</button>
                <button class="sn-tool" data-tool="arrow" title="Arrow" style="${btn}">Arrow</button>
                <button class="sn-undo" title="Undo the last mark" style="${btn}">Undo</button>
                <button class="sn-clear" title="Remove all marks" style="${btn}">Clear</button>
                <div style="flex:1;"></div>
                <button class="sn-copy" style="${btn}">Copy</button>
                <button class="sn-save" style="${btn}">Save as…</button>
            </div>
            <div class="sn-stage" style="flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:12px;overflow:hidden;background:#0c0e12;position:relative;">
                <canvas class="sn-canvas" style="display:none;max-width:100%;max-height:100%;box-shadow:0 6px 28px rgba(0,0,0,0.5);touch-action:none;cursor:crosshair;"></canvas>
                <div class="sn-empty" style="display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;max-width:420px;">
                    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" style="opacity:0.5;">
                        <rect x="3" y="3" width="18" height="18" rx="3" stroke="#9aa0ad" stroke-width="1.4" stroke-dasharray="3 3"/>
                        <path d="M7 7h4M7 7v4M17 17h-4M17 17v-4" stroke="#e6e6ea" stroke-width="1.6" stroke-linecap="round"/>
                    </svg>
                    <div style="font-size:14px;color:#cfd3db;">Press New snip to capture your screen</div>
                    <div class="sn-help" style="font-size:12px;color:#7b818d;line-height:1.55;">The browser asks which screen, window or tab to share. Then drag a box over the part you want to keep, mark it up and save it to Pictures.</div>
                </div>
            </div>
            <div style="display:flex;justify-content:space-between;gap:12px;padding:6px 12px;background:#1c1f26;border-top:1px solid #2b2f39;font-size:11px;color:#8b909c;">
                <span class="sn-status">Ready</span>
                <span class="sn-size"></span>
            </div>
        </div>`;
}

function launch() {
    const app = createApp({ id: 'snippingTool', name: 'Snipping Tool' });
    const win = app.window.create({
        title: 'Snipping Tool',
        icon: app.icon(),
        content: getContent(),
        width: 900,
        height: 620,
        minWidth: 520,
        minHeight: 360
    });
    const el = win.element;
    const canvas = el.querySelector('.sn-canvas');
    const ctx = canvas.getContext('2d');
    const stage = el.querySelector('.sn-stage');
    const empty = el.querySelector('.sn-empty');
    const status = el.querySelector('.sn-status');
    const sizeLabel = el.querySelector('.sn-size');
    const tools = [...el.querySelectorAll('.sn-tool')];

    let frame = null;         // full capture (canvas)
    let image = null;         // cropped snip (canvas)
    let shapes = [];
    let tool = 'pen';
    let mode = 'idle';        // idle | select | annotate
    let selection = null;     // { x, y, w, h } in CSS px over the fitted frame
    let dragging = null;
    let stream = null;
    let closed = false;

    const say = (text) => { status.textContent = text; };

    function fitScale() {
        const rect = stage.getBoundingClientRect();
        const availW = Math.max(40, rect.width - 24);
        const availH = Math.max(40, rect.height - 24);
        const target = mode === 'select' ? frame : image;
        if (!target) return 1;
        return Math.min(1, availW / target.width, availH / target.height);
    }

    // fitScale measures the stage in visual (screen) pixels because the
    // pointer events and selection rectangle live in that space; the canvas
    // is sized in style px, which the body zoom multiplies, so the fit is
    // divided by the UI zoom before it is written.
    function layout() {
        const target = mode === 'select' ? frame : image;
        if (!target) return;
        const scale = fitScale() / (Scaling.getUiZoom() || 1);
        canvas.style.width = `${Math.round(target.width * scale)}px`;
        canvas.style.height = `${Math.round(target.height * scale)}px`;
    }

    function paintFrame() {
        if (!frame) return;
        if (canvas.width !== frame.width) canvas.width = frame.width;
        if (canvas.height !== frame.height) canvas.height = frame.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(frame, 0, 0);
        layout();
        const rect = canvas.getBoundingClientRect();
        const sx = frame.width / Math.max(1, rect.width);
        const sy = frame.height / Math.max(1, rect.height);
        if (selection && selection.w > 1 && selection.h > 1) {
            const x = Math.max(0, Math.min(canvas.width, selection.x * sx));
            const y = Math.max(0, Math.min(canvas.height, selection.y * sy));
            const w = Math.max(0, Math.min(canvas.width - x, selection.w * sx));
            const h = Math.max(0, Math.min(canvas.height - y, selection.h * sy));
            // Dim only what the selection leaves out, so the kept region
            // stays at full brightness.
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(0, 0, canvas.width, y);
            ctx.fillRect(0, y + h, canvas.width, canvas.height - y - h);
            ctx.fillRect(0, y, x, h);
            ctx.fillRect(x + w, y, canvas.width - x - w, h);
            ctx.strokeStyle = 'rgba(0,0,0,0.5)';
            ctx.lineWidth = Math.max(1, frame.width / 1400);
            ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = Math.max(1, frame.width / 700);
            ctx.strokeRect(x, y, w, h);
        }
        sizeLabel.textContent = selection && selection.w > 2
            ? `${Math.round(selection.w * sx)} × ${Math.round(selection.h * sy)} px`
            : `${frame.width} × ${frame.height} px`;
    }

    // Shared by the on-screen preview and the exported file, so a saved snip
    // is exactly what the editor showed.
    function paintShapes(target, width) {
        const line = Math.max(2, width / 320);
        shapes.forEach(shape => {
            const pts = shape.points;
            target.save();
            target.strokeStyle = shape.tool === 'highlight' ? HIGHLIGHT : RED;
            target.fillStyle = shape.tool === 'highlight' ? HIGHLIGHT : RED;
            target.lineWidth = shape.tool === 'highlight' ? line * 4 : line;
            target.lineCap = 'round';
            target.lineJoin = 'round';
            if (shape.tool === 'pen' || shape.tool === 'highlight') {
                target.beginPath();
                pts.forEach((p, i) => (i ? target.lineTo(p.x, p.y) : target.moveTo(p.x, p.y)));
                target.stroke();
            } else if (shape.tool === 'rect') {
                const a = pts[0];
                const b = pts[pts.length - 1];
                target.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
            } else if (shape.tool === 'arrow') {
                const a = pts[0];
                const b = pts[pts.length - 1];
                const angle = Math.atan2(b.y - a.y, b.x - a.x);
                const head = line * 5;
                target.beginPath();
                target.moveTo(a.x, a.y);
                target.lineTo(b.x, b.y);
                target.moveTo(b.x, b.y);
                target.lineTo(b.x - head * Math.cos(angle - Math.PI / 7), b.y - head * Math.sin(angle - Math.PI / 7));
                target.moveTo(b.x, b.y);
                target.lineTo(b.x - head * Math.cos(angle + Math.PI / 7), b.y - head * Math.sin(angle + Math.PI / 7));
                target.stroke();
            }
            target.restore();
        });
    }

    function paintImage() {
        if (!image) return;
        if (canvas.width !== image.width) canvas.width = image.width;
        if (canvas.height !== image.height) canvas.height = image.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0);
        paintShapes(ctx, image.width);
        layout();
        sizeLabel.textContent = `${image.width} × ${image.height} px`;
    }

    function repaint() {
        if (mode === 'select') paintFrame();
        else if (mode === 'annotate') paintImage();
    }

    let paintReq = 0;
    function scheduleRepaint() {
        if (paintReq) return;
        paintReq = requestAnimationFrame(() => {
            paintReq = 0;
            repaint();
        });
    }

    function setTool(next) {
        tool = next;
        tools.forEach(btn => {
            const on = btn.dataset.tool === next;
            btn.style.borderColor = on ? 'var(--accent-color)' : '#35394a';
            btn.style.color = on ? '#fff' : '#e6e6ea';
            btn.style.background = on ? 'rgba(56,189,248,0.18)' : 'rgba(255,255,255,0.08)';
        });
    }

    function showEmpty(html) {
        mode = 'idle';
        image = null;
        frame = null;
        shapes = [];
        selection = null;
        canvas.style.display = 'none';
        empty.style.display = 'flex';
        empty.innerHTML = html;
        sizeLabel.textContent = '';
    }

    function resetToIdle(html) {
        showEmpty(html || `
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" style="opacity:0.5;">
                <rect x="3" y="3" width="18" height="18" rx="3" stroke="#9aa0ad" stroke-width="1.4" stroke-dasharray="3 3"/>
                <path d="M7 7h4M7 7v4M17 17h-4M17 17v-4" stroke="#e6e6ea" stroke-width="1.6" stroke-linecap="round"/>
            </svg>
            <div style="font-size:14px;color:#cfd3db;">Press New snip to capture your screen</div>
            <div style="font-size:12px;color:#7b818d;line-height:1.55;">The browser asks which screen, window or tab to share. Then drag a box over the part you want to keep, mark it up and save it to Pictures.</div>`);
    }

    async function captureScreen() {
        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
            say('Screen capture is not available in this browser');
            resetToIdle(`
                <svg width="52" height="52" viewBox="0 0 24 24" fill="none" style="opacity:0.5;">
                    <rect x="3" y="4" width="18" height="13" rx="2" stroke="#9aa0ad" stroke-width="1.4"/>
                    <path d="M4 4l16 13" stroke="#f43f5e" stroke-width="1.6" stroke-linecap="round"/>
                </svg>
                <div style="font-size:14px;color:#cfd3db;">Screen capture isn't available here</div>
                <div style="font-size:12px;color:#7b818d;line-height:1.55;">This browser has no <code>getDisplayMedia</code> — that is normal on iOS and most mobile browsers. Open the OS in a desktop browser (Chrome, Edge, Firefox or Safari on a computer) to snip your screen.</div>`);
            return;
        }
        say('Waiting for the share picker…');
        try {
            stream = await navigator.mediaDevices.getDisplayMedia({
                video: { displaySurface: 'monitor' },
                audio: false
            });
        } catch (err) {
            const name = err && err.name;
            if (name === 'NotAllowedError' || name === 'AbortError') {
                say('Capture cancelled');
                resetToIdle();
            } else {
                say('Screen capture failed');
                resetToIdle(`
                    <div style="font-size:14px;color:#cfd3db;">Screen capture could not start</div>
                    <div style="font-size:12px;color:#7b818d;line-height:1.55;">${err && err.message ? err.message : 'The browser refused the capture request.'}</div>`);
            }
            return;
        }
        const track = stream.getVideoTracks()[0];
        if (!track) {
            stopStream();
            say('That share source had no video');
            return;
        }
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        try {
            await video.play();
        } catch {
            stopStream();
            say('The captured video could not be played');
            return;
        }
        await new Promise(resolve => {
            if (video.videoWidth) return resolve();
            video.addEventListener('loadedmetadata', resolve, { once: true });
            setTimeout(resolve, 2500);
        });
        if (closed) { stopStream(); return; }
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) {
            stopStream();
            say('The captured frame was empty');
            return;
        }
        frame = document.createElement('canvas');
        frame.width = w;
        frame.height = h;
        frame.getContext('2d').drawImage(video, 0, 0, w, h);
        stopStream();

        image = null;
        shapes = [];
        selection = null;
        mode = 'select';
        empty.style.display = 'none';
        canvas.style.display = 'block';
        layout();
        paintFrame();
        say('Drag over the part you want to keep');
    }

    function stopStream() {
        if (!stream) return;
        stream.getTracks().forEach(t => { try { t.stop(); } catch { /* already gone */ } });
        stream = null;
    }

    function canvasPoint(e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: Math.min(rect.width, Math.max(0, e.clientX - rect.left)),
            y: Math.min(rect.height, Math.max(0, e.clientY - rect.top)),
            w: rect.width,
            h: rect.height
        };
    }

    canvas.addEventListener('pointerdown', (e) => {
        if (mode === 'select') {
            const p = canvasPoint(e);
            dragging = { start: p };
            selection = { x: p.x, y: p.y, w: 0, h: 0 };
            canvas.setPointerCapture(e.pointerId);
            return;
        }
        if (mode !== 'annotate') return;
        const scale = canvas.width / Math.max(1, canvas.getBoundingClientRect().width);
        const p = canvasPoint(e);
        const pt = { x: p.x * scale, y: p.y * scale };
        dragging = { shape: { tool, points: [pt] } };
        shapes.push(dragging.shape);
        canvas.setPointerCapture(e.pointerId);
        scheduleRepaint();
    });

    canvas.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const p = canvasPoint(e);
        if (mode === 'select') {
            const s = dragging.start;
            selection = {
                x: Math.min(s.x, p.x),
                y: Math.min(s.y, p.y),
                w: Math.abs(p.x - s.x),
                h: Math.abs(p.y - s.y)
            };
            scheduleRepaint();
            return;
        }
        const scale = canvas.width / Math.max(1, canvas.getBoundingClientRect().width);
        const pt = { x: p.x * scale, y: p.y * scale };
        const shape = dragging.shape;
        if (shape.tool === 'pen' || shape.tool === 'highlight') {
            shape.points.push(pt);
        } else {
            shape.points[1] = pt;
        }
        scheduleRepaint();
    });

    const endDrag = (e) => {
        if (!dragging) return;
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
        const wasSelect = mode === 'select';
        dragging = null;
        if (!wasSelect) return;
        if (!selection || selection.w < 6 || selection.h < 6) {
            selection = null;
            paintFrame();
            say('Drag a box at least a few pixels wide');
            return;
        }
        cropSelection();
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    function cropSelection() {
        const rect = canvas.getBoundingClientRect();
        const sx = frame.width / Math.max(1, rect.width);
        const sy = frame.height / Math.max(1, rect.height);
        const x = Math.max(0, Math.round(selection.x * sx));
        const y = Math.max(0, Math.round(selection.y * sy));
        const w = Math.min(frame.width - x, Math.round(selection.w * sx));
        const h = Math.min(frame.height - y, Math.round(selection.h * sy));
        if (w < 2 || h < 2) {
            say('That selection is too small');
            return;
        }
        const cropped = document.createElement('canvas');
        cropped.width = w;
        cropped.height = h;
        cropped.getContext('2d').drawImage(frame, x, y, w, h, 0, 0, w, h);
        image = cropped;
        frame = null;
        shapes = [];
        selection = null;
        mode = 'annotate';
        paintImage();
        say('Annotate the snip, then save or copy it');
    }

    el.querySelector('.sn-new').addEventListener('click', () => {
        if (stream) stopStream();
        captureScreen();
    });

    tools.forEach(btn => btn.addEventListener('click', () => setTool(btn.dataset.tool)));
    el.querySelector('.sn-undo').addEventListener('click', () => {
        if (mode !== 'annotate' || !shapes.length) return;
        shapes.pop();
        paintImage();
    });
    el.querySelector('.sn-clear').addEventListener('click', () => {
        if (mode !== 'annotate' || !shapes.length) return;
        shapes = [];
        paintImage();
        say('Marks cleared');
    });

    function composeBlob() {
        return new Promise(resolve => {
            if (!image) return resolve(null);
            const out = document.createElement('canvas');
            out.width = image.width;
            out.height = image.height;
            const cx = out.getContext('2d');
            cx.drawImage(image, 0, 0);
            paintShapes(cx, image.width);
            out.toBlob(resolve, 'image/png');
        });
    }

    el.querySelector('.sn-save').addEventListener('click', async () => {
        if (!image) { say('Take a snip first'); return; }
        const blob = await composeBlob();
        if (!blob) { say('The snip could not be encoded'); return; }
        const q = await FileSystem.pickSave({
            defaultName: `${stampName()}.png`,
            defaultPath: PICTURES(),
            extensions: [{ value: 'png', label: 'PNG image' }],
            parentApp: 'snippingTool'
        });
        if (!q) return;
        const ok = await FileSystem.writeBlob(q.path, q.fullName, blob, 'png');
        if (!ok) { say('Could not save the snip'); return; }
        say(`Saved ${q.fullName}`);
        app.notify.info('Snipping Tool', `Saved ${q.fullName}.`);
    });

    el.querySelector('.sn-copy').addEventListener('click', async () => {
        if (!image) { say('Take a snip first'); return; }
        if (typeof ClipboardItem === 'undefined' || !navigator.clipboard || !navigator.clipboard.write) {
            say('This browser cannot copy images to the clipboard — use Save as…');
            return;
        }
        const blob = await composeBlob();
        if (!blob) { say('The snip could not be encoded'); return; }
        try {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            say('Snip copied to the clipboard');
        } catch {
            say('The browser blocked the clipboard — use Save as…');
        }
    });

    const ro = new ResizeObserver(() => {
        if (mode === 'select' || mode === 'annotate') layout();
    });
    ro.observe(stage);

    const onClosed = (e) => {
        if (!e.detail || e.detail.id !== win.id) return;
        closed = true;
        window.removeEventListener('window-closed', onClosed);
        ro.disconnect();
        cancelAnimationFrame(paintReq);
        stopStream();
    };
    window.addEventListener('window-closed', onClosed);

    setTool('pen');
    resetToIdle();
    app.shell.activity.trackAppOpen('snippingTool');
}

export default { launch, icon: AppIcons.get('snippingTool') };
