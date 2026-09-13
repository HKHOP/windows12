import WindowManager from '../../modules/windowManager.js';
import AppIcons from '../../modules/appIcons.js';
import Sounds from '../../modules/sounds.js';

const SolarSpacer = (() => {
    const icon = AppIcons.get('solarSpacer');

    function getContent() {
        return `
            <div style="display:flex;height:100%;background:#0f1117;color:white;font-family:'Segoe UI',sans-serif;overflow:hidden;box-sizing:border-box;">
                <!-- Sidebar Controls / Tools -->
                <div style="width:280px;background:#181b22;border-right:1px solid #2a2e39;display:flex;flex-direction:column;padding:16px;gap:14px;overflow-y:auto;flex-shrink:0;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <div style="width:36px;height:36px;background:linear-gradient(135deg, #ffaa00, #ff4500);border-radius:10px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 12px rgba(255,170,0,0.4);">🪐</div>
                        <div>
                            <h2 style="font-size:16px;font-weight:600;margin:0;">Solar Spacer Sandbox</h2>
                            <p style="font-size:11px;color:#8b949e;margin:0;">Gravity, Orbits & Swings</p>
                        </div>
                    </div>

                    <!-- Sandbox Tools -->
                    <div style="background:#21262d;border:1px solid #30363d;border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px;">
                        <h3 style="font-size:13px;font-weight:600;margin:0;color:#c9d1d9;">Sandbox Tools</h3>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                            <button class="ss-tool-btn active" data-tool="spawn" style="background:#238636;border:none;color:white;padding:8px;border-radius:6px;font-weight:600;cursor:pointer;font-size:11px;display:flex;align-items:center;gap:6px;justify-content:center;">🪐 Spawn</button>
                            <button class="ss-tool-btn" data-tool="grab" style="background:#30363d;border:none;color:white;padding:8px;border-radius:6px;font-weight:600;cursor:pointer;font-size:11px;display:flex;align-items:center;gap:6px;justify-content:center;">✋ Grab & Throw</button>
                            <button class="ss-tool-btn" data-tool="well" style="background:#30363d;border:none;color:white;padding:8px;border-radius:6px;font-weight:600;cursor:pointer;font-size:11px;display:flex;align-items:center;gap:6px;justify-content:center;">🧲 Swing Well</button>
                            <button class="ss-tool-btn" data-tool="delete" style="background:#30363d;border:none;color:white;padding:8px;border-radius:6px;font-weight:600;cursor:pointer;font-size:11px;display:flex;align-items:center;gap:6px;justify-content:center;">🗑️ Delete</button>
                        </div>
                    </div>

                    <!-- Planet Customizer -->
                    <div style="background:#21262d;border:1px solid #30363d;border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px;">
                        <h3 style="font-size:13px;font-weight:600;margin:0;color:#c9d1d9;">New Planet Config</h3>
                        <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#8b949e;">
                            <span>Mass</span>
                            <strong class="ss-mass-val" style="color:#c9d1d9;">15 (Planet)</strong>
                        </div>
                        <input type="range" class="ss-mass-slider" min="1" max="500" value="15" style="accent-color:#238636;">
                        <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#8b949e;margin-top:4px;">
                            <span>Color</span>
                            <div style="display:flex;gap:4px;" class="ss-color-picker">
                                <span class="ss-color-opt active" data-color="#4db2ff" style="width:16px;height:16px;border-radius:50%;background:#4db2ff;cursor:pointer;border:2px solid white;"></span>
                                <span class="ss-color-opt" data-color="#39d353" style="width:16px;height:16px;border-radius:50%;background:#39d353;cursor:pointer;border:2px solid transparent;"></span>
                                <span class="ss-color-opt" data-color="#ff7b72" style="width:16px;height:16px;border-radius:50%;background:#ff7b72;cursor:pointer;border:2px solid transparent;"></span>
                                <span class="ss-color-opt" data-color="#ffa657" style="width:16px;height:16px;border-radius:50%;background:#ffa657;cursor:pointer;border:2px solid transparent;"></span>
                                <span class="ss-color-opt" data-color="#a371f7" style="width:16px;height:16px;border-radius:50%;background:#a371f7;cursor:pointer;border:2px solid transparent;"></span>
                            </div>
                        </div>
                    </div>

                    <!-- Simulation Controls -->
                    <div style="background:#21262d;border:1px solid #30363d;border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:10px;">
                        <h3 style="font-size:13px;font-weight:600;margin:0;color:#c9d1d9;">Controls</h3>
                        <div style="display:flex;gap:8px;">
                            <button class="ss-play-btn" style="flex:1;background:#238636;border:none;color:white;padding:6px;border-radius:6px;font-weight:600;cursor:pointer;font-size:12px;">Pause</button>
                            <button class="ss-clear-btn" style="flex:1;background:#da3633;border:none;color:white;padding:6px;border-radius:6px;font-weight:600;cursor:pointer;font-size:12px;">Clear All</button>
                        </div>
                        <div style="display:flex;flex-direction:column;gap:4px;">
                            <label style="font-size:11px;color:#8b949e;display:flex;justify-content:space-between;"><span>Time Speed</span><span class="ss-speed-val">1.0x</span></label>
                            <input type="range" class="ss-speed-slider" min="0.1" max="3" step="0.1" value="1" style="accent-color:#238636;">
                        </div>
                        <div style="display:flex;flex-direction:column;gap:4px;">
                            <label style="font-size:11px;color:#8b949e;display:flex;justify-content:space-between;"><span>Gravity (G)</span><span class="ss-grav-val">1.0</span></label>
                            <input type="range" class="ss-grav-slider" min="0.2" max="3" step="0.2" value="1" style="accent-color:#238636;">
                        </div>
                    </div>

                    <!-- Presets -->
                    <div style="background:#21262d;border:1px solid #30363d;border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:6px;">
                        <h3 style="font-size:13px;font-weight:600;margin:0;color:#c9d1d9;">Presets</h3>
                        <button class="ss-preset-btn" data-preset="solar" style="background:#30363d;border:none;color:white;padding:6px;border-radius:6px;text-align:left;cursor:pointer;font-size:11px;">☀️ Inner Solar System</button>
                        <button class="ss-preset-btn" data-preset="swing" style="background:#30363d;border:none;color:white;padding:6px;border-radius:6px;text-align:left;cursor:pointer;font-size:11px;">🎢 Orbit Swing Pendulum</button>
                        <button class="ss-preset-btn" data-preset="binary" style="background:#30363d;border:none;color:white;padding:6px;border-radius:6px;text-align:left;cursor:pointer;font-size:11px;">⭐ Binary Star System</button>
                        <button class="ss-preset-btn" data-preset="slingshot" style="background:#30363d;border:none;color:white;padding:6px;border-radius:6px;text-align:left;cursor:pointer;font-size:11px;">☄️ Slingshot Maneuver</button>
                    </div>

                    <div style="margin-top:auto;font-size:11px;color:#6e7681;text-align:center;">
                        💡 Click & drag to launch planets with velocity!
                    </div>
                </div>

                <!-- Canvas Area -->
                <div style="flex:1;position:relative;background:#0d1117;display:flex;align-items:center;justify-content:center;overflow:hidden;">
                    <canvas class="ss-canvas" style="display:block;width:100%;height:100%;cursor:crosshair;"></canvas>
                    <div style="position:absolute;top:12px;left:16px;background:rgba(22,27,34,0.85);backdrop-filter:blur(4px);border:1px solid #30363d;padding:6px 12px;border-radius:6px;font-size:11px;color:#c9d1d9;pointer-events:none;display:flex;gap:16px;">
                        <span>Bodies: <strong class="ss-count">0</strong></span>
                        <span>Tool: <strong class="ss-tool-name" style="color:#58a6ff;">Spawn Planet</strong></span>
                        <span>Sound: <strong>On 🔊</strong></span>
                    </div>
                </div>
            </div>
        `;
    }

    function launch() {
        const win = WindowManager.createWindow('solarSpacer', 'Solar Spacer Sandbox', icon, getContent(), { width: 950, height: 640 });
        const el = win.element;
        const canvas = el.querySelector('.ss-canvas');
        const ctx = canvas.getContext('2d');

        let bodies = [];
        let isRunning = true;
        let timeSpeed = 1.0;
        let G = 1.0;
        let activeTool = 'spawn'; // 'spawn' | 'grab' | 'well' | 'delete'
        let newMass = 15;
        let newColor = '#4db2ff';

        // Interaction state
        let isDragging = false;
        let dragStartX = 0;
        let dragStartY = 0;
        let currentMouseX = 0;
        let currentMouseY = 0;
        let grabbedBody = null;
        let activeWell = null; // { x, y, strength }

        function loadPreset(type) {
            bodies = [];
            activeWell = null;
            if (type === 'solar') {
                bodies.push({ x: 0, y: 0, vx: 0, vy: 0, mass: 2000, radius: 24, color: '#ffaa00', name: 'Sun', trail: [] });
                bodies.push({ x: 0, y: -70, vx: 5.3, vy: 0, mass: 5, radius: 4, color: '#a0a0a0', name: 'Mercury', trail: [] });
                bodies.push({ x: 0, y: -110, vx: 4.2, vy: 0, mass: 12, radius: 7, color: '#e3bb76', name: 'Venus', trail: [] });
                bodies.push({ x: 0, y: -170, vx: 3.4, vy: 0, mass: 15, radius: 8, color: '#4db2ff', name: 'Earth', trail: [] });
                bodies.push({ x: 0, y: -185, vx: 4.8, vy: 0, mass: 1, radius: 3, color: '#cccccc', name: 'Moon', trail: [] });
                bodies.push({ x: 0, y: -240, vx: 2.8, vy: 0, mass: 8, radius: 6, color: '#ff5533', name: 'Mars', trail: [] });
            } else if (type === 'swing') {
                // Orbit Swing Pendulum setup
                bodies.push({ x: 0, y: 0, vx: 0, vy: 0, mass: 2500, radius: 26, color: '#ffaa00', name: 'Anchor Star', trail: [] });
                bodies.push({ x: 0, y: -150, vx: 4.1, vy: 0, mass: 20, radius: 9, color: '#39d353', name: 'Swing Planet', trail: [] });
                bodies.push({ x: 0, y: -230, vx: 3.2, vy: 0, mass: 5, radius: 5, color: '#a371f7', name: 'Outer Comet', trail: [] });
            } else if (type === 'binary') {
                bodies.push({ x: -70, y: 0, vx: 0, vy: -2.8, mass: 1200, radius: 18, color: '#ff4500', name: 'Alpha', trail: [] });
                bodies.push({ x: 70, y: 0, vx: 0, vy: 2.8, mass: 1200, radius: 18, color: '#00bfff', name: 'Beta', trail: [] });
                bodies.push({ x: 0, y: -220, vx: 2.6, vy: 0, mass: 8, radius: 6, color: '#39d353', name: 'Planet', trail: [] });
            } else if (type === 'slingshot') {
                bodies.push({ x: -220, y: 160, vx: 3.5, vy: -1.3, mass: 40, radius: 8, color: '#ff7b72', name: 'Probe', trail: [] });
                bodies.push({ x: 0, y: 0, vx: 0, vy: 0, mass: 1800, radius: 22, color: '#ffaa00', name: 'Sun', trail: [] });
                bodies.push({ x: 140, y: -90, vx: -1.8, vy: 2.5, mass: 400, radius: 14, color: '#a371f7', name: 'Giant', trail: [] });
            }
            Sounds.confirm();
        }

        loadPreset('solar');

        function resizeCanvas() {
            const rect = canvas.getBoundingClientRect();
            if (rect.width && rect.height) {
                canvas.width = rect.width;
                canvas.height = rect.height;
            }
        }
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

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

        playBtn.addEventListener('click', () => {
            isRunning = !isRunning;
            playBtn.textContent = isRunning ? 'Pause' : 'Play';
            playBtn.style.background = isRunning ? '#238636' : '#1f6feb';
            Sounds.click();
        });

        clearBtn.addEventListener('click', () => {
            bodies = [];
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
                el.querySelectorAll('.ss-color-opt').forEach(o => o.style.border = '2px solid transparent');
                opt.style.border = '2px solid white';
                newColor = opt.dataset.color;
                Sounds.click();
            });
        });

        el.querySelectorAll('.ss-tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                el.querySelectorAll('.ss-tool-btn').forEach(b => {
                    b.style.background = '#30363d';
                    b.classList.remove('active');
                });
                btn.style.background = '#238636';
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

        // Mouse event handlers for sandbox interactions
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
                // Find clicked body
                for (let b of bodies) {
                    const dist = Math.hypot(b.x - x, b.y - y);
                    if (dist <= Math.max(b.radius + 4, 12)) {
                        grabbedBody = b;
                        break;
                    }
                }
            } else if (activeTool === 'well') {
                activeWell = { x, y, strength: 3000 };
                Sounds.info();
            } else if (activeTool === 'delete') {
                bodies = bodies.filter(b => Math.hypot(b.x - x, b.y - y) > Math.max(b.radius + 4, 15));
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
                const rect = canvas.getBoundingClientRect();
                const cx = rect.width / 2;
                const cy = rect.height / 2;
                const endX = e.clientX - rect.left - cx;
                const endY = e.clientY - rect.top - cy;

                // Velocity vector proportional to drag vector
                const vx = (dragStartX - endX) * 0.08;
                const vy = (dragStartY - endY) * 0.08;
                const radius = Math.max(3, Math.min(25, Math.cbrt(newMass) * 2.2));

                bodies.push({
                    x: dragStartX,
                    y: dragStartY,
                    vx, vy,
                    mass: newMass,
                    radius,
                    color: newColor,
                    name: newMass > 300 ? 'Star' : 'Planet ' + (bodies.length + 1),
                    trail: []
                });
                Sounds.confirm();
            }

            if (grabbedBody) {
                // Throw with velocity based on release movement
                grabbedBody = null;
            }

            isDragging = false;
        });

        let animId;
        function updatePhysics() {
            if (!isRunning) return;
            const dt = 0.5 * timeSpeed;

            // Apply active swing/gravity well if active
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

            // N-body gravity calculation
            for (let i = 0; i < bodies.length; i++) {
                let bi = bodies[i];
                for (let j = i + 1; j < bodies.length; j++) {
                    let bj = bodies[j];
                    let dx = bj.x - bi.x;
                    let dy = bj.y - bi.y;
                    let distSq = dx * dx + dy * dy + 100;
                    let dist = Math.sqrt(distSq);

                    // Collision / Merger check
                    if (dist < bi.radius + bj.radius) {
                        // Merge smaller into larger
                        if (bi.mass >= bj.mass) {
                            bi.vx = (bi.mass * bi.vx + bj.mass * bj.vx) / (bi.mass + bj.mass);
                            bi.vy = (bi.mass * bi.vy + bj.mass * bj.vy) / (bi.mass + bj.mass);
                            bi.mass += bj.mass;
                            bi.radius = Math.max(bi.radius, Math.cbrt(bi.mass) * 2);
                            bodies.splice(j, 1);
                            j--;
                            continue;
                        }
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

                if (Math.random() < 0.35) {
                    b.trail.push({ x: b.x, y: b.y });
                    if (b.trail.length > 60) b.trail.shift();
                }
            }
        }

        function draw() {
            updatePhysics();
            countEl.textContent = bodies.length;

            ctx.fillStyle = '#0d1117';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.save();
            ctx.translate(canvas.width / 2, canvas.height / 2);

            // Draw active well / swing attractor
            if (activeWell) {
                ctx.beginPath();
                ctx.arc(activeWell.x, activeWell.y, 18, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(88, 166, 255, 0.25)';
                ctx.fill();
                ctx.strokeStyle = '#58a6ff';
                ctx.lineWidth = 2;
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(activeWell.x, activeWell.y, 6, 0, Math.PI * 2);
                ctx.fillStyle = '#58a6ff';
                ctx.fill();
            }

            // Draw trails
            for (let b of bodies) {
                if (b.trail.length > 1) {
                    ctx.beginPath();
                    ctx.strokeStyle = b.color;
                    ctx.lineWidth = 1.2;
                    ctx.globalAlpha = 0.35;
                    ctx.moveTo(b.trail[0].x, b.trail[0].y);
                    for (let pt of b.trail) {
                        ctx.lineTo(pt.x, pt.y);
                    }
                    ctx.stroke();
                    ctx.globalAlpha = 1.0;
                }
            }

            // Draw bodies
            for (let b of bodies) {
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
                ctx.fillStyle = b.color;
                ctx.shadowColor = b.color;
                ctx.shadowBlur = b.mass > 200 ? 18 : 6;
                ctx.fill();
                ctx.shadowBlur = 0;

                if (b.mass > 5 || b.radius > 5) {
                    ctx.fillStyle = '#c9d1d9';
                    ctx.font = '10px Segoe UI';
                    ctx.textAlign = 'center';
                    ctx.fillText(b.name, b.x, b.y + b.radius + 12);
                }
            }

            // Draw spawn velocity vector preview line
            if (activeTool === 'spawn' && isDragging) {
                ctx.beginPath();
                ctx.arc(dragStartX, dragStartY, Math.max(3, Math.min(25, Math.cbrt(newMass) * 2.2)), 0, Math.PI * 2);
                ctx.fillStyle = newColor;
                ctx.globalAlpha = 0.7;
                ctx.fill();
                ctx.globalAlpha = 1.0;

                ctx.beginPath();
                ctx.moveTo(dragStartX, dragStartY);
                ctx.lineTo(currentMouseX, currentMouseY);
                ctx.strokeStyle = '#58a6ff';
                ctx.lineWidth = 2;
                ctx.setLineDash([4, 4]);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            ctx.restore();
            animId = requestAnimationFrame(draw);
        }

        animId = requestAnimationFrame(draw);

        WindowManager.setCloseHandler('solarSpacer', () => {
            cancelAnimationFrame(animId);
            window.removeEventListener('resize', resizeCanvas);
            return true;
        });
    }

    return { launch, icon };
})();

export default SolarSpacer;
