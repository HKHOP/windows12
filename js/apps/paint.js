import WindowManager from '../modules/windowManager.js';
import FileSystem from '../modules/fileSystem.js';
import SavePrompt from '../modules/saveprompt.js';

const Paint = (() => {
    const icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" fill="#1565C0"/><circle cx="8" cy="8" r="2" fill="#FF5722"/><circle cx="14" cy="9" r="2" fill="#4CAF50"/><circle cx="10" cy="14" r="2" fill="#FFC107"/><circle cx="16" cy="15" r="2" fill="#9C27B0"/></svg>`;

    const MAX_UNDO = 30;

    function getContent() {
        return `
            <div style="display:flex;flex-direction:column;height:100%;">
                <div style="display:flex;gap:6px;padding:6px 8px;background:rgba(0,0,0,0.2);border-bottom:1px solid rgba(255,255,255,0.06);align-items:center;flex-wrap:wrap;">
                    <div class="paint-tools" style="display:flex;gap:3px;">
                        <button class="paint-tool-btn" data-tool="pencil" title="Pencil" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.15);color:#ccc;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                            Pencil
                        </button>
                        <button class="paint-tool-btn" data-tool="brush" title="Brush" style="background:none;border:1px solid rgba(255,255,255,0.1);color:#ccc;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.37 2.63a2.12 2.12 0 0 1 3 3L14 13l-4 1 1-4Z"/><path d="M9 15c-2 2-4 2-6 0s-2-4 0-6 4-2 6 0"/></svg>
                            Brush
                        </button>
                        <button class="paint-tool-btn" data-tool="eraser" title="Eraser" style="background:none;border:1px solid rgba(255,255,255,0.1);color:#ccc;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>
                            Eraser
                        </button>
                        <button class="paint-tool-btn" data-tool="line" title="Line" style="background:none;border:1px solid rgba(255,255,255,0.1);color:#ccc;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="19" x2="19" y2="5"/></svg>
                            Line
                        </button>
                        <button class="paint-tool-btn" data-tool="rect" title="Rectangle" style="background:none;border:1px solid rgba(255,255,255,0.1);color:#ccc;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="1"/></svg>
                            Rect
                        </button>
                        <button class="paint-tool-btn" data-tool="circle" title="Ellipse" style="background:none;border:1px solid rgba(255,255,255,0.1);color:#ccc;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="12" rx="9" ry="7"/></svg>
                            Circle
                        </button>
                    </div>
                    <div style="width:1px;height:24px;background:rgba(255,255,255,0.1);margin:0 4px;"></div>
                    <div style="display:flex;align-items:center;gap:4px;">
                        <label style="color:#888;font-size:11px;">Size</label>
                        <input type="range" class="paint-size-slider" min="1" max="50" value="3" style="width:80px;accent-color:#1565C0;">
                        <span class="paint-size-label" style="color:#aaa;font-size:11px;min-width:24px;">3px</span>
                    </div>
                    <div style="width:1px;height:24px;background:rgba(255,255,255,0.1);margin:0 4px;"></div>
                    <div class="paint-colors" style="display:flex;gap:3px;align-items:center;">
                        <div class="paint-swatch" data-color="#000000" style="width:18px;height:18px;border-radius:3px;background:#000000;border:1px solid rgba(255,255,255,0.3);cursor:pointer;" title="Black"></div>
                        <div class="paint-swatch" data-color="#FFFFFF" style="width:18px;height:18px;border-radius:3px;background:#FFFFFF;border:1px solid rgba(255,255,255,0.3);cursor:pointer;" title="White"></div>
                        <div class="paint-swatch" data-color="#FF0000" style="width:18px;height:18px;border-radius:3px;background:#FF0000;border:1px solid rgba(255,255,255,0.3);cursor:pointer;" title="Red"></div>
                        <div class="paint-swatch" data-color="#FF5722" style="width:18px;height:18px;border-radius:3px;background:#FF5722;border:1px solid rgba(255,255,255,0.3);cursor:pointer;" title="Orange"></div>
                        <div class="paint-swatch" data-color="#FFC107" style="width:18px;height:18px;border-radius:3px;background:#FFC107;border:1px solid rgba(255,255,255,0.3);cursor:pointer;" title="Yellow"></div>
                        <div class="paint-swatch" data-color="#4CAF50" style="width:18px;height:18px;border-radius:3px;background:#4CAF50;border:1px solid rgba(255,255,255,0.3);cursor:pointer;" title="Green"></div>
                        <div class="paint-swatch" data-color="#2196F3" style="width:18px;height:18px;border-radius:3px;background:#2196F3;border:1px solid rgba(255,255,255,0.3);cursor:pointer;" title="Blue"></div>
                        <div class="paint-swatch" data-color="#9C27B0" style="width:18px;height:18px;border-radius:3px;background:#9C27B0;border:1px solid rgba(255,255,255,0.3);cursor:pointer;" title="Purple"></div>
                        <div class="paint-swatch" data-color="#795548" style="width:18px;height:18px;border-radius:3px;background:#795548;border:1px solid rgba(255,255,255,0.3);cursor:pointer;" title="Brown"></div>
                        <div class="paint-swatch" data-color="#607D8B" style="width:18px;height:18px;border-radius:3px;background:#607D8B;border:1px solid rgba(255,255,255,0.3);cursor:pointer;" title="Gray"></div>
                        <input type="color" class="paint-custom-color" value="#000000" style="width:24px;height:24px;border:none;background:none;cursor:pointer;padding:0;" title="Custom color">
                    </div>
                    <div style="flex:1;"></div>
                    <div style="display:flex;gap:3px;">
                        <button class="paint-undo-btn" title="Undo (Ctrl+Z)" style="background:none;border:1px solid rgba(255,255,255,0.1);color:#ccc;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
                            Undo
                        </button>
                        <button class="paint-clear-btn" title="Clear canvas" style="background:none;border:1px solid rgba(255,255,255,0.1);color:#ccc;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                            Clear
                        </button>
                        <button class="paint-save-btn" title="Save" style="background:none;border:1px solid rgba(255,255,255,0.1);color:#ccc;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15V3m0 12l-4-4m4 4l4-4"/><path d="M2 17l.621 2.485A2 2 0 0 0 4.561 21h14.878a2 2 0 0 0 1.94-1.515L22 17"/></svg>
                            Save
                        </button>
                    </div>
                </div>
                <div class="paint-canvas-container" style="flex:1;overflow:auto;background:#1a1a1a;position:relative;">
                    <canvas class="paint-canvas" style="cursor:crosshair;display:block;"></canvas>
                </div>
            </div>
        `;
    }

    function launch() {
        const win = WindowManager.createWindow('paint', 'Paint', icon, getContent(), { width: 850, height: 550 });
        const el = win.element;

        const canvas = el.querySelector('.paint-canvas');
        const ctx = canvas.getContext('2d');
        const container = el.querySelector('.paint-canvas-container');
        const sizeSlider = el.querySelector('.paint-size-slider');
        const sizeLabel = el.querySelector('.paint-size-label');
        const customColorInput = el.querySelector('.paint-custom-color');

        let currentTool = 'pencil';
        let currentColor = '#000000';
        let brushSize = 3;
        let isDrawing = false;
        let startX = 0, startY = 0;
        let lastX = 0, lastY = 0;
        let undoStack = [];
        let previewCanvas = document.createElement('canvas');
        let previewCtx = previewCanvas.getContext('2d');
        let points = [];

        function resizeCanvas() {
            const w = container.clientWidth;
            const h = container.clientHeight;
            if (canvas.width === w && canvas.height === h) return;
            const imageData = canvas.width > 0 ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
            canvas.width = w;
            canvas.height = h;
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, w, h);
            if (imageData) ctx.putImageData(imageData, 0, 0);
            previewCanvas.width = w;
            previewCanvas.height = h;
        }

        function saveState() {
            if (undoStack.length >= MAX_UNDO) undoStack.shift();
            undoStack.push(canvas.toDataURL());
        }

        function restoreState(dataUrl) {
            const img = new Image();
            img.onload = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
            };
            img.src = dataUrl;
        }

        function setTool(tool) {
            currentTool = tool;
            el.querySelectorAll('.paint-tool-btn').forEach(btn => {
                const isActive = btn.dataset.tool === tool;
                btn.style.background = isActive ? 'rgba(255,255,255,0.1)' : 'none';
                btn.style.borderColor = isActive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)';
            });
            canvas.style.cursor = tool === 'eraser' ? 'cell' : 'crosshair';
        }

        function getPos(e) {
            const rect = canvas.getBoundingClientRect();
            return {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
        }

        function drawSmoothLine(context, pts, color, size) {
            if (pts.length < 2) return;
            context.strokeStyle = color;
            context.lineWidth = size;
            context.lineCap = 'round';
            context.lineJoin = 'round';
            context.beginPath();
            context.moveTo(pts[0].x, pts[0].y);
            if (pts.length === 2) {
                context.lineTo(pts[1].x, pts[1].y);
            } else {
                for (let i = 1; i < pts.length - 1; i++) {
                    const mx = (pts[i].x + pts[i + 1].x) / 2;
                    const my = (pts[i].y + pts[i + 1].y) / 2;
                    context.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
                }
                const last = pts[pts.length - 1];
                const prev = pts[pts.length - 2];
                context.quadraticCurveTo(prev.x, prev.y, last.x, last.y);
            }
            context.stroke();
        }

        function drawShape(context, tool, sx, sy, ex, ey, color, size) {
            context.strokeStyle = color;
            context.lineWidth = size;
            context.lineCap = 'round';
            context.lineJoin = 'round';
            if (tool === 'line') {
                context.beginPath();
                context.moveTo(sx, sy);
                context.lineTo(ex, ey);
                context.stroke();
            } else if (tool === 'rect') {
                context.strokeRect(sx, sy, ex - sx, ey - sy);
            } else if (tool === 'circle') {
                const cx = (sx + ex) / 2;
                const cy = (sy + ey) / 2;
                const rx = Math.abs(ex - sx) / 2;
                const ry = Math.abs(ey - sy) / 2;
                context.beginPath();
                context.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
                context.stroke();
            }
        }

        el.addEventListener('mousedown', (e) => {
            if (!e.target.closest('.paint-canvas')) return;
            isDrawing = true;
            const pos = getPos(e);
            startX = pos.x;
            startY = pos.y;
            lastX = pos.x;
            lastY = pos.y;
            points = [pos];

            saveState();

            if (currentTool === 'pencil' || currentTool === 'brush' || currentTool === 'eraser') {
                const size = currentTool === 'brush' ? brushSize * 2 : (currentTool === 'eraser' ? brushSize * 3 : brushSize);
                const color = currentTool === 'eraser' ? '#FFFFFF' : currentColor;
                drawSmoothLine(ctx, points, color, size);
            } else {
                previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
            }
        });

        el.addEventListener('mousemove', (e) => {
            if (!isDrawing || !e.target.closest('.paint-canvas')) return;
            const pos = getPos(e);

            if (currentTool === 'pencil' || currentTool === 'brush' || currentTool === 'eraser') {
                const size = currentTool === 'brush' ? brushSize * 2 : (currentTool === 'eraser' ? brushSize * 3 : brushSize);
                const color = currentTool === 'eraser' ? '#FFFFFF' : currentColor;
                points.push(pos);
                drawSmoothLine(ctx, points, color, size);
                lastX = pos.x;
                lastY = pos.y;
            } else {
                const saved = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const dataUrl = undoStack[undoStack.length - 1];
                if (dataUrl) {
                    const img = new Image();
                    img.onload = () => {
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        ctx.drawImage(img, 0, 0);
                        drawShape(ctx, currentTool, startX, startY, pos.x, pos.y, currentColor, brushSize);
                    };
                    img.src = dataUrl;
                } else {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    drawShape(ctx, currentTool, startX, startY, pos.x, pos.y, currentColor, brushSize);
                }
            }
        });

        el.addEventListener('mouseup', () => { isDrawing = false; points = []; });
        el.addEventListener('mouseleave', () => { isDrawing = false; points = []; });

        el.addEventListener('touchstart', (e) => {
            if (!e.target.closest('.paint-canvas')) return;
            e.preventDefault();
            const touch = e.touches[0];
            const rect = canvas.getBoundingClientRect();
            const pos = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
            isDrawing = true;
            startX = pos.x;
            startY = pos.y;
            lastX = pos.x;
            lastY = pos.y;
            points = [pos];

            saveState();

            if (currentTool === 'pencil' || currentTool === 'brush' || currentTool === 'eraser') {
                const size = currentTool === 'brush' ? brushSize * 2 : (currentTool === 'eraser' ? brushSize * 3 : brushSize);
                const color = currentTool === 'eraser' ? '#FFFFFF' : currentColor;
                drawSmoothLine(ctx, points, color, size);
            } else {
                previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
            }
        }, { passive: false });

        el.addEventListener('touchmove', (e) => {
            if (!isDrawing || !e.target.closest('.paint-canvas')) return;
            e.preventDefault();
            const touch = e.touches[0];
            const rect = canvas.getBoundingClientRect();
            const pos = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };

            if (currentTool === 'pencil' || currentTool === 'brush' || currentTool === 'eraser') {
                const size = currentTool === 'brush' ? brushSize * 2 : (currentTool === 'eraser' ? brushSize * 3 : brushSize);
                const color = currentTool === 'eraser' ? '#FFFFFF' : currentColor;
                points.push(pos);
                drawSmoothLine(ctx, points, color, size);
                lastX = pos.x;
                lastY = pos.y;
            } else {
                const dataUrl = undoStack[undoStack.length - 1];
                if (dataUrl) {
                    const img = new Image();
                    img.onload = () => {
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        ctx.drawImage(img, 0, 0);
                        drawShape(ctx, currentTool, startX, startY, pos.x, pos.y, currentColor, brushSize);
                    };
                    img.src = dataUrl;
                } else {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    drawShape(ctx, currentTool, startX, startY, pos.x, pos.y, currentColor, brushSize);
                }
            }
        }, { passive: false });

        el.addEventListener('touchend', () => { isDrawing = false; points = []; });
        el.addEventListener('touchcancel', () => { isDrawing = false; points = []; });

        el.querySelectorAll('.paint-tool-btn').forEach(btn => {
            btn.addEventListener('click', () => setTool(btn.dataset.tool));
        });

        el.querySelectorAll('.paint-swatch').forEach(swatch => {
            swatch.addEventListener('click', () => {
                currentColor = swatch.dataset.color;
                customColorInput.value = currentColor;
            });
        });

        customColorInput.addEventListener('input', (e) => {
            currentColor = e.target.value;
        });

        sizeSlider.addEventListener('input', (e) => {
            brushSize = parseInt(e.target.value);
            sizeLabel.textContent = brushSize + 'px';
        });

        el.querySelector('.paint-undo-btn').addEventListener('click', () => {
            if (undoStack.length === 0) return;
            restoreState(undoStack.pop());
        });

        el.querySelector('.paint-clear-btn').addEventListener('click', () => {
            saveState();
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        });

        el.querySelector('.paint-save-btn').addEventListener('click', () => {
            SavePrompt.show({
                defaultName: 'painting.png',
                defaultPath: ['/', 'users', 'default', 'Pictures'],
                extensions: [
                    { value: 'png', label: 'PNG' },
                    { value: 'jpeg', label: 'JPEG' },
                    { value: 'webp', label: 'WebP' },
                    { value: 'bmp', label: 'BMP' }
                ],
                parentApp: 'paint'
            }).then(result => {
                if (!result) return;
                const mimeTypeMap = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp' };
                const mimeType = mimeTypeMap[result.ext] || 'image/png';
                const dataUrl = canvas.toDataURL(mimeType, 0.92);
                FileSystem.createFile(result.path, result.fullName, dataUrl, result.ext);
            });
        });

        const observer = new ResizeObserver(() => resizeCanvas());
        observer.observe(container);

        document.addEventListener('keydown', (e) => {
            if (!el.isConnected) { observer.disconnect(); return; }
            if (e.ctrlKey && e.key === 'z') {
                e.preventDefault();
                if (undoStack.length > 0) restoreState(undoStack.pop());
            }
        });

        setTool('pencil');
        resizeCanvas();
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    return { launch };
})();

export default Paint;
