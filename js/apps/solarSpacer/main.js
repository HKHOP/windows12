import WindowManager from '../../modules/windowManager.js';
import AppIcons from '../../modules/appIcons.js';

const SolarSpacer = (() => {
    const icon = AppIcons.get('solarSpacer');

    function getContent() {
        return `
            <div style="display:flex;height:100%;background:#0f1117;color:white;font-family:'Segoe UI',sans-serif;overflow:hidden;box-sizing:border-box;">
                <!-- Sidebar Controls / Info -->
                <div style="width:280px;background:#181b22;border-right:1px solid #2a2e39;display:flex;flex-direction:column;padding:16px;gap:16px;overflow-y:auto;flex-shrink:0;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <div style="width:36px;height:36px;background:linear-gradient(135deg, #ffaa00, #ff4500);border-radius:10px;display:flex;align-items:center;justify-content:center;">🪐</div>
                        <div>
                            <h2 style="font-size:16px;font-weight:600;margin:0;">Solar Spacer</h2>
                            <p style="font-size:11px;color:#8b949e;margin:0;">Gravity & Orbit Simulator</p>
                        </div>
                    </div>

                    <div style="background:#21262d;border:1px solid #30363d;border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:10px;">
                        <h3 style="font-size:13px;font-weight:600;margin:0;color:#c9d1d9;">Simulation Controls</h3>
                        <div style="display:flex;gap:8px;">
                            <button class="ss-play-btn" style="flex:1;background:#238636;border:none;color:white;padding:6px;border-radius:6px;font-weight:600;cursor:pointer;font-size:12px;">Pause</button>
                            <button class="ss-reset-btn" style="flex:1;background:#21262d;border:1px solid #30363d;color:c9d1d9;padding:6px;border-radius:6px;font-weight:600;cursor:pointer;font-size:12px;">Reset</button>
                        </div>
                        <div style="display:flex;flex-direction:column;gap:4px;">
                            <label style="font-size:11px;color:#8b949e;display:flex;justify-content:space-between;"><span>Time Speed</span><span class="ss-speed-val">1.0x</span></label>
                            <input type="range" class="ss-speed-slider" min="0.1" max="3" step="0.1" value="1" style="accent-color:#238636;">
                        </div>
                        <div style="display:flex;flex-direction:column;gap:4px;">
                            <label style="font-size:11px;color:#8b949e;display:flex;justify-content:space-between;"><span>Gravity Constant (G)</span><span class="ss-grav-val">1.0</span></label>
                            <input type="range" class="ss-grav-slider" min="0.2" max="3" step="0.2" value="1" style="accent-color:#238636;">
                        </div>
                    </div>

                    <div style="background:#21262d;border:1px solid #30363d;border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px;">
                        <h3 style="font-size:13px;font-weight:600;margin:0;color:#c9d1d9;">Presets</h3>
                        <button class="ss-preset-btn" data-preset="solar" style="background:#30363d;border:none;color:white;padding:6px;border-radius:6px;text-align:left;cursor:pointer;font-size:12px;">☀️ Inner Solar System</button>
                        <button class="ss-preset-btn" data-preset="binary" style="background:#30363d;border:none;color:white;padding:6px;border-radius:6px;text-align:left;cursor:pointer;font-size:12px;">⭐ Binary Star System</button>
                        <button class="ss-preset-btn" data-preset="slingshot" style="background:#30363d;border:none;color:white;padding:6px;border-radius:6px;text-align:left;cursor:pointer;font-size:12px;">☄️ Gravitational Slingshot</button>
                    </div>

                    <div style="background:#21262d;border:1px solid #30363d;border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px;">
                        <h3 style="font-size:13px;font-weight:600;margin:0;color:#c9d1d9;">How Gravity Works</h3>
                        <p style="font-size:11px;color:#8b949e;line-height:1.4;margin:0;">
                            Every mass attracts every other mass with force: <br>
                            <code style="color:#58a6ff;">F = G * (m₁ * m₂) / r²</code><br>
                            Planets maintain stable orbits because their forward velocity balances the inward gravitational pull!
                        </p>
                    </div>

                    <div style="margin-top:auto;font-size:11px;color:#6e7681;text-align:center;">
                        Click on canvas to spawn planet
                    </div>
                </div>

                <!-- Canvas Area -->
                <div style="flex:1;position:relative;background:#0d1117;display:flex;align-items:center;justify-content:center;overflow:hidden;">
                    <canvas class="ss-canvas" style="display:block;width:100%;height:100%;cursor:crosshair;"></canvas>
                    <div style="position:absolute;top:12px;left:16px;background:rgba(22,27,34,0.85);backdrop-filter:blur(4px);border:1px solid #30363d;padding:6px 12px;border-radius:6px;font-size:11px;color:#c9d1d9;pointer-events:none;display:flex;gap:16px;">
                        <span>Bodies: <strong class="ss-count">0</strong></span>
                        <span>Paused: <strong class="ss-status">No</strong></span>
                    </div>
                </div>
            </div>
        `;
    }

    function launch() {
        const win = WindowManager.createWindow('solarSpacer', 'Solar Spacer', icon, getContent(), { width: 900, height: 600 });
        const el = win.element;
        const canvas = el.querySelector('.ss-canvas');
        const ctx = canvas.getContext('2d');

        let bodies = [];
        let isRunning = true;
        let timeSpeed = 1.0;
        let G = 1.0;

        function loadPreset(type) {
            bodies = [];
            if (type === 'solar') {
                // Sun
                bodies.push({ x: 0, y: 0, vx: 0, vy: 0, mass: 2000, radius: 24, color: '#ffaa00', name: 'Sun', trail: [] });
                // Mercury
                bodies.push({ x: 0, y: -70, vx: 5.3, vy: 0, mass: 5, radius: 4, color: '#a0a0a0', name: 'Mercury', trail: [] });
                // Venus
                bodies.push({ x: 0, y: -110, vx: 4.2, vy: 0, mass: 12, radius: 7, color: '#e3bb76', name: 'Venus', trail: [] });
                // Earth & Moon
                bodies.push({ x: 0, y: -170, vx: 3.4, vy: 0, mass: 15, radius: 8, color: '#4db2ff', name: 'Earth', trail: [] });
                bodies.push({ x: 0, y: -185, vx: 4.8, vy: 0, mass: 1, radius: 3, color: '#cccccc', name: 'Moon', trail: [] });
                // Mars
                bodies.push({ x: 0, y: -240, vx: 2.8, vy: 0, mass: 8, radius: 6, color: '#ff5533', name: 'Mars', trail: [] });
            } else if (type === 'binary') {
                // Binary stars
                bodies.push({ x: -60, y: 0, vx: 0, vy: -2.5, mass: 1000, radius: 18, color: '#ff4500', name: 'Alpha', trail: [] });
                bodies.push({ x: 60, y: 0, vx: 0, vy: 2.5, mass: 1000, radius: 18, color: '#00bfff', name: 'Beta', trail: [] });
                // Planet orbiting both
                bodies.push({ x: 0, y: -200, vx: 2.8, vy: 0, mass: 5, radius: 5, color: '#39d353', name: 'Circumbinary Planet', trail: [] });
            } else if (type === 'slingshot') {
                bodies.push({ x: -200, y: 150, vx: 3.2, vy: -1.2, mass: 50, radius: 10, color: '#ff7b72', name: 'Comet', trail: [] });
                bodies.push({ x: 0, y: 0, vx: 0, vy: 0, mass: 1500, radius: 22, color: '#ffaa00', name: 'Sun', trail: [] });
                bodies.push({ x: 120, y: -80, vx: -1.5, vy: 2.2, mass: 300, radius: 14, color: '#a371f7', name: 'Heavy Planet', trail: [] });
            }
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

        // Controls
        const playBtn = el.querySelector('.ss-play-btn');
        const resetBtn = el.querySelector('.ss-reset-btn');
        const speedSlider = el.querySelector('.ss-speed-slider');
        const speedVal = el.querySelector('.ss-speed-val');
        const gravSlider = el.querySelector('.ss-grav-slider');
        const gravVal = el.querySelector('.ss-grav-val');
        const countEl = el.querySelector('.ss-count');
        const statusEl = el.querySelector('.ss-status');

        playBtn.addEventListener('click', () => {
            isRunning = !isRunning;
            playBtn.textContent = isRunning ? 'Pause' : 'Play';
            playBtn.style.background = isRunning ? '#238636' : '#1f6feb';
            statusEl.textContent = isRunning ? 'No' : 'Yes';
        });

        resetBtn.addEventListener('click', () => {
            loadPreset('solar');
        });

        speedSlider.addEventListener('input', () => {
            timeSpeed = parseFloat(speedSlider.value);
            speedVal.textContent = timeSpeed.toFixed(1) + 'x';
        });

        gravSlider.addEventListener('input', () => {
            G = parseFloat(gravSlider.value);
            gravVal.textContent = G.toFixed(1);
        });

        el.querySelectorAll('.ss-preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                loadPreset(btn.dataset.preset);
            });
        });

        // Click on canvas to add planet
        canvas.addEventListener('click', (e) => {
            const rect = canvas.getBoundingClientRect();
            const cx = rect.width / 2;
            const cy = rect.height / 2;
            const x = e.clientX - rect.left - cx;
            const y = e.clientY - rect.top - cy;

            // Random initial velocity perpendicular to center vector
            const angle = Math.atan2(y, x) + Math.PI / 2;
            const v = 2.5 + Math.random() * 1.5;
            bodies.push({
                x, y,
                vx: Math.cos(angle) * v,
                vy: Math.sin(angle) * v,
                mass: 10 + Math.random() * 20,
                radius: 6,
                color: ['#39d353', '#58a6ff', '#ffa657', '#ff7b72', '#a371f7'][Math.floor(Math.random() * 5)],
                name: 'Planet ' + (bodies.length + 1),
                trail: []
            });
        });

        let animId;
        function updatePhysics() {
            if (!isRunning) return;
            const dt = 0.5 * timeSpeed;

            // N-body gravity calculation
            for (let i = 0; i < bodies.length; i++) {
                let bi = bodies[i];
                for (let j = i + 1; j < bodies.length; j++) {
                    let bj = bodies[j];
                    let dx = bj.x - bi.x;
                    let dy = bj.y - bi.y;
                    let distSq = dx * dx + dy * dy + 100; // softening factor
                    let dist = Math.sqrt(distSq);
                    let force = (G * bi.mass * bj.mass) / distSq;

                    let fx = force * (dx / dist);
                    let fy = force * (dy / dist);

                    bi.vx += (fx / bi.mass) * dt;
                    bi.vy += (fy / bi.mass) * dt;
                    bj.vx -= (fx / bj.mass) * dt;
                    bj.vy -= (fy / bj.mass) * dt;
                }
            }

            for (let b of bodies) {
                b.x += b.vx * dt;
                b.y += b.vy * dt;

                // Record trail
                if (Math.random() < 0.3) {
                    b.trail.push({ x: b.x, y: b.y });
                    if (b.trail.length > 50) b.trail.shift();
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

            // Draw trails
            for (let b of bodies) {
                if (b.trail.length > 1) {
                    ctx.beginPath();
                    ctx.strokeStyle = b.color;
                    ctx.lineWidth = 1;
                    ctx.globalAlpha = 0.3;
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
                ctx.shadowBlur = b.mass > 100 ? 15 : 4;
                ctx.fill();
                ctx.shadowBlur = 0;

                // Name label
                if (b.mass > 5 || b.radius > 5) {
                    ctx.fillStyle = '#c9d1d9';
                    ctx.font = '10px Segoe UI';
                    ctx.textAlign = 'center';
                    ctx.fillText(b.name, b.x, b.y + b.radius + 12);
                }
            }

            ctx.restore();
            animId = requestAnimationFrame(draw);
        }

        animId = requestAnimationFrame(draw);

        // Clean up on window close if needed
        WindowManager.setCloseHandler('solarSpacer', () => {
            cancelAnimationFrame(animId);
            window.removeEventListener('resize', resizeCanvas);
            return true;
        });
    }

    return { launch, icon };
})();

export default SolarSpacer;
