import WindowManager from '../modules/windowManager.js';

const Settings = (() => {
    const icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;

    function getContent() {
        return `
            <div style="display:flex;height:100%;">
                <div style="width:220px;background:rgba(0,0,0,0.2);padding:12px 8px;border-right:1px solid rgba(255,255,255,0.06);overflow-y:auto;">
                    <div style="padding:12px;display:flex;align-items:center;gap:12px;margin-bottom:8px;">
                        <div style="width:48px;height:48px;background:linear-gradient(135deg,#667eea,#764ba2);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:600;">U</div>
                        <div>
                            <div style="font-size:14px;font-weight:500;">User</div>
                            <div style="font-size:12px;color:#888;">Local Account</div>
                        </div>
                    </div>
                    ${buildNavItems()}
                </div>
                <div id="settings-content" style="flex:1;padding:24px;overflow-y:auto;">
                    <h2 style="font-size:28px;font-weight:600;margin-bottom:24px;">System</h2>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                        ${buildSystemCards()}
                    </div>
                </div>
            </div>
        `;
    }

    function buildNavItems() {
        const items = [
            { name: 'System', icon: '💻', active: true },
            { name: 'Bluetooth & devices', icon: '📶' },
            { name: 'Network & internet', icon: '🌐' },
            { name: 'Personalization', icon: '🎨' },
            { name: 'Apps', icon: '📦' },
            { name: 'Accounts', icon: '👤' },
            { name: 'Time & language', icon: '🕐' },
            { name: 'Privacy & security', icon: '🔒' },
            { name: 'Windows Update', icon: '🔄' }
        ];
        return items.map(i => `
            <div class="settings-nav-item" style="padding:10px 16px;border-radius:6px;cursor:pointer;font-size:14px;${i.active ? 'background:rgba(255,255,255,0.08);' : ''}transition:background 0.15s;" onmouseenter="this.style.background='rgba(255,255,255,0.06)'" onmouseleave="this.style.background='${i.active ? 'rgba(255,255,255,0.08)' : 'transparent'}'">
                <span style="margin-right:10px;">${i.icon}</span>${i.name}
            </div>
        `).join('');
    }

    function buildSystemCards() {
        const cards = [
            { title: 'Display', desc: 'Brightness, night light, display profile', icon: '🖥️' },
            { title: 'Sound', desc: 'Volume levels, output, input, sound devices', icon: '🔊' },
            { title: 'Notifications', desc: 'Alerts from apps and system', icon: '🔔' },
            { title: 'Focus assist', desc: 'Do not disturb, automatic rules', icon: '🌙' },
            { title: 'Power & battery', desc: 'Sleep, battery usage, power saver', icon: '🔋' },
            { title: 'Storage', desc: 'Storage space, drives, configuration rules', icon: '💾' },
            { title: 'Nearby sharing', desc: 'Share with nearby devices', icon: '📡' },
            { title: 'Multitasking', desc: 'Snap windows, desktops, task switching', icon: '🪟' }
        ];
        return cards.map(c => `
            <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:16px;cursor:pointer;transition:background 0.15s;border:1px solid transparent;" onmouseenter="this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='rgba(255,255,255,0.1)'" onmouseleave="this.style.background='rgba(255,255,255,0.04)';this.style.borderColor='transparent'">
                <div style="font-size:20px;margin-bottom:8px;">${c.icon}</div>
                <div style="font-size:14px;font-weight:500;margin-bottom:4px;">${c.title}</div>
                <div style="font-size:12px;color:#888;">${c.desc}</div>
            </div>
        `).join('');
    }

    function launch() {
        WindowManager.createWindow('settings', 'Settings', icon, getContent(), { width: 800, height: 550 });
    }

    return { launch };
})();

export default Settings;
