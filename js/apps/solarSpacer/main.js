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
                            <p style="font-size:11px;color:#8b949e;margin:0;">Galactic & Orbital Sandbox</p>
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

                    <!-- Planet Customizer -->
                    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px;">
                        <h3 style="font-size:12px;font-weight:600;margin:0;color:#8b949e;text-transform:uppercase;letter-spacing:0.5px;">Planet Properties</h3>
                        <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#8b949e;">
                            <span>Mass & Size</span>
                            <strong class="ss-mass-val" style="color:#58a6ff;">15 (Planet)</strong>
                        </div>
                        <input type="range" class="ss-mass-slider" min="1" max="500" value="15" style="accent-color:#58a6ff;cursor:pointer;">
                        <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#8b949e;margin-top:4px;">
                            <span>Atmosphere Color</span>
                            <div style="display:flex;gap:6px;" class="ss-color-picker">
                                <span class="ss-color-opt active" data-color="#4db2ff" style="width:18px;height:18px;border-radius:50%;background:#4db2ff;cursor:pointer;border:2px solid white;box-shadow:0 0 8px #4db2ff;"></span>
                                <span class="ss-color-opt" data-color="#39d353" style="width:18px;height:18px;border-radius:50%;background:#39d353;cursor:pointer;border:2px solid transparent;"></span>
                                <span class="ss-color-opt" data-color="#ff7b72" style="width:18px;height:18px;border-radius:50%;background:#ff7b72;cursor:pointer;border:2px solid transparent;"></span>
                                <span class="ss-color-opt" data-color="#ffa657" style="width:18px;height:18px;border-radius:50%;background:#ffa657;cursor:pointer;border:2px solid transparent;"></span>
                                <span class="ss-color-opt" data-color="#a371f7" style="width:18px;height:18px;border-radius:50%;background:#a371f7;cursor:pointer;border:2px solid transparent;"></span>
                            </div>
                        </div>
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
                        <button class="ss-preset-btn" data-preset="solar" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);color:white;padding:7px 10px;border-radius:8px;text-align:left;cursor:pointer;font-size:11px;transition:background 0.2s;">☀️ Inner Solar System</button>
                        <button class="ss-preset-btn" data-preset="galaxy" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);color:white;padding:7px 10px;border-radius:8px;text-align:left;cursor:pointer;font-size:11px;transition:background 0.2s;">🌌 Galaxy Collision</button>
                        <button class="ss-preset-btn" data-preset="swing" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);color:white;padding:7px 10px;border-radius:8px;text-align:left;cursor:pointer;font-size:11px;transition:background 0.2s;">🎢 Orbit Swing Pendulum</button>
                        <button class="ss-preset-btn" data-preset="binary" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);color:white;padding:7px 10px;border-radius:8px;text-align:left;cursor:pointer;font-size:11px;transition:background 0.2s;">⭐ Binary Star System</button>
                    </div>

                    <div style="margin-top:auto;font-size:11px;color:#8b949e;text-align:center;padding:4px;">
                        ✨ Tidal Plasma Streams & Collision Sparks
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
        let particles = []; // Particle system for collisions and tidal streams
        let isRunning = true;
        let timeSpeed = 1.0;
        let G = 1.0;
        let activeTool = 'spawn';
        let newMass = 15;
        let newColor = '#4db2ff';

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

        // Interaction state
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
                bodies.push({ x: 0, y: 0, vx: 0, vy: 0, mass: 2500, radius: 28, color: '#ffaa00', name: 'Sun', glow: '#ff4500', trail: [] });
                bodies.push({ x: 0, y: -80, vx: 5.4, vy: 0, mass: 5, radius: 5, color: '#a0a0a0', name: 'Mercury', glow: '#888888', trail: [] });
                bodies.push({ x: 0, y: -130, vx: 4.3, vy: 0, mass: 14, radius: 8, color: '#e3bb76', name: 'Venus', glow: '#ffcc00', trail: [] });
                bodies.push({ x: 0, y: -190, vx: 3.5, vy: 0, mass: 18, radius: 9, color: '#4db2ff', name: 'Earth', glow: '#0088ff', trail: [] });
                bodies.push({ x: 0, y: -210, vx: 4.9, vy: 0, mass: 1, radius: 3, color: '#cccccc', name: 'Moon', glow: '#ffffff', trail: [] });
                bodies.push({ x: 0, y: -270, vx: 2.9, vy: 0, mass: 10, radius: 7, color: '#ff5533', name: 'Mars', glow: '#ff2200', trail: [] });
            } else if (type === 'galaxy') {
                // Two massive galaxies / suns interacting with tidal streams
                bodies.push({ x: -140, y: 0, vx: 0, vy: -2.2, mass: 3500, radius: 32, color: '#ff7b72', name: 'Galaxy A', glow: '#ff3333', trail: [] });
                bodies.push({ x: 140, y: 0, vx: 0, vy: 2.2, mass: 3500, radius: 32, color: '#58a6ff', name: 'Galaxy B', glow: '#0088ff', trail: [] });
                // Surrounding stars
                for (let i = 0; i < 8; i++) {
                    const angle = (i / 8) * Math.PI * 2;
                    bodies.push({
                        x: -140 + Math.cos(angle) * 60,
                        y: Math.sin(angle) * 60,
                        vx: -2.2 + Math.sin(angle) * 2,
                        vy: Math.cos(angle) * 2,
                        mass: 5, radius: 4, color: '#ffa657', glow: '#ffaa00', name: 'Star', trail: []
                    });
                }
            } else if (type === 'swing') {
                bodies.push({ x: 0, y: 0, vx: 0, vy: 0, mass: 3000, radius: 30, color: '#ffaa00', name: 'Anchor Star', glow: '#ff6600', trail: [] });
                bodies.push({ x: 0, y: -160, vx: 4.2, vy: 0, mass: 25, radius: 10, color: '#39d353', name: 'Swing Planet', glow: '#00ff66', trail: [] });
                bodies.push({ x: 0, y: -250, vx: 3.3, vy: 0, mass: 6, radius: 5, color: '#a371f7', name: 'Outer Comet', glow: '#bb88ff', trail: [] });
            } else if (type === 'binary') {
                bodies.push({ x: -80, y: 0, vx: 0, vy: -3.0, mass: 1500, radius: 22, color: '#ff4500', name: 'Alpha', glow: '#ff2200', trail: [] });
                bodies.push({ x: 80, y: 0, vx: 0, vy: 3.0, mass: 1500, radius: 22, color: '#00bfff', name: 'Beta', glow: '#0088ff', trail: [] });
                bodies.push({ x: 0, y: -250, vx: 2.7, vy: 0, mass: 10, radius: 7, color: '#39d353', name: 'Planet', glow: '#00ff66', trail: [] });
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
            const label = newMass > 300 ? 'Super Star ⭐' : newMass > 100 ? 'Giant Planet 🪐' : newMass > 20 ? 'Planet 🌍' : 'Asteroid ☄️';
            massVal.textContent = `${newMass} (${label})`;
        });

        el.querySelectorAll('.ss-color-opt').forEach(opt => {
            opt.addEventListener('click', () => {
                el.querySelectorAll('.ss-color-opt').forEach(o => {
                    o.style.border = '2px solid transparent';
                    o.style.boxShadow = 'none';
                });
                opt.style.border = '2px solid white';
                opt.style.boxShadow = `0 0 10px ${opt.dataset.color}`;
                newColor = opt.dataset.color;
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
                const radius = Math.max(4, Math.min(30, Math.cbrt(newMass) * 2.5));

                bodies.push({
                    x: dragStartX,
                    y: dragStartY,
                    vx, vy,
                    mass: newMass,
                    radius,
                    color: newColor,
                    glow: newColor,
                    name: newMass > 300 ? 'Star' : 'Planet ' + (bodies.length + 1),
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

            // Check for massive object tidal stream generation (galaxy/sun interaction)
            for (let i = 0; i < bodies.length; i++) {
                for (let j = i + 1; j < bodies.length; j++) {
                    let bi = bodies[i];
                    let bj = bodies[j];
                    if (bi.mass > 150 && bj.mass > 150) {
                        let dx = bj.x - bi.x;
                        let dy = bj.y - bi.y;
                        let dist = Math.hypot(dx, dy);
                        // When two huge objects gravitate closely, spawn tidal stream spark particles
                        if (dist < 300 && Math.random() < 0.4) {
                            const mx = (bi.x + bj.x) / 2 + (Math.random() - 0.5) * 40;
                            const my = (bi.y + bj.y) / 2 + (Math.random() - 0.5) * 40;
                            particles.push({
                                x: mx,
                                y: my,
                                vx: (Math.random() - 0.5) * 3 + (bi.vx + bj.vx) / 2,
                                vy: (Math.random() - 0.5) * 3 + (bi.vy + bj.vy) / 2,
                                color: '#ffaa00',
                                size: Math.random() * 2 + 1,
                                alpha: 0.8,
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

                        // Spawn explosion / swallow particle burst
                        const burstX = (bi.x + bj.x) / 2;
                        const burstY = (bi.y + bj.y) / 2;
                        for (let p = 0; p < 35; p++) {
                            const angle = Math.random() * Math.PI * 2;
                            const speed = Math.random() * 4 + 1;
                            particles.push({
                                x: burstX,
                                y: burstY,
                                vx: Math.cos(angle) * speed,
                                vy: Math.sin(angle) * speed,
                                color: p % 2 === 0 ? survivor.color : '#ff4500',
                                size: Math.random() * 3 + 1.5,
                                alpha: 1.0,
                                life: 0,
                                maxLife: 30 + Math.random() * 25
                            });
                        }

                        // Play explosion / swallow sound effect
                        try {
                            Sounds.recycleBin();
                        } catch(e) {}

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

            // Draw glowing 3D-shaded orbits (trails)
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

            // Draw 3D Spherical Bodies
            for (let b of bodies) {
                const glowGrad = ctx.createRadialGradient(b.x, b.y, b.radius * 0.5, b.x, b.y, b.radius * 2.2);
                glowGrad.addColorStop(0, b.glow || b.color);
                glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.radius * 2.2, 0, Math.PI * 2);
                ctx.fillStyle = glowGrad;
                ctx.globalAlpha = b.mass > 100 ? 0.6 : 0.25;
                ctx.fill();
                ctx.globalAlpha = 1.0;

                const sphereGrad = ctx.createRadialGradient(
                    b.x - b.radius * 0.3, b.y - b.radius * 0.3, b.radius * 0.1,
                    b.x, b.y, b.radius
                );
                sphereGrad.addColorStop(0, '#ffffff');
                sphereGrad.addColorStop(0.3, b.color);
                sphereGrad.addColorStop(1, '#050505');

                ctx.beginPath();
                ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
                ctx.fillStyle = sphereGrad;
                ctx.shadowColor = b.color;
                ctx.shadowBlur = b.mass > 200 ? 25 : 8;
                ctx.fill();
                ctx.shadowBlur = 0;

                if (b.mass > 6 || b.radius > 6) {
                    ctx.fillStyle = '#f0f6fc';
                    ctx.font = '600 11px Segoe UI';
                    ctx.textAlign = 'center';
                    ctx.fillText(b.name, b.x, b.y + b.radius + 14);
                }
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
                const radius = Math.max(4, Math.min(30, Math.cbrt(newMass) * 2.5));

                const prevGrad = ctx.createRadialGradient(dragStartX - 3, dragStartY - 3, 1, dragStartX, dragStartY, radius);
                prevGrad.addColorStop(0, '#ffffff');
                prevGrad.addColorStop(0.4, newColor);
                prevGrad.addColorStop(1, '#000000');

                ctx.beginPath();
                ctx.arc(dragStartX, dragStartY, radius, 0, Math.PI * 2);
                ctx.fillStyle = prevGrad;
                ctx.globalAlpha = 0.85;
                ctx.fill();
                ctx.globalAlpha = 1.0;

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
