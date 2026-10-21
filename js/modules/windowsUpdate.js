// Windows Update — the app.
//
// The app is only a view: the work happens in the update service
// (js/modules/updateService.js), which checks for updates in the
// background, downloads them and asks for a restart. This window shows
// what the service is doing, and the history of what it did.
//
// The page is Windows 11 style: a status card, the "Check for updates"
// button, and - below it - the progress of whatever is running right now.
import WindowManager from './windowManager.js';
import Popup from './popup.js';
import AppIcons from './appIcons.js';
import UpdateService from './updateService.js';

const WindowsUpdate = (() => {
    const icon = AppIcons.get('windowsUpdate');

    let currentVersion = null;
    let latestVersion = null;
    let updateAvailable = false;
    let windowEl = null;
    let view = 'main';

    function getCurrentVersion() {
        return currentVersion || UpdateService.getState().osCurrent || null;
    }

    function getLatestVersion() {
        return latestVersion || UpdateService.getState().osVersion || null;
    }

    function isUpdateAvailable() {
        const state = UpdateService.getState();
        return updateAvailable || !!state.osVersion || state.apps.length > 0;
    }

    // ---- helpers ----

    function esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function timeAgo(ts) {
        if (!ts) return 'never';
        const diff = Date.now() - ts;
        if (diff < 60000) return 'just now';
        if (diff < 3600000) return Math.floor(diff / 60000) + ' min ago';
        if (diff < 86400000) return Math.floor(diff / 3600000) + ' h ago';
        return new Date(ts).toLocaleDateString();
    }

    function dateText(iso) {
        try {
            const d = new Date(iso);
            if (isNaN(d.getTime())) return String(iso || '');
            return d.toLocaleString();
        } catch (e) {
            return String(iso || '');
        }
    }

    // ---- the views ----

    function statusCard(state) {
        const ready = state.status === 'ready';
        const working = state.status === 'checking' || state.status === 'downloading' || state.status === 'applying';
        const error = state.status === 'error';

        let headline = 'You\'re up to date';
        let sub = 'Last checked: ' + timeAgo(state.lastCheck);
        let tone = 'ok';

        if (ready) {
            headline = 'Restart required';
            sub = state.message || 'Updates are ready to install.';
            tone = 'warn';
        } else if (working) {
            headline = state.status === 'checking' ? 'Checking for updates' : 'Downloading updates';
            sub = state.message || 'Please wait…';
            tone = 'busy';
        } else if (error) {
            headline = 'We couldn\'t check for updates';
            sub = state.message || '';
            tone = 'warn';
        } else if (state.osVersion || state.apps.length) {
            headline = 'Update available';
            sub = state.osVersion
                ? 'Version ' + state.osVersion + ' is ready to install'
                : state.apps.length + ' app update' + (state.apps.length === 1 ? '' : 's') + ' available';
            tone = 'warn';
        }

        const iconSvg = tone === 'ok'
            ? '<svg width="34" height="34" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#0f7b0f"/><path d="M8 12.5l2.6 2.6L16 9.5" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
            : tone === 'busy'
                ? '<svg width="34" height="34" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#0078D4" stroke-width="2.4" opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke="#0078D4" stroke-width="2.4" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></path></svg>'
                : '<svg width="34" height="34" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#c47f00"/><path d="M12 7v6" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="16.4" r="1.3" fill="#fff"/></svg>';

        // The progress lives BELOW the button, the way Windows 11 shows it.
        const progress = working || ready
            ? `<div class="wu-progress">
                   <div class="wu-progress-bar"><div class="wu-progress-fill" style="width:${Math.round((state.progress || 0) * 100)}%"></div></div>
                   <div class="wu-progress-text">${esc(state.message || '')} ${working ? Math.round((state.progress || 0) * 100) + '%' : ''}</div>
               </div>`
            : '';

        const restart = ready
            ? `<div class="wu-actions">
                   <button class="wu-restart" style="flex:1;padding:10px 18px;background:#0078D4;border:none;border-radius:6px;color:#fff;cursor:pointer;font-size:13px;font-weight:600;">Restart now</button>
                   <button class="wu-later" style="padding:10px 18px;background:transparent;border:1px solid var(--window-border);border-radius:6px;color:var(--text-primary);cursor:pointer;font-size:13px;">Restart later</button>
               </div>`
            : '';

        const updates = (state.osVersion || state.apps.length)
            ? `<div class="wu-available">
                   <div class="wu-available-title">Available updates</div>
                   ${state.osVersion ? `<div class="wu-available-row"><span>Operating system update</span><span class="wu-available-version">${esc(state.osVersion)}</span></div>` : ''}
                   ${state.apps.map(a => `<div class="wu-available-row"><span>${esc(a.name)}</span><span class="wu-available-version">${esc(a.installedVersion)} → ${esc(a.version)}</span></div>`).join('')}
               </div>`
            : '';

        return `
            <div class="wu-card">
                <div class="wu-status">
                    <div class="wu-status-icon">${iconSvg}</div>
                    <div class="wu-status-text">
                        <div class="wu-status-headline">${esc(headline)}</div>
                        <div class="wu-status-sub">${esc(sub)}</div>
                    </div>
                </div>
                <button class="wu-check-btn" style="width:100%;padding:11px;background:#0078D4;border:none;border-radius:6px;color:#fff;cursor:pointer;font-size:13px;font-weight:600;margin-top:18px;" ${working ? 'disabled' : ''}>
                    ${working ? 'Working…' : 'Check for updates'}
                </button>
                ${progress}
                ${restart}
            </div>
            ${updates}`;
    }

    function historyPage() {
        const entries = UpdateService.history();
        const rows = entries.length
            ? entries.map(e => `
                <div class="wu-history-row">
                    <div class="wu-history-head">
                        <span class="wu-history-title">${esc(e.title)}</span>
                        <span class="wu-history-status ${e.status === 'failed' ? 'is-failed' : ''}">${esc(e.status)}</span>
                    </div>
                    <div class="wu-history-meta">${esc(dateText(e.date))}${e.version ? ' · ' + esc(e.version) : ''}</div>
                    ${e.details ? `<div class="wu-history-details">${esc(e.details)}</div>` : ''}
                </div>`).join('')
            : '<div class="wu-history-empty">No updates have been installed yet.</div>';

        return `
            <div class="wu-subpage">
                <button class="wu-back" style="display:flex;align-items:center;gap:8px;background:none;border:none;color:var(--text-primary);cursor:pointer;font-size:13px;padding:0;margin-bottom:14px;">&#9664; Back</button>
                <div class="wu-subpage-title">Update history</div>
                <div class="wu-history">${rows}</div>
            </div>`;
    }

    function render() {
        if (!windowEl || !windowEl.isConnected) return;
        const state = UpdateService.getState();
        currentVersion = state.osCurrent || currentVersion;
        latestVersion = state.osVersion || latestVersion;
        updateAvailable = isUpdateAvailable();

        const body = view === 'history'
            ? historyPage()
            : statusCard(state) + `<button class="wu-history-link" style="background:none;border:none;color:var(--accent-color);cursor:pointer;font-size:12px;padding:16px 0 0;text-align:left;">Update history</button>`;
        const content = windowEl.querySelector('.window-body');
        if (!content) return;
        content.innerHTML = `<div class="wu-root" style="padding:22px;color:var(--text-primary);font-family:inherit;">${body}</div>`;

        const checkBtn = content.querySelector('.wu-check-btn');
        if (checkBtn) {
            checkBtn.addEventListener('click', async () => {
                checkBtn.disabled = true;
                checkBtn.textContent = 'Checking…';
                await UpdateService.check({ manual: true });
                render();
            });
        }
        const restartBtn = content.querySelector('.wu-restart');
        if (restartBtn) {
            restartBtn.addEventListener('click', () => UpdateService.restartNow());
        }
        const laterBtn = content.querySelector('.wu-later');
        if (laterBtn) {
            laterBtn.addEventListener('click', () => render());
        }
        const backBtn = content.querySelector('.wu-back');
        if (backBtn) {
            backBtn.addEventListener('click', () => { view = 'main'; render(); });
        }
        const historyBtn = content.querySelector('.wu-history-link');
        if (historyBtn) {
            historyBtn.addEventListener('click', () => { view = 'history'; render(); });
        }
    }

    function launch() {
        view = 'main';
        const state = UpdateService.getState();
        currentVersion = state.osCurrent || currentVersion;
        const content = '<div class="wu-root" style="padding:22px;color:var(--text-primary);font-family:inherit;"></div>';
        const win = WindowManager.createWindow('windowsUpdate', 'Windows Update', icon, content, { width: 560, height: 620 });
        windowEl = win.element;
        render();
    }

    // ---- the service behind the app ----

    async function checkForUpdates(silent = false) {
        const state = await UpdateService.check({ manual: !silent });
        if (!silent && state.status === 'error') {
            Popup.warn('Windows Update', state.message || 'Unable to check for updates.');
        }
        return state.status !== 'error' && (!!state.osVersion || state.apps.length > 0);
    }

    function init() {
        // The service reports every change; the app follows along.
        window.addEventListener('w12:update-state', () => {
            const state = UpdateService.getState();
            currentVersion = state.osCurrent || currentVersion;
            latestVersion = state.osVersion || latestVersion;
            render();
        });
        // A first look at the state, so the window opens with real numbers.
        const state = UpdateService.getState();
        currentVersion = state.osCurrent || currentVersion;
        return Promise.resolve();
    }

    function destroy() {
        windowEl = null;
    }

    return { init, launch, destroy, getCurrentVersion, getLatestVersion, isUpdateAvailable, checkForUpdates };
})();

export default WindowsUpdate;
