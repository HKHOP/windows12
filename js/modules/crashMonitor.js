// CrashMonitor — app crash recovery for the web OS.
//
// Uncaught exceptions (and launch failures) are attributed to the app that
// threw via the script filename (`js/apps/<id>/…`) or the error stack, the
// app is flagged "Not responding" (Task Manager reads this live), and the
// user gets the classic recovery dialog:
//
//   Microsoft Windows — "<App> stopped responding."
//   [Restart] [Close] [View details]
//
// Honest limits: the browser runs every app on one thread, so a true hard
// hang (infinite loop) freezes the whole OS and no dialog can appear until
// it unblocks — "Not responding" here means "threw / failed to launch",
// which covers every realistic web-app failure. True hang detection would
// need one worker per app; that refactor is out of scope.
import WindowManager from './windowManager.js';
import AppLoader from './appLoader.js';
import { AppMetadata } from './taskbar.js';

const CrashMonitor = (() => {
    const crashes = new Map(); // appId -> { message, stack, source, time, count }
    const dialogs = new Map(); // appId -> crash-dialog windowId
    const lastDialogAt = new Map();
    const DIALOG_COOLDOWN_MS = 5000;
    const APP_FILE_RE = /js\/apps\/([^\/]+)\//;

    function attributeFromFile(filename) {
        const m = String(filename || '').match(APP_FILE_RE);
        return m ? m[1] : null;
    }

    function attributeFromStack(stack) {
        if (!stack) return null;
        const m = String(stack).match(APP_FILE_RE);
        return m ? m[1] : null;
    }

    function isKnownApp(appId) {
        try {
            return !!AppLoader.getManifest(appId);
        } catch { return false; }
    }

    function isCrashed(appId) {
        return crashes.has(appId);
    }

    function getCrash(appId) {
        return crashes.get(appId) || null;
    }

    function clear(appId) {
        crashes.delete(appId);
    }

    function esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function describeSource(info) {
        if (info.source === 'launch') return 'failed to start';
        if (info.source === 'rejection') return 'hit an unhandled error';
        return 'threw an uncaught exception';
    }

    function reportCrash(appId, info = {}) {
        if (!appId || appId === 'system' || appId === 'popup') return false;
        if (!isKnownApp(appId)) return false;
        const prev = crashes.get(appId);
        crashes.set(appId, {
            message: String(info.message || 'Unknown error'),
            stack: String(info.stack || ''),
            source: info.source || 'exception',
            time: Date.now(),
            count: (prev ? prev.count : 0) + 1
        });
        try {
            window.dispatchEvent(new CustomEvent('app-crashed', { detail: { appId } }));
        } catch { /* noop */ }
        showDialog(appId);
        return true;
    }

    function dialogAlive(appId) {
        const id = dialogs.get(appId);
        if (!id) return false;
        const w = WindowManager._getWindow(id);
        if (w) return true;
        dialogs.delete(appId);
        return false;
    }

    function showDialog(appId) {
        if (dialogAlive(appId)) return;
        const now = Date.now();
        if (now - (lastDialogAt.get(appId) || 0) < DIALOG_COOLDOWN_MS) return;
        lastDialogAt.set(appId, now);

        const crash = crashes.get(appId);
        if (!crash) return;
        const meta = AppMetadata.get(appId);
        const appName = meta.name || appId;

        const html = `
            <div style="display:flex;flex-direction:column;height:100%;padding:20px 20px 16px;box-sizing:border-box;user-select:text;-webkit-user-select:text;">
                <div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:8px;">
                    <div style="width:40px;height:40px;flex-shrink:0;">${meta.icon || ''}</div>
                    <div style="font-size:14px;line-height:1.5;color:var(--text-primary);">
                        <b>${esc(appName)}</b> stopped responding.<br>
                        <span style="font-size:12px;color:var(--text-secondary);">It ${describeSource(crash)} and may need to restart.</span>
                    </div>
                </div>
                <div class="crash-details" style="display:none;flex:1;min-height:0;overflow:auto;background:rgba(0,0,0,0.35);border:1px solid var(--window-border);border-radius:6px;padding:8px 10px;font-family:Consolas,monospace;font-size:11px;color:#ffb3b3;white-space:pre-wrap;word-break:break-word;margin-bottom:8px;">${esc(crash.message)}${crash.stack ? '\n\n' + esc(crash.stack.slice(0, 2000)) : ''}</div>
                <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:auto;">
                    <button class="crash-restart" style="padding:6px 20px;background:#0078D4;border:none;border-radius:4px;color:white;cursor:pointer;font-size:13px;font-weight:600;">Restart</button>
                    <button class="crash-close" style="padding:6px 20px;background:rgba(255,255,255,0.08);border:1px solid var(--window-border);border-radius:4px;color:var(--text-primary);cursor:pointer;font-size:13px;">Close</button>
                    <button class="crash-details-btn" style="padding:6px 12px;background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:13px;">View details</button>
                </div>
            </div>
        `;

        const dlg = WindowManager.createWindow(appId, 'Microsoft Windows', meta.icon, html, {
            width: 460, height: 230, minWidth: 380, minHeight: 200, saveState: false
        });
        dialogs.set(appId, dlg.id);
        const el = dlg.element;

        el.querySelector('.crash-restart').addEventListener('click', () => restartApp(appId));
        el.querySelector('.crash-close').addEventListener('click', () => closeApp(appId));
        const detailsBtn = el.querySelector('.crash-details-btn');
        const details = el.querySelector('.crash-details');
        detailsBtn.addEventListener('click', () => {
            const open = details.style.display !== 'none';
            details.style.display = open ? 'none' : 'block';
            detailsBtn.textContent = open ? 'View details' : 'Hide details';
        });
    }

    function hideDialog(appId) {
        const id = dialogs.get(appId);
        if (id) {
            dialogs.delete(appId);
            WindowManager.closeWindow(id);
        }
    }

    function closeApp(appId) {
        hideDialog(appId);
        try {
            WindowManager.closeAllWindows(appId);
        } catch { /* already gone */ }
        clear(appId);
    }

    function launchApp(appId) {
        let mod = null;
        try {
            mod = AppLoader.getModule(appId);
        } catch { mod = null; }
        if (!mod || typeof mod.launch !== 'function') return false;
        try {
            mod.launch();
        } catch (err) {
            reportCrash(appId, {
                message: err && err.message ? err.message : String(err),
                stack: err && err.stack ? err.stack : '',
                source: 'launch'
            });
            return false;
        }
        clear(appId);
        return true;
    }

    function restartApp(appId) {
        hideDialog(appId);
        try {
            WindowManager.closeAllWindows(appId);
        } catch { /* already gone */ }
        clear(appId);
        return launchApp(appId);
    }

    // ---------- global listeners ----------

    function onError(e) {
        try {
            const appId = attributeFromFile(e.filename) || attributeFromStack(e.error && e.error.stack);
            if (!appId) return;
            reportCrash(appId, {
                message: e.message || (e.error && e.error.message) || 'Script error',
                stack: (e.error && e.error.stack) || '',
                source: 'exception'
            });
        } catch { /* never break the error path itself */ }
    }

    function onRejection(e) {
        try {
            const reason = e.reason;
            const stack = reason && (reason.stack || (reason.error && reason.error.stack));
            const appId = attributeFromStack(stack)
                || attributeFromStack(typeof reason === 'string' ? reason : '');
            if (!appId) return;
            reportCrash(appId, {
                message: (reason && reason.message) || String(reason),
                stack: stack || '',
                source: 'rejection'
            });
        } catch { /* never break the rejection path itself */ }
    }

    function init() {
        window.addEventListener('error', onError);
        window.addEventListener('unhandledrejection', onRejection);
    }

    return { init, reportCrash, isCrashed, getCrash, clear, restartApp, closeApp, launchApp };
})();

export default CrashMonitor;
