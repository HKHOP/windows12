import AppIcons from '../../modules/appIcons.js';
import UIIcons from '../../modules/uiIcons.js';
import WindowManager from '../../modules/windowManager.js';
import SystemConfig from '../../modules/systemConfig.js';
import FileSystem from '../../modules/fileSystem.js';
import Scaling from '../../modules/scaling.js';
import Popup from '../../modules/popup.js';
import AppSystem from '../../modules/appSystem.js';
import AppLoader from '../../modules/appLoader.js';
import { AppMetadata } from '../../modules/taskbar.js';
import WindowsUpdate from '../../modules/windowsUpdate.js';
import Touch from '../../modules/touch.js';
import VirtualKeyboard from '../../modules/virtualKeyboard.js';
import Cursor from '../../modules/cursor.js';
import VirtualDesktops from '../../modules/virtualDesktops.js';
import Permissions from '../../modules/permissions.js';

const Settings = (() => {
    const icon = AppIcons.get('settings');

    let currentPage = 'system';
    let currentSubPage = null;
    let win = null;

    // No keyboard glyph in ShellIcons — inline tile icon (same 20px box).
    const TOUCH_KBD_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6" stroke-linecap="round"/></svg>';

    const pages = {
        system: { name: 'System', icon: UIIcons.setting('system', 20) },
        personalization: { name: 'Personalization', icon: UIIcons.setting('personalization', 20) },
        apps: { name: 'Apps', icon: UIIcons.setting('apps', 20) },
        accounts: { name: 'Accounts', icon: UIIcons.setting('accounts', 20) },
        time: { name: 'Time & language', icon: UIIcons.setting('time', 20) },
        privacy: { name: 'Privacy & security', icon: UIIcons.setting('privacy', 20) },
        update: { name: 'Windows Update', icon: UIIcons.setting('update', 20) },
        about: { name: 'About', icon: UIIcons.setting('about', 20) }
    };

    const systemSubPages = {
        display: { name: 'Display', icon: UIIcons.setting('display', 20) },
        sound: { name: 'Sound', icon: UIIcons.setting('sound', 20) },
        notifications: { name: 'Notifications', icon: UIIcons.setting('notifications', 20) },
        power: { name: 'Power & battery', icon: UIIcons.setting('power', 20) },
        storage: { name: 'Storage', icon: UIIcons.setting('storage', 20) },
        multitasking: { name: 'Multitasking', icon: UIIcons.setting('multitasking', 20) },
        touchpad: { name: 'Touchpad', icon: UIIcons.setting('touchpad', 20) },
        touchKeyboard: { name: 'Touch keyboard', icon: TOUCH_KBD_ICON }
    };

    function getContent() {
        return `
            <div style="display:flex;height:100%;">
                <div class="settings-sidebar" style="width:220px;background:rgba(0,0,0,0.2);padding:12px 8px;border-right:1px solid rgba(255,255,255,0.06);overflow-y:auto;">
                    <div style="padding:12px;display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                        <div style="width:48px;height:48px;background:var(--accent-color,#0078D4);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:600;">${(SystemConfig.get('userName')||'U').charAt(0).toUpperCase()}</div>
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
                <span style="width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">${page.icon}</span>${page.name}
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
                ${systemCard(UIIcons.setting('display', 22), 'Display', 'Brightness, night light, display profile', 'display')}
                ${systemCard(UIIcons.setting('sound', 22), 'Sound', 'Volume levels, output, input', 'sound')}
                ${systemCard(UIIcons.setting('notifications', 22), 'Notifications', 'Alerts from apps and system', 'notifications')}
                ${systemCard(UIIcons.setting('power', 22), 'Power & battery', 'Sleep, battery usage', 'power')}
                ${systemCard(UIIcons.setting('storage', 22), 'Storage', 'Storage space, drives', 'storage')}
                ${systemCard(UIIcons.setting('multitasking', 22), 'Multitasking', 'Snap windows, desktops', 'multitasking')}
                ${systemCard(UIIcons.setting('touchpad', 22), 'Touchpad', 'Virtual touchpad, gestures', 'touchpad')}
                ${systemCard(TOUCH_KBD_ICON.replace('width="20" height="20"', 'width="22" height="22"'), 'Touch keyboard', 'On-screen keyboard, auto-show', 'touchKeyboard')}
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
            case 'touchpad': renderTouchpadSettings(el); break;
            case 'touchKeyboard': renderTouchKeyboardSettings(el); break;
        }
    }

    function renderDisplaySettings(el) {
        const config = SystemConfig.getAll();
        const currentScaling = Scaling.getMode();
        const resOptions = SystemConfig.getResolutionOptions();
        const nativeW = SystemConfig.getNativeWidth();
        const nativeH = SystemConfig.getNativeHeight();
        const currentRes = config.displayResolution === 'native' ? 'native' : config.displayResolution;
        const currentResLabel = currentRes === 'native' ? `${nativeW}x${nativeH}` : currentRes;

        const resOptionsHtml = resOptions.map(opt => {
            const val = opt.isNative ? 'native' : opt.label;
            const sel = currentRes === val ? 'selected' : '';
            const suffix = opt.isNative ? ' (Native)' : '';
            return `<option value="${val}" ${sel}>${opt.label}${suffix}</option>`;
        }).join('');

        el.innerHTML += `
            <div style="display:flex;flex-direction:column;gap:16px;">
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="font-size:14px;font-weight:500;margin-bottom:12px;">Brightness</div>
                    <div style="display:flex;align-items:center;gap:12px;">
                        <span style="width:18px;height:18px;display:inline-flex;flex-shrink:0;">${UIIcons.setting('brightnessLow', 18)}</span>
                        <input type="range" class="brightness-slider" min="20" max="100" value="${config.brightness}" style="flex:1;accent-color:var(--accent-color);">
                        <span style="width:18px;height:18px;display:inline-flex;flex-shrink:0;">${UIIcons.setting('brightnessHigh', 18)}</span>
                    </div>
                </div>
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="font-size:14px;font-weight:500;margin-bottom:12px;">Night light</div>
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <div>
                            <div style="font-size:13px;">Reduce blue light to help you sleep</div>
                        </div>
                        <label style="position:relative;display:inline-block;width:44px;height:24px;">
                            <input type="checkbox" class="night-light-toggle" ${config.nightLight ? 'checked' : ''} style="opacity:0;width:0;height:0;">
                            <span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:rgba(255,255,255,0.15);border-radius:12px;transition:0.3s;"></span>
                        </label>
                    </div>
                </div>
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="font-size:14px;font-weight:500;margin-bottom:12px;">Scale & layout</div>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                        <span style="font-size:13px;">Display scaling</span>
                        <select class="scaling-select" style="font-size:13px;">
                            <option value="auto" ${currentScaling === 'auto' ? 'selected' : ''}>Auto (Adaptive)</option>
                            <option value="50" ${currentScaling === '50' ? 'selected' : ''}>50%</option>
                            <option value="75" ${currentScaling === '75' ? 'selected' : ''}>75%</option>
                            <option value="100" ${currentScaling === '100' ? 'selected' : ''}>100%</option>
                            <option value="125" ${currentScaling === '125' ? 'selected' : ''}>125%</option>
                            <option value="150" ${currentScaling === '150' ? 'selected' : ''}>150%</option>
                            <option value="175" ${currentScaling === '175' ? 'selected' : ''}>175%</option>
                            <option value="200" ${currentScaling === '200' ? 'selected' : ''}>200%</option>
                        </select>
                    </div>
                    <div class="current-scale-label" style="font-size:12px;color:var(--text-secondary);margin-top:4px;">Current scale: ${Math.round(Scaling.getScale() * 100)}%</div>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;">
                        <span style="font-size:13px;">Display resolution</span>
                        <select class="resolution-select" style="font-size:13px;">
                            ${resOptionsHtml}
                        </select>
                    </div>
                    <div class="current-res-label" style="font-size:12px;color:var(--text-secondary);margin-top:4px;">Rendering at: ${currentResLabel}</div>
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <span style="font-size:13px;">Display orientation</span>
                        <select class="orientation-select" style="font-size:13px;">
                            <option value="landscape" ${config.displayOrientation === 'landscape' ? 'selected' : ''}>Landscape</option>
                            <option value="portrait" ${config.displayOrientation === 'portrait' ? 'selected' : ''}>Portrait</option>
                        </select>
                    </div>
                </div>
            </div>
        `;

        el.querySelector('.brightness-slider').addEventListener('input', (e) => {
            document.body.style.filter = `brightness(${e.target.value / 100})`;
        });
        el.querySelector('.brightness-slider').addEventListener('change', (e) => {
            SystemConfig.set('brightness', parseInt(e.target.value));
        });

        el.querySelector('.night-light-toggle').addEventListener('change', (e) => {
            SystemConfig.set('nightLight', e.target.checked);
        });

        el.querySelector('.resolution-select').addEventListener('change', (e) => {
            const prevRes = currentRes;
            const newRes = e.target.value;

            SystemConfig.set('displayResolution', newRes);

            const resLabel = el.querySelector('.current-res-label');
            if (resLabel) {
                const target = SystemConfig.getCurrentResolution();
                resLabel.textContent = `Rendering at: ${target.width}x${target.height}`;
            }

            let reverted = false;
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;bottom:70px;right:20px;background:var(--window-bg);border:1px solid var(--window-border);border-radius:10px;padding:16px 20px;font-size:13px;color:var(--text-primary);box-shadow:0 8px 32px rgba(0,0,0,0.4);z-index:99999;display:flex;flex-direction:column;gap:12px;min-width:300px;animation:windowOpen 0.2s ease-out;';

            let remaining = 15;

            overlay.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;">
                    <span style="width:20px;height:20px;display:inline-flex;flex-shrink:0;">${UIIcons.setting('display', 20)}</span>
                    <div style="flex:1;">
                        <div style="font-weight:500;">Resolution changed</div>
                        <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">Reverting in <span class="res-countdown">${remaining}</span>s unless you keep changes.</div>
                    </div>
                </div>
                <div style="display:flex;gap:8px;justify-content:flex-end;">
                    <button class="res-revert-btn" style="background:rgba(255,255,255,0.08);border:1px solid var(--window-border);border-radius:6px;padding:6px 14px;color:var(--text-primary);cursor:pointer;font-size:12px;">Revert</button>
                    <button class="res-keep-btn" style="background:var(--accent-color);border:none;border-radius:6px;padding:6px 14px;color:white;cursor:pointer;font-size:12px;font-weight:500;">Keep changes</button>
                </div>
            `;

            document.body.appendChild(overlay);

            const countdownEl = overlay.querySelector('.res-countdown');

            function doRevert() {
                if (reverted) return;
                reverted = true;
                SystemConfig.set('displayResolution', prevRes);
                const selectEl = el.querySelector('.resolution-select');
                if (selectEl) selectEl.value = prevRes;
                const label = el.querySelector('.current-res-label');
                if (label) {
                    const target = SystemConfig.getCurrentResolution();
                    label.textContent = `Rendering at: ${target.width}x${target.height}`;
                }
                overlay.remove();
                clearInterval(interval);
            }

            function doKeep() {
                reverted = true;
                overlay.remove();
                clearInterval(interval);
            }

            overlay.querySelector('.res-keep-btn').addEventListener('click', doKeep);
            overlay.querySelector('.res-revert-btn').addEventListener('click', doRevert);

            const interval = setInterval(() => {
                remaining--;
                if (countdownEl) countdownEl.textContent = remaining;
                if (remaining <= 0) {
                    doRevert();
                }
            }, 1000);
        });

        el.querySelector('.orientation-select').addEventListener('change', (e) => {
            SystemConfig.set('displayOrientation', e.target.value);
        });

        el.querySelector('.scaling-select').addEventListener('change', (e) => {
            const prevMode = Scaling.getMode();
            const newMode = e.target.value;

            Scaling.setMode(newMode);
            const label = el.querySelector('.current-scale-label');
            if (label) {
                label.textContent = `Current scale: ${Math.round(Scaling.getScale() * 100)}%`;
            }

            let reverted = false;
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;bottom:70px;right:20px;background:var(--window-bg);border:1px solid var(--window-border);border-radius:10px;padding:16px 20px;font-size:13px;color:var(--text-primary);box-shadow:0 8px 32px rgba(0,0,0,0.4);z-index:99999;display:flex;flex-direction:column;gap:12px;min-width:300px;animation:windowOpen 0.2s ease-out;';

            const timerDuration = 15;
            let remaining = timerDuration;

            overlay.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;">
                    <span style="width:20px;height:20px;display:inline-flex;flex-shrink:0;">${UIIcons.setting('display', 20)}</span>
                    <div style="flex:1;">
                        <div style="font-weight:500;">Display scaling changed</div>
                        <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">Reverting in <span class="scaling-countdown">${remaining}</span>s unless you keep changes.</div>
                    </div>
                </div>
                <div style="display:flex;gap:8px;justify-content:flex-end;">
                    <button class="scaling-revert-btn" style="background:rgba(255,255,255,0.08);border:1px solid var(--window-border);border-radius:6px;padding:6px 14px;color:var(--text-primary);cursor:pointer;font-size:12px;">Revert</button>
                    <button class="scaling-keep-btn" style="background:var(--accent-color);border:none;border-radius:6px;padding:6px 14px;color:white;cursor:pointer;font-size:12px;font-weight:500;">Keep changes</button>
                </div>
            `;

            document.body.appendChild(overlay);

            const countdownEl = overlay.querySelector('.scaling-countdown');

            function doRevert() {
                if (reverted) return;
                reverted = true;
                Scaling.setMode(prevMode);
                if (label) {
                    label.textContent = `Current scale: ${Math.round(Scaling.getScale() * 100)}%`;
                }
                const selectEl = el.querySelector('.scaling-select');
                if (selectEl) selectEl.value = prevMode;
                overlay.remove();
                clearInterval(interval);
            }

            function doKeep() {
                reverted = true;
                overlay.remove();
                clearInterval(interval);
            }

            overlay.querySelector('.scaling-keep-btn').addEventListener('click', doKeep);
            overlay.querySelector('.scaling-revert-btn').addEventListener('click', doRevert);

            const interval = setInterval(() => {
                remaining--;
                if (countdownEl) countdownEl.textContent = remaining;
                if (remaining <= 0) {
                    doRevert();
                }
            }, 1000);
        });
    }

    function renderSoundSettings(el) {
        const config = SystemConfig.getAll();
        el.innerHTML += `
            <div style="display:flex;flex-direction:column;gap:16px;">
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="font-size:14px;font-weight:500;margin-bottom:12px;">Master Volume</div>
                    <div style="display:flex;align-items:center;gap:12px;">
                        <span style="width:18px;height:18px;display:inline-flex;flex-shrink:0;">${UIIcons.setting('soundMute', 18)}</span>
                        <input type="range" class="volume-slider" min="0" max="100" value="${config.masterVolume}" style="flex:1;accent-color:var(--accent-color);">
                        <span style="width:18px;height:18px;display:inline-flex;flex-shrink:0;">${UIIcons.setting('sound', 18)}</span>
                        <span class="volume-value" style="min-width:35px;text-align:right;font-size:13px;">${config.masterVolume}%</span>
                    </div>
                </div>
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="font-size:14px;font-weight:500;margin-bottom:12px;">Output device</div>
                    <select class="output-device-select" style="width:100%;padding:8px 12px;font-size:13px;">
                        <option ${config.outputDevice === 'Speakers (Realtek Audio)' ? 'selected' : ''}>Speakers (Realtek Audio)</option>
                        <option ${config.outputDevice === 'HDMI Output' ? 'selected' : ''}>HDMI Output</option>
                        <option ${config.outputDevice === 'USB Audio Device' ? 'selected' : ''}>USB Audio Device</option>
                    </select>
                </div>
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="font-size:14px;font-weight:500;margin-bottom:12px;">Input device</div>
                    <select class="input-device-select" style="width:100%;padding:8px 12px;font-size:13px;">
                        <option ${config.inputDevice === 'Microphone (Realtek Audio)' ? 'selected' : ''}>Microphone (Realtek Audio)</option>
                        <option ${config.inputDevice === 'USB Microphone' ? 'selected' : ''}>USB Microphone</option>
                    </select>
                </div>
            </div>
        `;

        const slider = el.querySelector('.volume-slider');
        const sliderVal = el.querySelector('.volume-value');
        slider.addEventListener('input', () => {
            sliderVal.textContent = `${slider.value}%`;
        });
        slider.addEventListener('change', () => {
            SystemConfig.set('masterVolume', parseInt(slider.value));
        });

        el.querySelector('.output-device-select').addEventListener('change', (e) => {
            SystemConfig.set('outputDevice', e.target.value);
        });

        el.querySelector('.input-device-select').addEventListener('change', (e) => {
            SystemConfig.set('inputDevice', e.target.value);
        });
    }

    function renderNotificationSettings(el) {
        const config = SystemConfig.getAll();
        const apps = ['File Explorer', 'Notepad', 'Settings', 'Task Manager'];
        el.innerHTML += `
            <div style="display:flex;flex-direction:column;gap:16px;">
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                        <div style="font-size:14px;font-weight:500;">Notification alerts</div>
                        <label style="position:relative;display:inline-block;width:44px;height:24px;">
                            <input type="checkbox" class="notification-alerts-toggle" ${config.notificationAlerts ? 'checked' : ''} style="opacity:0;width:0;height:0;">
                            <span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:var(--accent-color);border-radius:12px;transition:0.3s;"></span>
                        </label>
                    </div>
                </div>
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="font-size:14px;font-weight:500;margin-bottom:12px;">App notifications</div>
                    ${apps.map(app => `
                        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--window-border);">
                            <span style="font-size:13px;">${app}</span>
                            <label style="position:relative;display:inline-block;width:44px;height:24px;">
                                <input type="checkbox" class="app-notif-toggle" data-app="${app}" ${(config.appNotifications || {})[app] !== false ? 'checked' : ''} style="opacity:0;width:0;height:0;">
                                <span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:var(--accent-color);border-radius:12px;transition:0.3s;"></span>
                            </label>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        el.querySelector('.notification-alerts-toggle').addEventListener('change', (e) => {
            SystemConfig.set('notificationAlerts', e.target.checked);
        });

        el.querySelectorAll('.app-notif-toggle').forEach(toggle => {
            toggle.addEventListener('change', (e) => {
                const appNotifs = { ...(config.appNotifications || {}) };
                appNotifs[e.target.dataset.app] = e.target.checked;
                SystemConfig.set('appNotifications', appNotifs);
            });
        });
    }

    function renderPowerSettings(el) {
        const config = SystemConfig.getAll();
        el.innerHTML += `
            <div style="display:flex;flex-direction:column;gap:16px;">
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="font-size:14px;font-weight:500;margin-bottom:12px;">Power mode</div>
                    <select class="power-mode-select" style="width:100%;padding:8px 12px;font-size:13px;">
                        <option value="performance" ${config.powerMode === 'performance' ? 'selected' : ''}>Best performance</option>
                        <option value="balanced" ${config.powerMode === 'balanced' ? 'selected' : ''}>Balanced</option>
                        <option value="efficiency" ${config.powerMode === 'efficiency' ? 'selected' : ''}>Best power efficiency</option>
                    </select>
                </div>
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="font-size:14px;font-weight:500;margin-bottom:12px;">Screen and sleep</div>
                    <div style="display:flex;flex-direction:column;gap:12px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <span style="font-size:13px;">Turn off screen after</span>
                            <select class="screen-timeout-select" style="font-size:13px;">
                                <option ${config.screenTimeout === '5 minutes' ? 'selected' : ''}>5 minutes</option>
                                <option ${config.screenTimeout === '10 minutes' ? 'selected' : ''}>10 minutes</option>
                                <option ${config.screenTimeout === '15 minutes' ? 'selected' : ''}>15 minutes</option>
                                <option ${config.screenTimeout === 'Never' ? 'selected' : ''}>Never</option>
                            </select>
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <span style="font-size:13px;">Put to sleep after</span>
                            <select class="sleep-timeout-select" style="font-size:13px;">
                                <option ${config.sleepTimeout === '15 minutes' ? 'selected' : ''}>15 minutes</option>
                                <option ${config.sleepTimeout === '30 minutes' ? 'selected' : ''}>30 minutes</option>
                                <option ${config.sleepTimeout === '1 hour' ? 'selected' : ''}>1 hour</option>
                                <option ${config.sleepTimeout === 'Never' ? 'selected' : ''}>Never</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="font-size:14px;font-weight:500;margin-bottom:12px;">Battery</div>
                    <div style="display:flex;align-items:center;gap:16px;">
                        <div style="width:42px;height:42px;display:flex;align-items:center;flex-shrink:0;">${UIIcons.setting('battery', 42)}</div>
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

        el.querySelector('.power-mode-select').addEventListener('change', (e) => {
            SystemConfig.set('powerMode', e.target.value);
        });

        el.querySelector('.screen-timeout-select').addEventListener('change', (e) => {
            SystemConfig.set('screenTimeout', e.target.value);
        });

        el.querySelector('.sleep-timeout-select').addEventListener('change', (e) => {
            SystemConfig.set('sleepTimeout', e.target.value);
        });
    }

    function formatBytes(n) {
        if (n == null || isNaN(n)) return 'unknown';
        n = Math.max(0, n);
        if (n < 1024) return `${n} B`;
        if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
        if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
        return `${(n / 1073741824).toFixed(2)} GB`;
    }

    // Recursively totals a filesystem subtree. Inline file contents live in
    // localStorage (their string length is the footprint); blob-backed files
    // live in IndexedDB (their verified `size` is the footprint).
    function measureNode(node) {
        if (!node) return { local: 0, blob: 0, files: 0 };
        if (node.type === 'file') {
            if (node.blobRef) return { local: 0, blob: node.size || 0, files: 1 };
            return { local: node.content ? node.content.length : 0, blob: 0, files: 1 };
        }
        let local = 0, blob = 0, files = 0;
        if (node.type === 'folder' && node.children) {
            for (const key of Object.keys(node.children)) {
                const r = measureNode(node.children[key]);
                local += r.local; blob += r.blob; files += r.files;
            }
        }
        return { local, blob, files };
    }

    function renderStorageSettings(el) {
        let totalLocal = 0;
        try { totalLocal = FileSystem.serializedSize(); } catch (e) { totalLocal = 0; }
        const budget = FileSystem.STORAGE_BUDGET || Math.floor(4.5 * 1024 * 1024);
        const usedPct = Math.min(100, Math.max(0, (totalLocal / budget) * 100));

        const home = ['/', 'users', 'default'];
        const categories = [
            { name: 'Documents', path: [...home, 'Documents'], color: '#FFC107' },
            { name: 'Downloads', path: [...home, 'Downloads'], color: '#00ACC1' },
            { name: 'Pictures', path: [...home, 'Pictures'], color: '#43A047' },
            { name: 'Music', path: [...home, 'Music'], color: '#AB47BC' },
            { name: 'Videos', path: [...home, 'Videos'], color: '#E53935' },
            { name: 'Desktop', path: [...home, 'Desktop'], color: '#7E57C2' },
            { name: 'Apps & data', path: ['/', 'programs data'], color: '#0078D4' },
            { name: 'System & reserved', path: ['/', 'system'], color: '#888' }
        ].map(cat => {
            let m = { local: 0, blob: 0, files: 0 };
            try { m = measureNode(FileSystem.getNode(cat.path)); } catch (e) { /* treat as empty */ }
            return { ...cat, ...m, bytes: m.local + m.blob };
        });

        const blobTotal = categories.reduce((sum, c) => sum + c.blob, 0);

        el.innerHTML += `
            <div style="display:flex;flex-direction:column;gap:16px;">
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="font-size:14px;font-weight:500;margin-bottom:12px;">Virtual disk (browser storage)</div>
                    <div style="height:20px;background:rgba(255,255,255,0.06);border-radius:10px;overflow:hidden;margin-bottom:8px;">
                        <div style="height:100%;width:${usedPct.toFixed(1)}%;background:linear-gradient(90deg,#0078D4,#00a8e8);border-radius:10px;"></div>
                    </div>
                    <div style="font-size:13px;color:var(--text-secondary);">${formatBytes(totalLocal)} of ${formatBytes(budget)} used (${usedPct.toFixed(1)}%)</div>
                    <div class="storage-disk-line" style="font-size:12px;color:var(--text-secondary);margin-top:4px;">Media files (IndexedDB): ${formatBytes(blobTotal)}${blobTotal > 0 ? '' : ' • nothing stored off-index yet'}</div>
                </div>
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="font-size:14px;font-weight:500;margin-bottom:12px;">Storage usage</div>
                    <div style="display:flex;flex-direction:column;gap:8px;">
                        ${categories.map(item => `
                            <div style="display:flex;align-items:center;gap:8px;" title="${item.files} file(s)">
                                <div style="width:12px;height:12px;border-radius:3px;background:${item.color};"></div>
                                <span style="flex:1;font-size:13px;">${item.name}</span>
                                <span style="font-size:12px;color:var(--text-secondary);">${item.files} items</span>
                                <span style="font-size:13px;color:var(--text-secondary);min-width:70px;text-align:right;">${formatBytes(item.bytes)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        // Fill in the real on-disk browser estimate when it resolves.
        try {
            FileSystem.storageInfo().then(info => {
                if (!el.isConnected) return;
                const line = el.querySelector('.storage-disk-line');
                if (!line) return;
                const usage = info.usage == null ? 'unknown' : formatBytes(info.usage);
                const quota = info.quota == null ? 'unknown' : formatBytes(info.quota);
                line.textContent = `Media files (IndexedDB): ${formatBytes(blobTotal)} • On-disk usage: ${usage} of ${quota}`;
            }).catch(() => { /* keep the synchronous numbers */ });
        } catch (e) { /* keep the synchronous numbers */ }
    }

    function renderMultitaskingSettings(el) {
        const config = SystemConfig.getAll();
        const desktops = VirtualDesktops.getDesktops();
        const wallpaperOpts = Object.entries(VirtualDesktops.WALLPAPER_NAMES)
            .map(([v, label]) => `<option value="${v}">${label}</option>`).join('');
        el.innerHTML += `
            <div style="display:flex;flex-direction:column;gap:16px;">
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="font-size:14px;font-weight:500;margin-bottom:4px;">Virtual desktops</div>
                    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">Add, rename, and switch desktops from Task View (WIN+TAB). Each desktop can keep its own wallpaper here.</div>
                    <div style="display:flex;flex-direction:column;gap:8px;">
                        ${desktops.map(d => `
                            <div style="display:flex;align-items:center;gap:10px;font-size:13px;">
                                <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${d.name.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>
                                <select class="vd-wallpaper-select" data-desktop="${d.id}" style="max-width:150px;">
                                    <option value="">Follow system</option>
                                    ${Object.entries(VirtualDesktops.WALLPAPER_NAMES).map(([v, label]) => `<option value="${v}"${d.wallpaper === v ? ' selected' : ''}>${label}</option>`).join('')}
                                </select>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="font-size:14px;font-weight:500;margin-bottom:12px;">Snap windows</div>
                    <div style="display:flex;flex-direction:column;gap:8px;">
                        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;">
                            <input type="checkbox" class="snap-layouts-toggle" ${config.snapLayouts ? 'checked' : ''} style="accent-color:var(--accent-color);"> Show snap layouts when dragging windows
                        </label>
                        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;">
                            <input type="checkbox" class="snap-bar-toggle" ${config.snapBar ? 'checked' : ''} style="accent-color:var(--accent-color);"> Show snap bar when dragging to top of screen
                        </label>
                        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;">
                            <input type="checkbox" class="snap-auto-toggle" ${config.snapAuto ? 'checked' : ''} style="accent-color:var(--accent-color);"> Snap windows automatically
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

        el.querySelector('.snap-layouts-toggle').addEventListener('change', (e) => {
            SystemConfig.set('snapLayouts', e.target.checked);
        });

        el.querySelectorAll('.vd-wallpaper-select').forEach(sel => {
            sel.addEventListener('change', () => {
                VirtualDesktops.setWallpaper(sel.dataset.desktop, sel.value || null);
            });
        });

        el.querySelector('.snap-bar-toggle').addEventListener('change', (e) => {
            SystemConfig.set('snapBar', e.target.checked);
        });

        el.querySelector('.snap-auto-toggle').addEventListener('change', (e) => {
            SystemConfig.set('snapAuto', e.target.checked);
        });
    }

    function renderTouchpadSettings(el) {
        const config = SystemConfig.getAll();
        const enabled = !!config.virtualTouchpadEnabled;
        const sensitivity = parseFloat(config.touchpadSensitivity) || 1.6;
        const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

        const gestures = [
            [UIIcons.setting('swipe', 20), 'Swipe with one finger', 'Move the virtual mouse'],
            [UIIcons.setting('tap', 20), 'Single tap', 'Left click'],
            [UIIcons.setting('doubleTap', 20), 'Double tap', 'Double click'],
            [UIIcons.setting('drag', 20), 'Tap, then touch & drag', 'Drag windows / select text'],
            [UIIcons.setting('twoFingerTap', 20), 'Two-finger tap', 'Right click'],
            [UIIcons.setting('twoFingerSwipe', 20), 'Two-finger swipe', 'Scroll'],
            [UIIcons.setting('hold', 20), 'Touch & hold', 'Right click (alternative)']
        ];

        el.innerHTML += `
            <div style="display:flex;flex-direction:column;gap:16px;">
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <div>
                            <div style="font-size:14px;font-weight:500;">Virtual touchpad</div>
                            <div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">${hasTouch ? 'Touch screen detected — swipe moves a virtual mouse.' : 'No touch screen detected — you can still enable it for testing.'}</div>
                        </div>
                        <label style="position:relative;display:inline-block;width:44px;height:24px;flex-shrink:0;">
                            <input type="checkbox" class="touchpad-enable-toggle" ${enabled ? 'checked' : ''} style="opacity:0;width:0;height:0;">
                            <span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:var(--accent-color);border-radius:12px;transition:0.3s;"></span>
                        </label>
                    </div>
                </div>
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;opacity:${enabled ? '1' : '0.5'};pointer-events:${enabled ? 'auto' : 'none'};">
                    <div style="font-size:14px;font-weight:500;margin-bottom:12px;">Cursor speed</div>
                    <div style="display:flex;align-items:center;gap:12px;">
                        <span style="width:18px;height:18px;display:inline-flex;flex-shrink:0;">${UIIcons.setting('slow', 18)}</span>
                        <input type="range" class="touchpad-sensitivity-slider" min="0.4" max="4" step="0.1" value="${sensitivity}" style="flex:1;accent-color:var(--accent-color);">
                        <span style="width:18px;height:18px;display:inline-flex;flex-shrink:0;">${UIIcons.setting('fast', 18)}</span>
                        <span class="touchpad-sensitivity-value" style="min-width:36px;text-align:right;font-size:13px;">${sensitivity.toFixed(1)}x</span>
                    </div>
                </div>
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="font-size:14px;font-weight:500;margin-bottom:12px;">Gestures</div>
                    <div style="display:flex;flex-direction:column;gap:8px;">
                        ${gestures.map(([icon, name, desc]) => `
                            <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--window-border);">
                                <div style="min-width:40px;display:flex;align-items:center;justify-content:center;">${icon}</div>
                                <div style="flex:1;">
                                    <div style="font-size:13px;font-weight:500;">${name}</div>
                                    <div style="font-size:12px;color:var(--text-secondary);">${desc}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div style="font-size:12px;color:var(--text-secondary);">Tip: while touchpad mode is on, the whole screen acts as a trackpad. Use two-finger swipe to scroll windows and Settings pages.</div>
            </div>
        `;

        el.querySelector('.touchpad-enable-toggle').addEventListener('change', (e) => {
            SystemConfig.set('virtualTouchpadEnabled', e.target.checked);
            try { Touch.refreshTouchpad(true); } catch (err) {}
            // Clean re-render (header reset + single content block). Never call
            // renderTouchpadSettings(el) here: it appends via `innerHTML +=`,
            // which would duplicate the block and destroy live listeners.
            renderPage();
        });

        const slider = el.querySelector('.touchpad-sensitivity-slider');
        if (slider) {
            const val = el.querySelector('.touchpad-sensitivity-value');
            slider.addEventListener('input', () => {
                if (val) val.textContent = `${parseFloat(slider.value).toFixed(1)}x`;
            });
            slider.addEventListener('change', () => {
                SystemConfig.set('touchpadSensitivity', parseFloat(slider.value));
            });
        }
    }

    function renderTouchKeyboardSettings(el) {
        const config = SystemConfig.getAll();
        const enabled = !!config.touchKeyboardEnabled;
        const autoShow = config.touchKeyboardAutoShow !== false;
        const trayBtn = config.touchKeyboardTrayButton !== false;
        const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

        const toggleRow = (title, desc, cls, checked, dimmed) => `
            <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;${dimmed ? 'opacity:0.5;pointer-events:none;' : ''}">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <div style="font-size:14px;font-weight:500;">${title}</div>
                        <div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">${desc}</div>
                    </div>
                    <label style="position:relative;display:inline-block;width:44px;height:24px;flex-shrink:0;">
                        <input type="checkbox" class="${cls}" ${checked ? 'checked' : ''} style="opacity:0;width:0;height:0;">
                        <span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:var(--accent-color);border-radius:12px;transition:0.3s;"></span>
                    </label>
                </div>
            </div>`;

        el.innerHTML += `
            <div style="display:flex;flex-direction:column;gap:16px;">
                ${toggleRow('Touch keyboard',
                    hasTouch
                        ? 'Use the Windows 12 keyboard instead of the native iOS / Android one.'
                        : 'No touch screen detected — enable it anyway to type with mouse or touch.',
                    'tk-enable-toggle', enabled, false)}
                ${toggleRow('Show automatically',
                    'Open the keyboard whenever a text field is focused. Turn off to summon it only from the taskbar.',
                    'tk-auto-toggle', autoShow, !enabled)}
                ${toggleRow('Taskbar button',
                    'Show the keyboard button in the taskbar tray so it can be requested at any time.',
                    'tk-tray-toggle', trayBtn, !enabled)}
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="font-size:14px;font-weight:500;margin-bottom:4px;">Try it</div>
                    <div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">Focus this field${enabled && autoShow ? '' : ' (enable + auto-show first)'}:</div>
                    <input type="text" class="tk-demo-input" placeholder="Type here…" style="width:100%;box-sizing:border-box;background:rgba(0,0,0,0.3);border:1px solid var(--window-border);color:var(--text-primary);border-radius:6px;padding:10px 12px;font-size:14px;outline:none;">
                    <button class="tk-show-now" style="margin-top:12px;background:var(--accent-color);border:none;color:white;border-radius:6px;padding:8px 16px;cursor:pointer;font-size:13px;font-weight:500;">Show keyboard now</button>
                </div>
                <div style="font-size:12px;color:var(--text-secondary);">Tip: Shift toggles capitals for one letter — double-tap it for Caps Lock. Hold Backspace to delete whole words quickly.</div>
            </div>
        `;

        el.querySelector('.tk-enable-toggle').addEventListener('change', (e) => {
            SystemConfig.set('touchKeyboardEnabled', e.target.checked);
            try { VirtualKeyboard.refresh(); } catch (err) {}
            renderPage();
        });
        const autoT = el.querySelector('.tk-auto-toggle');
        if (autoT) autoT.addEventListener('change', (e) => {
            SystemConfig.set('touchKeyboardAutoShow', e.target.checked);
            try { VirtualKeyboard.refresh(); } catch (err) {}
        });
        const trayT = el.querySelector('.tk-tray-toggle');
        if (trayT) trayT.addEventListener('change', (e) => {
            SystemConfig.set('touchKeyboardTrayButton', e.target.checked);
            try { VirtualKeyboard.refresh(); } catch (err) {}
        });
        el.querySelector('.tk-show-now').addEventListener('click', () => {
            if (!SystemConfig.get('touchKeyboardEnabled')) {
                SystemConfig.set('touchKeyboardEnabled', true);
                try { VirtualKeyboard.refresh(); } catch (err) {}
                renderPage();
                return;
            }
            try { VirtualKeyboard.show(); } catch (err) {}
        });
    }

    function renderPersonalization(el) {
        const config = SystemConfig.getAll();
        el.innerHTML = `
            <h2 style="font-size:28px;font-weight:600;margin-bottom:24px;">Personalization</h2>

            <div class="settings-section" style="margin-bottom:24px;">
                <h3 style="font-size:16px;font-weight:500;margin-bottom:12px;">Theme</h3>
                <div style="display:flex;gap:12px;">
                    <div class="theme-option" data-theme="dark" style="flex:1;padding:16px;border-radius:8px;cursor:pointer;text-align:center;background:${config.darkMode ? 'var(--accent-color)' : 'rgba(255,255,255,0.04)'};border:1px solid ${config.darkMode ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)'};">
                        <div style="display:flex;justify-content:center;margin-bottom:4px;">${UIIcons.setting('moon', 28)}</div>
                        <div style="font-size:13px;">Dark</div>
                    </div>
                    <div class="theme-option" data-theme="light" style="flex:1;padding:16px;border-radius:8px;cursor:pointer;text-align:center;background:${!config.darkMode ? 'var(--accent-color)' : 'rgba(255,255,255,0.04)'};border:1px solid ${!config.darkMode ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)'};">
                        <div style="display:flex;justify-content:center;margin-bottom:4px;">${UIIcons.setting('sun', 28)}</div>
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
                <h3 style="font-size:16px;font-weight:500;margin-bottom:4px;">Mouse Cursor</h3>
                <p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">Applies to the real mouse and the virtual touchpad cursor.</p>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
                    ${(typeof Cursor !== 'undefined' ? Cursor.getThemes() : []).map(t => cursorThemeOption(t, config.cursorTheme)).join('')}
                </div>
                <div style="font-size:13px;font-weight:500;margin:12px 0 8px;">Cursor Size</div>
                <div style="display:flex;align-items:center;gap:12px;">
                    <input type="range" class="cursor-size-slider" min="16" max="64" step="1" value="${(typeof Cursor !== 'undefined' && typeof Cursor.getSizeObj === 'function') ? Cursor.getSizeObj(config.cursorSize).px : 22}" style="flex:1;accent-color:var(--accent-color);">
                    <span class="cursor-size-value" style="min-width:45px;text-align:right;font-size:14px;">${(typeof Cursor !== 'undefined' && typeof Cursor.getSizeObj === 'function') ? Cursor.getSizeObj(config.cursorSize).px : 22}px</span>
                </div>
                <div style="font-size:13px;font-weight:500;margin:12px 0 8px;">Pointer style</div>
                <div style="display:flex;gap:8px;">
                    ${(typeof Cursor !== 'undefined' ? Cursor.getStyles() : []).map(s => cursorStyleOption(s, config.cursorStyle)).join('')}
                </div>
                <div class="cursor-test-area" style="margin-top:12px;background:rgba(255,255,255,0.04);border:1px dashed var(--window-border);border-radius:8px;padding:14px;display:flex;align-items:center;gap:16px;">
                    <span style="font-size:12px;color:var(--text-secondary);">Try it:</span>
                    <button style="background:var(--hover-bg);border:1px solid var(--window-border);border-radius:6px;padding:6px 14px;color:var(--text-primary);font-size:12px;cursor:pointer;">Hover me</button>
                    <input type="text" placeholder="Text cursor" style="background:var(--hover-bg);border:1px solid var(--window-border);border-radius:6px;padding:6px 10px;color:var(--text-primary);font-size:12px;outline:none;width:130px;">
                    <a href="#" onclick="return false;" style="font-size:12px;">Link</a>
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
                <h3 style="font-size:16px;font-weight:500;margin-bottom:12px;">Taskbar Position</h3>
                <div style="display:flex;gap:8px;">
                    ${TASKBAR_POSITIONS.map(p => taskbarPositionOption(p, config.taskbarPosition)).join('')}
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
        const installed = AppSystem.getInstalledApps();
        const allMeta = AppMetadata.getAll();

        el.innerHTML = `
            <h2 style="font-size:28px;font-weight:600;margin-bottom:24px;">Apps</h2>
            <div style="display:flex;flex-direction:column;gap:8px;">
                ${Object.entries(allMeta).map(([id, meta]) => {
                    const man = AppLoader.getManifest(id);
                    if (!man) return '';
                    const svc = AppLoader.isService(id);
                    if (man.distribution === 'builtin') return appRow(meta.name, svc ? 'Built-in service' : 'Built-in', false);
                    if (installed.includes(id)) {
                        const row = appRow(meta.name, svc ? 'Service • Installed from Store' : 'Installed from Store', true, id);
                        const perms = Permissions.getDeclared(id);
                        if (perms.length === 0) return row;
                        const toggles = perms.map(p => {
                            const info = Permissions.getCatalog()[p];
                            const on = Permissions.isGranted(id, p);
                            return `<label style="display:flex;align-items:center;gap:8px;font-size:12px;color:#ccc;cursor:pointer;">
                                <input type="checkbox" class="settings-perm-toggle" data-app="${id}" data-perm="${p}"${on ? ' checked' : ''} style="accent-color:var(--accent-color);">
                                ${info.label}</label>`;
                        }).join('');
                        return row + `<div style="margin:-4px 0 4px 0;padding:10px 16px;background:rgba(255,255,255,0.02);border-radius:6px;display:flex;flex-direction:column;gap:6px;">
                            <div style="font-size:11px;color:#888;">Permissions</div>${toggles}</div>`;
                    }
                    return '';
                }).join('')}
            </div>
        `;

        el.querySelectorAll('.settings-perm-toggle').forEach(t => {
            t.addEventListener('change', () => {
                Permissions.setGranted(t.dataset.app, t.dataset.perm, t.checked);
            });
        });

        el.querySelectorAll('.settings-uninstall-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const appId = btn.dataset.app;
                AppSystem.uninstallApp(appId);
                renderApps(el);
            });
        });
    }

    function renderAccounts(el) {
        el.innerHTML = `
            <h2 style="font-size:28px;font-weight:600;margin-bottom:24px;">Accounts</h2>
            <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:20px;display:flex;align-items:center;gap:16px;margin-bottom:16px;">
                <div style="width:64px;height:64px;background:var(--accent-color,#0078D4);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:600;">${(SystemConfig.get('userName')||'U').charAt(0).toUpperCase()}</div>
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
        const hasUpdate = WindowsUpdate.isUpdateAvailable();
        const currentVersion = WindowsUpdate.getCurrentVersion();
        const latestVersion = WindowsUpdate.getLatestVersion();

        el.innerHTML = `
            <h2 style="font-size:28px;font-weight:600;margin-bottom:24px;">Windows Update</h2>
            <div style="background:${hasUpdate ? 'rgba(255,152,0,0.15)' : 'rgba(0,150,0,0.15)'};border:1px solid ${hasUpdate ? 'rgba(255,152,0,0.3)' : 'rgba(0,150,0,0.3)'};border-radius:8px;padding:16px;display:flex;align-items:center;gap:12px;margin-bottom:16px;">
                <span style="width:26px;height:26px;display:inline-flex;flex-shrink:0;">${hasUpdate ? UIIcons.action('arrowUp', 26) : UIIcons.action('check', 26)}</span>
                <div>
                    <div style="font-weight:500;">${hasUpdate ? 'Update available' : 'You\'re up to date'}</div>
                    <div style="font-size:13px;color:#888;">${hasUpdate ? `Version ${latestVersion} is available` : `Current version: ${currentVersion}`}</div>
                </div>
            </div>
            ${hasUpdate ? `
                <button class="settings-update-refresh" style="width:100%;padding:12px;background:#0078D4;border:none;border-radius:6px;color:white;cursor:pointer;font-size:14px;font-weight:500;margin-bottom:16px;">Refresh to Update</button>
            ` : ''}
            <button class="settings-update-check" style="width:100%;padding:12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:var(--text-primary);cursor:pointer;font-size:14px;">Check for updates</button>
            <div style="margin-top:16px;font-size:12px;color:#888;">Last checked: ${new Date().toLocaleString()}</div>
        `;

        el.querySelector('.settings-update-check').addEventListener('click', async () => {
            const btn = el.querySelector('.settings-update-check');
            btn.textContent = 'Checking...';
            btn.disabled = true;
            await WindowsUpdate.checkForUpdates(false);
            renderUpdate(el);
        });

        if (hasUpdate) {
            el.querySelector('.settings-update-refresh').addEventListener('click', () => {
                location.reload();
            });
        }
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
            const v = WindowsUpdate.getCurrentVersion() || '12.0.4000';
            el.querySelector('.about-version').textContent = v;
            el.querySelector('.about-build').textContent = v.replace(/\./g, '');
            el.querySelector('.about-date').textContent = '2026-08-31';
        });
    }

    function systemCard(icon, title, desc, subPage) {
        return `<div class="system-sub-card" data-subpage="${subPage}" style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;cursor:pointer;transition:background 0.15s;">
            <div style="width:22px;height:22px;margin-bottom:8px;display:flex;align-items:center;">${icon}</div>
            <div style="font-size:14px;font-weight:500;margin-bottom:4px;">${title}</div>
            <div style="font-size:12px;color:#888;">${desc}</div>
        </div>`;
    }

    function appRow(name, detail, removable, appId) {
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:rgba(255,255,255,0.04);border-radius:6px;">
            <div>
                <div style="font-size:14px;font-weight:500;">${name}</div>
                <div style="font-size:12px;color:#888;">${detail}</div>
            </div>
            ${removable ? `<button class="settings-uninstall-btn" data-app="${appId}" style="background:rgba(233,17,35,0.2);border:1px solid rgba(233,17,35,0.4);border-radius:4px;padding:6px 12px;color:#ff6666;cursor:pointer;font-size:12px;">Uninstall</button>` : ''}
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

    function cursorThemeOption(t, activeId) {
        const active = (activeId || 'default') === t.id;
        const arrow = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M5 3l14 7-6.5 1.5L9 18 5 3z" fill="${t.fill}" stroke="${t.stroke}" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
        return `<div class="cursor-theme-option" data-theme="${t.id}" title="${t.desc}" style="background:rgba(255,255,255,0.04);border:1px solid ${active ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)'};border-radius:8px;padding:10px 8px;cursor:pointer;text-align:center;transition:border-color 0.15s;">
            <div style="height:30px;display:flex;align-items:center;justify-content:center;">${arrow}</div>
            <div style="font-size:11px;font-weight:${active ? '600' : '400'};margin-top:4px;">${t.name}</div>
        </div>`;
    }

    function cursorSizeOption(s, activeId, themeId) {
        const active = (activeId || 'normal') === s.id;
        const px = Math.round(14 * s.scale);
        const themes = (typeof Cursor !== 'undefined' ? Cursor.getThemes() : []);
        const theme = themes.find(x => x.id === (themeId || 'default')) || { fill: '#fff', stroke: '#111' };
        const dot = `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="none"><path d="M5 3l14 7-6.5 1.5L9 18 5 3z" fill="${theme.fill}" stroke="${theme.stroke}" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
        return `<div class="cursor-size-option" data-size="${s.id}" style="flex:1;background:rgba(255,255,255,0.04);border:1px solid ${active ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)'};border-radius:8px;padding:10px 8px;cursor:pointer;text-align:center;transition:border-color 0.15s;">
            <div style="height:30px;display:flex;align-items:center;justify-content:center;">${dot}</div>
            <div style="font-size:11px;font-weight:${active ? '600' : '400'};margin-top:4px;">${s.name}</div>
        </div>`;
    }

    function cursorStyleOption(s, activeId) {
        const active = (activeId || 'modern') === s.id;
        return `<div class="cursor-style-option" data-style="${s.id}" title="${s.desc}" style="flex:1;background:rgba(255,255,255,0.04);border:1px solid ${active ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)'};border-radius:8px;padding:10px 8px;cursor:pointer;text-align:center;transition:border-color 0.15s;">
            <div style="height:30px;display:flex;align-items:center;justify-content:center;">${s.preview || ''}</div>
            <div style="font-size:11px;font-weight:${active ? '600' : '400'};margin-top:4px;">${s.name}</div>
        </div>`;
    }

    const TASKBAR_POSITIONS = [
        { id: 'bottom', name: 'Bottom' },
        { id: 'top', name: 'Top' },
        { id: 'left', name: 'Left' },
        { id: 'right', name: 'Right' }
    ];

    function taskbarPositionPreview(pos) {
        // Mini screen mock with the taskbar bar on the given edge.
        const bar = {
            bottom: 'position:absolute;left:3px;right:3px;bottom:2px;height:5px;',
            top: 'position:absolute;left:3px;right:3px;top:2px;height:5px;',
            left: 'position:absolute;left:2px;top:3px;bottom:3px;width:5px;',
            right: 'position:absolute;right:2px;top:3px;bottom:3px;width:5px;'
        }[pos];
        return `<div style="width:44px;height:30px;border-radius:5px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);position:relative;margin:0 auto;"><div style="${bar}background:var(--accent-color);border-radius:2px;"></div></div>`;
    }

    function taskbarPositionOption(p, activeId) {
        const active = (activeId || 'bottom') === p.id;
        return `<div class="taskbar-pos-option" data-pos="${p.id}" style="flex:1;background:rgba(255,255,255,0.04);border:1px solid ${active ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)'};border-radius:8px;padding:10px 8px;cursor:pointer;text-align:center;transition:border-color 0.15s;">
            ${taskbarPositionPreview(p.id)}
            <div style="font-size:11px;font-weight:${active ? '600' : '400'};margin-top:6px;">${p.name}</div>
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

        win.element.querySelectorAll('.cursor-theme-option').forEach(opt => {
            opt.addEventListener('click', () => {
                try { Cursor.setTheme(opt.dataset.theme); } catch (e) {}
                SystemConfig.set('cursorTheme', opt.dataset.theme);
                renderPersonalization(win.element.querySelector('.settings-content'));
            });
        });

        const cursorSlider = win.element.querySelector('.cursor-size-slider');
        const cursorSliderVal = win.element.querySelector('.cursor-size-value');
        if (cursorSlider) {
            cursorSlider.addEventListener('input', () => {
                const px = parseInt(cursorSlider.value);
                if (cursorSliderVal) cursorSliderVal.textContent = `${px}px`;
                try { Cursor.setSize(px); } catch (e) {}
            });
            cursorSlider.addEventListener('change', () => {
                const px = parseInt(cursorSlider.value);
                SystemConfig.set('cursorSize', px);
            });
        }

        win.element.querySelectorAll('.cursor-style-option').forEach(opt => {
            opt.addEventListener('click', () => {
                try { Cursor.setStyle(opt.dataset.style); } catch (e) {}
                SystemConfig.set('cursorStyle', opt.dataset.style);
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

        win.element.querySelectorAll('.taskbar-pos-option').forEach(opt => {
            opt.addEventListener('click', () => {
                SystemConfig.set('taskbarPosition', opt.dataset.pos);
                renderPersonalization(win.element.querySelector('.settings-content'));
            });
        });

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

    function showPage(page, subPage = null) {
        const validPage = Object.hasOwn(pages, page) ? page : 'system';
        const validSubPage = validPage === 'system' && Object.hasOwn(systemSubPages, subPage) ? subPage : null;

        currentPage = validPage;
        currentSubPage = validSubPage;

        if (!win || !win.element.isConnected) {
            return;
        }

        if (win.element.style.display === 'none') {
            win.element.style.display = 'flex';
        }
        WindowManager.focusWindow(win.id);
        renderPage();
    }

    function launch(options = {}) {
        if (options.page || options.subPage) {
            showPage(options.page || 'system', options.subPage);

            if (win && win.element.isConnected) {
                return;
            }
        } else if (win && win.element.isConnected) {
            return;
        }

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

    return { launch, showPage };
})();

export default Settings;
