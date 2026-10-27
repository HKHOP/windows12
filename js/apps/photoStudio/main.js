// Photo Studio — crop, rotate and colour-grade an image, then save a copy.
//
// Editing is non-destructive until you save: rotation, flip, brightness,
// contrast, saturation and the colour filters are re-applied from the
// original pixels every time, so Reset always gets the picture back.
// Interactive previews work on a downscaled copy; Save and "Set as
// desktop background" compose at full resolution.
import { createApp, FileSystem } from '../../sdk/index.js';
import AppIcons from '../../modules/appIcons.js';
import Users from '../../modules/users.js';
import FilePicker from '../../modules/filePicker.js';
import SystemConfig from '../../modules/systemConfig.js';

const PICTURES = () => Users.home(['Pictures']);
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'];
const PREVIEW_MAX = 1400;
const SOURCE_MAX = 3200;

const DEFAULTS = { rotation: 0, flipH: false, flipV: false, brightness: 100, contrast: 100, saturation: 100, filter: 'none' };

const FILTERS = [
    { id: 'none', label: 'Original' },
    { id: 'mono', label: 'Mono' },
    { id: 'warm', label: 'Warm' },
    { id: 'cool', label: 'Cool' },
    { id: 'fade', label: 'Fade' }
];

function pad(n) {
    return String(n).padStart(2, '0');
}

function stampName() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
}

function baseName(path) {
    const leaf = path[path.length - 1];
    const dot = leaf.lastIndexOf('.');
    return dot > 0 ? leaf.slice(0, dot) : leaf;
}

