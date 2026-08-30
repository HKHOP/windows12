import WindowManager from '../modules/windowManager.js';
import SystemConfig from '../modules/systemConfig.js';

const Settings = (() => {
    const icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;

    let currentPage = 'system';
    let win = null;

    const pages = {
        system: { name: 'System', icon: '💻' },
        personalization: { name: 'Personalization', icon: '🎨' },
        apps: { name: 'Apps', icon: '📦' },
        accounts: { name: 'Accounts', icon: '👤' },
        time: { name: 'Time & language', icon: '🕐' },
        privacy: { name: 'Privacy & security', icon: '🔒' },
        update: { name: 'Windows Update', icon: '🔄' }
    };

    function getContent() {
        return `
            <div style="display:flex;height:100%;">
                <div class="settings-sidebar" style="width:220px;background:rgba(0,0,0,0.2);padding:12px 8px;border-right:1px solid rgba(255,255,255,0.06);overflow-y:auto;">
                    <div style="padding:12px;display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                        <div style="width:48px;height:48px;background:linear-gradient(135deg,#667eea,#764ba2);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:600;">U</div>
                        <div>
                            <div class="settings-username" style="font-size:14px;font-weight:500;">${SystemConfig.get('userName')}</div>
                            <div style="font-size:12px;color:#888;">Local Account</div>
                        </div>
                    </div>
                    ${buildNav()}
                </div>
                <div class="settings-content" style="flex:1;padding:24px;overflow-y:auto;"></div>
            </div>
        `;
    }

    function buildNav() {
        return Object.entries(pages).map(([id, page]) => `
            <div class="settings-nav-item" data-page="${id}" style="padding:10px 16px;border-radius:6px;cursor:pointer;font-size:14px;${currentPage === id ? 'background:rgba(255,255,255,0.08);' : ''}transition:background 0.15s;display:flex;align-items:center;gap:10px;">
                <span>${page.icon}</span>${page.name}
            </div>
        `).join('');
    }

    function renderPage() {
        const contentEl = win.element.querySelector('.settings-content');
        const navItems = win.element.querySelectorAll('.settings-nav-item');

        navItems.forEach(item => {
            if (item.dataset.page === currentPage) {
                item.style.background = 'rgba(255,255,255,0.08)';
            } else {
                item.style.background = '';
            }
        });

        switch (currentPage) {
            case 'system': renderSystem(contentEl); break;
            case 'personalization': renderPersonalization(contentEl); break;
            case 'apps': renderApps(contentEl); break;
            case 'accounts': renderAccounts(contentEl); break;
            case 'time': renderTime(contentEl); break;
            case 'privacy': renderPrivacy(contentEl); break;
            case 'update': renderUpdate(contentEl); break;
        }
    }

    function renderSystem(el) {
        el.innerHTML = `
            <h2 style="font-size:28px;font-weight:600;margin-bottom:24px;">System</h2>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                ${systemCard('🖥️', 'Display', 'Brightness, night light, display profile')}
                ${systemCard('🔊', 'Sound', 'Volume levels, output, input')}
                ${systemCard('🔔', 'Notifications', 'Alerts from apps and system')}
                ${systemCard('🔋', 'Power & battery', 'Sleep, battery usage')}
                ${systemCard('💾', 'Storage', 'Storage space, drives')}
                ${systemCard('🪟', 'Multitasking', 'Snap windows, desktops')}
            </div>
        `;
    }

    function renderPersonalization(el) {
        const config = SystemConfig.getAll();
        el.innerHTML = `
            <h2 style="font-size:28px;font-weight:600;margin-bottom:24px;">Personalization</h2>

            <div class="settings-section" style="margin-bottom:24px;">
                <h3 style="font-size:16px;font-weight:500;margin-bottom:12px;">Accent Color</h3>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    ${accentOption('#0078D4', 'Blue')}
                    ${accentOption('#0099BC', 'Teal')}
                    ${accentOption('#7A7574', 'Gray')}
                    ${accentOption('#767676', 'Dark Gray')}
                    ${accentOption('#FF8C00', 'Orange')}
                    ${accentOption('#E81123', 'Red')}
                    ${accentOption('#0063B1', 'Light Blue')}
                    ${accentOption('#8764B8', 'Purple')}
                    ${accentOption('#881798', 'Magenta')}
                    ${accentOption('#038387', 'Dark Teal')}
                    ${accentOption('#00B294', 'Green')}
                    ${accentOption('#C239B3', 'Pink')}
                </div>
            </div>

            <div class="settings-section" style="margin-bottom:24px;">
                <h3 style="font-size:16px;font-weight:500;margin-bottom:12px;">Background</h3>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    ${bgOption('gradient', 'Default', 'linear-gradient(135deg, #0a1628, #2d1b4e)')}
                    ${bgOption('blue', 'Ocean', 'linear-gradient(135deg, #001a33, #003366)')}
                    ${bgOption('purple', 'Purple', 'linear-gradient(135deg, #1a0033, #4a0080)')}
                    ${bgOption('green', 'Forest', 'linear-gradient(135deg, #001a00, #004d00)')}
                    ${bgOption('sunset', 'Sunset', 'linear-gradient(135deg, #1a0a00, #cc6600)')}
                    ${bgOption('solid', 'Solid', '#1a1a2e')}
                </div>
            </div>

            <div class="settings-section" style="margin-bottom:24px;">
                <h3 style="font-size:16px;font-weight:500;margin-bottom:12px;">Taskbar Opacity</h3>
                <div style="display:flex;align-items:center;gap:12px;">
                    <input type="range" class="taskbar-opacity-slider" min="30" max="100" value="${config.taskbarOpacity}" style="flex:1;accent-color:var(--accent-color);">
                    <span class="opacity-value" style="min-width:40px;text-align:right;font-size:14px;">${config.taskbarOpacity}%</span>
                </div>
            </div>

            <div class="settings-section" style="margin-bottom:24px;">
                <h3 style="font-size:16px;font-weight:500;margin-bottom:12px;">User Name</h3>
                <div style="display:flex;gap:8px;">
                    <input type="text" class="username-input" value="${config.userName}" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:8px 12px;color:white;font-size:14px;flex:1;max-width:300px;outline:none;">
                    <button class="username-save" style="background:var(--accent-color);border:none;border-radius:6px;padding:8px 16px;color:white;cursor:pointer;font-size:14px;">Save</button>
                </div>
            </div>

            <div class="settings-section">
                <h3 style="font-size:16px;font-weight:500;margin-bottom:12px;">Config File</h3>
                <p style="font-size:13px;color:#888;margin-bottom:8px;">Edit config.json in File Explorer > Documents > System to change settings directly.</p>
                <button class="reset-btn" style="background:rgba(255,80,80,0.2);border:1px solid rgba(255,80,80,0.3);border-radius:6px;padding:8px 16px;color:#ff6666;cursor:pointer;font-size:14px;">Reset to Defaults</button>
            </div>
        `;

        setupPersonalizationEvents();
    }

    function renderApps(el) {
        el.innerHTML = `
            <h2 style="font-size:28px;font-weight:600;margin-bottom:24px;">Apps</h2>
            <div style="display:flex;flex-direction:column;gap:4px;">
                ${appRow('File Explorer', 'Built-in')}
                ${appRow('Notepad', 'Built-in')}
                ${appRow('Settings', 'Built-in')}
            </div>
        `;
    }

    function renderAccounts(el) {
        el.innerHTML = `
            <h2 style="font-size:28px;font-weight:600;margin-bottom:24px;">Accounts</h2>
            <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:20px;display:flex;align-items:center;gap:16px;margin-bottom:16px;">
                <div style="width:64px;height:64px;background:linear-gradient(135deg,#667eea,#764ba2);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:600;">U</div>
                <div>
                    <div style="font-size:18px;font-weight:500;">${SystemConfig.get('userName')}</div>
                    <div style="font-size:13px;color:#888;">Local Account</div>
                </div>
            </div>
        `;
    }

    function renderTime(el) {
        const now = new Date();
        el.innerHTML = `
            <h2 style="font-size:28px;font-weight:600;margin-bottom:24px;">Time & language</h2>
            <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:20px;margin-bottom:16px;">
                <div style="font-size:36px;font-weight:200;margin-bottom:8px;">${now.toLocaleTimeString()}</div>
                <div style="font-size:14px;color:#888;">${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
            </div>
        `;
    }

    function renderPrivacy(el) {
        el.innerHTML = `
            <h2 style="font-size:28px;font-weight:600;margin-bottom:24px;">Privacy & security</h2>
            <p style="color:#888;font-size:14px;">No privacy settings to configure yet.</p>
        `;
    }

    function renderUpdate(el) {
        el.innerHTML = `
            <h2 style="font-size:28px;font-weight:600;margin-bottom:24px;">Windows Update</h2>
            <div style="background:rgba(0,150,0,0.15);border:1px solid rgba(0,150,0,0.3);border-radius:8px;padding:16px;display:flex;align-items:center;gap:12px;margin-bottom:16px;">
                <span style="font-size:24px;">✓</span>
                <div>
                    <div style="font-weight:500;">You're up to date</div>
                    <div style="font-size:13px;color:#888;">Last checked: ${new Date().toLocaleString()}</div>
                </div>
            </div>
        `;
    }

    function systemCard(icon, title, desc) {
        return `<div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;cursor:pointer;transition:background 0.15s;" onmouseenter="this.style.background='rgba(255,255,255,0.08)'" onmouseleave="this.style.background='rgba(255,255,255,0.04)'">
            <div style="font-size:20px;margin-bottom:8px;">${icon}</div>
            <div style="font-size:14px;font-weight:500;margin-bottom:4px;">${title}</div>
            <div style="font-size:12px;color:#888;">${desc}</div>
        </div>`;
    }

    function appRow(name, detail) {
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:rgba(255,255,255,0.04);border-radius:6px;">
            <div>
                <div style="font-size:14px;font-weight:500;">${name}</div>
                <div style="font-size:12px;color:#888;">${detail}</div>
            </div>
        </div>`;
    }

    function accentOption(color, name) {
        const active = SystemConfig.get('accentColor') === color;
        return `<div class="accent-option" data-color="${color}" style="width:40px;height:40px;border-radius:50%;background:${color};cursor:pointer;outline:${active ? '2px solid white' : 'none'};outline-offset:2px;transition:outline 0.15s;" title="${name}"></div>`;
    }

    function bgOption(id, name, preview) {
        const active = SystemConfig.get('backgroundStyle') === id;
        return `<div class="bg-option" data-style="${id}" style="width:80px;height:50px;border-radius:6px;background:${preview};cursor:pointer;outline:${active ? '2px solid white' : 'none'};outline-offset:2px;display:flex;align-items:flex-end;padding:4px;transition:outline 0.15s;">
            <span style="font-size:10px;color:white;text-shadow:0 1px 2px rgba(0,0,0,0.8);">${name}</span>
        </div>`;
    }

    function setupPersonalizationEvents() {
        win.element.querySelectorAll('.accent-option').forEach(opt => {
            opt.addEventListener('click', () => {
                SystemConfig.set('accentColor', opt.dataset.color);
                renderPersonalization(win.element.querySelector('.settings-content'));
            });
        });

        win.element.querySelectorAll('.bg-option').forEach(opt => {
            opt.addEventListener('click', () => {
                SystemConfig.set('backgroundStyle', opt.dataset.style);
                renderPersonalization(win.element.querySelector('.settings-content'));
            });
        });

        const slider = win.element.querySelector('.taskbar-opacity-slider');
        const sliderVal = win.element.querySelector('.opacity-value');
        if (slider) {
            slider.addEventListener('input', () => {
                sliderVal.textContent = `${slider.value}%`;
            });
            slider.addEventListener('change', () => {
                SystemConfig.set('taskbarOpacity', parseInt(slider.value));
            });
        }

        const usernameInput = win.element.querySelector('.username-input');
        const usernameSave = win.element.querySelector('.username-save');
        if (usernameSave) {
            usernameSave.addEventListener('click', () => {
                const name = usernameInput.value.trim();
                if (name) {
                    SystemConfig.set('userName', name);
                    win.element.querySelector('.settings-username').textContent = name;
                }
            });
        }

        const resetBtn = win.element.querySelector('.reset-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                SystemConfig.reset();
                renderPersonalization(win.element.querySelector('.settings-content'));
            });
        }
    }

    function launch() {
        win = WindowManager.createWindow('settings', 'Settings', icon, getContent(), { width: 800, height: 550 });

        win.element.querySelectorAll('.settings-nav-item').forEach(item => {
            item.addEventListener('click', () => {
                currentPage = item.dataset.page;
                renderPage();
            });
        });

        renderPage();

        SystemConfig.onChange(() => {
            const usernameEl = win.element.querySelector('.settings-username');
            if (usernameEl) usernameEl.textContent = SystemConfig.get('userName');
        });
    }

    return { launch };
})();

export default Settings;
