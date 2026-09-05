import WindowManager from '../modules/windowManager.js';
import AppIcons from '../modules/appIcons.js';

const Clock = (() => {
    const icon = AppIcons.get('clock');

    let activeTab = 'clock';
    let win = null;
    let clockInterval = null;

    // Timer state
    let timerState = { running: false, remaining: 0, interval: null, input: { h: 0, m: 0, s: 0 } };

    // Stopwatch state
    let swState = { running: false, elapsed: 0, interval: null, start: 0, laps: [] };

    function getContent() {
        return `
            <div style="display:flex;flex-direction:column;height:100%;">
                <div style="display:flex;gap:2px;padding:4px 8px;background:rgba(0,0,0,0.2);border-bottom:1px solid rgba(255,255,255,0.06);">
                    <button class="clock-tab-btn" data-tab="clock" style="background:${activeTab==='clock'?'rgba(255,255,255,0.1)':'none'};border:none;color:${activeTab==='clock'?'#fff':'#aaa'};padding:6px 14px;border-radius:4px;cursor:pointer;font-size:13px;">Clock</button>
                    <button class="clock-tab-btn" data-tab="timer" style="background:${activeTab==='timer'?'rgba(255,255,255,0.1)':'none'};border:none;color:${activeTab==='timer'?'#fff':'#aaa'};padding:6px 14px;border-radius:4px;cursor:pointer;font-size:13px;">Timer</button>
                    <button class="clock-tab-btn" data-tab="stopwatch" style="background:${activeTab==='stopwatch'?'rgba(255,255,255,0.1)':'none'};border:none;color:${activeTab==='stopwatch'?'#fff':'#aaa'};padding:6px 14px;border-radius:4px;cursor:pointer;font-size:13px;">Stopwatch</button>
                </div>
                <div class="clock-content" style="flex:1;display:flex;align-items:center;justify-content:center;overflow-y:auto;padding:20px;"></div>
            </div>
        `;
    }

    function renderTab() {
        const contentEl = win.element.querySelector('.clock-content');
        const tabs = win.element.querySelectorAll('.clock-tab-btn');
        tabs.forEach(t => {
            t.style.background = t.dataset.tab === activeTab ? 'rgba(255,255,255,0.1)' : 'none';
            t.style.color = t.dataset.tab === activeTab ? '#fff' : '#aaa';
        });

        if (activeTab === 'clock') renderClock(contentEl);
        else if (activeTab === 'timer') renderTimer(contentEl);
        else renderStopwatch(contentEl);
    }

    function renderClock(el) {
        el.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;gap:20px;">
                <div class="analog-clock" style="width:200px;height:200px;border-radius:50%;border:3px solid rgba(255,255,255,0.2);position:relative;background:rgba(0,0,0,0.3);box-shadow:0 0 20px rgba(0,0,0,0.3);">
                    <div class="clock-center" style="position:absolute;top:50%;left:50%;width:10px;height:10px;background:#fff;border-radius:50%;transform:translate(-50%,-50%);z-index:10;"></div>
                    <div class="clock-hand clock-hand-h" style="position:absolute;bottom:50%;left:50%;width:3px;height:55px;background:#fff;transform-origin:bottom center;border-radius:2px;transform:translateX(-50%) rotate(0deg);z-index:4;"></div>
                    <div class="clock-hand clock-hand-m" style="position:absolute;bottom:50%;left:50%;width:2px;height:75px;background:rgba(255,255,255,0.8);transform-origin:bottom center;border-radius:2px;transform:translateX(-50%) rotate(0deg);z-index:3;"></div>
                    <div class="clock-hand clock-hand-s" style="position:absolute;bottom:50%;left:50%;width:1px;height:85px;background:#e74c3c;transform-origin:bottom center;border-radius:1px;transform:translateX(-50%) rotate(0deg);z-index:5;"></div>
                    ${renderClockMarkers()}
                </div>
                <div class="clock-digital" style="font-size:36px;font-weight:300;letter-spacing:2px;font-family:'Segoe UI',sans-serif;"></div>
                <div class="clock-date" style="font-size:14px;color:#aaa;"></div>
            </div>
        `;
        updateClock();
    }

    function renderClockMarkers() {
        let markers = '';
        for (let i = 0; i < 12; i++) {
            const angle = i * 30;
            const isMain = i % 3 === 0;
            markers += `<div style="position:absolute;top:50%;left:50%;width:${isMain?2:1}px;height:${isMain?12:6}px;background:rgba(255,255,255,${isMain?0.8:0.4});transform-origin:center ${isMain?0:0}px;transform:translate(-50%,0) rotate(${angle}deg) translateY(-${isMain?88:91}px);border-radius:1px;"></div>`;
        }
        return markers;
    }

    function updateClock() {
        if (!win || activeTab !== 'clock') return;
        const now = new Date();
        const h = now.getHours() % 12;
        const m = now.getMinutes();
        const s = now.getSeconds();
        const ms = now.getMilliseconds();

        const hDeg = (h + m / 60) * 30;
        const mDeg = (m + s / 60) * 6;
        const sDeg = (s + ms / 1000) * 6;

        const handH = win.element.querySelector('.clock-hand-h');
        const handM = win.element.querySelector('.clock-hand-m');
        const handS = win.element.querySelector('.clock-hand-s');
        const digital = win.element.querySelector('.clock-digital');
        const dateEl = win.element.querySelector('.clock-date');

        if (handH) handH.style.transform = `translateX(-50%) rotate(${hDeg}deg)`;
        if (handM) handM.style.transform = `translateX(-50%) rotate(${mDeg}deg)`;
        if (handS) handS.style.transform = `translateX(-50%) rotate(${sDeg}deg)`;
        if (digital) digital.textContent = formatTime12(now);
        if (dateEl) dateEl.textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }

    function formatTime12(d) {
        let h = d.getHours();
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        return `${h}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')} ${ampm}`;
    }

    function renderTimer(el) {
        const rem = timerState.remaining;
        const running = timerState.running;
        const total = timerState.input.h * 3600 + timerState.input.m * 60 + timerState.input.s;
        const showInputs = !running && rem === 0;

        el.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;gap:24px;width:100%;">
                <div class="timer-display" style="font-size:48px;font-weight:200;letter-spacing:3px;font-family:'Segoe UI',sans-serif;min-height:60px;display:flex;align-items:center;">
                    ${showInputs ? renderTimerInputs() : formatDuration(rem)}
                </div>
                <div style="display:flex;gap:12px;">
                    ${showInputs
                        ? `<button class="clock-btn timer-start-btn" style="background:var(--accent-color,#4a90d9);color:#fff;border:none;padding:10px 28px;border-radius:6px;cursor:pointer;font-size:14px;">Start</button>`
                        : running
                            ? `<button class="clock-btn timer-pause-btn" style="background:rgba(255,255,255,0.1);color:#fff;border:none;padding:10px 28px;border-radius:6px;cursor:pointer;font-size:14px;">Pause</button>
                               <button class="clock-btn timer-reset-btn" style="background:rgba(255,255,255,0.1);color:#fff;border:none;padding:10px 28px;border-radius:6px;cursor:pointer;font-size:14px;">Reset</button>`
                            : `<button class="clock-btn timer-resume-btn" style="background:var(--accent-color,#4a90d9);color:#fff;border:none;padding:10px 28px;border-radius:6px;cursor:pointer;font-size:14px;">Resume</button>
                               <button class="clock-btn timer-reset-btn" style="background:rgba(255,255,255,0.1);color:#fff;border:none;padding:10px 28px;border-radius:6px;cursor:pointer;font-size:14px;">Reset</button>`
                    }
                </div>
            </div>
        `;

        if (showInputs) {
            el.querySelectorAll('.timer-input').forEach(inp => {
                inp.addEventListener('change', () => {
                    timerState.input.h = parseInt(el.querySelector('.timer-h').value) || 0;
                    timerState.input.m = parseInt(el.querySelector('.timer-m').value) || 0;
                    timerState.input.s = parseInt(el.querySelector('.timer-s').value) || 0;
                });
            });
        }

        const startBtn = el.querySelector('.timer-start-btn');
        const pauseBtn = el.querySelector('.timer-pause-btn');
        const resumeBtn = el.querySelector('.timer-resume-btn');
        const resetBtn = el.querySelector('.timer-reset-btn');

        if (startBtn) startBtn.addEventListener('click', startTimer);
        if (pauseBtn) pauseBtn.addEventListener('click', pauseTimer);
        if (resumeBtn) resumeBtn.addEventListener('click', resumeTimer);
        if (resetBtn) resetBtn.addEventListener('click', resetTimer);
    }

    function renderTimerInputs() {
        const pad = v => String(v).padStart(2, '0');
        return `
            <div style="display:flex;align-items:center;gap:6px;">
                <input type="number" class="timer-input timer-h" min="0" max="23" value="${timerState.input.h}" style="width:60px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#fff;padding:8px;border-radius:6px;text-align:center;font-size:28px;font-weight:200;outline:none;">
                <span style="font-size:24px;color:#666;">:</span>
                <input type="number" class="timer-input timer-m" min="0" max="59" value="${timerState.input.m}" style="width:60px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#fff;padding:8px;border-radius:6px;text-align:center;font-size:28px;font-weight:200;outline:none;">
                <span style="font-size:24px;color:#666;">:</span>
                <input type="number" class="timer-input timer-s" min="0" max="59" value="${timerState.input.s}" style="width:60px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#fff;padding:8px;border-radius:6px;text-align:center;font-size:28px;font-weight:200;outline:none;">
            </div>
        `;
    }

    function formatDuration(totalSec) {
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }

    function startTimer() {
        const total = timerState.input.h * 3600 + timerState.input.m * 60 + timerState.input.s;
        if (total <= 0) return;
        timerState.remaining = total;
        timerState.running = true;
        timerState.interval = setInterval(() => {
            timerState.remaining--;
            if (timerState.remaining <= 0) {
                clearInterval(timerState.interval);
                timerState.running = false;
                timerState.remaining = 0;
                timerState.interval = null;
            }
            renderTab();
        }, 1000);
        renderTab();
    }

    function pauseTimer() {
        clearInterval(timerState.interval);
        timerState.running = false;
        timerState.interval = null;
        renderTab();
    }

    function resumeTimer() {
        if (timerState.remaining <= 0) return;
        timerState.running = true;
        timerState.interval = setInterval(() => {
            timerState.remaining--;
            if (timerState.remaining <= 0) {
                clearInterval(timerState.interval);
                timerState.running = false;
                timerState.remaining = 0;
                timerState.interval = null;
            }
            renderTab();
        }, 1000);
        renderTab();
    }

    function resetTimer() {
        clearInterval(timerState.interval);
        timerState = { running: false, remaining: 0, interval: null, input: timerState.input };
        renderTab();
    }

    function renderStopwatch(el) {
        const ms = swState.elapsed;
        const running = swState.running;

        el.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;gap:20px;width:100%;max-width:360px;">
                <div class="sw-display" style="font-size:52px;font-weight:200;letter-spacing:3px;font-family:'Segoe UI',sans-serif;">
                    ${formatStopwatch(ms)}
                </div>
                <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;">
                    ${running
                        ? `<button class="clock-btn sw-pause-btn" style="background:var(--accent-color,#4a90d9);color:#fff;border:none;padding:10px 24px;border-radius:6px;cursor:pointer;font-size:14px;">Pause</button>`
                        : `<button class="clock-btn sw-start-btn" style="background:var(--accent-color,#4a90d9);color:#fff;border:none;padding:10px 24px;border-radius:6px;cursor:pointer;font-size:14px;">${ms > 0 ? 'Resume' : 'Start'}</button>`
                    }
                    ${ms > 0 ? `<button class="clock-btn sw-lap-btn" style="background:rgba(255,255,255,0.1);color:#fff;border:none;padding:10px 24px;border-radius:6px;cursor:pointer;font-size:14px;">Lap</button>` : ''}
                    ${ms > 0 ? `<button class="clock-btn sw-reset-btn" style="background:rgba(255,255,255,0.1);color:#fff;border:none;padding:10px 24px;border-radius:6px;cursor:pointer;font-size:14px;">Reset</button>` : ''}
                </div>
                <div class="sw-laps" style="width:100%;max-height:180px;overflow-y:auto;margin-top:4px;">
                    ${swState.laps.map((lap, i) => `
                        <div style="display:flex;justify-content:space-between;padding:6px 12px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:13px;color:#aaa;">
                            <span>Lap ${swState.laps.length - i}</span>
                            <span style="color:#ddd;font-variant-numeric:tabular-nums;">${formatStopwatch(lap)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        const startBtn = el.querySelector('.sw-start-btn');
        const pauseBtn = el.querySelector('.sw-pause-btn');
        const lapBtn = el.querySelector('.sw-lap-btn');
        const resetBtn = el.querySelector('.sw-reset-btn');

        if (startBtn) startBtn.addEventListener('click', startStopwatch);
        if (pauseBtn) pauseBtn.addEventListener('click', pauseStopwatch);
        if (lapBtn) lapBtn.addEventListener('click', lapStopwatch);
        if (resetBtn) resetBtn.addEventListener('click', resetStopwatch);
    }

    function formatStopwatch(ms) {
        const totalSec = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSec / 60);
        const seconds = totalSec % 60;
        const centis = Math.floor((ms % 1000) / 10);
        return `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}.${String(centis).padStart(2,'0')}`;
    }

    function startStopwatch() {
        swState.running = true;
        swState.start = performance.now() - swState.elapsed;
        swState.interval = setInterval(() => {
            swState.elapsed = performance.now() - swState.start;
            const display = win ? win.element.querySelector('.sw-display') : null;
            if (display) display.textContent = formatStopwatch(swState.elapsed);
        }, 10);
        renderTab();
    }

    function pauseStopwatch() {
        clearInterval(swState.interval);
        swState.running = false;
        swState.interval = null;
        renderTab();
    }

    function lapStopwatch() {
        swState.laps.unshift(swState.elapsed);
        renderTab();
    }

    function resetStopwatch() {
        clearInterval(swState.interval);
        swState = { running: false, elapsed: 0, interval: null, start: 0, laps: [] };
        renderTab();
    }

    function launch() {
        win = WindowManager.createWindow('clock', 'Clock', icon, getContent(), { width: 400, height: 480 });

        win.element.querySelectorAll('.clock-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                activeTab = btn.dataset.tab;
                renderTab();
            });
        });

        renderTab();

        if (clockInterval) clearInterval(clockInterval);
        clockInterval = setInterval(updateClock, 1000);
    }

    return { launch };
})();

export default Clock;