function extOf(name) {
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function getContent() {
    const chips = FILTERS.map(f => `<button class="ps-filter" data-filter="${f.id}" style="background:rgba(255,255,255,0.07);border:1px solid #3a3a42;border-radius:14px;color:#e6e6ea;padding:4px 12px;font-size:12px;cursor:pointer;">${f.label}</button>`).join('');
    return `
        <div class="ps-root" style="display:flex;flex-direction:column;height:100%;background:#161619;color:#e6e6ea;font-family:'Segoe UI',sans-serif;">
            <div style="display:flex;align-items:center;gap:6px;padding:8px 12px;background:#1d1d21;border-bottom:1px solid #2c2c33;flex-wrap:wrap;">
                <button class="ps-open" style="background:var(--accent-color);border:none;border-radius:5px;color:#fff;padding:6px 12px;font-size:12px;cursor:pointer;">Open image…</button>
                <button class="ps-save" style="background:rgba(255,255,255,0.08);border:1px solid #3a3a42;border-radius:5px;color:#e6e6ea;padding:6px 12px;font-size:12px;cursor:pointer;">Save a copy</button>
                <button class="ps-wallpaper" style="background:rgba(255,255,255,0.08);border:1px solid #3a3a42;border-radius:5px;color:#e6e6ea;padding:6px 12px;font-size:12px;cursor:pointer;">Set as desktop background</button>
                <div style="width:1px;height:22px;background:#33333a;margin:0 4px;"></div>
                <button class="ps-rotl" title="Rotate left" style="background:rgba(255,255,255,0.08);border:1px solid #3a3a42;border-radius:5px;color:#e6e6ea;padding:6px 10px;font-size:12px;cursor:pointer;">⟲</button>
                <button class="ps-rotr" title="Rotate right" style="background:rgba(255,255,255,0.08);border:1px solid #3a3a42;border-radius:5px;color:#e6e6ea;padding:6px 10px;font-size:12px;cursor:pointer;">⟳</button>
                <button class="ps-fliph" title="Flip horizontally" style="background:rgba(255,255,255,0.08);border:1px solid #3a3a42;border-radius:5px;color:#e6e6ea;padding:6px 10px;font-size:12px;cursor:pointer;">Flip H</button>
                <button class="ps-flipv" title="Flip vertically" style="background:rgba(255,255,255,0.08);border:1px solid #3a3a42;border-radius:5px;color:#e6e6ea;padding:6px 10px;font-size:12px;cursor:pointer;">Flip V</button>
                <button class="ps-crop" style="background:rgba(255,255,255,0.08);border:1px solid #3a3a42;border-radius:5px;color:#e6e6ea;padding:6px 12px;font-size:12px;cursor:pointer;">Crop…</button>
                <button class="ps-uncrop" style="display:none;background:rgba(255,255,255,0.08);border:1px solid #3a3a42;border-radius:5px;color:#e6e6ea;padding:6px 12px;font-size:12px;cursor:pointer;">Undo crop</button>
                <div style="flex:1;"></div>
                <button class="ps-reset" style="background:none;border:none;color:#9a9aa5;padding:6px 8px;font-size:12px;cursor:pointer;">Reset edits</button>
            </div>

            <div style="display:flex;flex:1;min-height:0;">
                <div class="ps-stage-wrap" style="flex:1;min-width:0;display:flex;align-items:center;justify-content:center;padding:16px;overflow:hidden;background:#111114;">
                    <div class="ps-empty" style="display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;color:#8b8b96;padding:24px;">
                        <div style="font-size:15px;color:#cfcfd6;">Open a photo to start editing</div>
                        <div style="font-size:12px;max-width:340px;line-height:1.5;">Drag an image here, or open one from Pictures. Rotation and colour changes never touch the original until you save a copy.</div>
                        <button class="ps-empty-open" style="background:var(--accent-color);border:none;border-radius:5px;color:#fff;padding:7px 14px;font-size:12px;cursor:pointer;">Open image…</button>
                    </div>
                    <div class="ps-stage" style="position:relative;display:none;line-height:0;max-width:100%;max-height:100%;min-width:0;min-height:0;">
                        <canvas class="ps-canvas" style="display:block;box-shadow:0 6px 24px rgba(0,0,0,0.45);"></canvas>
                        <div class="ps-crop-layer" style="position:absolute;inset:0;cursor:crosshair;display:none;">
                            <div class="ps-crop-box" style="position:absolute;border:1px solid #fff;box-shadow:0 0 0 9999px rgba(0,0,0,0.5);display:none;"></div>
                        </div>
                    </div>
                </div>

                <div style="width:212px;flex:none;background:#1b1b1f;border-left:1px solid #2c2c33;padding:12px;overflow-y:auto;display:flex;flex-direction:column;gap:14px;">
                    <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#8b8b96;">Adjust</div>
                    <label style="font-size:12px;color:#cfcfd6;display:flex;flex-direction:column;gap:4px;">Brightness
                        <input class="ps-brightness" type="range" min="40" max="180" value="100" style="accent-color:var(--accent-color);">
                    </label>
                    <label style="font-size:12px;color:#cfcfd6;display:flex;flex-direction:column;gap:4px;">Contrast
                        <input class="ps-contrast" type="range" min="40" max="180" value="100" style="accent-color:var(--accent-color);">
                    </label>
                    <label style="font-size:12px;color:#cfcfd6;display:flex;flex-direction:column;gap:4px;">Saturation
                        <input class="ps-saturation" type="range" min="0" max="200" value="100" style="accent-color:var(--accent-color);">
                    </label>
                    <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#8b8b96;margin-top:4px;">Filter</div>
                    <div class="ps-filters" style="display:flex;flex-wrap:wrap;gap:6px;">${chips}</div>
                    <div class="ps-hint" style="font-size:11px;color:#73737d;line-height:1.5;margin-top:auto;">Large pictures are scaled to ${SOURCE_MAX}px on the long edge when opened, so editing stays responsive.</div>
                </div>
            </div>

            <div style="display:flex;justify-content:space-between;gap:12px;padding:6px 12px;background:#1d1d21;border-top:1px solid #2c2c33;font-size:11px;color:#8b8b96;">
                <span class="ps-status">No image</span>
                <span class="ps-msg"></span>
            </div>
        </div>`;
}

function launch(filePath) {
    const app = createApp({ id: 'photoStudio', name: 'Photo Studio' });
    const win = app.window.create({
        title: 'Photo Studio',
        icon: app.icon(),
        content: getContent(),
        width: 980,
        height: 680,
        minWidth: 560,
        minHeight: 420
    });
    const el = win.element;
    const root = el.querySelector('.ps-root');
    const canvas = el.querySelector('.ps-canvas');
    const ctx = canvas.getContext('2d');
    const stage = el.querySelector('.ps-stage');
    const empty = el.querySelector('.ps-empty');
    const cropLayer = el.querySelector('.ps-crop-layer');
    const cropBox = el.querySelector('.ps-crop-box');
    const status = el.querySelector('.ps-status');
    const msg = el.querySelector('.ps-msg');
    const uncropBtn = el.querySelector('.ps-uncrop');
    const filtersEl = el.querySelector('.ps-filters');
    const sliders = {
        brightness: el.querySelector('.ps-brightness'),
        contrast: el.querySelector('.ps-contrast'),
        saturation: el.querySelector('.ps-saturation')
    };

    let source = null;          // full-size canvas (capped at SOURCE_MAX)
    let previewSource = null;   // downscaled canvas for interactive work
    let state = { ...DEFAULTS };
    let lastCrop = null;
    let fileName = '';
    let cropMode = false;
    let cropRect = null;
    let dragging = false;
    let dragStart = null;
    let frame = 0;

    const say = (text) => { msg.textContent = text || ''; };

    function clamp(v, lo, hi) {
        return v < lo ? lo : (v > hi ? hi : v);
    }

    function copyCanvas(src) {
        const c = document.createElement('canvas');
        c.width = src.width;
        c.height = src.height;
        c.getContext('2d').drawImage(src, 0, 0);
        return c;
    }

    function downscale(src, max) {
        const scale = Math.min(1, max / Math.max(src.width, src.height));
        if (scale === 1) return copyCanvas(src);
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(src.width * scale));
        c.height = Math.max(1, Math.round(src.height * scale));
        const cx = c.getContext('2d');
        cx.imageSmoothingQuality = 'high';
        cx.drawImage(src, 0, 0, c.width, c.height);
        return c;
    }

    // Rotation + flips only: this is also what "Apply crop" bakes in.
    function composeGeometry(base, st) {
        const rot = ((st.rotation % 360) + 360) % 360;
        const swapped = rot === 90 || rot === 270;
        const c = document.createElement('canvas');
        c.width = swapped ? base.height : base.width;
        c.height = swapped ? base.width : base.height;
        const cx = c.getContext('2d');
        cx.translate(c.width / 2, c.height / 2);
        cx.rotate(rot * Math.PI / 180);
        if (st.flipH) cx.scale(-1, 1);
        if (st.flipV) cx.scale(1, -1);
        cx.drawImage(base, -base.width / 2, -base.height / 2);
        return c;
    }

    // Colour grading is pixel work rather than a CSS filter so the saved file
    // is exactly what the preview showed, in every browser.
    function applyAdjustments(c) {
        const st = state;
        const brightness = st.brightness / 100;
        const contrast = st.contrast / 100;
        const saturation = st.saturation / 100;
        if (brightness === 1 && contrast === 1 && saturation === 1 && st.filter === 'none') return c;
        const cx = c.getContext('2d', { willReadFrequently: true });
        let img;
        try { img = cx.getImageData(0, 0, c.width, c.height); } catch { return c; }
        const d = img.data;
        const mono = st.filter === 'mono';
        const warm = st.filter === 'warm';
        const cool = st.filter === 'cool';
        const fade = st.filter === 'fade';
        for (let i = 0; i < d.length; i += 4) {
            let r = d[i];
            let g = d[i + 1];
            let b = d[i + 2];
            if (fade) {
                r = r * 0.9 + 24;
                g = g * 0.9 + 24;
                b = b * 0.9 + 24;
            }
            r *= brightness;
            g *= brightness;
            b *= brightness;
            r = (r - 128) * contrast + 128;
            g = (g - 128) * contrast + 128;
            b = (b - 128) * contrast + 128;
            const luma = 0.299 * r + 0.587 * g + 0.114 * b;
            r = luma + (r - luma) * saturation;
            g = luma + (g - luma) * saturation;
            b = luma + (b - luma) * saturation;
            if (mono) { r = luma; g = luma; b = luma; }
            else if (warm) { r *= 1.07; b *= 0.93; }
            else if (cool) { r *= 0.93; b *= 1.07; }
            d[i] = clamp(r, 0, 255);
            d[i + 1] = clamp(g, 0, 255);
            d[i + 2] = clamp(b, 0, 255);
        }
        cx.putImageData(img, 0, 0);
        return c;
    }

    function compose(base) {
        return applyAdjustments(composeGeometry(base, state));
    }

    function render() {
        if (!previewSource) return;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
            const out = compose(previewSource);
            canvas.width = out.width;
            canvas.height = out.height;
            ctx.drawImage(out, 0, 0);
            stage.style.display = '';
            empty.style.display = 'none';
            fitCanvas();
            if (!cropMode) clearCropRect();
            updateStatus();
        });
    }

    // The canvas is drawn at preview resolution and then fitted to the stage
    // in CSS pixels, so the crop layer (inset:0 over the stage) lines up with
    // what is on screen at any window size.
    function fitCanvas() {
        const wrap = el.querySelector('.ps-stage-wrap');
        const availW = Math.max(80, wrap.clientWidth - 32);
        const availH = Math.max(80, wrap.clientHeight - 32);
        const scale = Math.min(1, availW / Math.max(1, canvas.width), availH / Math.max(1, canvas.height));
        canvas.style.width = `${Math.max(1, Math.round(canvas.width * scale))}px`;
        canvas.style.height = `${Math.max(1, Math.round(canvas.height * scale))}px`;
    }

    function updateStatus() {
        if (!source) {
            status.textContent = 'No image';
            return;
        }
        const rot = ((state.rotation % 360) + 360) % 360;
        const swapped = rot === 90 || rot === 270;
        const w = swapped ? source.height : source.width;
        const h = swapped ? source.width : source.height;
        status.textContent = `${fileName} · ${w}×${h}`;
    }

    function paintFilterChips() {
        filtersEl.querySelectorAll('.ps-filter').forEach(btn => {
            const on = btn.dataset.filter === state.filter;
            btn.style.background = on ? 'var(--accent-color)' : 'rgba(255,255,255,0.07)';
            btn.style.borderColor = on ? 'var(--accent-color)' : '#3a3a42';
            btn.style.color = on ? '#fff' : '#e6e6ea';
        });
    }

    function syncControls() {
        Object.entries(sliders).forEach(([key, input]) => {
            input.value = String(state[key]);
        });
        paintFilterChips();
    }

    // ---------- loading ----------

    async function urlForPath(path) {
        const blob = await FileSystem.readBlob(path);
        if (blob) return { url: URL.createObjectURL(blob), revoke: true };
        const text = FileSystem.readFile(path);
        if (typeof text === 'string' && /^data:image\//i.test(text.trim())) {
            return { url: text.trim(), revoke: false };
        }
        return null;
    }

    function decodeImage(url) {
        return new Promise(resolve => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = url;
        });
    }

    async function openPath(path) {
        if (!Array.isArray(path) || !path.length) return;
        say('Opening…');
        const src = await urlForPath(path);
        if (!src) {
            say('That file is not an image this app can read.');
            return;
        }
        const img = await decodeImage(src.url);
        if (src.revoke) { try { URL.revokeObjectURL(src.url); } catch { /* gone */ } }
        if (!img || !img.naturalWidth) {
            say('The image could not be decoded.');
            return;
        }
        const full = document.createElement('canvas');
        full.width = img.naturalWidth;
        full.height = img.naturalHeight;
        full.getContext('2d').drawImage(img, 0, 0);
        source = downscale(full, SOURCE_MAX);
        previewSource = downscale(source, PREVIEW_MAX);
        fileName = path[path.length - 1];
        state = { ...DEFAULTS };
        lastCrop = null;
        uncropBtn.style.display = 'none';
        syncControls();
        render();
        say('');
    }

    function pickAndOpen() {
        FilePicker.open({
            title: 'Open image',
            confirmLabel: 'Open',
            extensions: IMAGE_EXTS,
            startPath: PICTURES(),
            appId: 'photoStudio'
        }).then(path => {
            if (path) openPath(path);
        }).catch(() => {});
    }

    // ---------- crop ----------

    function clearCropRect() {
        cropRect = null;
        cropBox.style.display = 'none';
    }

    function setCropMode(on) {
        cropMode = on;
        cropLayer.style.display = on ? 'block' : 'none';
        el.querySelector('.ps-crop').textContent = on ? 'Apply crop' : 'Crop…';
        if (!on) clearCropRect();
    }

    function layerPoint(e) {
        const rect = cropLayer.getBoundingClientRect();
        return {
            x: clamp(e.clientX - rect.left, 0, rect.width),
            y: clamp(e.clientY - rect.top, 0, rect.height),
            w: rect.width,
            h: rect.height
        };
    }

    function paintCropBox() {
        if (!cropRect) {
            cropBox.style.display = 'none';
            return;
        }
        cropBox.style.display = 'block';
        cropBox.style.left = `${cropRect.x}px`;
        cropBox.style.top = `${cropRect.y}px`;
        cropBox.style.width = `${cropRect.w}px`;
        cropBox.style.height = `${cropRect.h}px`;
    }

    cropLayer.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        dragging = true;
        dragStart = layerPoint(e);
        cropRect = { x: dragStart.x, y: dragStart.y, w: 0, h: 0 };
        cropLayer.setPointerCapture(e.pointerId);
    });
    cropLayer.addEventListener('pointermove', (e) => {
        if (!dragging || !dragStart) return;
        const p = layerPoint(e);
        const x = Math.min(p.x, dragStart.x);
        const y = Math.min(p.y, dragStart.y);
        cropRect = { x, y, w: Math.abs(p.x - dragStart.x), h: Math.abs(p.y - dragStart.y) };
        paintCropBox();
    });
    cropLayer.addEventListener('pointerup', (e) => {
        dragging = false;
        if (cropLayer.hasPointerCapture(e.pointerId)) cropLayer.releasePointerCapture(e.pointerId);
        if (cropRect && (cropRect.w < 8 || cropRect.h < 8)) clearCropRect();
    });

    function applyCrop() {
        if (!cropRect) {
            say('Drag a rectangle over the picture first.');
            return;
        }
        const composed = composeGeometry(source, state);
        const scaleX = composed.width / cropLayer.getBoundingClientRect().width;
        const scaleY = composed.height / cropLayer.getBoundingClientRect().height;
        const x = Math.round(cropRect.x * scaleX);
        const y = Math.round(cropRect.y * scaleY);
        const w = Math.round(cropRect.w * scaleX);
        const h = Math.round(cropRect.h * scaleY);
        if (w < 2 || h < 2 || x >= composed.width || y >= composed.height) {
            say('That selection is too small.');
            return;
        }
        const cropped = document.createElement('canvas');
        cropped.width = Math.min(w, composed.width - x);
        cropped.height = Math.min(h, composed.height - y);
        cropped.getContext('2d').drawImage(composed, x, y, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);

        lastCrop = { source, rotation: state.rotation, flipH: state.flipH, flipV: state.flipV };
        uncropBtn.style.display = '';
        source = cropped;
        previewSource = downscale(source, PREVIEW_MAX);
        state.rotation = 0;
        state.flipH = false;
        state.flipV = false;
        setCropMode(false);
        render();
        say('');
    }

    // ---------- saving ----------

    function toBlob(c, type, quality) {
        return new Promise(resolve => c.toBlob(resolve, type, quality));
    }

    async function saveCopy() {
        if (!source) { say('Open an image first.'); return; }
        const q = await FileSystem.pickSave({
            defaultName: `${baseName(fileName) || 'Edited'} (edited).png`,
            defaultPath: PICTURES(),
            extensions: [
                { value: 'png', label: 'PNG image' },
                { value: 'jpg', label: 'JPEG image' }
            ],
            parentApp: 'photoStudio'
        });
        if (!q) return;
        const ext = (q.ext || extOf(q.fullName) || 'png').toLowerCase();
        const type = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
        const blob = await toBlob(compose(source), type, 0.94);
        if (!blob) { say('The image could not be encoded.'); return; }
        const ok = await FileSystem.writeBlob(q.path, q.fullName, blob, ext === 'jpeg' ? 'jpg' : ext);
        say(ok ? `Saved ${q.fullName}` : 'Could not save the copy.');
        if (ok) app.notify.info('Photo Studio', `Saved ${q.fullName} to ${q.path.slice(1).join('\\')}.`);
    }

    async function setWallpaper() {
        if (!source) { say('Open an image first.'); return; }
        const dir = PICTURES();
        if (!FileSystem.exists(dir)) FileSystem.createFolder(Users.home(), 'Pictures');
        const name = `Wallpaper ${stampName()}.png`;
        const blob = await toBlob(compose(source), 'image/png');
        if (!blob) { say('The image could not be encoded.'); return; }
        const ok = await FileSystem.writeBlob(dir, name, blob, 'png');
        if (!ok || !SystemConfig.setWallpaperImage([...dir, name])) {
            say('Could not set the background.');
            return;
        }
        app.notify.info('Desktop background', `Background set to ${name}.`);
        say(`Saved ${name} and set it as the background.`);
    }

    // ---------- wiring ----------

    el.querySelectorAll('.ps-open, .ps-empty-open').forEach(btn => btn.addEventListener('click', pickAndOpen));
    el.querySelector('.ps-save').addEventListener('click', saveCopy);
    el.querySelector('.ps-wallpaper').addEventListener('click', setWallpaper);

    el.querySelector('.ps-rotl').addEventListener('click', () => {
        if (!source) return;
        state.rotation = (state.rotation + 270) % 360;
        render();
    });
    el.querySelector('.ps-rotr').addEventListener('click', () => {
        if (!source) return;
        state.rotation = (state.rotation + 90) % 360;
        render();
    });
    el.querySelector('.ps-fliph').addEventListener('click', () => {
        if (!source) return;
        state.flipH = !state.flipH;
        render();
    });
    el.querySelector('.ps-flipv').addEventListener('click', () => {
        if (!source) return;
        state.flipV = !state.flipV;
        render();
    });
    el.querySelector('.ps-crop').addEventListener('click', () => {
        if (!source) { say('Open an image first.'); return; }
        if (cropMode) {
            applyCrop();
            return;
        }
        setCropMode(true);
    });
    uncropBtn.addEventListener('click', () => {
        if (!lastCrop) return;
        source = lastCrop.source;
        state.rotation = lastCrop.rotation;
        state.flipH = lastCrop.flipH;
        state.flipV = lastCrop.flipV;
        previewSource = downscale(source, PREVIEW_MAX);
        lastCrop = null;
        uncropBtn.style.display = 'none';
        setCropMode(false);
        render();
    });
    el.querySelector('.ps-reset').addEventListener('click', () => {
        if (!source) return;
        state = { ...DEFAULTS };
        syncControls();
        render();
        say('');
    });

    Object.entries(sliders).forEach(([key, input]) => {
        input.addEventListener('input', () => {
            state[key] = Number(input.value);
            if (source) render();
        });
    });

    filtersEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.ps-filter');
        if (!btn) return;
        state.filter = btn.dataset.filter;
        paintFilterChips();
        if (source) render();
    });

    root.addEventListener('dragover', (e) => {
        e.preventDefault();
        root.style.outline = '2px solid var(--accent-color)';
        root.style.outlineOffset = '-2px';
    });
    root.addEventListener('dragleave', () => { root.style.outline = 'none'; });
    root.addEventListener('drop', (e) => {
        e.preventDefault();
        root.style.outline = 'none';
        try {
            const data = JSON.parse(e.dataTransfer.getData('text/plain'));
            if (data && Array.isArray(data.names) && Array.isArray(data.from) && data.names.length) {
                openPath([...data.from, data.names[0]]);
            }
        } catch { /* not one of our drags */ }
    });

    const offOpen = app.keyboard.register('CTRL+O', pickAndOpen, { scope: el });
    const offSave = app.keyboard.register('CTRL+S', () => { saveCopy(); }, { scope: el });

    const ro = new ResizeObserver(() => {
        if (source) fitCanvas();
    });
    ro.observe(el.querySelector('.ps-stage-wrap'));

    const onClosed = (e) => {
        if (!e.detail || e.detail.id !== win.id) return;
        window.removeEventListener('window-closed', onClosed);
        app.keyboard.unregister(offOpen);
        app.keyboard.unregister(offSave);
        ro.disconnect();
        cancelAnimationFrame(frame);
    };
    window.addEventListener('window-closed', onClosed);

    syncControls();
    if (Array.isArray(filePath) && filePath.length) openPath(filePath);
    app.shell.activity.trackAppOpen('photoStudio');
}

export default { launch, icon: AppIcons.get('photoStudio') };
