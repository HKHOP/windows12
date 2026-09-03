import WindowManager from '../modules/windowManager.js';
import FileSystem from '../modules/fileSystem.js';
import SavePrompt from '../modules/saveprompt.js';

const Paint = (() => {
    const icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" fill="#1565C0"/><circle cx="8" cy="8" r="2" fill="#FF5722"/><circle cx="14" cy="9" r="2" fill="#4CAF50"/><circle cx="10" cy="14" r="2" fill="#FFC107"/><circle cx="16" cy="15" r="2" fill="#9C27B0"/></svg>`;

    const MAX_UNDO = 20;

    function getContent() {
        return `
            <div style="display:flex;flex-direction:column;height:100%;">
                <div class="paint-menubar" style="display:flex;background:#2d2d2d;border-bottom:1px solid #3d3d3d;">
                    <button class="paint-menu-tab active" data-tab="home" style="padding:6px 12px;background:none;border:none;border-bottom:2px solid #0078D4;color:#fff;font-size:12px;cursor:pointer;">Home</button>
                    <button class="paint-menu-tab" data-tab="view" style="padding:6px 12px;background:none;border:none;border-bottom:2px solid transparent;color:#888;font-size:12px;cursor:pointer;">View</button>
                </div>
                <div class="paint-toolbar" style="display:flex;gap:8px;padding:8px 12px;background:#2d2d2d;border-bottom:1px solid #3d3d3d;align-items:center;flex-wrap:wrap;min-height:52px;">
                    <div class="paint-tab-content" data-tab="home">
                        <div style="display:flex;gap:12px;align-items:center;">
                            <div style="display:flex;gap:3px;">
                                <button class="paint-tool-btn" data-tool="pencil" title="Pencil" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.15);color:#ccc;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:48px;">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                                    Pencil
                                </button>
                                <button class="paint-tool-btn" data-tool="brush" title="Brush" style="background:none;border:1px solid rgba(255,255,255,0.1);color:#ccc;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:48px;">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.37 2.63a2.12 2.12 0 0 1 3 3L14 13l-4 1 1-4Z"/><path d="M9 15c-2 2-4 2-6 0s-2-4 0-6 4-2 6 0"/></svg>
                                    Brush
                                </button>
                                <button class="paint-tool-btn" data-tool="eraser" title="Eraser" style="background:none;border:1px solid rgba(255,255,255,0.1);color:#ccc;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:48px;">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>
                                    Eraser
                                </button>
                                <button class="paint-tool-btn" data-tool="fill" title="Fill" style="background:none;border:1px solid rgba(255,255,255,0.1);color:#ccc;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:48px;">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v6m0 0l-3 3m3-3l3 3"/><path d="M19 17c0 2-3 4-7 4s-7-2-7-4c0-1.5 3-3 7-3s7 1.5 7 3z"/></svg>
                                    Fill
                                </button>
                            </div>
                            <div style="width:1px;height:32px;background:#3d3d3d;"></div>
                            <div style="display:flex;gap:3px;">
                                <button class="paint-tool-btn" data-tool="line" title="Line" style="background:none;border:1px solid rgba(255,255,255,0.1);color:#ccc;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:48px;">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="19" x2="19" y2="5"/></svg>
                                    Line
                                </button>
                                <button class="paint-tool-btn" data-tool="rect" title="Rectangle" style="background:none;border:1px solid rgba(255,255,255,0.1);color:#ccc;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:48px;">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="1"/></svg>
                                    Rect
                                </button>
                                <button class="paint-tool-btn" data-tool="circle" title="Ellipse" style="background:none;border:1px solid rgba(255,255,255,0.1);color:#ccc;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:48px;">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="12" rx="9" ry="7"/></svg>
                                    Circle
                                </button>
                                <button class="paint-tool-btn" data-tool="triangle" title="Triangle" style="background:none;border:1px solid rgba(255,255,255,0.1);color:#ccc;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:48px;">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3L22 21H2z"/></svg>
                                    Triangle
                                </button>
                            </div>
                            <div style="width:1px;height:32px;background:#3d3d3d;"></div>
                            <div style="display:flex;align-items:center;gap:6px;">
                                <label style="color:#888;font-size:11px;">Size</label>
                                <input type="range" class="paint-size-slider" min="1" max="50" value="3" style="width:80px;accent-color:#0078D4;">
                                <span class="paint-size-label" style="color:#aaa;font-size:11px;min-width:28px;">3px</span>
                            </div>
                            <div style="width:1px;height:32px;background:#3d3d3d;"></div>
                            <div class="paint-colors" style="display:flex;gap:3px;align-items:center;">
                                <div class="paint-swatch" data-color="#000000" style="width:20px;height:20px;border-radius:3px;background:#000000;border:2px solid #555;cursor:pointer;" title="Black"></div>
                                <div class="paint-swatch" data-color="#FFFFFF" style="width:20px;height:20px;border-radius:3px;background:#FFFFFF;border:2px solid #555;cursor:pointer;" title="White"></div>
                                <div class="paint-swatch" data-color="#FF0000" style="width:20px;height:20px;border-radius:3px;background:#FF0000;border:2px solid #555;cursor:pointer;" title="Red"></div>
                                <div class="paint-swatch" data-color="#FF5722" style="width:20px;height:20px;border-radius:3px;background:#FF5722;border:2px solid #555;cursor:pointer;" title="Orange"></div>
                                <div class="paint-swatch" data-color="#FFC107" style="width:20px;height:20px;border-radius:3px;background:#FFC107;border:2px solid #555;cursor:pointer;" title="Yellow"></div>
                                <div class="paint-swatch" data-color="#4CAF50" style="width:20px;height:20px;border-radius:3px;background:#4CAF50;border:2px solid #555;cursor:pointer;" title="Green"></div>
                                <div class="paint-swatch" data-color="#2196F3" style="width:20px;height:20px;border-radius:3px;background:#2196F3;border:2px solid #555;cursor:pointer;" title="Blue"></div>
                                <div class="paint-swatch" data-color="#9C27B0" style="width:20px;height:20px;border-radius:3px;background:#9C27B0;border:2px solid #555;cursor:pointer;" title="Purple"></div>
                                <div class="paint-swatch" data-color="#795548" style="width:20px;height:20px;border-radius:3px;background:#795548;border:2px solid #555;cursor:pointer;" title="Brown"></div>
                                <div class="paint-swatch" data-color="#607D8B" style="width:20px;height:20px;border-radius:3px;background:#607D8B;border:2px solid #555;cursor:pointer;" title="Gray"></div>
                                <input type="color" class="paint-custom-color" value="#000000" style="width:28px;height:28px;border:none;background:none;cursor:pointer;padding:0;" title="Custom color">
                            </div>
                        </div>
                    </div>
                    <div class="paint-tab-content" data-tab="view" style="display:none;">
                        <div style="display:flex;gap:12px;align-items:center;">
                            <div style="display:flex;gap:3px;">
                                <button class="paint-undo-btn" title="Undo (Ctrl+Z)" style="background:none;border:1px solid rgba(255,255,255,0.1);color:#ccc;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:48px;">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
                                    Undo
                                </button>
                                <button class="paint-clear-btn" title="Clear canvas" style="background:none;border:1px solid rgba(255,255,255,0.1);color:#ccc;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:48px;">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                    Clear
                                </button>
                            </div>
                            <div style="width:1px;height:32px;background:#3d3d3d;"></div>
                            <div style="display:flex;gap:3px;">
                                <button class="paint-save-btn" title="Save" style="background:none;border:1px solid rgba(255,255,255,0.1);color:#ccc;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:48px;">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15V3m0 12l-4-4m4 4l4-4"/><path d="M2 17l.621 2.485A2 2 0 0 0 4.561 21h14.878a2 2 0 0 0 1.94-1.515L22 17"/></svg>
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="paint-canvas-container" style="flex:1;overflow:auto;background:#1a1a1a;position:relative;">
                    <canvas class="paint-canvas" style="cursor:crosshair;display:block;"></canvas>
                </div>
                <div class="paint-statusbar" style="display:flex;justify-content:space-between;padding:4px 12px;background:#2d2d2d;border-top:1px solid #3d3d3d;font-size:11px;color:#888;">
                    <span class="paint-status-size"></span>
                    <span class="paint-status-pos"></span>
                </div>
            </div>
        `;
    }

    function launch() {
        const win = WindowManager.createWindow('paint', 'Paint', icon, getContent(), { width: 900, height: 600 });
        const el = win.element;

        const canvas = el.querySelector('.paint-canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const container = el.querySelector('.paint-canvas-container');
        const sizeSlider = el.querySelector('.paint-size-slider');
        const sizeLabel = el.querySelector('.paint-size-label');
        const customColorInput = el.querySelector('.paint-custom-color');
        const statusSize = el.querySelector('.paint-status-size');
        const statusPos = el.querySelector('.paint-status-pos');

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
        let shapePreviewData = null;

        function resizeCanvas() {
            const w = container.clientWidth;
            const h = container.clientHeight;
            if (canvas.width === w && canvas.height === h) return;
            let imageData = null;
            if (canvas.width > 0 && canvas.height > 0) {
                try { imageData = ctx.getImageData(0, 0, canvas.width, canvas.height); } catch(e) {}
            }
            canvas.width = w;
            canvas.height = h;
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, w, h);
            if (imageData) ctx.putImageData(imageData, 0, 0);
            previewCanvas.width = w;
            previewCanvas.height = h;
            statusSize.textContent = `${w} x ${h}`;
        }

        function saveState() {
            if (undoStack.length >= MAX_UNDO) undoStack.shift();
            undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
        }

        function restoreState(imageData) {
            ctx.putImageData(imageData, 0, 0);
        }

        function setTool(tool) {
            currentTool = tool;
            el.querySelectorAll('.paint-tool-btn').forEach(btn => {
                const isActive = btn.dataset.tool === tool;
                btn.style.background = isActive ? 'rgba(0,120,212,0.3)' : 'none';
                btn.style.borderColor = isActive ? '#0078D4' : 'rgba(255,255,255,0.1)';
            });
            if (tool === 'fill') {
                canvas.style.cursor = 'crosshair';
            } else if (tool === 'eraser') {
                canvas.style.cursor = 'cell';
            } else {
                canvas.style.cursor = 'crosshair';
            }
        }

        function getPos(e) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            return {
                x: (e.clientX - rect.left) * scaleX,
                y: (e.clientY - rect.top) * scaleY
            };
        }

        function getBrushSize() {
            return currentTool === 'brush' ? brushSize * 2 : (currentTool === 'eraser' ? brushSize * 3 : brushSize);
        }

        function getColor() {
            return currentTool === 'eraser' ? '#FFFFFF' : currentColor;
        }

        function drawSegment(x1, y1, x2, y2, color, size) {
            ctx.strokeStyle = color;
            ctx.lineWidth = size;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }

        function drawShape(tool, sx, sy, ex, ey, color, size) {
            ctx.strokeStyle = color;
            ctx.lineWidth = size;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            if (tool === 'line') {
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.lineTo(ex, ey);
                ctx.stroke();
            } else if (tool === 'rect') {
                ctx.strokeRect(sx, sy, ex - sx, ey - sy);
            } else if (tool === 'circle') {
                const cx = (sx + ex) / 2;
                const cy = (sy + ey) / 2;
                const rx = Math.abs(ex - sx) / 2;
                const ry = Math.abs(ey - sy) / 2;
                ctx.beginPath();
                ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
                ctx.stroke();
            } else if (tool === 'triangle') {
                const midX = (sx + ex) / 2;
                ctx.beginPath();
                ctx.moveTo(midX, sy);
                ctx.lineTo(ex, ey);
                ctx.lineTo(sx, ey);
                ctx.closePath();
                ctx.stroke();
            }
        }

        function floodFill(startX, startY, fillColor) {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            const width = canvas.width;
            const height = canvas.height;

            startX = Math.floor(startX);
            startY = Math.floor(startY);

            if (startX < 0 || startX >= width || startY < 0 || startY >= height) return;

            const startIdx = (startY * width + startX) * 4;
            const startR = data[startIdx];
            const startG = data[startIdx + 1];
            const startB = data[startIdx + 2];
            const startA = data[startIdx + 3];

            const temp = document.createElement('canvas').getContext('2d');
            temp.fillStyle = fillColor;
            temp.fillRect(0, 0, 1, 1);
            const fillData = temp.getImageData(0, 0, 1, 1).data;
            const fillR = fillData[0];
            const fillG = fillData[1];
            const fillB = fillData[2];

            if (startR === fillR && startG === fillG && startB === fillB && startA === 255) return;

            const tolerance = 30;
            function matchesStart(idx) {
                return Math.abs(data[idx] - startR) <= tolerance &&
                       Math.abs(data[idx + 1] - startG) <= tolerance &&
                       Math.abs(data[idx + 2] - startB) <= tolerance &&
                       Math.abs(data[idx + 3] - startA) <= tolerance;
            }

            const stack = [[startX, startY]];
            const visited = new Uint8Array(width * height);

            while (stack.length > 0) {
                const [x, y] = stack.pop();
                const idx = (y * width + x) * 4;
                const vIdx = y * width + x;

                if (x < 0 || x >= width || y < 0 || y >= height) continue;
                if (visited[vIdx]) continue;
                if (!matchesStart(idx)) continue;

                visited[vIdx] = 1;
                data[idx] = fillR;
                data[idx + 1] = fillG;
                data[idx + 2] = fillB;
                data[idx + 3] = 255;

                stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
            }

            ctx.putImageData(imageData, 0, 0);
        }

        function isBrushTool() {
            return currentTool === 'pencil' || currentTool === 'brush' || currentTool === 'eraser';
        }

        function isShapeTool() {
            return ['line', 'rect', 'circle', 'triangle'].includes(currentTool);
        }

        function startDrawing(pos) {
            if (currentTool === 'fill') {
                saveState();
                floodFill(pos.x, pos.y, currentColor);
                return;
            }

            isDrawing = true;
            startX = pos.x;
            startY = pos.y;
            lastX = pos.x;
            lastY = pos.y;
            points = [pos];

            saveState();

            if (isBrushTool()) {
                drawSegment(pos.x, pos.y, pos.x, pos.y, getColor(), getBrushSize());
            } else if (isShapeTool()) {
                shapePreviewData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            }
        }

        function moveDrawing(pos) {
            if (!isDrawing) return;

            if (isBrushTool()) {
                drawSegment(lastX, lastY, pos.x, pos.y, getColor(), getBrushSize());
                lastX = pos.x;
                lastY = pos.y;
            } else if (isShapeTool()) {
                if (shapePreviewData) {
                    ctx.putImageData(shapePreviewData, 0, 0);
                }
                drawShape(currentTool, startX, startY, pos.x, pos.y, currentColor, brushSize);
            }
        }

        function endDrawing() {
            if (!isDrawing) return;
            isDrawing = false;
            points = [];
            shapePreviewData = null;
        }

        el.querySelectorAll('.paint-menu-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                el.querySelectorAll('.paint-menu-tab').forEach(t => {
                    t.style.borderBottomColor = 'transparent';
                    t.style.color = '#888';
                });
                tab.style.borderBottomColor = '#0078D4';
                tab.style.color = '#fff';
                const tabId = tab.dataset.tab;
                el.querySelectorAll('.paint-tab-content').forEach(content => {
                    content.style.display = content.dataset.tab === tabId ? '' : 'none';
                });
            });
        });

        el.addEventListener('mousedown', (e) => {
            if (!e.target.closest('.paint-canvas')) return;
            startDrawing(getPos(e));
        });

        el.addEventListener('mousemove', (e) => {
            if (!e.target.closest('.paint-canvas')) return;
            const pos = getPos(e);
            statusPos.textContent = `${Math.round(pos.x)}, ${Math.round(pos.y)}`;
            if (isDrawing) moveDrawing(pos);
        });

        el.addEventListener('mouseup', endDrawing);
        el.addEventListener('mouseleave', endDrawing);

        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            startDrawing({ x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY });
        }, { passive: false });

        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            moveDrawing({ x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY });
        }, { passive: false });

        canvas.addEventListener('touchend', (e) => { e.preventDefault(); endDrawing(); });
        canvas.addEventListener('touchcancel', endDrawing);

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
