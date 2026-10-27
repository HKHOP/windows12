// Camera — webcam stills saved to Pictures.
//
// The stream never leaves the page: getUserMedia is gated by the OS's
// "camera" permission (Settings > Apps), and each shot is written straight
// into the user's Pictures folder as a JPEG. Nothing is uploaded.
import { createApp, Apps, FileSystem } from '../../sdk/index.js';
import AppIcons from '../../modules/appIcons.js';
import Users from '../../modules/users.js';

const PICTURES = () => Users.home(['Pictures']);

function revoke(url) {
    try { URL.revokeObjectURL(url); } catch { /* already gone */ }
}

function pad(n) {
    return String(n).padStart(2, '0');
}

// "Photo 2026-10-27 14.32.05.jpg" — Windows Camera's naming.
function stampName() {
    const d = new Date();
    return `Photo ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `
        + `${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
}

function uniqueName(dir, base, ext) {
    let name = `${base}.${ext}`;
    let i = 1;
    while (FileSystem.exists([...dir, name])) name = `${base} (${i++}).${ext}`;
    return name;
}

function ensurePictures() {
    const dir = PICTURES();
    try {
        if (!FileSystem.exists(dir)) FileSystem.createFolder(Users.home(), 'Pictures');
    } catch { /* the write below reports the failure */ }
    return dir;
}

function getContent() {
    return `
        <div style="display:flex;flex-direction:column;height:100%;background:#0b0b0d;color:#fff;font-family:'Segoe UI',sans-serif;">
            <div class="cam-stage" tabindex="0" style="flex:1;position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#000;min-height:0;outline:none;">
                <video class="cam-video" autoplay playsinline muted style="width:100%;height:100%;object-fit:contain;background:#000;"></video>
                <div class="cam-grid" style="position:absolute;inset:0;pointer-events:none;display:none;">
                    <div style="position:absolute;left:33.33%;top:0;bottom:0;width:1px;background:rgba(255,255,255,0.35);"></div>
                    <div style="position:absolute;left:66.66%;top:0;bottom:0;width:1px;background:rgba(255,255,255,0.35);"></div>
                    <div style="position:absolute;top:33.33%;left:0;right:0;height:1px;background:rgba(255,255,255,0.35);"></div>
                    <div style="position:absolute;top:66.66%;left:0;right:0;height:1px;background:rgba(255,255,255,0.35);"></div>
                </div>
                <div class="cam-count" style="position:absolute;inset:0;display:none;align-items:center;justify-content:center;font-size:96px;font-weight:300;text-shadow:0 4px 24px rgba(0,0,0,0.7);pointer-events:none;"></div>
                <div class="cam-message" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:32px;text-align:center;background:rgba(0,0,0,0.78);"></div>
                <div class="cam-flash" style="position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;transition:opacity 180ms ease-out;"></div>
            </div>
            <div class="cam-film" style="display:none;gap:8px;padding:8px 12px 0;overflow-x:auto;background:#111114;"></div>
            <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:#17171a;border-top:1px solid #2a2a30;">
                <select class="cam-device" title="Camera" style="display:none;max-width:190px;background:#242428;border:1px solid #3a3a42;border-radius:6px;color:#fff;padding:6px 8px;font-size:12px;"></select>
                <select class="cam-timer" title="Timer" style="background:#242428;border:1px solid #3a3a42;border-radius:6px;color:#fff;padding:6px 8px;font-size:12px;">
                    <option value="0">No timer</option>
                    <option value="3">3 seconds</option>
                    <option value="10">10 seconds</option>
                </select>
                <button class="cam-mirror" title="Mirror preview" style="background:#242428;border:1px solid #3a3a42;border-radius:6px;color:#cfcfd6;padding:6px 10px;font-size:12px;cursor:pointer;">Mirror</button>
                <button class="cam-grid-btn" title="Rule-of-thirds grid" style="background:#242428;border:1px solid #3a3a42;border-radius:6px;color:#cfcfd6;padding:6px 10px;font-size:12px;cursor:pointer;">Grid</button>
                <div style="flex:1;"></div>
                <span class="cam-info" style="font-size:11px;color:#8b8b96;"></span>
                <button class="cam-shutter" title="Take a photo" style="width:46px;height:46px;border-radius:50%;border:3px solid #fff;background:rgba(255,255,255,0.18);cursor:pointer;transition:transform 120ms;"></button>
            </div>
        </div>`;
}

function launch() {
    const app = createApp({ id: 'camera', name: 'Camera' });
    const win = app.window.create({
        title: 'Camera',
        icon: app.icon(),
        content: getContent(),
        width: 900,
        height: 640,
        minWidth: 460,
        minHeight: 380
    });
    const el = win.element;
    const stage = el.querySelector('.cam-stage');
    const video = el.querySelector('.cam-video');
    const grid = el.querySelector('.cam-grid');
    const message = el.querySelector('.cam-message');
    const flash = el.querySelector('.cam-flash');
    const countEl = el.querySelector('.cam-count');
    const film = el.querySelector('.cam-film');
    const deviceSel = el.querySelector('.cam-device');
    const timerSel = el.querySelector('.cam-timer');
    const mirrorBtn = el.querySelector('.cam-mirror');
    const gridBtn = el.querySelector('.cam-grid-btn');
    const info = el.querySelector('.cam-info');
    const shutter = el.querySelector('.cam-shutter');

    let stream = null;
    let shots = [];
    let mirrored = false;
    let counting = false;
    let closed = false;

    const setMessage = (html) => {
        message.innerHTML = html;
        message.style.display = 'flex';
    };
    const clearMessage = () => {
        message.innerHTML = '';
        message.style.display = 'none';
    };

    const applyMirror = () => {
        video.style.transform = mirrored ? 'scaleX(-1)' : 'none';
        mirrorBtn.style.color = mirrored ? 'var(--accent-color)' : '#cfcfd6';
        mirrorBtn.style.borderColor = mirrored ? 'var(--accent-color)' : '#3a3a42';
    };

    const stop = () => {
        if (!stream) return;
        stream.getTracks().forEach(t => { try { t.stop(); } catch { /* already gone */ } });
        stream = null;
        video.srcObject = null;
    };

    async function listDevices() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const cams = devices.filter(d => d.kind === 'videoinput');
            if (cams.length <= 1) {
                deviceSel.style.display = 'none';
                return;
            }
            const active = stream && stream.getVideoTracks()[0]
                ? stream.getVideoTracks()[0].getSettings().deviceId
                : null;
            deviceSel.innerHTML = cams.map((d, i) =>
                `<option value="${d.deviceId}" ${d.deviceId === active ? 'selected' : ''}>${d.label || `Camera ${i + 1}`}</option>`
            ).join('');
            deviceSel.style.display = '';
        } catch { /* labels are a nicety */ }
    }

    function describeFailure(err) {
        const code = err && err.code;
        if (code === 'PERMISSION_DENIED') {
            return {
                text: 'Camera access is blocked. Allow the camera for this app in Settings > Apps, then allow the browser prompt.',
                offerSettings: true
            };
        }
        if (code === 'UNSUPPORTED') {
            return { text: (err && err.message) || 'This device has no camera the page can use.' };
        }
        return { text: 'The camera could not be started.' };
    }

    async function start(constraints) {
        if (closed) return;
        stop();
        setMessage('<div style="font-size:13px;color:#cfcfd6;">Starting camera…</div>');
        try {
            stream = await app.media.camera(constraints || { width: { ideal: 1920 }, height: { ideal: 1080 } });
            if (closed) { stop(); return; }
            video.srcObject = stream;
            try { await video.play(); } catch { /* autoplay is muted */ }
            clearMessage();
            const track = stream.getVideoTracks()[0];
            const s = track ? track.getSettings() : {};
            info.textContent = s.width && s.height ? `${s.width}×${s.height}` : '';
            listDevices();
        } catch (err) {
            const d = describeFailure(err);
            setMessage(`
                <div style="font-size:13px;color:#e6e6ea;max-width:420px;line-height:1.5;">${d.text}</div>
                <div style="display:flex;gap:8px;margin-top:4px;">
                    <button class="cam-retry" style="background:var(--accent-color);border:none;border-radius:6px;color:#fff;padding:7px 14px;font-size:12px;cursor:pointer;">Try again</button>
                    ${d.offerSettings ? '<button class="cam-settings" style="background:rgba(255,255,255,0.1);border:1px solid #3a3a42;border-radius:6px;color:#e6e6ea;padding:7px 14px;font-size:12px;cursor:pointer;">Open camera settings</button>' : ''}
                </div>`);
            const retry = message.querySelector('.cam-retry');
            if (retry) retry.addEventListener('click', () => start());
            const openSettings = message.querySelector('.cam-settings');
            if (openSettings) openSettings.addEventListener('click', () => {
                Apps.launch('settings', { page: 'apps' }).catch(() => {});
            });
        }
    }

    function addToFilmstrip(name, path, blob) {
        // Only the newest eight shots stay in the strip; the rest give their
        // object URLs back so a long session does not leak memory.
        shots.slice(0, Math.max(0, shots.length - 7)).forEach(shot => revoke(shot.url));
        shots = shots.slice(-7);
        shots.push({ name, path, blob, url: URL.createObjectURL(blob) });
        film.style.display = 'flex';
        film.innerHTML = '';
        shots.forEach(shot => {
            const img = document.createElement('img');
            img.src = shot.url;
            img.dataset.name = shot.name;
            img.title = shot.name;
            img.style.cssText = 'width:66px;height:50px;object-fit:cover;border-radius:4px;border:1px solid #33333a;cursor:pointer;flex:none;';
            img.addEventListener('click', () => openShot(shot));
            film.appendChild(img);
        });
        film.scrollLeft = film.scrollWidth;
    }

    function openShot(shot) {
        // The viewer owns its own URL, so closing the camera window never
        // blanks a photo that is still open in front of it.
        const url = URL.createObjectURL(shot.blob);
        const viewer = app.window.create({
            title: shot.name,
            icon: app.icon(),
            content: `<div style="display:flex;flex-direction:column;height:100%;background:#0b0b0d;color:#e6e6ea;font-family:'Segoe UI',sans-serif;">
                <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:12px;min-height:0;">
                    <img src="${url}" alt="${shot.name}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:6px;">
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 14px;background:#17171a;border-top:1px solid #2a2a30;font-size:11px;color:#9a9aa5;">
                    <span>${shot.path.join('\\')}</span>
                    <button class="cam-viewer-close" style="background:rgba(255,255,255,0.1);border:1px solid #3a3a42;border-radius:5px;color:#e6e6ea;padding:5px 12px;font-size:12px;cursor:pointer;">Close</button>
                </div>
            </div>`,
            width: 760,
            height: 560
        });
        const closeBtn = viewer.element.querySelector('.cam-viewer-close');
        if (closeBtn) closeBtn.addEventListener('click', () => app.window.close(viewer.id));
        const onViewerClosed = (e) => {
            if (!e.detail || e.detail.id !== viewer.id) return;
            window.removeEventListener('window-closed', onViewerClosed);
            revoke(url);
        };
        window.addEventListener('window-closed', onViewerClosed);
    }

    async function capture() {
        if (!stream) return;
        if (!video.videoWidth || !video.videoHeight) return;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (mirrored) {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0);

        flash.style.transition = 'none';
        flash.style.opacity = '0.85';
        requestAnimationFrame(() => {
            flash.style.transition = 'opacity 240ms ease-out';
            flash.style.opacity = '0';
        });

        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
        if (!blob) {
            app.notify.info('Camera', 'The photo could not be encoded.');
            return;
        }
        const dir = ensurePictures();
        const name = uniqueName(dir, stampName(), 'jpg');
        const ok = await FileSystem.writeBlob(dir, name, blob, 'jpg');
        if (!ok) {
            app.notify.info('Camera', 'Could not save the photo to Pictures.');
            return;
        }
        addToFilmstrip(name, [...dir, name], blob);
    }

    async function shoot() {
        if (counting || !stream) return;
        const seconds = Number(timerSel.value) || 0;
        if (seconds <= 0) { capture(); return; }
        counting = true;
        countEl.style.display = 'flex';
        for (let s = seconds; s > 0; s--) {
            countEl.textContent = String(s);
            await new Promise(r => setTimeout(r, 1000));
            if (closed) return;
        }
        countEl.style.display = 'none';
        counting = false;
        capture();
    }

    shutter.addEventListener('click', shoot);
    // Space shoots, unless focus is on a control (a focused button would
    // otherwise fire its own click on the same key press).
    stage.addEventListener('click', () => stage.focus());
    el.addEventListener('keydown', (e) => {
        if (e.target.closest('button, select, input, textarea')) return;
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            shoot();
        }
    });

    mirrorBtn.addEventListener('click', () => {
        mirrored = !mirrored;
        applyMirror();
    });
    gridBtn.addEventListener('click', () => {
        const on = grid.style.display !== 'none';
        grid.style.display = on ? 'none' : 'block';
        gridBtn.style.color = on ? '#cfcfd6' : 'var(--accent-color)';
        gridBtn.style.borderColor = on ? '#3a3a42' : 'var(--accent-color)';
    });
    deviceSel.addEventListener('change', () => {
        const id = deviceSel.value;
        if (!id) return;
        start({ deviceId: { exact: id }, width: { ideal: 1920 }, height: { ideal: 1080 } });
    });

    const onClosed = (e) => {
        if (!e.detail || e.detail.id !== win.id) return;
        closed = true;
        window.removeEventListener('window-closed', onClosed);
        stop();
        shots.forEach(shot => revoke(shot.url));
        shots = [];
    };
    window.addEventListener('window-closed', onClosed);

    applyMirror();
    start();
    app.shell.activity.trackAppOpen('camera');
}

export default { launch, icon: AppIcons.get('camera') };
