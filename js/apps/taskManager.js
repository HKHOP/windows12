import WindowManager from '../modules/windowManager.js';
import AppIcons from '../modules/appIcons.js';

const TaskManager = (() => {
    const icon = AppIcons.get('taskManager');

    function getContent() {
        return `
            <div style="display:flex;flex-direction:column;height:100%;">
                <div class="tm-tabs" style="display:flex;gap:0;border-bottom:1px solid var(--window-border);background:rgba(0,0,0,0.1);">
                    <button class="tm-tab tm-tab-active" data-tab="processes">Processes</button>
                    <button class="tm-tab" data-tab="performance">Performance</button>
                    <button class="tm-tab" data-tab="startup">Startup</button>
                </div>
                <div class="tm-content" style="flex:1;overflow:auto;padding:0;"></div>
                <div style="padding:6px 12px;border-top:1px solid var(--window-border);display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--text-secondary);">
                    <span class="tm-status">Ready</span>
                    <button class="tm-end-btn" style="padding:4px 12px;border:1px solid var(--window-border);background:var(--hover-bg);color:var(--text-primary);border-radius:4px;cursor:pointer;font-size:12px;" disabled>End task</button>
                </div>
            </div>
        `;
    }

    function launch() {
        const win = WindowManager.createWindow('taskManager', 'Task Manager', icon, getContent(), { width: 650, height: 450 });

        setupTabs(win);
        showProcesses(win);

        let updateInterval = setInterval(() => {
            const activeTab = win.element.querySelector('.tm-tab-active')?.dataset.tab;
            if (activeTab === 'processes') showProcesses(win, false);
            else if (activeTab === 'performance') showPerformance(win);
        }, 2000);

        const origClose = win.element.querySelector('.close-btn');
        if (origClose) {
            origClose.addEventListener('click', () => {
                if (updateInterval) {
                    clearInterval(updateInterval);
                    updateInterval = null;
                }
            });
        }
    }

    function setupTabs(win) {
        win.element.querySelectorAll('.tm-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                win.element.querySelectorAll('.tm-tab').forEach(t => {
                    t.classList.remove('tm-tab-active');
                    t.style.background = 'transparent';
                    t.style.borderBottom = 'none';
                });
                tab.classList.add('tm-tab-active');
                tab.style.background = 'var(--hover-bg)';
                tab.style.borderBottom = '2px solid var(--accent-color)';

                const tabName = tab.dataset.tab;
                if (tabName === 'processes') showProcesses(win);
                else if (tabName === 'performance') showPerformance(win);
                else if (tabName === 'startup') showStartup(win);
            });
        });

        win.element.querySelectorAll('.tm-tab').forEach(t => {
            t.style.cssText = 'padding:8px 16px;border:none;background:transparent;color:var(--text-primary);cursor:pointer;font-size:13px;border-bottom:2px solid transparent;transition:background 0.12s;';
            t.addEventListener('mouseenter', () => { if (!t.classList.contains('tm-tab-active')) t.style.background = 'var(--hover-bg)'; });
            t.addEventListener('mouseleave', () => { if (!t.classList.contains('tm-tab-active')) t.style.background = 'transparent'; });
        });

        const activeTab = win.element.querySelector('.tm-tab-active');
        if (activeTab) {
            activeTab.style.background = 'var(--hover-bg)';
            activeTab.style.borderBottom = '2px solid var(--accent-color)';
        }
    }

    function showProcesses(win, animate = true) {
        const content = win.element.querySelector('.tm-content');
        const endBtn = win.element.querySelector('.tm-end-btn');
        const status = win.element.querySelector('.tm-status');

        const windows = WindowManager.getAllWindows();
        const processes = windows.map(w => ({
            id: w.id,
            name: w.title || 'Unknown',
            appId: w.appId,
            cpu: (Math.random() * 15 + 0.5).toFixed(1),
            memory: (Math.random() * 80 + 5).toFixed(0),
            disk: (Math.random() * 2).toFixed(1),
            network: (Math.random() * 0.5).toFixed(2),
            pid: Math.floor(Math.random() * 9000 + 1000),
            isSystem: false
        }));

        processes.unshift({
            id: 'system',
            name: 'Windows 12 Shell',
            appId: 'system',
            cpu: (Math.random() * 5 + 0.2).toFixed(1),
            memory: '24',
            disk: '0.0',
            network: '0.00',
            pid: 4,
            isSystem: true
        });

        processes.push({
            id: 'fileSystem',
            name: 'File System Service',
            appId: 'system',
            cpu: (Math.random() * 2 + 0.1).toFixed(1),
            memory: '8',
            disk: '0.0',
            network: '0.00',
            pid: 8,
            isSystem: true
        });

        processes.push({
            id: 'userActivity',
            name: 'User Activity Tracker',
            appId: 'system',
            cpu: (Math.random() * 1 + 0.1).toFixed(1),
            memory: '4',
            disk: '0.0',
            network: '0.00',
            pid: 12,
            isSystem: true
        });

        let selectedId = null;

        content.innerHTML = `
            <table style="width:100%;border-collapse:collapse;font-size:12px;">
                <thead>
                    <tr style="position:sticky;top:0;background:var(--window-bg);border-bottom:1px solid var(--window-border);">
                        <th style="text-align:left;padding:6px 12px;font-weight:500;">Name</th>
                        <th style="text-align:right;padding:6px 8px;font-weight:500;width:60px;">CPU</th>
                        <th style="text-align:right;padding:6px 8px;font-weight:500;width:60px;">Memory</th>
                        <th style="text-align:right;padding:6px 8px;font-weight:500;width:50px;">Disk</th>
                        <th style="text-align:right;padding:6px 8px;font-weight:500;width:80px;">Network</th>
                        <th style="text-align:right;padding:6px 8px;font-weight:500;width:60px;">PID</th>
                    </tr>
                </thead>
                <tbody>
                    ${processes.map(p => `
                        <tr class="tm-process" data-id="${p.id}" data-system="${p.isSystem}" style="cursor:pointer;transition:background 0.1s;${p.isSystem ? 'opacity:0.6;' : ''}">
                            <td style="padding:5px 12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px;">${p.name}</td>
                            <td style="text-align:right;padding:5px 8px;color:${parseFloat(p.cpu) > 10 ? '#ff6b6b' : 'inherit'};">${p.cpu}%</td>
                            <td style="text-align:right;padding:5px 8px;">${p.memory} MB</td>
                            <td style="text-align:right;padding:5px 8px;">${p.disk}%</td>
                            <td style="text-align:right;padding:5px 8px;">${p.network} Mbps</td>
                            <td style="text-align:right;padding:5px 8px;color:#888;">${p.pid}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        const totalCpu = processes.reduce((sum, p) => sum + parseFloat(p.cpu), 0).toFixed(1);
        const totalMem = processes.reduce((sum, p) => sum + parseInt(p.memory), 0);
        status.textContent = `${processes.length} processes | CPU: ${totalCpu}% | Memory: ${totalMem} MB`;

        content.querySelectorAll('.tm-process').forEach(row => {
            row.addEventListener('mouseenter', () => { if (row.dataset.id !== selectedId) row.style.background = 'var(--hover-bg)'; });
            row.addEventListener('mouseleave', () => { if (row.dataset.id !== selectedId) row.style.background = 'transparent'; });
            row.addEventListener('click', () => {
                content.querySelectorAll('.tm-process').forEach(r => r.style.background = 'transparent');
                row.style.background = 'rgba(0,120,212,0.2)';
                selectedId = row.dataset.id;
                endBtn.disabled = row.dataset.system === 'true';
            });
        });

        endBtn.onclick = () => {
            if (selectedId && selectedId !== 'system') {
                const row = content.querySelector(`.tm-process[data-id="${selectedId}"]`);
                const processName = row ? row.querySelector('td').textContent : 'Unknown';
                showKillConfirmation(win, selectedId, processName);
            }
        };
    }

    function showKillConfirmation(win, processId, processName) {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;border-radius:var(--radius);';

        overlay.innerHTML = `
            <div style="background:var(--window-bg);border:1px solid var(--window-border);border-radius:8px;padding:24px;max-width:400px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
                    <div style="width:40px;height:40px;background:rgba(255,80,80,0.2);border-radius:50%;display:flex;align-items:center;justify-content:center;">
                        <span style="font-size:20px;">⚠️</span>
                    </div>
                    <div>
                        <div style="font-size:16px;font-weight:500;">End Process</div>
                        <div style="font-size:13px;color:var(--text-secondary);">Are you sure you want to end this process?</div>
                    </div>
                </div>
                <div style="background:var(--hover-bg);border-radius:6px;padding:12px;margin-bottom:16px;">
                    <div style="font-size:13px;color:var(--text-secondary);">Process:</div>
                    <div style="font-size:14px;font-weight:500;">${processName}</div>
                </div>
                <div style="display:flex;justify-content:flex-end;gap:8px;">
                    <button class="tm-confirm-cancel" style="padding:6px 16px;border:1px solid var(--window-border);background:var(--hover-bg);color:var(--text-primary);border-radius:4px;cursor:pointer;font-size:13px;">Cancel</button>
                    <button class="tm-confirm-end" style="padding:6px 16px;border:none;background:#E81123;color:white;border-radius:4px;cursor:pointer;font-size:13px;">End process</button>
                </div>
            </div>
        `;

        win.element.appendChild(overlay);

        overlay.querySelector('.tm-confirm-cancel').addEventListener('click', () => overlay.remove());
        overlay.querySelector('.tm-confirm-end').addEventListener('click', () => {
            WindowManager.closeWindow(processId);
            overlay.remove();
            showProcesses(win);
        });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });
    }

    function showPerformance(win) {
        const content = win.element.querySelector('.tm-content');
        const endBtn = win.element.querySelector('.tm-end-btn');
        const status = win.element.querySelector('.tm-status');
        endBtn.disabled = true;

        const cpuUsage = (Math.random() * 30 + 5).toFixed(1);
        const memUsage = (Math.random() * 40 + 20).toFixed(1);
        const diskUsage = (Math.random() * 10 + 1).toFixed(1);

        content.innerHTML = `
            <div style="padding:16px;display:grid;grid-template-columns:repeat(3,1fr);gap:16px;">
                <div class="tm-perf-card" style="background:var(--hover-bg);border-radius:8px;padding:16px;text-align:center;">
                    <div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">CPU</div>
                    <div style="font-size:32px;font-weight:600;color:var(--accent-color);margin-bottom:4px;">${cpuUsage}%</div>
                    <div style="height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;">
                        <div style="height:100%;width:${cpuUsage}%;background:var(--accent-color);border-radius:3px;transition:width 0.3s;"></div>
                    </div>
                    <div style="font-size:10px;color:var(--text-secondary);margin-top:6px;">Virtual Processor</div>
                </div>
                <div class="tm-perf-card" style="background:var(--hover-bg);border-radius:8px;padding:16px;text-align:center;">
                    <div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Memory</div>
                    <div style="font-size:32px;font-weight:600;color:#00b894;margin-bottom:4px;">${memUsage}%</div>
                    <div style="height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;">
                        <div style="height:100%;width:${memUsage}%;background:#00b894;border-radius:3px;transition:width 0.3s;"></div>
                    </div>
                    <div style="font-size:10px;color:var(--text-secondary);margin-top:6px;">${(parseInt(memUsage) * 0.08).toFixed(1)} GB / 8 GB</div>
                </div>
                <div class="tm-perf-card" style="background:var(--hover-bg);border-radius:8px;padding:16px;text-align:center;">
                    <div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Disk</div>
                    <div style="font-size:32px;font-weight:600;color:#e17055;margin-bottom:4px;">${diskUsage}%</div>
                    <div style="height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;">
                        <div style="height:100%;width:${diskUsage * 10}%;background:#e17055;border-radius:3px;transition:width 0.3s;"></div>
                    </div>
                    <div style="font-size:10px;color:var(--text-secondary);margin-top:6px;">C: SSD</div>
                </div>
            </div>
            <div style="padding:0 16px 16px;">
                <div style="background:var(--hover-bg);border-radius:8px;padding:16px;">
                    <div style="font-size:12px;font-weight:500;margin-bottom:12px;">System Info</div>
                    <div style="display:grid;grid-template-columns:120px 1fr;gap:6px;font-size:12px;">
                        <span style="color:var(--text-secondary);">OS:</span><span>Windows 12</span>
                        <span style="color:var(--text-secondary);">Uptime:</span><span>${getUptime()}</span>
                        <span style="color:var(--text-secondary);">Processes:</span><span>${WindowManager.getAllWindows().length + 3}</span>
                        <span style="color:var(--text-secondary);">Threads:</span><span>${(WindowManager.getAllWindows().length + 3) * 8}</span>
                        <span style="color:var(--text-secondary);">CPU Cores:</span><span>4</span>
                        <span style="color:var(--text-secondary);">Total Memory:</span><span>8 GB</span>
                    </div>
                </div>
            </div>
        `;

        status.textContent = `CPU: ${cpuUsage}% | Memory: ${memUsage}% | Disk: ${diskUsage}%`;
    }

    function showStartup(win) {
        const content = win.element.querySelector('.tm-content');
        const endBtn = win.element.querySelector('.tm-end-btn');
        const status = win.element.querySelector('.tm-status');
        endBtn.disabled = true;

        const startupItems = [
            { name: 'System Config', status: 'Enabled', publisher: 'Windows 12', impact: 'High' },
            { name: 'User Activity Tracker', status: 'Enabled', publisher: 'Windows 12', impact: 'Low' },
            { name: 'Desktop Icons Service', status: 'Enabled', publisher: 'Windows 12', impact: 'Low' }
        ];

        content.innerHTML = `
            <table style="width:100%;border-collapse:collapse;font-size:12px;">
                <thead>
                    <tr style="position:sticky;top:0;background:var(--window-bg);border-bottom:1px solid var(--window-border);">
                        <th style="text-align:left;padding:8px 12px;font-weight:500;">Name</th>
                        <th style="text-align:left;padding:8px 12px;font-weight:500;">Publisher</th>
                        <th style="text-align:left;padding:8px 12px;font-weight:500;">Status</th>
                        <th style="text-align:left;padding:8px 12px;font-weight:500;">Impact</th>
                    </tr>
                </thead>
                <tbody>
                    ${startupItems.map(item => `
                        <tr style="border-bottom:1px solid var(--window-border);">
                            <td style="padding:8px 12px;">${item.name}</td>
                            <td style="padding:8px 12px;color:var(--text-secondary);">${item.publisher}</td>
                            <td style="padding:8px 12px;color:#00b894;">${item.status}</td>
                            <td style="padding:8px 12px;color:var(--text-secondary);">${item.impact}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        status.textContent = `${startupItems.length} startup items`;
    }

    function getUptime() {
        const start = performance.timing.navigationStart;
        const diff = Date.now() - start;
        const hours = Math.floor(diff / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        return `${hours}h ${mins}m ${secs}s`;
    }

    return { launch };
})();

export default TaskManager;
