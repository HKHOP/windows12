import WindowManager from '../modules/windowManager.js';
import SystemConfig from '../modules/systemConfig.js';

const Settings = (() => {
    const icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;

    let currentPage = 'system';
    let currentSubPage = null;
    let win = null;

    const pages = {
        system: { name: 'System', icon: '💻' },
        personalization: { name: 'Personalization', icon: '🎨' },
        apps: { name: 'Apps', icon: '📦' },
        accounts: { name: 'Accounts', icon: '👤' },
        time: { name: 'Time & language', icon: '🕐' },
        privacy: { name: 'Privacy & security', icon: '🔒' },
        update: { name: 'Windows Update', icon: '🔄' },
        about: { name: 'About', icon: 'ℹ️' }
    };

    const systemSubPages = {
        display: { name: 'Display', icon: '🖥️' },
        sound: { name: 'Sound', icon: '🔊' },
        notifications: { name: 'Notifications', icon: '🔔' },
        power: { name: 'Power & battery', icon: '🔋' },
        storage: { name: 'Storage', icon: '💾' },
        multitasking: { name: 'Multitasking', icon: '🪟' }
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
            <div class="settings-nav-item" data-page="${id}" style="padding:10px 16px;border-radius:6px;cursor:pointer;font-size:14px;${currentPage === id && !currentSubPage ? 'background:rgba(255,255,255,0.08);' : ''}transition:background 0.15s;display:flex;align-items:center;gap:10px;">
                <span>${page.icon}</span>${page.name}
            </div>
        `).join('');
    }

    function renderPage() {
        const contentEl = win.element.querySelector('.settings-content');
        const navItems = win.element.querySelectorAll('.settings-nav-item');

        navItems.forEach(item => {
            if (item.dataset.page === currentPage && !currentSubPage) {
                item.style.background = 'rgba(255,255,255,0.08)';
            } else {
                item.style.background = '';
            }
        });

        if (currentPage === 'system' && currentSubPage) {
            renderSystemSubPage(contentEl, currentSubPage);
        } else {
            switch (currentPage) {
                case 'system': renderSystem(contentEl); break;
                case 'personalization': renderPersonalization(contentEl); break;
                case 'apps': renderApps(contentEl); break;
                case 'accounts': renderAccounts(contentEl); break;
                case 'time': renderTime(contentEl); break;
                case 'privacy': renderPrivacy(contentEl); break;
                case 'update': renderUpdate(contentEl); break;
                case 'about': renderAbout(contentEl); break;
            }
        }
    }

    function renderSystem(el) {
        el.innerHTML = `
            <h2 style="font-size:28px;font-weight:600;margin-bottom:24px;">System</h2>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                ${systemCard('🖥️', 'Display', 'Brightness, night light, display profile', 'display')}
                ${systemCard('🔊', 'Sound', 'Volume levels, output, input', 'sound')}
                ${systemCard('🔔', 'Notifications', 'Alerts from apps and system', 'notifications')}
                ${systemCard('🔋', 'Power & battery', 'Sleep, battery usage', 'power')}
                ${systemCard('💾', 'Storage', 'Storage space, drives', 'storage')}
                ${systemCard('🪟', 'Multitasking', 'Snap windows, desktops', 'multitasking')}
            </div>
        `;

        el.querySelectorAll('.system-sub-card').forEach(card => {
            card.addEventListener('click', () => {
                currentSubPage = card.dataset.subpage;
                renderPage();
            });
            card.addEventListener('mouseenter', () => card.style.background = 'rgba(255,255,255,0.08)');
            card.addEventListener('mouseleave', () => card.style.background = 'rgba(255,255,255,0.04)');
        });
    }

    function renderSystemSubPage(el, subPage) {
        const sub = systemSubPages[subPage];
        el.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
                <button class="settings-back-btn" style="background:none;border:none;color:var(--text-primary);cursor:pointer;font-size:18px;padding:4px 8px;border-radius:4px;display:flex;align-items:center;">&#9664;</button>
                <h2 style="font-size:28px;font-weight:600;">${sub.name}</h2>
            </div>
        `;

        switch (subPage) {
            case 'display': renderDisplaySettings(el); break;
            case 'sound': renderSoundSettings(el); break;
            case 'notifications': renderNotificationSettings(el); break;
            case 'power': renderPowerSettings(el); break;
            case 'storage': renderStorageSettings(el); break;
            case 'multitasking': renderMultitaskingSettings(el); break;
        }
    }

    function renderDisplaySettings(el) {
        el.innerHTML += `
            <div style="display:flex;flex-direction:column;gap:16px;">
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="font-size:14px;font-weight:500;margin-bottom:12px;">Brightness</div>
                    <div style="display:flex;align-items:center;gap:12px;">
                        <span style="font-size:16px;">🔅</span>
                        <input type="range" min="20" max="100" value="80" style="flex:1;accent-color:var(--accent-color);" oninput="document.body.style.filter='brightness('+this.value/100+')'">
                        <span style="font-size:16px;">🔆</span>
                    </div>
                </div>
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="font-size:14px;font-weight:500;margin-bottom:12px;">Night light</div>
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <div>
                            <div style="font-size:13px;">Reduce blue light to help you sleep</div>
                        </div>
                        <label style="position:relative;display:inline-block;width:44px;height:24px;">
                            <input type="checkbox" class="night-light-toggle" style="opacity:0;width:0;height:0;">
                            <span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:rgba(255,255,255,0.15);border-radius:12px;transition:0.3s;"></span>
                        </label>
                    </div>
                </div>
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="font-size:14px;font-weight:500;margin-bottom:12px;">Scale & layout</div>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                        <span style="font-size:13px;">Display resolution</span>
                        <select style="background:var(--hover-bg);border:1px solid var(--window-border);border-radius:4px;padding:4px 8px;color:var(--text-primary);font-size:13px;">
                            <option>1920 x 1080 (Recommended)</option>
                            <option>1600 x 900</option>
                            <option>1366 x 768</option>
                        </select>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <span style="font-size:13px;">Display orientation</span>
                        <select style="background:var(--hover-bg);border:1px solid var(--window-border);border-radius:4px;padding:4px 8px;color:var(--text-primary);font-size:13px;">
                            <option>Landscape</option>
                            <option>Portrait</option>
                        </select>
                    </div>
                </div>
            </div>
        `;
    }

    function renderSoundSettings(el) {
        el.innerHTML += `
            <div style="display:flex;flex-direction:column;gap:16px;">
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="font-size:14px;font-weight:500;margin-bottom:12px;">Master Volume</div>
                    <div style="display:flex;align-items:center;gap:12px;">
                        <span style="font-size:16px;">🔇</span>
                        <input type="range" min="0" max="100" value="75" style="flex:1;accent-color:var(--accent-color);">
                        <span style="font-size:16px;">🔊</span>
                        <span style="font-size:13px;min-width:35px;">75%</span>
                    </div>
                </div>
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="font-size:14px;font-weight:500;margin-bottom:12px;">Output device</div>
                    <select style="width:100%;background:var(--hover-bg);border:1px solid var(--window-border);border-radius:6px;padding:8px 12px;color:var(--text-primary);font-size:13px;">
                        <option>Speakers (Realtek Audio)</option>
                        <option>HDMI Output</option>
                        <option>USB Audio Device</option>
                    </select>
                </div>
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="font-size:14px;font-weight:500;margin-bottom:12px;">Input device</div>
                    <select style="width:100%;background:var(--hover-bg);border:1px solid var(--window-border);border-radius:6px;padding:8px 12px;color:var(--text-primary);font-size:13px;">
                        <option>Microphone (Realtek Audio)</option>
                        <option>USB Microphone</option>
                    </select>
                </div>
            </div>
        `;
    }

    function renderNotificationSettings(el) {
        el.innerHTML += `
            <div style="display:flex;flex-direction:column;gap:16px;">
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                        <div style="font-size:14px;font-weight:500;">Notification alerts</div>
                        <label style="position:relative;display:inline-block;width:44px;height:24px;">
                            <input type="checkbox" checked style="opacity:0;width:0;height:0;">
                            <span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:var(--accent-color);border-radius:12px;transition:0.3s;"></span>
                        </label>
                    </div>
                </div>
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="font-size:14px;font-weight:500;margin-bottom:12px;">App notifications</div>
                    ${['File Explorer', 'Notepad', 'Settings', 'Task Manager'].map(app => `
                        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--window-border);">
                            <span style="font-size:13px;">${app}</span>
                            <label style="position:relative;display:inline-block;width:44px;height:24px;">
                                <input type="checkbox" checked style="opacity:0;width:0;height:0;">
                                <span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:var(--accent-color);border-radius:12px;transition:0.3s;"></span>
                            </label>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    function renderPowerSettings(el) {
        el.innerHTML += `
            <div style="display:flex;flex-direction:column;gap:16px;">
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="font-size:14px;font-weight:500;margin-bottom:12px;">Power mode</div>
                    <select style="width:100%;background:var(--hover-bg);border:1px solid var(--window-border);border-radius:6px;padding:8px 12px;color:var(--text-primary);font-size:13px;">
                        <option>Best performance</option>
                        <option>Balanced</option>
                        <option>Best power efficiency</option>
                    </select>
                </div>
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="font-size:14px;font-weight:500;margin-bottom:12px;">Screen and sleep</div>
                    <div style="display:flex;flex-direction:column;gap:12px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <span style="font-size:13px;">Turn off screen after</span>
                            <select style="background:var(--hover-bg);border:1px solid var(--window-border);border-radius:4px;padding:4px 8px;color:var(--text-primary);font-size:13px;">
                                <option>5 minutes</option><option>10 minutes</option><option>15 minutes</option><option>Never</option>
                            </select>
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <span style="font-size:13px;">Put to sleep after</span>
                            <select style="background:var(--hover-bg);border:1px solid var(--window-border);border-radius:4px;padding:4px 8px;color:var(--text-primary);font-size:13px;">
                                <option>15 minutes</option><option>30 minutes</option><option>1 hour</option><option>Never</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="font-size:14px;font-weight:500;margin-bottom:12px;">Battery</div>
                    <div style="display:flex;align-items:center;gap:16px;">
                        <div style="font-size:40px;">🔋</div>
                        <div style="flex:1;">
                            <div style="font-size:24px;font-weight:600;margin-bottom:4px;">85%</div>
                            <div style="height:8px;background:rgba(255,255,255,0.06);border-radius:4px;overflow:hidden;">
                                <div style="height:100%;width:85%;background:#00b894;border-radius:4px;"></div>
                            </div>
                            <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">Plugged in</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderStorageSettings(el) {
        const used = 45;
        el.innerHTML += `
            <div style="display:flex;flex-direction:column;gap:16px;">
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="font-size:14px;font-weight:500;margin-bottom:12px;">Local Disk (C:)</div>
                    <div style="height:20px;background:rgba(255,255,255,0.06);border-radius:10px;overflow:hidden;margin-bottom:8px;">
                        <div style="height:100%;width:${used}%;background:linear-gradient(90deg,#0078D4,#00a8e8);border-radius:10px;"></div>
                    </div>
                    <div style="font-size:13px;color:var(--text-secondary);">${used}% used</div>
                </div>
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="font-size:14px;font-weight:500;margin-bottom:12px;">Storage usage</div>
                    <div style="display:flex;flex-direction:column;gap:8px;">
                        ${[
                            { name: 'Apps & features', size: '12.3 GB', color: '#0078D4' },
                            { name: 'Documents', size: '2.1 GB', color: '#FFC107' },
                            { name: 'Pictures', size: '1.8 GB', color: '#43A047' },
                            { name: 'Videos', size: '0.9 GB', color: '#E53935' },
                            { name: 'Other', size: '4.2 GB', color: '#888' }
                        ].map(item => `
                            <div style="display:flex;align-items:center;gap:8px;">
                                <div style="width:12px;height:12px;border-radius:3px;background:${item.color};"></div>
                                <span style="flex:1;font-size:13px;">${item.name}</span>
                                <span style="font-size:13px;color:var(--text-secondary);">${item.size}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    function renderMultitaskingSettings(el) {
        el.innerHTML += `
            <div style="display:flex;flex-direction:column;gap:16px;">
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="font-size:14px;font-weight:500;margin-bottom:12px;">Snap windows</div>
                    <div style="display:flex;flex-direction:column;gap:8px;">
                        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;">
                            <input type="checkbox" checked style="accent-color:var(--accent-color);"> Show snap layouts when dragging windows
                        </label>
                        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;">
                            <input type="checkbox" checked style="accent-color:var(--accent-color);"> Show snap bar when dragging to top of screen
                        </label>
                        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;">
                            <input type="checkbox" checked style="accent-color:var(--accent-color);"> Snap windows automatically
                        </label>
                    </div>
                </div>
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="font-size:14px;font-weight:500;margin-bottom:12px;">Snap layouts</div>
                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
                        ${[
                            '<div style="display:flex;gap:2px;height:40px;"><div style="flex:1;background:var(--accent-color);border-radius:3px;"></div></div>',
                            '<div style="display:flex;gap:2px;height:40px;"><div style="flex:1;background:var(--accent-color);border-radius:3px;"></div><div style="flex:1;background:var(--accent-color);border-radius:3px;"></div></div>',
                            '<div style="display:flex;gap:2px;height:40px;"><div style="flex:2;background:var(--accent-color);border-radius:3px;"></div><div style="flex:1;background:var(--accent-color);border-radius:3px;"></div></div>',
                            '<div style="display:flex;gap:2px;height:40px;"><div style="flex:1;background:var(--accent-color);border-radius:3px;"></div><div style="flex:1;background:var(--accent-color);border-radius:3px;"></div><div style="flex:1;background:var(--accent-color);border-radius:3px;"></div></div>',
                            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px;height:40px;"><div style="background:var(--accent-color);border-radius:3px;"></div><div style="background:var(--accent-color);border-radius:3px;"></div><div style="background:var(--accent-color);border-radius:3px;"></div><div style="background:var(--accent-color);border-radius:3px;"></div></div>',
                            '<div style="display:flex;gap:2px;height:40px;"><div style="flex:1;background:var(--accent-color);border-radius:3px;"></div><div style="flex:1;background:var(--accent-color);border-radius:3px;"></div><div style="flex:1;background:var(--accent-color);border-radius:3px;"></div><div style="flex:1;background:var(--accent-color);border-radius:3px;"></div></div>'
                        ].map(layout => `
                            <div style="background:var(--hover-bg);border:1px solid var(--window-border);border-radius:6px;padding:8px;cursor:pointer;transition:border-color 0.15s;" onmouseenter="this.style.borderColor='var(--accent-color)'" onmouseleave="this.style.borderColor='var(--window-border)'">
                                ${layout}
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    function renderPersonalization(el) {
        const config = SystemConfig.getAll();
        el.innerHTML = `
            <h2 style="font-size:28px;font-weight:600;margin-bottom:24px;">Personalization</h2>

            <div class="settings-section" style="margin-bottom:24px;">
                <h3 style="font-size:16px;font-weight:500;margin-bottom:12px;">Theme</h3>
                <div style="display:flex;gap:12px;">
                    <div class="theme-option" data-theme="dark" style="flex:1;padding:16px;border-radius:8px;cursor:pointer;text-align:center;background:${config.darkMode ? 'var(--accent-color)' : 'rgba(255,255,255,0.04)'};border:1px solid ${config.darkMode ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)'};">
                        <div style="font-size:28px;margin-bottom:4px;">🌙</div>
                        <div style="font-size:13px;">Dark</div>
                    </div>
                    <div class="theme-option" data-theme="light" style="flex:1;padding:16px;border-radius:8px;cursor:pointer;text-align:center;background:${!config.darkMode ? 'var(--accent-color)' : 'rgba(255,255,255,0.04)'};border:1px solid ${!config.darkMode ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)'};">
                        <div style="font-size:28px;margin-bottom:4px;">☀️</div>
                        <div style="font-size:13px;">Light</div>
                    </div>
                </div>
            </div>

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
                    <input type="text" class="username-input" value="${config.userName}" style="background:var(--hover-bg);border:1px solid var(--window-border);border-radius:6px;padding:8px 12px;color:var(--text-primary);font-size:14px;flex:1;max-width:300px;outline:none;">
                    <button class="username-save" style="background:var(--accent-color);border:none;border-radius:6px;padding:8px 16px;color:white;cursor:pointer;font-size:14px;">Save</button>
                </div>
            </div>

            <div class="settings-section">
                <h3 style="font-size:16px;font-weight:500;margin-bottom:12px;">Config File</h3>
                <p style="font-size:13px;color:var(--text-secondary);margin-bottom:8px;">Edit config.json in File Explorer > Documents to change settings directly.</p>
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
                ${appRow('Task Manager', 'Built-in')}
                ${appRow('Calculator', 'Built-in')}
                ${appRow('Calendar', 'Built-in')}
                ${appRow('Clock', 'Built-in')}
                ${appRow('Photos', 'Built-in')}
                ${appRow('Paint', 'Built-in')}
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

    function renderAbout(el) {
        el.innerHTML = `
            <h2 style="font-size:28px;font-weight:600;margin-bottom:24px;">About</h2>
            <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:20px;margin-bottom:16px;">
                <div style="font-size:20px;font-weight:600;margin-bottom:4px;">Windows 12</div>
                <div style="font-size:13px;color:#888;margin-bottom:16px;">Web OS Simulation</div>
                <div style="display:flex;flex-direction:column;gap:12px;">
                    <div style="display:flex;justify-content:space-between;font-size:13px;">
                        <span style="color:#888;">Version</span>
                        <span class="about-version" style="font-weight:500;">Loading...</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:13px;">
                        <span style="color:#888;">Build</span>
                        <span class="about-build" style="font-weight:500;">Loading...</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:13px;">
                        <span style="color:#888;">Release Date</span>
                        <span class="about-date" style="font-weight:500;">Loading...</span>
                    </div>
                </div>
            </div>
            <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:20px;">
                <div style="font-size:14px;font-weight:500;margin-bottom:8px;">System</div>
                <div style="display:flex;flex-direction:column;gap:12px;">
                    <div style="display:flex;justify-content:space-between;font-size:13px;">
                        <span style="color:#888;">Device name</span>
                        <span style="font-weight:500;">${SystemConfig.get('userName')}-PC</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:13px;">
                        <span style="color:#888;">Processor</span>
                        <span style="font-weight:500;">JavaScript V8 Engine</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:13px;">
                        <span style="color:#888;">Memory</span>
                        <span style="font-weight:500;">${navigator.deviceMemory || 'N/A'} GB</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:13px;">
                        <span style="color:#888;">Platform</span>
                        <span style="font-weight:500;">${navigator.platform}</span>
                    </div>
                </div>
            </div>
        `;

        fetch('CHANGELOG.md').then(r => r.text()).then(text => {
            const match = text.match(/## \[(\d+\.\d+\.\d+)\]\s*-\s*(\d{4}-\d{2}-\d{2})/);
            if (match) {
                el.querySelector('.about-version').textContent = match[1];
                el.querySelector('.about-build').textContent = match[1].replace(/\./g, '');
                el.querySelector('.about-date').textContent = match[2];
            }
        }).catch(() => {
            el.querySelector('.about-version').textContent = '12.0.4000';
            el.querySelector('.about-build').textContent = '1204000';
            el.querySelector('.about-date').textContent = '2026-08-31';
        });
    }

    function systemCard(icon, title, desc, subPage) {
        return `<div class="system-sub-card" data-subpage="${subPage}" style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;cursor:pointer;transition:background 0.15s;">
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
        win.element.querySelectorAll('.theme-option').forEach(opt => {
            opt.addEventListener('click', () => {
                const isDark = opt.dataset.theme === 'dark';
                SystemConfig.set('darkMode', isDark);
                renderPersonalization(win.element.querySelector('.settings-content'));
            });
        });

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
        currentSubPage = null;
        win = WindowManager.createWindow('settings', 'Settings', icon, getContent(), { width: 800, height: 550 });

        win.element.querySelectorAll('.settings-nav-item').forEach(item => {
            item.addEventListener('click', () => {
                currentPage = item.dataset.page;
                currentSubPage = null;
                renderPage();
            });
        });

        win.element.querySelector('.settings-content').addEventListener('click', (e) => {
            if (e.target.closest('.settings-back-btn')) {
                currentSubPage = null;
                renderPage();
            }
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
