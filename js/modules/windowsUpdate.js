import WindowManager from './windowManager.js';
import Popup from './popup.js';

const WindowsUpdate = (() => {
    const icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z" fill="#0078D4"/></svg>`;

    let currentVersion = null;
    let latestVersion = null;
    let updateAvailable = false;
    let checkInterval = null;

    function getCurrentVersion() {
        return currentVersion;
    }

    function getLatestVersion() {
        return latestVersion;
    }

    function isUpdateAvailable() {
        return updateAvailable;
    }

    function compareVersions(v1, v2) {
        const parts1 = v1.split('.').map(Number);
        const parts2 = v2.split('.').map(Number);
        for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
            const a = parts1[i] || 0;
            const b = parts2[i] || 0;
            if (a > b) return 1;
            if (a < b) return -1;
        }
        return 0;
    }

    async function checkForUpdates(silent = false) {
        try {
            const response = await fetch('version.json?t=' + Date.now());
            if (!response.ok) {
                if (!silent) Popup.warn('Windows Update', 'Unable to check for updates. Please try again later.');
                return false;
            }
            const data = await response.json();
            latestVersion = data.version;

            if (currentVersion && compareVersions(latestVersion, currentVersion) > 0) {
                updateAvailable = true;
                showUpdateNotification();
                return true;
            } else {
                updateAvailable = false;
                if (!silent) Popup.info('Windows Update', 'Your system is up to date.\n\nCurrent version: ' + currentVersion);
                return false;
            }
        } catch (err) {
            if (!silent) Popup.warn('Windows Update', 'Unable to check for updates. Please try again later.');
            return false;
        }
    }

    function showUpdateNotification() {
        const existing = document.getElementById('update-notification');
        if (existing) existing.remove();

        const notif = document.createElement('div');
        notif.id = 'update-notification';
        notif.style.cssText = 'position:fixed;bottom:60px;right:20px;background:var(--window-bg);border:1px solid var(--window-border);border-radius:8px;padding:16px 20px;box-shadow:0 4px 20px rgba(0,0,0,0.3);z-index:99999;min-width:300px;animation:windowOpen 0.2s ease-out;';
        notif.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="#0078D4"/></svg>
                <div>
                    <div style="font-size:14px;font-weight:600;color:var(--text-primary);">Update Available</div>
                    <div style="font-size:12px;color:var(--text-secondary);">Version ${latestVersion}</div>
                </div>
            </div>
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">A new version of Windows 12 is available. Refresh to get the latest features and improvements.</div>
            <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button class="update-dismiss" style="padding:6px 14px;background:transparent;border:1px solid var(--window-border);border-radius:4px;color:var(--text-primary);cursor:pointer;font-size:12px;">Dismiss</button>
                <button class="update-refresh" style="padding:6px 14px;background:var(--accent-color);border:none;border-radius:4px;color:white;cursor:pointer;font-size:12px;font-weight:500;">Refresh Now</button>
            </div>
        `;
        document.body.appendChild(notif);

        notif.querySelector('.update-dismiss').addEventListener('click', () => notif.remove());
        notif.querySelector('.update-refresh').addEventListener('click', () => location.reload());

        setTimeout(() => {
            if (notif.parentNode) notif.remove();
        }, 30000);
    }

    function launch() {
        const content = `
            <div style="padding:24px;height:100%;overflow-y:auto;">
                <div style="display:flex;align-items:center;gap:16px;margin-bottom:32px;">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z" fill="#0078D4"/></svg>
                    <div>
                        <div style="font-size:20px;font-weight:600;color:var(--text-primary);">Windows Update</div>
                        <div style="font-size:12px;color:var(--text-secondary);">Keep your system up to date</div>
                    </div>
                </div>

                <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:20px;margin-bottom:20px;">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
                        <div>
                            <div style="font-size:14px;font-weight:500;color:var(--text-primary);">Current Version</div>
                            <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">${currentVersion || 'Unknown'}</div>
                        </div>
                        <div style="padding:4px 12px;background:${updateAvailable ? '#FF9800' : '#4CAF50'};border-radius:12px;font-size:11px;color:white;font-weight:500;">
                            ${updateAvailable ? 'Update Available' : 'Up to Date'}
                        </div>
                    </div>
                    ${updateAvailable ? `
                        <div style="background:rgba(255,152,0,0.1);border:1px solid rgba(255,152,0,0.3);border-radius:6px;padding:12px;margin-bottom:16px;">
                            <div style="font-size:12px;color:var(--text-primary);">New version ${latestVersion} is available.</div>
                        </div>
                    ` : ''}
                    <button class="wu-check-btn" style="width:100%;padding:10px;background:var(--accent-color);border:none;border-radius:6px;color:white;cursor:pointer;font-size:13px;font-weight:500;">
                        Check for Updates
                    </button>
                </div>

                <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:20px;">
                    <div style="font-size:14px;font-weight:500;color:var(--text-primary);margin-bottom:12px;">Update History</div>
                    <div style="font-size:12px;color:var(--text-secondary);">
                        <div style="padding:8px 0;border-bottom:1px solid var(--border);">
                            <div style="font-weight:500;color:var(--text-primary);">Version ${currentVersion}</div>
                            <div style="color:var(--text-secondary);margin-top:2px;">Installed today</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const win = WindowManager.createWindow('windowsUpdate', 'Windows Update', icon, content, { width: 500, height: 450 });
        const el = win.element;

        el.querySelector('.wu-check-btn').addEventListener('click', async () => {
            const btn = el.querySelector('.wu-check-btn');
            btn.textContent = 'Checking...';
            btn.disabled = true;
            await checkForUpdates(false);
            btn.textContent = 'Check for Updates';
            btn.disabled = false;
        });
    }

    function init() {
        return new Promise((resolve) => {
            fetch('version.json?t=' + Date.now())
                .then(r => r.json())
                .then(data => {
                    currentVersion = data.version;
                    latestVersion = data.version;
                    checkForUpdates(true);
                    checkInterval = setInterval(() => checkForUpdates(true), 30 * 60 * 1000);
                    resolve();
                })
                .catch(() => {
                    currentVersion = '12.0.0';
                    latestVersion = currentVersion;
                    resolve();
                });
        });
    }

    function destroy() {
        if (checkInterval) clearInterval(checkInterval);
    }

    return { init, launch, destroy, getCurrentVersion, getLatestVersion, isUpdateAvailable, checkForUpdates };
})();

export default WindowsUpdate;
