import AppIcons from '../../modules/appIcons.js';
import UIIcons from '../../modules/uiIcons.js';
import WindowManager from '../../modules/windowManager.js';
import SystemConfig from '../../modules/systemConfig.js';
import FileSystem from '../../modules/fileSystem.js';
import Scaling from '../../modules/scaling.js';
import Popup from '../../modules/popup.js';
import AppSystem from '../../modules/appSystem.js';
import AppLoader from '../../modules/appLoader.js';
import { AppMetadata, Taskbar } from '../../modules/taskbar.js';
import WindowsUpdate from '../../modules/windowsUpdate.js';
import UpdateService from '../../modules/updateService.js';
import Touch from '../../modules/touch.js';
import VirtualKeyboard from '../../modules/virtualKeyboard.js';
import Cursor from '../../modules/cursor.js';
import VirtualDesktops from '../../modules/virtualDesktops.js';
import Permissions from '../../modules/permissions.js';
import Users from '../../modules/users.js';
import Packages from '../../modules/packages.js';
import UAC from '../../modules/uac.js';
import Sounds from '../../modules/sounds.js';
import FilePicker from '../../modules/filePicker.js';

const Settings = (() => {
    const icon = AppIcons.get('settings');

    let currentPage = 'system';
    let currentSubPage = null;
    let win = null;

    // No keyboard glyph in ShellIcons — inline tile icon (same 20px box).
    const TOUCH_KBD_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6" stroke-linecap="round"/></svg>';

    const SOUND_FILE_EXTS = ['wav', 'mp3', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus', 'webm'];

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
        touchKeyboard: { name: 'Touch keyboard', icon: TOUCH_KBD_ICON },
        recovery: { name: 'Recovery', icon: UIIcons.setting('recovery', 20) }
    };

    const personalizationSubPages = {
        theme: { name: 'Theme', icon: UIIcons.setting('moon', 20) },
        accent: { name: 'Accent color', icon: UIIcons.setting('palette', 20) },
        background: { name: 'Background', icon: UIIcons.setting('background', 20) },
        sounds: { name: 'Sounds', icon: UIIcons.setting('sound', 20) },
        cursor: { name: 'Mouse cursor', icon: UIIcons.setting('cursor', 20) },
        taskbar: { name: 'Taskbar', icon: UIIcons.setting('taskbarSettings', 20) }
    };

    const updateSubPages = {
        history: { name: 'Update history', icon: UIIcons.setting('update', 20) }
    };

    const subPageSets = { system: systemSubPages, personalization: personalizationSubPages, update: updateSubPages };

    function currentUserName() {
        let accName = null;
        try {
            const u = Users.getCurrent();
            if (u && u.name) accName = String(u.name);
        } catch { /* fall through */ }
        if (accName && accName !== 'User') return accName;
        try {
            const c = SystemConfig.get('userName');
            if (c) return String(c);
        } catch { /* fall through */ }
        return accName || 'User';
    }

    // 'Administrator' | 'Standard user' for an account record.
    function accountTypeLabel(acc) {
        return acc && acc.type === 'administrator' ? 'Administrator' : 'Standard user';
    }

    function currentUserTypeLabel() {
        try { return accountTypeLabel(Users.getCurrent()); } catch { return 'Local account'; }
    }

    // Elevation for administrator-only settings (account management). Falls
    // back to false when UAC is unavailable.
    async function requireAdmin(message) {
        try { return await UAC.request({ name: 'Windows Settings', message }); }
        catch { return false; }
    }

    // Countdown "keep these display settings?" dialog — a real Popup window.
    // Resolves true when the user keeps the change, false to revert (also on
    // timeout or when the dialog is closed). Display settings are
    // machine-wide, so a bad choice is confirmed before it is kept.
    function confirmDisplayChange(title, message, seconds = 15) {
        let remaining = seconds;
        const p = Popup.custom(title, `
            <div class="popup-message">${message} Reverting in <span class="display-confirm-countdown">${remaining}</span>s unless you keep the changes.</div>
        `, [
            { label: 'Revert', value: false },
            { label: 'Keep changes', value: true, primary: true }
        ]);

        const timer = setInterval(() => {
            remaining--;
            const el = WindowManager.getWindowsByApp('popup').find(w => w.id === p._winId)?.element;
            const count = el && el.querySelector('.display-confirm-countdown');
            if (count) count.textContent = remaining;
            if (remaining <= 0) {
                clearInterval(timer);
                try { p._cleanup(false); WindowManager.closeWindow(p._winId); } catch (e) { /* already closed */ }
            }
        }, 1000);

        return Promise.resolve(p).then(
            kept => { clearInterval(timer); return kept === true; },
            () => { clearInterval(timer); return false; }
        );
    }

    function getContent() {
        return `
            <div style="display:flex;height:100%;">
                <div class="settings-sidebar" style="width:220px;background:rgba(0,0,0,0.2);padding:12px 8px;border-right:1px solid rgba(255,255,255,0.06);overflow-y:auto;">
                    <div style="padding:12px;display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                        <div class="settings-avatar" style="width:48px;height:48px;background:var(--accent-color,#0078D4);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:600;">${esc(currentUserName()).charAt(0).toUpperCase()}</div>
                        <div>
                            <div class="settings-username" style="font-size:14px;font-weight:500;">${esc(currentUserName())}</div>
                            <div class="settings-usertype" style="font-size:12px;color:#888;">${esc(currentUserTypeLabel())}</div>
                        </div>
                    </div>
                    ${buildNav()}
                </div>
                <div class="settings-content" style="flex:1;padding:24px;overflow-y:auto;"></div>
            </div>
        `;
    }

    function refreshSidebarUser() {
        if (!win || !win.element || !win.element.isConnected) return;
        const name = currentUserName();
        const usernameEl = win.element.querySelector('.settings-username');
        if (usernameEl) usernameEl.textContent = name;
        const avatarEl = win.element.querySelector('.settings-avatar');
        if (avatarEl) avatarEl.textContent = name.charAt(0).toUpperCase();
        const typeEl = win.element.querySelector('.settings-usertype');
        if (typeEl) typeEl.textContent = currentUserTypeLabel();
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

        if (currentSubPage && subPageSets[currentPage] && Object.hasOwn(subPageSets[currentPage], currentSubPage)) {
            renderSubPage(contentEl, currentPage, currentSubPage);
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
                ${systemCard(UIIcons.setting('recovery', 22), 'Recovery', 'Reset config, format, and recovery options', 'recovery')}
            </div>
        `;

        wireSubPageCards(el);
    }

    // Card grids (System, Personalization) share the same navigation wiring.
    function wireSubPageCards(el) {
        el.querySelectorAll('.system-sub-card').forEach(card => {
            card.addEventListener('click', () => {
                currentSubPage = card.dataset.subpage;
                renderPage();
            });
            card.addEventListener('mouseenter', () => card.style.background = 'rgba(255,255,255,0.08)');
            card.addEventListener('mouseleave', () => card.style.background = 'rgba(255,255,255,0.04)');
        });
    }

    function renderSubPage(el, page, subPage) {
        if (page === 'system') {
            renderSystemSubPage(el, subPage);
        } else if (page === 'update') {
            renderUpdateSubPage(el, subPage);
        } else {
            renderPersonalizationSubPage(el, subPage);
        }
    }

    function subPageHeader(name) {
        return `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
                <button class="settings-back-btn" style="background:none;border:none;color:var(--text-primary);cursor:pointer;font-size:18px;padding:4px 8px;border-radius:4px;display:flex;align-items:center;">&#9664;</button>
                <h2 style="font-size:28px;font-weight:600;">${name}</h2>
            </div>
        `;
    }

    function renderSystemSubPage(el, subPage) {
        const sub = systemSubPages[subPage];
        el.innerHTML = subPageHeader(sub.name);

        switch (subPage) {
            case 'display': renderDisplaySettings(el); break;
            case 'sound': renderSoundSettings(el); break;
            case 'notifications': renderNotificationSettings(el); break;
            case 'power': renderPowerSettings(el); break;
            case 'storage': renderStorageSettings(el); break;
            case 'multitasking': renderMultitaskingSettings(el); break;
            case 'touchpad': renderTouchpadSettings(el); break;
            case 'touchKeyboard': renderTouchKeyboardSettings(el); break;
            case 'recovery': renderRecoverySettings(el); break;
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
                    <div style="font-size:14px;font-weight:500;margin-bottom:2px;">Scale &amp; layout</div>
                    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">Applies to every user and the lock screen · requires administrator approval</div>
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

        el.querySelector('.resolution-select').addEventListener('change', async (e) => {
            // Track the last applied value on the element: currentRes is
            // captured once at render, so after one change the "unchanged?"
            // check compared against the original resolution forever.
            const prevRes = e.target.dataset.applied || currentRes;
            const newRes = e.target.value;
            if (newRes === prevRes) return;

            if (!(await requireAdmin('Change the display resolution for all users on this device?'))) {
                e.target.value = prevRes;
                return;
            }

            const resLabel = el.querySelector('.current-res-label');
            const updateResLabel = () => {
                if (!resLabel) return;
                const target = SystemConfig.getCurrentResolution();
                resLabel.textContent = `Rendering at: ${target.width}x${target.height}`;
            };

            SystemConfig.set('displayResolution', newRes);
            e.target.dataset.applied = newRes;
            updateResLabel();

            const keep = await confirmDisplayChange('Display settings', 'Keep the new display resolution?');
            if (!keep) {
                SystemConfig.set('displayResolution', prevRes);
                const selectEl = el.querySelector('.resolution-select');
                if (selectEl) {
                    selectEl.value = prevRes;
                    selectEl.dataset.applied = prevRes;
                }
                updateResLabel();
            }
        });

        el.querySelector('.scaling-select').addEventListener('change', async (e) => {
            const prevMode = Scaling.getMode();
            const newMode = e.target.value;
            if (newMode === prevMode) return;

            if (!(await requireAdmin('Change the display scaling for all users on this device?'))) {
                e.target.value = prevMode;
                return;
            }

            const label = el.querySelector('.current-scale-label');
            const updateScaleLabel = () => {
                if (label) label.textContent = `Current scale: ${Math.round(Scaling.getScale() * 100)}%`;
            };

            Scaling.setMode(newMode);
            updateScaleLabel();

            const keep = await confirmDisplayChange('Display settings', 'Keep the new display scaling?');
            if (!keep) {
                Scaling.setMode(prevMode);
                const selectEl = el.querySelector('.scaling-select');
                if (selectEl) selectEl.value = prevMode;
                updateScaleLabel();
            }
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
    // the tree snapshot; blob-backed files (media, and the read-only OS core
    // mirror) store their raw bytes in OPFS, and their verified `size` is
    // used.
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
        const diskCaption = `${formatBytes(totalLocal)} in the file index (OPFS is quota-based, no fixed ceiling)`;

        const home = Users.home();
        const categories = [
            { name: 'Documents', path: [...home, 'Documents'], color: '#FFC107' },
            { name: 'Downloads', path: [...home, 'Downloads'], color: '#00ACC1' },
            { name: 'Pictures', path: [...home, 'Pictures'], color: '#43A047' },
            { name: 'Music', path: [...home, 'Music'], color: '#AB47BC' },
            { name: 'Videos', path: [...home, 'Videos'], color: '#E53935' },
            { name: 'Desktop', path: [...home, 'Desktop'], color: '#7E57C2' },
            { name: 'Apps & data', path: [...home, 'AppData'], color: '#0078D4' },
            { name: 'Windows 12 (system)', path: ['Windows'], color: '#4FC3F7' },
            { name: 'System & reserved', path: ['/', 'system'], color: '#888' }
        ].map(cat => {
            let m = { local: 0, blob: 0, files: 0 };
            try { m = measureNode(FileSystem.getNode(cat.path)); } catch (e) { /* treat as empty */ }
            return { ...cat, ...m, bytes: m.local + m.blob };
        });

        const diskSub = 'Backend: OPFS • files and media stored as real files';

        el.innerHTML += `
            <div style="display:flex;flex-direction:column;gap:16px;">
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="font-size:14px;font-weight:500;margin-bottom:12px;">Virtual disk (OPFS)</div>
                    <div style="height:20px;background:rgba(255,255,255,0.06);border-radius:10px;overflow:hidden;margin-bottom:8px;">
                        <div class="storage-disk-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#0078D4,#00a8e8);border-radius:10px;"></div>
                    </div>
                    <div class="storage-disk-caption" style="font-size:13px;color:var(--text-secondary);">${diskCaption}</div>
                    <div class="storage-disk-line" style="font-size:12px;color:var(--text-secondary);margin-top:4px;">${diskSub}</div>
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
                const usage = info.usage == null ? 'unknown' : formatBytes(info.usage);
                const quota = info.quota == null ? 'unknown' : formatBytes(info.quota);
                const line = el.querySelector('.storage-disk-line');
                if (line) {
                    line.textContent = `Backend: OPFS • On-disk usage: ${usage} of ${quota}`;
                }
                const bar = el.querySelector('.storage-disk-bar');
                if (bar && info.usage != null && info.quota) {
                    bar.style.width = Math.min(100, (info.usage / info.quota) * 100).toFixed(1) + '%';
                }
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
        let kbdMode = config.touchKeyboardMode;
        if (kbdMode !== 'generic' && kbdMode !== 'simple') kbdMode = hasTouch ? 'simple' : 'generic';

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
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;${!enabled ? 'opacity:0.5;pointer-events:none;' : ''}">
                    <div style="font-size:14px;font-weight:500;margin-bottom:4px;">Keyboard mode</div>
                    <div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">Generic is the full keyboard; Simple is phone-style without Ctrl, Alt or Tab.</div>
                    <div style="display:flex;gap:12px;">
                        <div class="tk-mode-option" data-mode="generic" style="flex:1;padding:12px;border-radius:8px;cursor:pointer;text-align:center;background:${kbdMode === 'generic' ? 'var(--accent-color)' : 'rgba(255,255,255,0.04)'};border:1px solid ${kbdMode === 'generic' ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)'};">
                            <div style="font-size:15px;margin-bottom:2px;">⌨️</div>
                            <div style="font-size:13px;font-weight:500;">Generic</div>
                            <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">Esc · Ctrl · Alt · Tab</div>
                        </div>
                        <div class="tk-mode-option" data-mode="simple" style="flex:1;padding:12px;border-radius:8px;cursor:pointer;text-align:center;background:${kbdMode === 'simple' ? 'var(--accent-color)' : 'rgba(255,255,255,0.04)'};border:1px solid ${kbdMode === 'simple' ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)'};">
                            <div style="font-size:15px;margin-bottom:2px;">📱</div>
                            <div style="font-size:13px;font-weight:500;">Simple</div>
                            <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">Letters + symbols only</div>
                        </div>
                    </div>
                </div>
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="font-size:14px;font-weight:500;margin-bottom:4px;">Try it</div>
                    <div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">Focus this field${enabled && autoShow ? '' : ' (enable + auto-show first)'}:</div>
                    <input type="text" class="tk-demo-input" placeholder="Type here…" style="width:100%;box-sizing:border-box;background:rgba(0,0,0,0.3);border:1px solid var(--window-border);color:var(--text-primary);border-radius:6px;padding:10px 12px;font-size:14px;outline:none;">
                    <button class="tk-show-now" style="margin-top:12px;background:var(--accent-color);border:none;color:white;border-radius:6px;padding:8px 16px;cursor:pointer;font-size:13px;font-weight:500;">Show keyboard now</button>
                </div>
                <div style="font-size:12px;color:var(--text-secondary);">Tip: Shift toggles capitals for one letter — double-tap it for Caps Lock. In Generic mode, Ctrl and Alt work the same one-shot way (tap Ctrl, then C to copy). The keyboard is finger-only on touch screens — the virtual touchpad cursor can't press its keys. Drag the top bar to move it, pull its corner to resize (double-click the bar to re-dock). Letter keys also drive games with no text field — hold one to keep moving.</div>
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
        el.querySelectorAll('.tk-mode-option').forEach(opt => {
            opt.addEventListener('click', () => {
                SystemConfig.set('touchKeyboardMode', opt.dataset.mode);
                try { VirtualKeyboard.repaint(); } catch (err) {}
                renderPage();
            });
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

    function renderRecoverySettings(el) {
        el.innerHTML += `
            <div style="display:flex;flex-direction:column;gap:16px;">
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="font-size:14px;font-weight:500;margin-bottom:8px;">Config File</div>
                    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">Edit config.json in File Explorer > Documents to change settings directly.</p>
                    <button class="reset-btn" style="background:rgba(255,80,80,0.2);border:1px solid rgba(255,80,80,0.3);border-radius:6px;padding:8px 16px;color:#ff6666;cursor:pointer;font-size:14px;">Reset to Defaults</button>
                </div>

                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;border:1px solid rgba(255,80,80,0.3);">
                    <div style="font-size:14px;font-weight:500;margin-bottom:4px;color:#ff6666;">Factory Reset</div>
                    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">Removes all user accounts, files, apps, and settings. This cannot be undone.</p>
                    <button class="factory-reset-btn" style="background:rgba(255,60,60,0.25);border:1px solid rgba(255,80,80,0.5);border-radius:6px;padding:8px 16px;color:#ff6666;cursor:pointer;font-size:14px;font-weight:500;">Factory Reset</button>
                </div>
            </div>
        `;

        const resetBtn = el.querySelector('.reset-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                SystemConfig.reset();
            });
        }

        const factoryBtn = el.querySelector('.factory-reset-btn');
        if (factoryBtn) {
            factoryBtn.addEventListener('click', async () => {
                await handleFactoryReset();
            });
        }
    }

    async function handleFactoryReset() {
        // Confirm with UAC (admin required for system-wide destructive action)
        const approved = await UAC.request({
            name: 'Windows Settings',
            message: 'Factory reset will delete ALL user accounts, files, apps, and settings. This cannot be undone. Continue?'
        });
        if (!approved) return;

        // Final confirmation dialog
        const confirmed = await Popup.confirm(
            'Factory Reset',
            'This will PERMANENTLY DELETE everything:\n• All user accounts and passwords\n• All personal files (Documents, Pictures, etc.)\n• All installed apps and their data\n• All system settings\n\nThe system will restart in 10 seconds after reset.\n\nAre you absolutely sure?'
        );
        if (!confirmed) return;

        // Show countdown overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:10000;
            display:flex;flex-direction:column;align-items:center;justify-content:center;
            color:white;font-family:inherit;
        `;
        overlay.innerHTML = `
            <div style="font-size:28px;font-weight:600;margin-bottom:16px;">Factory Reset in Progress</div>
            <div style="font-size:18px;margin-bottom:24px;">Please do not close or refresh the page.</div>
            <div class="countdown" style="font-size:72px;font-weight:700;color:#ff6666;font-variant-numeric:tabular-nums;">10</div>
            <div style="margin-top:24px;font-size:14px;color:#aaa;">Resetting all data...</div>
        `;
        document.body.appendChild(overlay);

        let count = 10;
        const countdownEl = overlay.querySelector('.countdown');
        const tick = setInterval(() => {
            count--;
            if (countdownEl) countdownEl.textContent = count;
            if (count <= 0) clearInterval(tick);
        }, 1000);

        try {
            // Clear all data
            await performFactoryReset();

            // Wait for countdown to finish
            await new Promise(r => setTimeout(r, Math.max(0, count * 1000)));

            // Restart
            if (window._Shell) window._Shell.restart();
        } catch (e) {
            console.error('Factory reset failed:', e);
            clearInterval(tick);
            document.body.removeChild(overlay);
            Popup.error('Factory Reset Failed', 'An error occurred during factory reset. Please try again.');
        }
    }

    async function performFactoryReset() {
        // Reset FileSystem to default tree
        FileSystem.resetToDefault();

        // 2. Reset Users to single default admin
        await Users.factoryReset();

        // 3. Reset SystemConfig to defaults (full reset, not keeping username)
        SystemConfig.factoryReset();

        // 4. Clear all installed packages (store apps)
        try { Packages.clearAll(); } catch (e) { /* noop */ }

        // 5. Clear localStorage leftovers from the pre-OPFS era
        try { localStorage.clear(); } catch (e) { /* noop */ }

        // 6. Drop OPFS blob files too (the fresh tree has no references, but
        // the old bytes would otherwise survive the "factory reset").
        try {
            const OpfsClient = (await import('../../modules/opfsClient.js')).default;
            await OpfsClient.removeEntry('w12/blobs', true);
        } catch (e) { /* legacy backend or no blobs */ }

        // Force persist the reset state
        await FileSystem.flushAsync();
    }

    function renderSoundCustomization(el) {
        const config = SystemConfig.getAll();
        const styles = config.soundEventStyles || {};
        const files = config.soundEventFiles || {};
        const enabled = config.soundEnabled !== false;

        const styleChoices = [
            ['on', 'On'],
            ['off', 'Off']
        ];

        const rows = Sounds.events().map(event => {
            const current = styles[event.id] === 'off' ? 'off' : 'on';
            const customPath = Array.isArray(files[event.id]) ? files[event.id] : null;
            const customName = customPath ? customPath[customPath.length - 1] : '';
            const exists = customPath ? FileSystem.itemExists(customPath) : false;
            const detail = customPath
                ? (exists ? `Custom: ${customName}` : `Missing file: ${customName}`)
                : 'Built-in preset';
            const detailColor = customPath && !exists ? '#ff8a80' : 'var(--text-secondary)';
            const options = styleChoices.map(([value, label]) =>
                `<option value="${value}" ${value === current ? 'selected' : ''}>${label}</option>`
            ).join('');
            return `
                <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--window-border);">
                    <div style="flex:1 1 150px;min-width:0;">
                        <div style="font-size:13px;">${esc(event.label)}</div>
                        <div style="font-size:11px;color:${detailColor};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(customPath ? customPath.join('/') : detail)}">${esc(detail)}</div>
                    </div>
                    <select class="sound-event-select" data-event="${event.id}" style="font-size:12px;padding:5px 8px;min-width:110px;">${options}</select>
                    <button class="sound-file-btn" data-event="${event.id}" style="background:var(--hover-bg);border:1px solid var(--window-border);border-radius:5px;padding:5px 10px;color:var(--text-primary);font-size:12px;cursor:pointer;">Choose / Upload...</button>
                    <button class="sound-test-btn" data-event="${event.id}" style="background:var(--hover-bg);border:1px solid var(--window-border);border-radius:5px;padding:5px 12px;color:var(--text-primary);font-size:12px;cursor:pointer;">Test</button>
                    ${customPath ? `<button class="sound-clear-btn" data-event="${event.id}" style="background:none;border:none;padding:5px 2px;color:var(--text-secondary);font-size:12px;cursor:pointer;">Clear</button>` : ''}
                </div>`;
        }).join('');

        el.innerHTML += `
            <div style="display:flex;flex-direction:column;gap:16px;">
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <label style="display:flex;justify-content:space-between;align-items:center;gap:16px;cursor:pointer;">
                        <span>
                            <span style="display:block;font-size:14px;font-weight:500;">System sounds</span>
                            <span style="display:block;font-size:12px;color:var(--text-secondary);margin-top:2px;">Play sounds for system events</span>
                        </span>
                        <input type="checkbox" class="sound-enabled-toggle" ${enabled ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--accent-color);cursor:pointer;">
                    </label>
                </div>
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;">
                    <div style="font-size:14px;font-weight:500;">Sound events</div>
                    <div style="font-size:12px;color:var(--text-secondary);margin:2px 0 4px;">Use the built-in sound, or pick your own audio file. Your setup is saved automatically.</div>
                    ${rows}
                    <div style="font-size:11px;color:var(--text-secondary);margin-top:10px;">Custom sounds play from the filesystem. Uploads are saved to Music/System Sounds.</div>
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:12px;color:var(--text-secondary);">
                    <span>Master volume is controlled separately.</span>
                    <button class="sound-open-system" style="background:var(--hover-bg);border:1px solid var(--window-border);border-radius:5px;padding:6px 12px;color:var(--text-primary);font-size:12px;cursor:pointer;">Open volume settings</button>
                </div>
            </div>
        `;

        const enabledToggle = el.querySelector('.sound-enabled-toggle');
        enabledToggle.addEventListener('change', () => {
            SystemConfig.set('soundEnabled', enabledToggle.checked);
            if (enabledToggle.checked) Sounds.play('notification', true);
        });

        el.querySelectorAll('.sound-event-select').forEach(select => {
            select.addEventListener('change', () => {
                const next = { ...(SystemConfig.get('soundEventStyles') || {}) };
                next[select.dataset.event] = select.value;
                SystemConfig.set('soundEventStyles', next);
                if (select.value !== 'off') Sounds.play(select.dataset.event, true);
            });
        });

        el.querySelectorAll('.sound-file-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const eventId = btn.dataset.event;
                const event = Sounds.events().find(item => item.id === eventId);
                const path = await FilePicker.open({
                    appId: 'settings',
                    title: `Select sound${event ? ' — ' + event.label : ''}`,
                    extensions: SOUND_FILE_EXTS,
                    startPath: Users.home(['Music']),
                    allowUpload: true,
                    uploadPath: Users.home(['Music', 'System Sounds']),
                    confirmLabel: 'Use sound'
                });
                if (!path) return;

                const nextFiles = { ...(SystemConfig.get('soundEventFiles') || {}) };
                nextFiles[eventId] = path.slice();
                SystemConfig.set('soundEventFiles', nextFiles);

                const nextStyles = { ...(SystemConfig.get('soundEventStyles') || {}) };
                if (!nextStyles[eventId] || nextStyles[eventId] === 'off') {
                    nextStyles[eventId] = 'on';
                    SystemConfig.set('soundEventStyles', nextStyles);
                }
                refreshPersonalization();
                Sounds.play(eventId, true);
            });
        });

        el.querySelectorAll('.sound-clear-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const next = { ...(SystemConfig.get('soundEventFiles') || {}) };
                next[btn.dataset.event] = null;
                SystemConfig.set('soundEventFiles', next);
                refreshPersonalization();
            });
        });

        el.querySelectorAll('.sound-test-btn').forEach(btn => {
            btn.addEventListener('click', () => Sounds.play(btn.dataset.event, true));
        });

        el.querySelector('.sound-open-system').addEventListener('click', () => {
            currentPage = 'system';
            currentSubPage = 'sound';
            renderPage();
        });
    }

    function renderPersonalization(el) {
        el.innerHTML = `
            <h2 style="font-size:28px;font-weight:600;margin-bottom:24px;">Personalization</h2>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                ${systemCard(UIIcons.setting('moon', 22), 'Theme', 'Dark and light mode', 'theme')}
                ${systemCard(UIIcons.setting('palette', 22), 'Accent color', 'Highlight color for the shell', 'accent')}
                ${systemCard(UIIcons.setting('background', 22), 'Background', 'Wallpaper styles and custom images', 'background')}
                ${systemCard(UIIcons.setting('sound', 22), 'Sounds', 'Event sounds and custom files', 'sounds')}
                ${systemCard(UIIcons.setting('cursor', 22), 'Mouse cursor', 'Pointer theme, size, and style', 'cursor')}
                ${systemCard(UIIcons.setting('taskbarSettings', 22), 'Taskbar', 'Opacity, position, and grouping', 'taskbar')}
            </div>
        `;

        wireSubPageCards(el);
    }

    function renderPersonalizationSubPage(el, subPage) {
        const sub = personalizationSubPages[subPage];
        el.innerHTML = subPageHeader(sub.name);

        switch (subPage) {
            case 'theme': renderThemeSettings(el); break;
            case 'accent': renderAccentSettings(el); break;
            case 'background': renderBackgroundSettings(el); break;
            case 'sounds': renderSoundCustomization(el); break;
            case 'cursor': renderCursorSettings(el); break;
            case 'taskbar': renderTaskbarSettings(el); break;
        }
    }

    function renderThemeSettings(el) {
        const config = SystemConfig.getAll();
        el.innerHTML += `
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
            <div style="font-size:12px;color:var(--text-secondary);margin-top:12px;">Applies to windows, the taskbar, the Start menu, and apps that follow the system theme.</div>
        `;

        el.querySelectorAll('.theme-option').forEach(opt => {
            opt.addEventListener('click', () => {
                const isDark = opt.dataset.theme === 'dark';
                SystemConfig.set('darkMode', isDark);
                refreshPersonalization();
            });
        });
    }

    function renderAccentSettings(el) {
        el.innerHTML += `
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
        `;

        el.querySelectorAll('.accent-option').forEach(opt => {
            opt.addEventListener('click', () => {
                SystemConfig.set('accentColor', opt.dataset.color);
                refreshPersonalization();
            });
        });
    }

    function renderBackgroundSettings(el) {
        el.innerHTML += `
            <div class="settings-section" style="margin-bottom:24px;">
                <h3 style="font-size:16px;font-weight:500;margin-bottom:12px;">Background style</h3>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    ${bgOption('gradient', 'Default', 'linear-gradient(135deg, #0a1628, #2d1b4e)')}
                    ${bgOption('blue', 'Ocean', 'linear-gradient(135deg, #001a33, #003366)')}
                    ${bgOption('purple', 'Purple', 'linear-gradient(135deg, #1a0033, #4a0080)')}
                    ${bgOption('green', 'Forest', 'linear-gradient(135deg, #001a00, #004d00)')}
                    ${bgOption('sunset', 'Sunset', 'linear-gradient(135deg, #1a0a00, #cc6600)')}
                    ${bgOption('solid', 'Solid', '#1a1a2e')}
                </div>
            </div>
            <div class="settings-section">
                <h3 style="font-size:16px;font-weight:500;margin-bottom:12px;">Custom image</h3>
                ${customBgSection()}
            </div>
        `;

        setupBackgroundEvents(el);
    }

    function renderCursorSettings(el) {
        const config = SystemConfig.getAll();
        el.innerHTML += `
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
        `;

        setupCursorEvents(el);
    }

    function renderTaskbarSettings(el) {
        const config = SystemConfig.getAll();
        el.innerHTML += `
            <div class="settings-section" style="margin-bottom:24px;">
                <h3 style="font-size:16px;font-weight:500;margin-bottom:12px;">Opacity</h3>
                <div style="display:flex;align-items:center;gap:12px;">
                    <input type="range" class="taskbar-opacity-slider" min="30" max="100" value="${config.taskbarOpacity}" style="flex:1;accent-color:var(--accent-color);">
                    <span class="opacity-value" style="min-width:40px;text-align:right;font-size:14px;">${config.taskbarOpacity}%</span>
                </div>
            </div>
            <div class="settings-section" style="margin-bottom:24px;">
                <h3 style="font-size:16px;font-weight:500;margin-bottom:12px;">Position</h3>
                <div style="display:flex;gap:8px;">
                    ${TASKBAR_POSITIONS.map(p => taskbarPositionOption(p, config.taskbarPosition)).join('')}
                </div>
            </div>
            <div class="settings-section">
                <h3 style="font-size:16px;font-weight:500;margin-bottom:12px;">Grouping</h3>
                <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">Choose how taskbar buttons are grouped when multiple windows of the same app are open.</p>
                <div style="display:flex;flex-direction:column;gap:8px;">
                    ${GROUPING_MODES.map(g => groupingOption(g, config.taskbarGrouping)).join('')}
                </div>
            </div>
        `;

        setupTaskbarEvents(el);
    }

    function renderApps(el) {
        const installed = AppSystem.getInstalledApps();
        const allMeta = AppMetadata.getAll();
        const catalogIds = new Set(AppLoader.getStoreApps().map(m => m.id));

        el.innerHTML = `
            <h2 style="font-size:28px;font-weight:600;margin-bottom:24px;">Apps</h2>
            <div style="display:flex;flex-direction:column;gap:8px;">
                ${Object.entries(allMeta).map(([id, meta]) => {
                    const man = AppLoader.getManifest(id);
                    if (!man) return '';
                    const svc = AppLoader.isService(id);
                    if (man.distribution === 'builtin') return appRow(meta.name, svc ? 'Built-in service' : 'Built-in', false);
                    if (installed.includes(id)) {
                        const scopeLabel = Packages.scopeOf(id) === 'system' ? 'All users' : 'This user';
                        const sourceLabel = catalogIds.has(id) ? 'Installed from Store' : 'Installed package';
                        const row = appRow(meta.name, svc ? `Service • ${sourceLabel} (${scopeLabel})` : `${sourceLabel} • ${scopeLabel}`, true, id);
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
            btn.addEventListener('click', async () => {
                const appId = btn.dataset.app;
                try {
                    await AppSystem.uninstallApp(appId);
                } catch (err) {
                    if (err && err.elevationDenied) {
                        Popup.info('Administrator approval required', 'Removing an app that is installed for all users needs administrator approval.');
                    } else {
                        Popup.error('Uninstall failed', (err && err.message) || 'The app could not be uninstalled.');
                    }
                }
                renderApps(el);
            });
        });
    }

    function renderAccounts(el) {
        const me = Users.getCurrent() || { id: '', name: 'User', type: 'standard', hash: null };
        const others = Users.getAccounts().filter(a => a.id !== me.id);

        const btn = 'padding:6px 12px;background:var(--hover-bg);border:1px solid var(--window-border);border-radius:6px;color:var(--text-primary);font-size:12px;cursor:pointer;';
        const dangerBtn = 'padding:6px 12px;background:rgba(220,50,50,0.15);border:1px solid rgba(220,50,50,0.4);border-radius:6px;color:#ff8a8a;font-size:12px;cursor:pointer;';

        const userRow = (acc, isMe) => {
            const admin = acc.type === 'administrator';
            return `
            <div data-user-row="${acc.id}" style="display:flex;align-items:center;gap:12px;padding:12px 0;border-top:1px solid var(--window-border);flex-wrap:wrap;">
                <div style="width:40px;height:40px;background:${admin ? 'var(--accent-color,#0078D4)' : '#5a5a66'};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:600;flex-shrink:0;">${esc(acc.name.charAt(0).toUpperCase())}</div>
                <div style="flex:1;min-width:140px;">
                    <div style="font-size:14px;font-weight:500;">${esc(acc.name)}${isMe ? ' <span style="font-size:11px;color:#888;font-weight:400;">(signed in)</span>' : ''}</div>
                    <div style="font-size:12px;color:#888;">${esc(accountTypeLabel(acc))}${acc.hash ? ' • Password protected' : ' • No password'}</div>
                </div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    <button class="acc-btn" data-action="type" data-user="${acc.id}" style="${btn}">${admin ? 'Make standard' : 'Make administrator'}</button>
                    <button class="acc-btn" data-action="rename" data-user="${acc.id}" style="${btn}">Rename</button>
                    ${isMe ? `
                        <button class="acc-btn" data-action="password" data-user="${acc.id}" style="${btn}">${acc.hash ? 'Change password' : 'Set password'}</button>
                        ${acc.hash ? `<button class="acc-btn" data-action="removepassword" data-user="${acc.id}" style="${btn}">Remove password</button>` : ''}
                        <button class="acc-btn" data-action="signout" style="${btn}">Sign out</button>
                    ` : `
                        <button class="acc-btn" data-action="password" data-user="${acc.id}" style="${btn}">Reset password</button>
                        <button class="acc-btn acc-btn-danger" data-action="remove" data-user="${acc.id}" style="${dangerBtn}">Remove</button>
                    `}
                </div>
            </div>`;
        };

        el.innerHTML = `
            <h2 style="font-size:28px;font-weight:600;margin-bottom:24px;">Accounts</h2>
            <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:20px;display:flex;align-items:center;gap:16px;margin-bottom:16px;">
                <div style="width:64px;height:64px;background:${me.type === 'administrator' ? 'var(--accent-color,#0078D4)' : '#5a5a66'};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:600;">${esc(me.name.charAt(0).toUpperCase())}</div>
                <div>
                    <div style="font-size:18px;font-weight:500;">${esc(me.name)}</div>
                    <div style="font-size:13px;color:#888;">${esc(accountTypeLabel(me))}${me.hash ? ' • Password protected' : ''}</div>
                </div>
            </div>
            <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:20px;margin-bottom:16px;">
                <div style="font-size:14px;font-weight:500;margin-bottom:8px;">Your account</div>
                ${userRow(me, true)}
            </div>
            <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:20px;margin-bottom:16px;">
                <div style="font-size:14px;font-weight:500;margin-bottom:8px;">Other users</div>
                ${others.length ? others.map(a => userRow(a, false)).join('') : '<div style="font-size:13px;color:#888;padding:12px 0;">No other accounts on this device.</div>'}
                <div style="padding-top:12px;">
                    <button id="acc-add-btn" style="padding:8px 16px;background:var(--accent-color,#0078D4);border:none;border-radius:6px;color:white;font-size:13px;cursor:pointer;">+ Add account</button>
                </div>
                <div style="font-size:12px;color:#888;margin-top:12px;">Adding, removing and changing account types requires administrator approval (UAC).</div>
            </div>
        `;

        wireAccountActions(el, () => renderAccounts(el));
    }

    function esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function wireAccountActions(el, rerender) {
        el.querySelectorAll('.acc-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const action = btn.dataset.action;
                const id = btn.dataset.user;
                const me = Users.getCurrent();
                const isSelf = !!(me && me.id === id);

                if (action === 'rename') {
                    const acc = Users.getAccount(id);
                    const name = await Popup.textbox('Rename account', 'Enter the new display name:', { value: acc ? acc.name : '' });
                    if (name && name.trim()) {
                        Users.renameAccount(id, name);
                        try { window.dispatchEvent(new CustomEvent('user-info-changed')); } catch { /* noop */ }
                        rerender();
                    }
                } else if (action === 'type') {
                    const acc = Users.getAccount(id);
                    if (!acc) return;
                    const toAdmin = acc.type !== 'administrator';
                    if (!(await requireAdmin(`Change the account type of "${acc.name}" to ${toAdmin ? 'Administrator' : 'Standard user'}?`))) return;
                    if (!Users.setAccountType(id, toAdmin ? 'administrator' : 'standard')) {
                        Popup.error('Cannot change account type', 'The last administrator cannot be changed to a standard user.');
                    }
                    try { window.dispatchEvent(new CustomEvent('user-info-changed')); } catch { /* noop */ }
                    rerender();
                } else if (action === 'password') {
                    const acc = Users.getAccount(id);
                    // Resetting someone else's password is an administrator action.
                    if (!isSelf && !(await requireAdmin(`Reset the password for "${acc ? acc.name : id}"?`))) return;
                    const res = await Popup.forum(isSelf ? 'Set password' : 'Reset password', [
                        { key: 'password', label: 'New password', type: 'password' },
                        { key: 'confirm', label: 'Confirm password', type: 'password' }
                    ]);
                    if (res) {
                        if (res.password && res.password === res.confirm) {
                            await Users.setPassword(id, res.password);
                            Popup.info('Password set', 'The account is now password protected.');
                            rerender();
                        } else {
                            Popup.error('Passwords do not match', 'Both fields must contain the same password.');
                        }
                    }
                } else if (action === 'removepassword') {
                    const ok = await Popup.confirm('Remove password', 'Anyone will be able to sign in to this account without a password. Continue?');
                    if (ok) {
                        await Users.setPassword(id, null);
                        rerender();
                    }
                } else if (action === 'signout') {
                    if (window._Shell) window._Shell.logout();
                } else if (action === 'remove') {
                    const acc = Users.getAccount(id);
                    if (!(await requireAdmin(`Remove the account "${acc ? acc.name : id}"? Their files stay on disk.`))) return;
                    const ok = await Popup.confirm('Remove account', `Remove "${acc ? acc.name : id}"? Their files in /users/${id} will remain on disk but the account will be gone.`);
                    if (ok) {
                        if (!Users.deleteAccount(id)) {
                            Popup.error('Cannot remove account', 'The signed-in account cannot be removed, the last administrator cannot be removed, and at least one account must remain.');
                        }
                        rerender();
                    }
                }
            });
        });

        const addBtn = el.querySelector('#acc-add-btn');
        if (addBtn) {
            addBtn.addEventListener('click', async () => {
                const res = await Popup.forum('Add account', [
                    { key: 'name', label: 'User name', placeholder: 'e.g. Alice' },
                    { key: 'password', label: 'Password (optional)', type: 'password' },
                    { key: 'type', label: 'Account type', type: 'select', value: 'standard', options: [
                        { value: 'standard', label: 'Standard user' },
                        { value: 'administrator', label: 'Administrator' }
                    ] }
                ]);
                if (!res || !res.name || !res.name.trim()) return;
                const type = res.type === 'administrator' ? 'administrator' : 'standard';
                if (!(await requireAdmin(`Add a new ${type === 'administrator' ? 'administrator' : 'standard user'} account named "${res.name.trim()}"?`))) return;
                const created = await Users.createAccount(res.name, res.password || null, type);
                if (!created) {
                    Popup.error('Could not create account', 'The user name cannot be empty.');
                }
                rerender();
            });
        }
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

    function updateStatusArt(state) {
        // The big status picture in the corner of the card.
        if (state.status === 'checking') {
            return `<svg width="52" height="52" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9.5" stroke="#0078D4" stroke-width="2" opacity="0.25"/>
                <path d="M12 2.5a9.5 9.5 0 0 1 9.5 9.5" stroke="#0078D4" stroke-width="2" stroke-linecap="round">
                    <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1.1s" repeatCount="indefinite"/>
                </path>
            </svg>`;
        }
        if (state.status === 'downloading' || state.status === 'applying') {
            return `<svg width="52" height="52" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9.5" stroke="#0078D4" stroke-width="2" opacity="0.25"/>
                <path d="M12 2.5a9.5 9.5 0 0 1 9.5 9.5" stroke="#0078D4" stroke-width="2" stroke-linecap="round">
                    <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1.1s" repeatCount="indefinite"/>
                </path>
            </svg>`;
        }
        if (state.status === 'ready') {
            return `<svg width="52" height="52" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" fill="#c47f00"/>
                <path d="M12 6.5v6.2" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>
                <circle cx="12" cy="16.4" r="1.3" fill="#fff"/>
            </svg>`;
        }
        if (state.status === 'error') {
            return `<svg width="52" height="52" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" fill="#c47f00"/>
                <path d="M12 6.5v6.2" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>
                <circle cx="12" cy="16.4" r="1.3" fill="#fff"/>
            </svg>`;
        }
        if (WindowsUpdate.isUpdateAvailable()) {
            return `<svg width="52" height="52" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" fill="#c47f00"/>
                <path d="M12 5.5v7.2l4.4 2.6" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>`;
        }
        return `<svg width="52" height="52" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" fill="#0f7b0f"/>
            <path d="M8 12.4l2.7 2.7L16 9.6" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
    }

    function updateTimeAgo(ts) {
        if (!ts) return 'never';
        const diff = Date.now() - ts;
        if (diff < 60000) return 'just now';
        if (diff < 3600000) return Math.floor(diff / 60000) + ' min ago';
        if (diff < 86400000) return Math.floor(diff / 3600000) + ' h ago';
        return new Date(ts).toLocaleDateString();
    }

    function renderUpdate(el) {
        const state = UpdateService.getState();
        const working = state.status === 'checking' || state.status === 'downloading' || state.status === 'applying';
        const ready = state.status === 'ready';
        const hasUpdate = WindowsUpdate.isUpdateAvailable();
        const currentVersion = WindowsUpdate.getCurrentVersion();
        const autoCheck = UpdateService.autoCheckEnabled();
        const percent = Math.round((state.progress || 0) * 100);

        const headline = ready ? 'Restart required'
            : state.status === 'checking' ? 'Checking for updates'
            : state.status === 'downloading' ? 'Downloading updates'
            : state.status === 'applying' ? 'Working on updates'
            : state.status === 'error' ? 'We couldn\'t check for updates'
            : hasUpdate ? 'Update available'
            : 'You\'re up to date';

        const sub = ready ? (state.message || 'The updates are on disk. Restart to finish installing them.')
            : working ? (state.message || 'Please wait…')
            : state.status === 'error' ? (state.message || 'Check your connection and try again.')
            : state.osPending ? (state.osVersion
                ? `Version ${state.osVersion} is ready to install`
                : 'A new version of Windows 12 is ready to install')
            : hasUpdate ? (state.osVersion
                ? `Version ${state.osVersion} is available`
                : `${state.apps.length} app update${state.apps.length === 1 ? '' : 's'} available`)
            : `You're up to date. Last checked ${updateTimeAgo(state.lastCheck)}.`;

        const updateRows = [];
        if (state.osPending || state.osVersion) {
            updateRows.push(`<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:13px 0;border-top:1px solid var(--window-border);">
                <div style="display:flex;align-items:center;gap:12px;min-width:0;">
                    <span style="width:26px;height:26px;display:inline-flex;flex-shrink:0;">${UIIcons.setting('update', 22)}</span>
                    <span style="font-size:13px;">Operating system update</span>
                </div>
                <span style="font-size:12px;color:var(--accent-color);white-space:nowrap;">${state.osVersion ? (state.osCurrent ? state.osCurrent + ' → ' : '') + state.osVersion : 'new version'}</span>
            </div>`);
        }
        for (const app of state.apps) {
            updateRows.push(`<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:13px 0;border-top:1px solid var(--window-border);">
                <div style="display:flex;align-items:center;gap:12px;min-width:0;">
                    <span style="width:26px;height:26px;display:inline-flex;flex-shrink:0;">${UIIcons.action('arrowUp', 22)}</span>
                    <span style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${app.name}</span>
                </div>
                <span style="font-size:12px;color:var(--accent-color);white-space:nowrap;">${app.installedVersion} → ${app.version}</span>
            </div>`);
        }

        el.innerHTML = `
            <h2 style="font-size:28px;font-weight:600;margin-bottom:22px;">Windows Update</h2>

            <!-- The status card -->
            <div style="background:var(--window-header);border:1px solid var(--window-border);border-radius:10px;padding:22px 24px;display:flex;align-items:flex-start;gap:20px;">
                <div style="width:52px;height:52px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${updateStatusArt(state)}</div>
                <div style="flex:1;min-width:0;">
                    <div style="font-size:19px;font-weight:600;margin-bottom:4px;">${headline}</div>
                    <div style="font-size:13px;color:#888;line-height:1.5;">${sub}</div>

                    <div style="margin-top:18px;">
                        <button class="settings-update-check" style="min-width:200px;padding:10px 22px;background:#0078D4;border:none;border-radius:6px;color:#fff;cursor:pointer;font-size:13px;font-weight:600;" ${working ? 'disabled' : ''}>
                            ${working ? 'Working…' : 'Check for updates'}
                        </button>
                        ${working ? `
                            <div style="margin-top:16px;max-width:420px;">
                                <div style="height:4px;border-radius:2px;background:rgba(255,255,255,0.15);overflow:hidden;">
                                    <div style="height:100%;width:${percent}%;background:var(--accent-color);transition:width 0.35s ease-out;"></div>
                                </div>
                                <div style="display:flex;justify-content:space-between;font-size:12px;color:#888;margin-top:8px;">
                                    <span>${state.message || ''}</span><span>${percent}%</span>
                                </div>
                            </div>
                        ` : ''}
                    </div>

                    ${ready ? `
                        <div style="display:flex;gap:10px;margin-top:18px;">
                            <button class="settings-update-refresh" style="padding:10px 22px;background:#0078D4;border:none;border-radius:6px;color:#fff;cursor:pointer;font-size:13px;font-weight:600;">Restart now</button>
                            <button class="settings-update-later" style="padding:10px 22px;background:transparent;border:1px solid var(--window-border);border-radius:6px;color:var(--text-primary);cursor:pointer;font-size:13px;">Restart later</button>
                        </div>
                    ` : ''}
                </div>
            </div>

            ${updateRows.length ? `
                <div style="margin-top:16px;background:var(--window-header);border:1px solid var(--window-border);border-radius:10px;padding:18px 24px;">
                    <div style="font-size:14px;font-weight:600;margin-bottom:6px;">Available updates</div>
                    <div style="font-size:12px;color:#888;">These updates are downloaded and are installed when you restart.</div>
                    ${updateRows.join('')}
                </div>
            ` : ''}

            <!-- More options -->
            <div style="margin-top:16px;background:var(--window-header);border:1px solid var(--window-border);border-radius:10px;padding:6px 24px;">
                <div class="settings-update-history-link" style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 0;cursor:pointer;border-bottom:1px solid var(--window-border);">
                    <span style="font-size:13px;">Update history</span>
                    <span style="font-size:16px;color:#888;">&#8250;</span>
                </div>
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:16px 0;">
                    <div style="min-width:0;">
                        <div style="font-size:13px;">Get the latest updates as soon as they're available</div>
                        <div style="font-size:12px;color:#888;margin-top:3px;">Windows Update checks for new versions in the background.</div>
                    </div>
                    <input type="checkbox" class="settings-update-auto" ${autoCheck ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--accent-color);cursor:pointer;flex-shrink:0;margin-top:2px;">
                </div>
            </div>

            <div style="margin-top:16px;font-size:12px;color:#888;">
                Last checked: ${state.lastCheck ? new Date(state.lastCheck).toLocaleString() : 'never'}${currentVersion ? ' · Version ' + currentVersion : ''}
            </div>
        `;

        const checkBtn = el.querySelector('.settings-update-check');
        if (checkBtn) {
            checkBtn.addEventListener('click', async () => {
                checkBtn.disabled = true;
                checkBtn.textContent = 'Checking…';
                await UpdateService.check({ manual: true });
                renderUpdate(el);
            });
        }

        const refresh = el.querySelector('.settings-update-refresh');
        if (refresh) {
            refresh.addEventListener('click', () => UpdateService.restartNow());
        }

        const later = el.querySelector('.settings-update-later');
        if (later) {
            later.addEventListener('click', () => renderUpdate(el));
        }

        const historyLink = el.querySelector('.settings-update-history-link');
        if (historyLink) {
            historyLink.addEventListener('click', () => {
                currentSubPage = 'history';
                renderPage();
            });
        }

        const auto = el.querySelector('.settings-update-auto');
        if (auto) {
            auto.addEventListener('change', () => {
                UpdateService.setAutoCheck(!!auto.checked);
            });
        }
    }

    // The sub-page of Windows Update: everything that was installed.
    function renderUpdateSubPage(el, subPage) {
        if (subPage !== 'history') { renderUpdate(el); return; }
        const entries = WindowsUpdate.history();

        const rows = entries.length
            ? entries.map(e => `
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:14px 0;border-top:1px solid var(--window-border);">
                    <div style="min-width:0;">
                        <div style="font-size:13px;font-weight:500;">${e.title}</div>
                        <div style="font-size:12px;color:#888;margin-top:3px;">${new Date(e.date).toLocaleString()}${e.details ? ' · ' + e.details : ''}</div>
                    </div>
                    <span style="font-size:11px;padding:3px 10px;border-radius:10px;white-space:nowrap;${e.status === 'failed'
                        ? 'background:rgba(200,60,60,0.2);color:#ff8a8a;'
                        : 'background:rgba(15,123,15,0.2);color:#7fd07f;'}">${e.status === 'failed' ? 'failed' : 'installed'}</span>
                </div>`).join('')
            : '<div style="padding:24px 0;font-size:13px;color:#888;">No updates have been installed yet.</div>';

        el.innerHTML = `
            ${subPageHeader('Update history')}
            <div style="background:var(--window-header);border:1px solid var(--window-border);border-radius:10px;padding:6px 24px;">
                ${rows}
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
                        <span style="font-weight:500;">${((Users.getCurrent()||{}).name || 'User')}-PC</span>
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
        const active = SystemConfig.get('backgroundStyle') === id && !SystemConfig.get('wallpaperImage');
        return `<div class="bg-option" data-style="${id}" style="width:80px;height:50px;border-radius:6px;background:${preview};cursor:pointer;outline:${active ? '2px solid white' : 'none'};outline-offset:2px;display:flex;align-items:flex-end;padding:4px;transition:outline 0.15s;">
            <span style="font-size:10px;color:white;text-shadow:0 1px 2px rgba(0,0,0,0.8);">${name}</span>
        </div>`;
    }

    const CUSTOM_BG_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'];

    function customBgSection() {
        const imgPath = SystemConfig.get('wallpaperImage');
        const imgName = Array.isArray(imgPath) && imgPath.length ? imgPath[imgPath.length - 1] : '';
        const fit = SystemConfig.get('wallpaperFit') || 'fill';
        const fitLabel = { fill: 'Fill', fit: 'Fit', stretch: 'Stretch', tile: 'Tile', center: 'Center' };
        const fitOpts = Object.entries(fitLabel).map(([v, l]) =>
            `<option value="${v}"${v === fit ? ' selected' : ''}>${l}</option>`).join('');
        return `
            <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;">
                <div class="custom-bg-preview" style="width:160px;height:100px;border-radius:8px;background-color:rgba(255,255,255,0.04);background-position:center;background-size:cover;background-repeat:no-repeat;border:1px solid ${imgPath ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)'};display:flex;align-items:flex-end;padding:4px;flex:none;">
                    <span style="font-size:10px;color:white;text-shadow:0 1px 2px rgba(0,0,0,0.8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${imgPath ? imgName : 'None'}</span>
                </div>
                <div style="flex:1;min-width:200px;display:flex;flex-direction:column;gap:8px;">
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <button class="custom-bg-choose" style="background:var(--accent-color);color:#fff;border:none;border-radius:6px;padding:8px 14px;cursor:pointer;font-size:13px;">Choose from my files…</button>
                        <button class="custom-bg-upload" style="background:rgba(255,255,255,0.06);color:var(--text-primary,#fff);border:1px solid rgba(255,255,255,0.12);border-radius:6px;padding:8px 14px;cursor:pointer;font-size:13px;">Upload image…</button>
                        ${imgPath ? '<button class="custom-bg-remove" style="background:transparent;color:#ff9b9b;border:1px solid rgba(255,100,100,0.4);border-radius:6px;padding:8px 14px;cursor:pointer;font-size:13px;">Remove</button>' : ''}
                    </div>
                    <label style="font-size:13px;display:flex;align-items:center;gap:8px;">Picture position
                        <select class="custom-bg-fit" style="background:rgba(255,255,255,0.06);color:inherit;border:1px solid rgba(255,255,255,0.12);border-radius:6px;padding:6px 8px;font-size:13px;">${fitOpts}</select>
                    </label>
                    <div style="font-size:12px;color:var(--text-secondary);">Shows on desktops set to “Follow system” (System → Multitasking).</div>
                </div>
            </div>`;
    }

    // All virtual-FS images a user could reasonably pick as wallpaper.
    function collectWallpaperImages() {
        const found = [];
        const seen = new Set();
        const roots = [];
        try { roots.push({ base: Users.home(['Pictures']), label: 'Pictures' }); } catch { /* noop */ }
        try { roots.push({ base: Users.home(['Desktop']), label: 'Desktop' }); } catch { /* noop */ }
        const walk = (dir, prefix) => {
            let kids = [];
            try { kids = FileSystem.getChildren(dir) || []; } catch { return; }
            for (const k of kids) {
                if (k.type === 'folder') { walk([...dir, k.name], `${prefix}${k.name}/`); continue; }
                const ext = String(k.ext || '').toLowerCase();
                if (!CUSTOM_BG_EXTS.includes(ext)) continue;
                const full = [...dir, k.name];
                const key = full.join('/');
                if (seen.has(key)) continue;
                seen.add(key);
                found.push({ label: `${prefix}${k.name}`, path: full });
            }
        };
        for (const r of roots) {
            try {
                if (FileSystem.itemExists(r.base)) walk(r.base, `${r.label}/`);
            } catch { /* noop */ }
        }
        return found.sort((a, b) => a.label.localeCompare(b.label));
    }

    function refreshPersonalization() {
        try {
            const content = win.element.querySelector('.settings-content');
            if (!content) return;
            if (currentPage === 'personalization' && currentSubPage && Object.hasOwn(personalizationSubPages, currentSubPage)) {
                renderPersonalizationSubPage(content, currentSubPage);
            } else {
                renderPersonalization(content);
            }
        } catch { /* noop */ }
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

    const GROUPING_MODES = [
        { id: 'always', name: 'Always', desc: 'Combine taskbar buttons (one button per app)' },
        { id: 'whenFull', name: 'When taskbar is full', desc: 'Group only when space runs out' },
        { id: 'never', name: 'Never', desc: 'Show each window as a separate button' }
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

    function groupingOption(g, activeId) {
        const active = (activeId || 'always') === g.id;
        return `<div class="grouping-option" data-grouping="${g.id}" style="flex:1;background:rgba(255,255,255,0.04);border:1px solid ${active ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)'};border-radius:8px;padding:12px 16px;cursor:pointer;transition:border-color 0.15s;display:flex;align-items:center;gap:12px;">
            <div style="flex:1;text-align:left;">
                <div style="font-size:14px;font-weight:${active ? '600' : '400'};">${g.name}</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">${g.desc}</div>
            </div>
            ${active ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
        </div>`;
    }

    function setupBackgroundEvents(el) {
        el.querySelectorAll('.bg-option').forEach(opt => {
            opt.addEventListener('click', () => {
                SystemConfig.setMultiple({ backgroundStyle: opt.dataset.style, wallpaperImage: null });
                refreshPersonalization();
            });
        });

        // Custom-image preview (async: rebuild the URL from the stored file).
        const preview = el.querySelector('.custom-bg-preview');
        if (preview) {
            SystemConfig.wallpaperImageURL().then(url => {
                if (!preview.isConnected || !url) return;
                preview.style.backgroundImage = `url("${String(url).replace(/"/g, '%22')}")`;
            }).catch(() => { /* preview stays empty */ });
        }

        const chooseBtn = el.querySelector('.custom-bg-choose');
        if (chooseBtn) {
            chooseBtn.addEventListener('click', () => {
                const images = collectWallpaperImages();
                if (!images.length) {
                    Popup.info('No images found', 'Add images to your Pictures or Desktop folder first (or use Upload image).');
                    return;
                }
                Popup.pick('Choose background', 'Pick an image from your files:', images).then(sel => {
                    if (!sel) return;
                    const picked = typeof sel === 'string' ? images.find(i => i.label === sel) : sel;
                    if (!picked || !picked.path) return;
                    if (!SystemConfig.setWallpaperImage(picked.path)) {
                        Popup.warn('Cannot use image', 'That file is not a supported image.');
                        return;
                    }
                    refreshPersonalization();
                });
            });
        }

        const uploadBtn = el.querySelector('.custom-bg-upload');
        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.addEventListener('change', async () => {
                    const file = input.files && input.files[0];
                    if (!file) return;
                    try {
                        let pics;
                        try { pics = Users.home(['Pictures']); } catch { pics = null; }
                        if (!pics) throw new Error('no home');
                        if (!FileSystem.itemExists(pics)) {
                            FileSystem.createFolder(pics.slice(0, -1), pics[pics.length - 1]);
                        }
                        const safe = String(file.name || 'wallpaper').replace(/[\\/]/g, '_').slice(0, 80) || 'wallpaper';
                        const dot = safe.lastIndexOf('.');
                        const ext = (dot >= 0 ? safe.slice(dot + 1) : '').toLowerCase() || 'png';
                        const target = [...pics, safe];
                        const existing = FileSystem.itemExists(target) ? FileSystem.getNode(target) : null;
                        if (existing && existing.type === 'folder') throw new Error('name taken');
                        const blob = file.slice(0, file.size, file.type || undefined);
                        const ok = await FileSystem.writeFileBlob(pics, safe, blob, ext);
                        if (!ok) throw new Error('save failed');
                        if (!SystemConfig.setWallpaperImage(target)) throw new Error('unsupported type');
                        refreshPersonalization();
                    } catch (e) {
                        Popup.warn('Upload failed', 'Could not save that image to your Pictures folder.');
                    }
                });
                input.click();
            });
        }

        const removeBtn = el.querySelector('.custom-bg-remove');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                SystemConfig.setWallpaperImage(null);
                refreshPersonalization();
            });
        }

        const fitSel = el.querySelector('.custom-bg-fit');
        if (fitSel) {
            fitSel.addEventListener('change', () => {
                SystemConfig.setWallpaperFit(fitSel.value);
            });
        }
    }

    function setupCursorEvents(el) {
        el.querySelectorAll('.cursor-theme-option').forEach(opt => {
            opt.addEventListener('click', () => {
                try { Cursor.setTheme(opt.dataset.theme); } catch (e) {}
                SystemConfig.set('cursorTheme', opt.dataset.theme);
                refreshPersonalization();
            });
        });

        const cursorSlider = el.querySelector('.cursor-size-slider');
        const cursorSliderVal = el.querySelector('.cursor-size-value');
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

        el.querySelectorAll('.cursor-style-option').forEach(opt => {
            opt.addEventListener('click', () => {
                try { Cursor.setStyle(opt.dataset.style); } catch (e) {}
                SystemConfig.set('cursorStyle', opt.dataset.style);
                refreshPersonalization();
            });
        });
    }

    function setupTaskbarEvents(el) {
        const slider = el.querySelector('.taskbar-opacity-slider');
        const sliderVal = el.querySelector('.opacity-value');
        if (slider) {
            slider.addEventListener('input', () => {
                if (sliderVal) sliderVal.textContent = `${slider.value}%`;
            });
            slider.addEventListener('change', () => {
                SystemConfig.set('taskbarOpacity', parseInt(slider.value));
            });
        }

        el.querySelectorAll('.taskbar-pos-option').forEach(opt => {
            opt.addEventListener('click', () => {
                SystemConfig.set('taskbarPosition', opt.dataset.pos);
                refreshPersonalization();
            });
        });

        el.querySelectorAll('.grouping-option').forEach(opt => {
            opt.addEventListener('click', () => {
                SystemConfig.set('taskbarGrouping', opt.dataset.grouping);
                // Also refresh the taskbar immediately
                try { Taskbar.refreshGrouping(); } catch (e) {}
                refreshPersonalization();
            });
        });
    }

    function showPage(page, subPage = null) {
        const validPage = Object.hasOwn(pages, page) ? page : 'system';
        const set = subPageSets[validPage];
        const validSubPage = set && Object.hasOwn(set, subPage) ? subPage : null;

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
        refreshSidebarUser();
    }

    let userListenerWired = false;
    let updateListenerWired = false;

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

        if (!userListenerWired) {
            userListenerWired = true;
            window.addEventListener('user-info-changed', refreshSidebarUser);
        }

        // The update service reports every change: the Windows Update page
        // follows along (the progress bar moves while a download runs).
        if (!updateListenerWired) {
            updateListenerWired = true;
            window.addEventListener('w12:update-state', () => {
                if (!win || !win.element.isConnected) return;
                if (currentPage !== 'update') return;
                const content = win.element.querySelector('.settings-content');
                if (!content) return;
                if (currentSubPage === 'history') renderUpdateSubPage(content, 'history');
                else renderUpdate(content);
            });
        }
        refreshSidebarUser();
    }

    return { launch, showPage };
})();

export default Settings;
