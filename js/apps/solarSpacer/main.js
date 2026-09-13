import WindowManager from '../../modules/windowManager.js';
import AppIcons from '../../modules/appIcons.js';
import Sounds from '../../modules/sounds.js';

const SolarSpacer = (() => {
    const icon = AppIcons.get('solarSpacer');

    function getContent() {
        return `
            <div style="display:flex;height:100%;background:#090b10;color:#f0f6fc;font-family:'Segoe UI',sans-serif;overflow:hidden;box-sizing:border-box;">
                <!-- Modern Glassmorphism Sidebar -->
                <div style="width:290px;background:rgba(18,22,31,0.85);backdrop-filter:blur(16px);border-right:1px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;padding:16px;gap:14px;overflow-y:auto;flex-shrink:0;box-shadow:4px 0 24px rgba(0,0,0,0.5);">
                    <div style="display:flex;align-items:center;gap:12px;padding:4px 0;">
                        <div style="width:40px;height:40px;background:linear-gradient(135deg, #ffaa00, #ff4500);border-radius:12px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 20px rgba(255,170,0,0.5);font-size:20px;">🪐</div>
                        <div>
                            <h2 style="font-size:16px;font-weight:600;margin:0;letter-spacing:0.3px;">Solar Spacer 3D</h2>
                            <p style="font-size:11px;color:#8b949e;margin:0;">Procedural Textures & Galaxies</p>
                        </div>
                    </div>

                    <!-- Sandbox Tools -->
                    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px;">
                        <h3 style="font-size:12px;font-weight:600;margin:0;color:#8b949e;text-transform:uppercase;letter-spacing:0.5px;">Sandbox Tools</h3>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                            <button class="ss-tool-btn active" data-tool="spawn" style="background:linear-gradient(135deg, #238636, #2ea043);border:none;color:white;padding:8px;border-radius:8px;font-weight:600;cursor:pointer;font-size:11px;box-shadow:0 2px 8px rgba(35,134,54,0.4);transition:all 0.2s;">🪐 Spawn</button>
                            <button class="ss-tool-btn" data-tool="grab" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);color:white;padding:8px;border-radius:8px;font-weight:600;cursor:pointer;font-size:11px;transition:all 0.2s;">✋ Grab & Throw</button>
                            <button class="ss-tool-btn" data-tool="well" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);color:white;padding:8px;border-radius:8px;font-weight:600;cursor:pointer;font-size:11px;transition:all 0.2s;">🧲 Swing Well</button>
                            <button class="ss-tool-btn" data-tool="delete" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);color:white;padding:8px;border-radius:8px;font-weight:600;cursor:pointer;font-size:11px;transition:all 0.2s;">🗑️ Delete</button>
                        </div>
                    </div>

                    <!-- Celestial Body Type Picker -->
                    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px;">
                        <h3 style="font-size:12px;font-weight:600;margin:0;color:#8b949e;text-transform:uppercase;letter-spacing:0.5px;">Celestial Body Type</h3>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;" class="ss-type-picker">
                            <button class="ss-type-btn active" data-type="rocky" style="background:rgba(77,178,255,0.2);border:1px solid #4db2ff;color:white;padding:6px;border-radius:6px;font-size:11px;cursor:pointer;">🌍 Rocky Planet</button>
                            <button class="ss-type-btn" data-type="gas" style="background:rgba(255,166,87,0.1);border:1px solid rgba(255,255,255,0.1);color:white;padding:6px;border-radius:6px;font-size:11px;cursor:pointer;">🪐 Gas Giant</button>
                            <button class="ss-type-btn" data-type="star" style="background:rgba(255,170,0,0.1);border:1px solid rgba(255,255,255,0.1);color:white;padding:6px;border-radius:6px;font-size:11px;cursor:pointer;">☀️ Star / Sun</button>
                            <button class="ss-type-btn" data-type="galaxy" style="background:rgba(163,113,247,0.1);border:1px solid rgba(255,255,255,0.1);color:white;padding:6px;border-radius:6px;font-size:11px;cursor:pointer;">🌌 Spiral Galaxy</button>
                            <button class="ss-type-btn" data-type="asteroid" style="background:rgba(150,150,150,0.1);border:1px solid rgba(255,255,255,0.1);color:white;padding:6px;border-radius:6px;font-size:11px;cursor:pointer;grid-column:span 2;">☄️ Asteroid / Comets</button>
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#8b949e;margin-top:4px;">
                            <span>Mass</span>
                            <strong class="ss-mass-val" style="color:#58a6ff;">15</strong>
                        </div>
                        <input type="range" class="ss-mass-slider" min="1" max="500" value="15" style="accent-color:#58a6ff;cursor:pointer;">
                    </div>

                    <!-- Simulation Controls -->
                    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:10px;">
                        <h3 style="font-size:12px;font-weight:600;margin:0;color:#8b949e;text-transform:uppercase;letter-spacing:0.5px;">Simulation Engine</h3>
                        <div style="display:flex;gap:8px;">
                            <button class="ss-play-btn" style="flex:1;background:linear-gradient(135deg, #238636, #2ea043);border:none;color:white;padding:7px;border-radius:8px;font-weight:600;cursor:pointer;font-size:12px;box-shadow:0 2px 8px rgba(35,134,54,0.3);">Pause</button>
                            <button class="ss-clear-btn" style="flex:1;background:rgba(218,54,51,0.2);border:1px solid rgba(218,54,51,0.4);color:#ff7b72;padding:7px;border-radius:8px;font-weight:600;cursor:pointer;font-size:12px;">Clear All</button>
                        </div>
                        <div style="display:flex;flex-direction:column;gap:4px;">
                            <label style="font-size:11px;color:#8b949e;display:flex;justify-content:space-between;"><span>Time Speed</span><span class="ss-speed-val" style="color:#58a6ff;">1.0x</span></label>
                            <input type="range" class="ss-speed-slider" min="0.1" max="3" step="0.1" value="1" style="accent-color:#58a6ff;cursor:pointer;">
                        </div>
                        <div style="display:flex;flex-direction:column;gap:4px;">
                            <label style="font-size:11px;color:#8b949e;display:flex;justify-content:space-between;"><span>Gravity (G)</span><span class="ss-grav-val" style="color:#58a6ff;">1.0</span></label>
                            <input type="range" class="ss-grav-slider" min="0.2" max="3" step="0.2" value="1" style="accent-color:#58a6ff;cursor:pointer;">
                        </div>
                    </div>

                    <!-- Presets -->
                    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px;">
                        <h3 style="font-size:12px;font-weight:600;margin:0;color:#8b949e;text-transform:uppercase;letter-spacing:0.5px;">Presets</h3>
                        <button class="ss-preset-btn" data-preset="solar" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);color:white;padding:7px 10px;border-radius:8px;text-align:left;cursor:pointer;font-size:11px;">☀️ Inner Solar System</button>
                        <button class="ss-preset-btn" data-preset="galaxy" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);color:white;padding:7px 10px;border-radius:8px;text-align:left;cursor:pointer;font-size:11px;">🌌 Galaxy Collision</button>
                        <button class="ss-preset-btn" data-preset="binary" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);color:white;padding:7px 10px;border-radius:8px;text-align:left;cursor:pointer;font-size:11px;">⭐ Binary Star System</button>
                    </div>

                    <div style="margin-top:auto;font-size:11px;color:#8b949e;text-align:center;padding:4px;">
                        ✨ Unique Procedural Textures for Every Body
                    </div>
                </div>

                <!-- 3D Canvas Area -->
                <div style="flex:1;position:relative;background:#06080d;display:flex;align-items:center;justify-content:center;overflow:hidden;">
                    <canvas class="ss-canvas" style="display:block;width:100%;height:100%;cursor:crosshair;"></canvas>
                    <div style="position:absolute;top:16px;left:20px;background:rgba(18,22,31,0.75);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.1);padding:8px 16px;border-radius:10px;font-size:12px;color:#c9d1d9;pointer-events:none;display:flex;gap:20px;box-shadow:0 4px 20px rgba(0,0,0,0.4);">
                        <span>Bodies: <strong class="ss-count" style="color:#58a6ff;">0</strong></span>
                        <span>Tool: <strong class="ss-tool-name" style="color:#39d353;">Spawn Planet</strong></span>
                        <span>FPS: <strong class="ss-fps" style="color:#ffa657;">60</strong></span>
                    </div>
                </div>
            </div>
        `;
    }

    function launch() {
        const win = WindowManager.createWindow('solarSpacer', 'Solar Spacer 3D', icon, getContent(), { width: 1000, height: 680 });
        const el = win.element;
        const canvas = el.querySelector('.ss-canvas');
        const ctx = canvas.getContext('2d');

        let bodies = [];
        let particles = [];
        let isRunning = true;
        let timeSpeed = 1.0;
        let G = 1.0;
        let activeTool = 'spawn';
        let newMass = 15;
        let newType = 'rocky';

        // Starfield background cache
        let stars = [];
        function initStars() {
            stars = [];
            for (let i = 0; i < 200; i++) {
                stars.push({
                    x: (Math.random() - 0.5) * 2500,
                    y: (Math.random() - 0.5) * 2500,
                    size: Math.random() * 1.8,
                    alpha: Math.random() * 0.8 + 0.2
                });
            }
        }
        initStars();

        let isDragging = false;
        let dragStartX = 0;
        let dragStartY = 0;
        let currentMouseX = 0;
        let currentMouseY = 0;
        let grabbedBody = null;
        let grabStartX = 0;
        let grabStartY = 0;
        let activeWell = null;

        function loadPreset(type) {
            bodies = [];
            particles = [];
            activeWell = null;
            if (type === 'solar') {
                bodies.push({ x: 0, y: 0, vx: 0, vy: 0, mass: 2500, radius: 28, type: 'star', color: '#ffaa00', name: 'Sun', glow: '#ff4500', trail: [] });
                bodies.push({ x: 0, y: -80, vx: 5.4, vy: 0, mass: 5, radius: 5, type: 'rocky', color: '#a0a0a0', name: 'Mercury', glow: '#888888', trail: [] });
                bodies.push({ x: 0, y: -130, vx: 4.3, vy: 0, mass: 14, radius: 8, type: 'rocky', color: '#e3bb76', name: 'Venus', glow: '#ffcc00', trail: [] });
                bodies.push({ x: 0, y: -190, vx: 3.5, vy: 0, mass: 18, radius: 9, type: 'rocky', color: '#4db2ff', name: 'Earth', glow: '#0088ff', trail: [] });
                bodies.push({ x: 0, y: -210, vx: 4.9, vy: 0, mass: 1, radius: 3, type: 'asteroid', color: '#cccccc', name: 'Moon', glow: '#ffffff', trail: [] });
                bodies.push({ x: 0, y: -270, vx: 2.9, vy: 0, mass: 10, radius: 7, type: 'rocky', color: '#ff5533', name: 'Mars', glow: '#ff2200', trail: [] });
                bodies.push({ x: 0, y: -370, vx: 2.4, vy: 0, mass: 80, radius: 14, type: 'gas', color: '#ffa657', name: 'Jupiter', glow: '#ff8800', trail: [] });
            } else if (type === 'galaxy') {
                bodies.push({ x: -160, y: 0, vx: 0, vy: -2.2, mass: 4000, radius: 36, type: 'galaxy', color: '#a371f7', name: 'Spiral Galaxy A', glow: '#bb88ff', trail: [] });
                bodies.push({ x: 160, y: 0, vx: 0, vy: 2.2, mass: 4000, radius: 36, type: 'galaxy', color: '#58a6ff', name: 'Spiral Galaxy B', glow: '#0088ff', trail: [] });
                for (let i = 0; i < 12; i++) {
                    const angle = (i / 12) * Math.PI * 2;
                    bodies.push({
                        x: -160 + Math.cos(angle) * 70,
                        y: Math.sin(angle) * 70,
                        vx: -2.2 + Math.sin(angle) * 2.2,
                        vy: Math.cos(angle) * 2.2,
                        mass: 4, radius: 4, type: 'star', color: '#ffaa00', glow: '#ff6600', name: 'Star', trail: []
                    });
                }
            } else if (type === 'binary') {
                bodies.push({ x: -90, y: 0, vx: 0, vy: -3.0, mass: 1800, radius: 24, type: 'star', color: '#ff4500', name: 'Alpha Star', glow: '#ff2200', trail: [] });
                bodies.push({ x: 90, y: 0, vx: 0, vy: 3.0, mass: 1800, radius: 24, type: 'star', color: '#00bfff', name: 'Beta Star', glow: '#0088ff', trail: [] });
                bodies.push({ x: 0, y: -280, vx: 2.6, vy: 0, mass: 15, radius: 8, type: 'gas', color: '#39d353', name: 'Gas Giant', glow: '#00ff66', trail: [] });
                bodies.push({ x: 0, y: 260, vx: -2.6, vy: 0, mass: 5, radius: 5, type: 'asteroid', color: '#888888', name: 'Asteroid Belt', trail: [] });
            }
            Sounds.confirm();
        }

        loadPreset('solar');

        const container = canvas.parentElement;
        function resizeCanvas() {
            const w = container.clientWidth;
            const h = container.clientHeight;
            if (w && h && (canvas.width !== w || canvas.height !== h)) {
                canvas.width = w;
                canvas.height = h;
            }
        }
        resizeCanvas();
        const observer = new ResizeObserver(() => {
            if (!el.isConnected) {
                observer.disconnect();
                return;
            }
            resizeCanvas();
        });
        observer.observe(container);

        // UI Controls wiring
        const playBtn = el.querySelector('.ss-play-btn');
        const clearBtn = el.querySelector('.ss-clear-btn');
        const speedSlider = el.querySelector('.ss-speed-slider');
        const speedVal = el.querySelector('.ss-speed-val');
        const gravSlider = el.querySelector('.ss-grav-slider');
        const gravVal = el.querySelector('.ss-grav-val');
        const countEl = el.querySelector('.ss-count');
        const toolNameEl = el.querySelector('.ss-tool-name');
        const massSlider = el.querySelector('.ss-mass-slider');
        const massVal = el.querySelector('.ss-mass-val');
        const fpsEl = el.querySelector('.ss-fps');

        playBtn.addEventListener('click', () => {
            isRunning = !isRunning;
            playBtn.textContent = isRunning ? 'Pause' : 'Play';
            playBtn.style.background = isRunning ? 'linear-gradient(135deg, #238636, #2ea043)' : 'linear-gradient(135deg, #1f6feb, #388bfd)';
            Sounds.click();
        });

        clearBtn.addEventListener('click', () => {
            bodies = [];
            particles = [];
            activeWell = null;
            Sounds.recycleBin();
        });

        speedSlider.addEventListener('input', () => {
            timeSpeed = parseFloat(speedSlider.value);
            speedVal.textContent = timeSpeed.toFixed(1) + 'x';
        });

        gravSlider.addEventListener('input', () => {
            G = parseFloat(gravSlider.value);
            gravVal.textContent = G.toFixed(1);
        });

        massSlider.addEventListener('input', () => {
            newMass = parseInt(massSlider.value);
            massVal.textContent = newMass;
        });

        el.querySelectorAll('.ss-type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                el.querySelectorAll('.ss-type-btn').forEach(b => {
                    b.style.background = 'rgba(255,255,255,0.03)';
                    b.style.border = '1px solid rgba(255,255,255,0.1)';
                });
                btn.style.background = 'rgba(77,178,255,0.2)';
                btn.style.border = '1px solid #4db2ff';
                newType = btn.dataset.type;
                if (newType === 'star' && newMass < 1000) { newMass = 2000; massSlider.value = 2000; massVal.textContent = 2000; }
                else if (newType === 'galaxy' && newMass < 2000) { newMass = 3500; massSlider.value = 3500; massVal.textContent = 3500; }
                else if (newType === 'gas' && newMass < 80) { newMass = 80; massSlider.value = 80; massVal.textContent = 80; }
                Sounds.click();
            });
        });

        el.querySelectorAll('.ss-tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                el.querySelectorAll('.ss-tool-btn').forEach(b => {
                    b.style.background = 'rgba(255,255,255,0.06)';
                    b.style.border = '1px solid rgba(255,255,255,0.08)';
                    b.style.boxShadow = 'none';
                    b.classList.remove('active');
                });
                btn.style.background = 'linear-gradient(135deg, #238636, #2ea043)';
                btn.style.border = 'none';
                btn.style.boxShadow = '0 2px 8px rgba(35,134,54,0.4)';
                btn.classList.add('active');
                activeTool = btn.dataset.tool;
                toolNameEl.textContent = btn.textContent.trim().replace(/^[^\s]+\s*/, '');
                Sounds.click();
            });
        });

        el.querySelectorAll('.ss-preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                loadPreset(btn.dataset.preset);
            });
        });

        // Mouse event handlers
        canvas.addEventListener('mousedown', (e) => {
            const rect = canvas.getBoundingClientRect();
            const cx = rect.width / 2;
            const cy = rect.height / 2;
            const x = e.clientX - rect.left - cx;
            const y = e.clientY - rect.top - cy;

            dragStartX = x;
            dragStartY = y;
            currentMouseX = x;
            currentMouseY = y;

            if (activeTool === 'spawn') {
                isDragging = true;
            } else if (activeTool === 'grab') {
                for (let b of bodies) {
                    const dist = Math.hypot(b.x - x, b.y - y);
                    if (dist <= Math.max(b.radius + 6, 14)) {
                        grabbedBody = b;
                        grabStartX = x;
                        grabStartY = y;
                        break;
                    }
                }
            } else if (activeTool === 'well') {
                activeWell = { x, y, strength: 3500 };
                Sounds.info();
            } else if (activeTool === 'delete') {
                bodies = bodies.filter(b => Math.hypot(b.x - x, b.y - y) > Math.max(b.radius + 6, 18));
                Sounds.recycleBin();
            }
        });

        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const cx = rect.width / 2;
            const cy = rect.height / 2;
            currentMouseX = e.clientX - rect.left - cx;
            currentMouseY = e.clientY - rect.top - cy;

            if (grabbedBody) {
                grabbedBody.x = currentMouseX;
                grabbedBody.y = currentMouseY;
                grabbedBody.vx = 0;
                grabbedBody.vy = 0;
            } else if (activeTool === 'well' && e.buttons === 1 && activeWell) {
                activeWell.x = currentMouseX;
                activeWell.y = currentMouseY;
            }
        });

        canvas.addEventListener('mouseup', (e) => {
            if (activeTool === 'spawn' && isDragging) {
                const vx = (dragStartX - currentMouseX) * 0.08;
                const vy = (dragStartY - currentMouseY) * 0.08;
                const radius = newType === 'galaxy' ? 36 : newType === 'star' ? 26 : newType === 'gas' ? 14 : newType === 'asteroid' ? 4 : Math.max(5, Math.min(22, Math.cbrt(newMass) * 2.2));
                const color = newType === 'galaxy' ? '#a371f7' : newType === 'star' ? '#ffaa00' : newType === 'gas' ? '#ffa657' : newType === 'asteroid' ? '#888888' : '#4db2ff';

                bodies.push({
                    x: dragStartX,
                    y: dragStartY,
                    vx, vy,
                    mass: newMass,
                    radius,
                    type: newType,
                    color,
                    glow: color,
                    name: newType === 'galaxy' ? 'Galaxy' : newType === 'star' ? 'Star' : newType === 'gas' ? 'Gas Giant' : newType === 'asteroid' ? 'Asteroid' : 'Planet',
                    trail: []
                });
                Sounds.confirm();
            }

            if (grabbedBody) {
                grabbedBody.vx = (currentMouseX - grabStartX) * 0.12;
                grabbedBody.vy = (currentMouseY - grabStartY) * 0.12;
                grabbedBody = null;
                Sounds.confirm();
            }

            isDragging = false;
        });

        let frameCount = 0;
        let fpsTimer = performance.now();

        function updatePhysics() {
            if (!isRunning) return;
            const dt = 0.5 * timeSpeed;

            if (activeWell) {
                for (let b of bodies) {
                    let dx = activeWell.x - b.x;
                    let dy = activeWell.y - b.y;
                    let distSq = dx * dx + dy * dy + 400;
                    let dist = Math.sqrt(distSq);
                    let force = (G * activeWell.strength * b.mass) / distSq;
                    b.vx += (force * (dx / dist) / b.mass) * dt;
                    b.vy += (force * (dy / dist) / b.mass) * dt;
                }
            }

            // Tidal stream particles between massive objects/galaxies/stars
            for (let i = 0; i < bodies.length; i++) {
                for (let j = i + 1; j < bodies.length; j++) {
                    let bi = bodies[i];
                    let bj = bodies[j];
                    if (bi.mass > 150 && bj.mass > 150) {
                        let dx = bj.x - bi.x;
                        let dy = bj.y - bi.y;
                        let dist = Math.hypot(dx, dy);
                        if (dist < 350 && Math.random() < 0.45) {
                            const mx = (bi.x + bj.x) / 2 + (Math.random() - 0.5) * 50;
                            const my = (bi.y + bj.y) / 2 + (Math.random() - 0.5) * 50;
                            particles.push({
                                x: mx,
                                y: my,
                                vx: (Math.random() - 0.5) * 3 + (bi.vx + bj.vx) / 2,
                                vy: (Math.random() - 0.5) * 3 + (bi.vy + bj.vy) / 2,
                                color: bi.type === 'galaxy' || bj.type === 'galaxy' ? '#a371f7' : '#ffaa00',
                                size: Math.random() * 2 + 1,
                                alpha: 0.85,
                                life: 0,
                                maxLife: 40 + Math.random() * 30
                            });
                        }
                    }
                }
            }

            for (let i = 0; i < bodies.length; i++) {
                let bi = bodies[i];
                for (let j = i + 1; j < bodies.length; j++) {
                    let bj = bodies[j];
                    let dx = bj.x - bi.x;
                    let dy = bj.y - bi.y;
                    let distSq = dx * dx + dy * dy + 100;
                    let dist = Math.sqrt(distSq);

                    // Collision & Swallow Merger
                    if (dist < bi.radius + bj.radius) {
                        let survivor = bi.mass >= bj.mass ? bi : bj;
                        let victim = bi.mass >= bj.mass ? bj : bi;
                        let removeIdx = bi.mass >= bj.mass ? j : i;

                        survivor.vx = (bi.mass * bi.vx + bj.mass * bj.vx) / (bi.mass + bj.mass);
                        survivor.vy = (bi.mass * bi.vy + bj.mass * bj.vy) / (bi.mass + bj.mass);
                        survivor.mass += victim.mass;
                        survivor.radius = Math.max(survivor.radius, Math.cbrt(survivor.mass) * 2.2);

                        const burstX = (bi.x + bj.x) / 2;
                        const burstY = (bi.y + bj.y) / 2;
                        for (let p = 0; p < 40; p++) {
                            const angle = Math.random() * Math.PI * 2;
                            const speed = Math.random() * 5 + 1;
                            particles.push({
                                x: burstX,
                                y: burstY,
                                vx: Math.cos(angle) * speed,
                                vy: Math.sin(angle) * speed,
                                color: p % 2 === 0 ? survivor.color : '#ff4500',
                                size: Math.random() * 3 + 1.5,
                                alpha: 1.0,
                                life: 0,
                                maxLife: 35 + Math.random() * 25
                            });
                        }

                        try { Sounds.recycleBin(); } catch(e) {}

                        bodies.splice(removeIdx, 1);
                        j--;
                        continue;
                    }

                    let force = (G * bi.mass * bj.mass) / distSq;
                    let fx = force * (dx / dist);
                    let fy = force * (dy / dist);

                    if (bi !== grabbedBody) {
                        bi.vx += (fx / bi.mass) * dt;
                        bi.vy += (fy / bi.mass) * dt;
                    }
                    if (bj !== grabbedBody) {
                        bj.vx -= (fx / bj.mass) * dt;
                        bj.vy -= (fy / bj.mass) * dt;
                    }
                }
            }

            for (let b of bodies) {
                if (b !== grabbedBody) {
                    b.x += b.vx * dt;
                    b.y += b.vy * dt;
                }

                if (Math.random() < 0.4) {
                    b.trail.push({ x: b.x, y: b.y });
                    if (b.trail.length > 70) b.trail.shift();
                }
            }

            // Update particles
            for (let p = particles.length - 1; p >= 0; p--) {
                let pt = particles[p];
                pt.x += pt.vx * dt;
                pt.y += pt.vy * dt;
                pt.life++;
                pt.alpha = 1 - (pt.life / pt.maxLife);
                if (pt.life >= pt.maxLife || pt.alpha <= 0) {
                    particles.splice(p, 1);
                }
            }
        }

        // Calculate future trajectory prediction (bending ray)
        function calculateTrajectory(startX, startY, vx, vy, mass) {
            let path = [];
            let px = startX;
            let py = startY;
            let pvx = vx;
            let pvy = vy;

            let simBodies = bodies.map(b => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, mass: b.mass, radius: b.radius }));

            for (let step = 0; step < 120; step++) {
                let pfx = 0, pfy = 0;
                for (let sb of simBodies) {
                    let dx = sb.x - px;
                    let dy = sb.y - py;
                    let distSq = dx * dx + dy * dy + 100;
                    let dist = Math.sqrt(distSq);
                    let force = (G * mass * sb.mass) / distSq;
                    pfx += force * (dx / dist);
                    pfy += force * (dy / dist);
                }

                pvx += (pfx / mass) * 0.5;
                pvy += (pfy / mass) * 0.5;
                px += pvx * 0.5;
                py += pvy * 0.5;

                path.push({ x: px, y: py });
            }
            return path;
        }

        // Distinct procedural body renderers
        function drawBody(b, time) {
            ctx.save();
            ctx.translate(b.x, b.y);

            const type = b.type || (b.mass > 1000 ? 'star' : b.mass > 60 ? 'gas' : 'rocky');

            if (type === 'galaxy') {
                // Spiral Galaxy texture with swirling arms
                ctx.rotate(time * 0.0005);
                const gGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, b.radius * 1.8);
                gGrad.addColorStop(0, '#ffffff');
                gGrad.addColorStop(0.3, b.color);
                gGrad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.beginPath();
                ctx.arc(0, 0, b.radius * 1.8, 0, Math.PI * 2);
                ctx.fillStyle = gGrad;
                ctx.globalAlpha = 0.5;
                ctx.fill();
                ctx.globalAlpha = 1.0;

                // Spiral arms
                for (let arm = 0; arm < 2; arm++) {
                    ctx.save();
                    ctx.rotate(arm * Math.PI);
                    ctx.beginPath();
                    for (let a = 0; a < Math.PI * 3; a += 0.1) {
                        const r = a * (b.radius / 3);
                        const sx = Math.cos(a) * r;
                        const sy = Math.sin(a) * r;
                        if (a === 0) ctx.moveTo(sx, sy);
                        else ctx.lineTo(sx, sy);
                    }
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 2.5;
                    ctx.globalAlpha = 0.7;
                    ctx.stroke();
                    ctx.restore();
                }
            } else if (type === 'star') {
                // Sun / Star with corona flares and pulsing plasma
                const pulse = Math.sin(time * 0.005) * 3;
                const corona = ctx.createRadialGradient(0, 0, b.radius * 0.5, 0, 0, b.radius + 12 + pulse);
                corona.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
                corona.addColorStop(0.5, b.color);
                corona.addColorStop(1, 'rgba(255, 69, 0, 0)');
                ctx.beginPath();
                ctx.arc(0, 0, b.radius + 12 + pulse, 0, Math.PI * 2);
                ctx.fillStyle = corona;
                ctx.fill();

                // Surface shading
                const sunGrad = ctx.createRadialGradient(-b.radius * 0.3, -b.radius * 0.3, b.radius * 0.1, 0, 0, b.radius);
                sunGrad.addColorStop(0, '#ffffff');
                sunGrad.addColorStop(0.5, '#ffaa00');
                sunGrad.addColorStop(1, '#ff3300');
                ctx.beginPath();
                ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
                ctx.fillStyle = sunGrad;
                ctx.shadowColor = '#ff4500';
                ctx.shadowBlur = 25;
                ctx.fill();
                ctx.shadowBlur = 0;
            } else if (type === 'gas') {
                // Gas Giant with horizontal atmospheric bands
                ctx.beginPath();
                ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
                ctx.fillStyle = b.color;
                ctx.fill();
                ctx.clip();

                // Atmosphere lighting gradient overlay
                const gasGrad = ctx.createRadialGradient(-b.radius * 0.3, -b.radius * 0.3, b.radius * 0.1, 0, 0, b.radius);
                gasGrad.addColorStop(0, 'rgba(255,255,255,0.4)');
                gasGrad.addColorStop(0.5, 'rgba(0,0,0,0)');
                gasGrad.addColorStop(1, 'rgba(0,0,0,0.7)');

                // Horizontal bands
                ctx.fillStyle = 'rgba(0,0,0,0.25)';
                ctx.fillRect(-b.radius, -b.radius * 0.5, b.radius * 2, b.radius * 0.3);
                ctx.fillRect(-b.radius, b.radius * 0.2, b.radius * 2, b.radius * 0.25);

                ctx.fillStyle = gasGrad;
                ctx.beginPath();
                ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
                ctx.fill();
            } else if (type === 'asteroid') {
                // Jagged rocky asteroid polygon
                ctx.beginPath();
                const pts = 7;
                for (let i = 0; i < pts; i++) {
                    const angle = (i / pts) * Math.PI * 2;
                    const r = b.radius * (0.8 + Math.sin(i * 3) * 0.2);
                    const ax = Math.cos(angle) * r;
                    const ay = Math.sin(angle) * r;
                    if (i === 0) ctx.moveTo(ax, ay);
                    else ctx.lineTo(ax, ay);
                }
                ctx.closePath();
                const astGrad = ctx.createRadialGradient(-2, -2, 1, 0, 0, b.radius);
                astGrad.addColorStop(0, '#cccccc');
                astGrad.addColorStop(1, '#555555');
                ctx.fillStyle = astGrad;
                ctx.fill();
                ctx.strokeStyle = '#333333';
                ctx.lineWidth = 1;
                ctx.stroke();
            } else {
                // Rocky Planet with atmosphere & continent look
                const glowGrad = ctx.createRadialGradient(0, 0, b.radius * 0.5, 0, 0, b.radius * 2.2);
                glowGrad.addColorStop(0, b.glow || b.color);
                glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.beginPath();
                ctx.arc(0, 0, b.radius * 2.2, 0, Math.PI * 2);
                ctx.fillStyle = glowGrad;
                ctx.globalAlpha = 0.3;
                ctx.fill();
                ctx.globalAlpha = 1.0;

                const sphereGrad = ctx.createRadialGradient(-b.radius * 0.3, -b.radius * 0.3, b.radius * 0.1, 0, 0, b.radius);
                sphereGrad.addColorStop(0, '#ffffff');
                sphereGrad.addColorStop(0.3, b.color);
                sphereGrad.addColorStop(1, '#050505');

                ctx.beginPath();
                ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
                ctx.fillStyle = sphereGrad;
                ctx.fill();
            }

            ctx.restore();

            // Name label
            if (b.mass > 6 || b.radius > 6) {
                ctx.fillStyle = '#f0f6fc';
                ctx.font = '600 11px Segoe UI';
                ctx.textAlign = 'center';
                ctx.fillText(b.name, b.x, b.y + b.radius + 14);
            }
        }

        let animId;
        function draw(now) {
            frameCount++;
            if (now - fpsTimer >= 1000) {
                fpsEl.textContent = Math.round((frameCount * 1000) / (now - fpsTimer));
                frameCount = 0;
                fpsTimer = now;
            }

            updatePhysics();
            countEl.textContent = bodies.length;

            ctx.fillStyle = '#06080d';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.save();
            ctx.translate(canvas.width / 2, canvas.height / 2);

            // Draw Parallax Starfield
            for (let s of stars) {
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.globalAlpha = s.alpha;
                ctx.fill();
            }
            ctx.globalAlpha = 1.0;

            // Draw Swing / Gravity Well Attractor
            if (activeWell) {
                const grad = ctx.createRadialGradient(activeWell.x, activeWell.y, 4, activeWell.x, activeWell.y, 40);
                grad.addColorStop(0, 'rgba(88, 166, 255, 0.6)');
                grad.addColorStop(1, 'rgba(88, 166, 255, 0)');
                ctx.beginPath();
                ctx.arc(activeWell.x, activeWell.y, 40, 0, Math.PI * 2);
                ctx.fillStyle = grad;
                ctx.fill();

                ctx.beginPath();
                ctx.arc(activeWell.x, activeWell.y, 8, 0, Math.PI * 2);
                ctx.fillStyle = '#58a6ff';
                ctx.shadowColor = '#58a6ff';
                ctx.shadowBlur = 12;
                ctx.fill();
                ctx.shadowBlur = 0;
            }

            // Draw glowing orbits (trails)
            for (let b of bodies) {
                if (b.trail.length > 1) {
                    ctx.beginPath();
                    ctx.strokeStyle = b.color;
                    ctx.lineWidth = 1.5;
                    ctx.globalAlpha = 0.3;
                    ctx.moveTo(b.trail[0].x, b.trail[0].y);
                    for (let pt of b.trail) {
                        ctx.lineTo(pt.x, pt.y);
                    }
                    ctx.stroke();
                    ctx.globalAlpha = 1.0;
                }
            }

            // Draw bodies with distinct textures
            for (let b of bodies) {
                drawBody(b, now);
            }

            // Draw collision & tidal stream particles
            for (let pt of particles) {
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
                ctx.fillStyle = pt.color;
                ctx.globalAlpha = pt.alpha;
                ctx.shadowColor = pt.color;
                ctx.shadowBlur = 6;
                ctx.fill();
                ctx.shadowBlur = 0;
            }
            ctx.globalAlpha = 1.0;

            // Draw spawn trajectory ray / bending prediction
            if (activeTool === 'spawn' && isDragging) {
                const vx = (dragStartX - currentMouseX) * 0.08;
                const vy = (dragStartY - currentMouseY) * 0.08;
                const radius = newType === 'galaxy' ? 36 : newType === 'star' ? 26 : newType === 'gas' ? 14 : newType === 'asteroid' ? 4 : Math.max(5, Math.min(22, Math.cbrt(newMass) * 2.2));
                const color = newType === 'galaxy' ? '#a371f7' : newType === 'star' ? '#ffaa00' : newType === 'gas' ? '#ffa657' : newType === 'asteroid' ? '#888888' : '#4db2ff';

                ctx.save();
                ctx.translate(dragStartX, dragStartY);
                ctx.beginPath();
                ctx.arc(0, 0, radius, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.globalAlpha = 0.85;
                ctx.fill();
                ctx.restore();

                const trajectory = calculateTrajectory(dragStartX, dragStartY, vx, vy, newMass);
                if (trajectory.length > 1) {
                    ctx.beginPath();
                    ctx.strokeStyle = '#58a6ff';
                    ctx.lineWidth = 2;
                    ctx.setLineDash([4, 4]);
                    ctx.moveTo(trajectory[0].x, trajectory[0].y);
                    for (let pt of trajectory) {
                        ctx.lineTo(pt.x, pt.y);
                    }
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
            }

            ctx.restore();
            animId = requestAnimationFrame(draw);
        }

        animId = requestAnimationFrame(draw);

        WindowManager.setCloseHandler('solarSpacer', () => {
            cancelAnimationFrame(animId);
            observer.disconnect();
            return true;
        });
    }

    return { launch, icon };
})();

export default SolarSpacer;
