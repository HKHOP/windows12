// Windows Update — the operating system's update service.
//
// It lives in the shell, not in an app: it checks for updates in the
// background (when the user allows it), downloads what it finds, and asks
// for a restart once everything is on disk. The Windows Update app and the
// Settings page are only views on this service.
//
// Two kinds of things can be updated:
//
//   - the operating system itself. A new service worker carries a new core
//     bundle and unpacks it into OPFS by itself; the worker then waits until
//     the machine restarts. The version is the one in the worker's core
//     manifest, so an update is only offered when the core really changed.
//   - the installed apps. Their packages are downloaded in the background and
//     kept in the virtual filesystem until the restart, which installs them.
//
// The service never interrupts: it works in the background, reports its
// progress through the 'w12:update-state' event and only speaks up when
// there is something to say.
import AppLoader from './appLoader.js';
import Packages from './packages.js';
import Notifications from './notifications.js';
import Registry from './registry.js';
import SystemConfig from './systemConfig.js';
import NetworkStatus from './networkStatus.js';
import FileSystem from './fileSystem.js';

const UpdateService = (() => {
    const AUTO_CHECK_MS = 30 * 60 * 1000;
    const FIRST_CHECK_MS = 8 * 1000;
    const PENDING_DIR = ['system', 'programs data', 'updates'];
    const PENDING_FILE = 'pending.json';
    const HISTORY_KEY = 'HKLM\\Software\\Windows 12\\Updates';
    const HISTORY_VALUE = 'History';
    const MAX_HISTORY = 40;

    const state = {
        // idle | checking | downloading | ready | error | applying | restarting
        status: 'idle',
        message: '',
        progress: 0,
        // The operating system update that is waiting for a restart.
        osVersion: '',
        osCurrent: '',
        // True when a new operating system is on disk and waiting.
        osPending: false,
        // The app updates that were found: { id, name, version, installedVersion }.
        apps: [],
        error: null,
        lastCheck: 0,
        lastResult: ''
    };

    let timer = null;
    let firstCheckTimer = null;
    let busy = false;
    let notified = false;
    // True while a new service worker is unpacking a new operating system.
    let osDownloading = false;

    // ---- state ----

    function snapshot() {
        return { ...state, apps: state.apps.map(a => ({ ...a })) };
    }

    function emit() {
        try {
            window.dispatchEvent(new CustomEvent('w12:update-state', { detail: snapshot() }));
        } catch (e) { /* no window (tests) */ }
    }

    function setState(patch) {
        Object.assign(state, patch || {});
        emit();
    }

    // ---- settings ----

    function autoCheckEnabled() {
        try { return SystemConfig.get('autoCheckUpdates') !== false; } catch (e) { return true; }
    }

    function setAutoCheck(enabled) {
        try { SystemConfig.set('autoCheckUpdates', !!enabled); } catch (e) { /* the config is optional */ }
    }

    // ---- helpers ----

    function compareVersions(a, b) {
        const pa = String(a || '0').split('.').map(n => parseInt(n, 10) || 0);
        const pb = String(b || '0').split('.').map(n => parseInt(n, 10) || 0);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            const x = pa[i] || 0;
            const y = pb[i] || 0;
            if (x > y) return 1;
            if (x < y) return -1;
        }
        return 0;
    }

    function shellWrite(fn) {
        const g = window._FSGuard;
        try { return g ? g.asShell(fn)() : fn(); } catch (e) { return null; }
    }

    // The core the running service worker serves.
    async function currentCoreVersion() {
        try {
            const reg = await navigator.serviceWorker.getRegistration();
            const worker = reg && (reg.active || navigator.serviceWorker.controller);
            if (!worker) return '';
            const info = await workerMessage(worker, 'core-status', 8000);
            return info && info.ok ? (info.version || '') : '';
        } catch (e) {
            return '';
        }
    }

    // Asks a service worker for one piece of information (the bootstrap uses
    // the same handshake).
    function workerMessage(worker, type, timeoutMs) {
        return new Promise((resolve) => {
            let done = false;
            const finish = (value) => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                if (worker) worker.removeEventListener('message', onMessage);
                resolve(value);
            };
            const onMessage = (event) => {
                const data = event.data || {};
                if (data.type !== type) return;
                if (data.__id !== id) return;
                finish(data);
            };
            const id = Math.random().toString(36).slice(2);
            const timer = setTimeout(() => finish(null), timeoutMs || 10000);
            if (!worker) { finish(null); return; }
            worker.addEventListener('message', onMessage);
            try {
                worker.postMessage({ type, __id: id });
            } catch (e) {
                finish(null);
            }
        });
    }

    function waitForWorker(worker) {
        return new Promise((resolve) => {
            if (!worker) { resolve(null); return; }
            if (worker.state === 'installed' || worker.state === 'activated' || worker.state === 'redundant') {
                resolve(worker);
                return;
            }
            const onState = () => {
                if (worker.state === 'installed' || worker.state === 'activated' || worker.state === 'redundant') {
                    worker.removeEventListener('statechange', onState);
                    resolve(worker);
                }
            };
            worker.addEventListener('statechange', onState);
        });
    }

    // The newest catalog of the apps, straight from the network. The catalog
    // the page imported is the one the OS shipped with; this one is what the
    // Store publishes right now.
    async function fetchLatestCatalog() {
        try {
            const res = await fetch('./js/apps/registry.js?t=' + Date.now(), { cache: 'no-store' });
            if (!res.ok) throw new Error('catalog-unavailable');
            const text = await res.text();
            const match = text.match(/APP_MANIFESTS\s*=\s*(\[[\s\S]*?\]);/);
            if (!match) throw new Error('catalog-unreadable');
            const list = JSON.parse(match[1]);
            return Array.isArray(list) ? list : [];
        } catch (e) {
            // Offline (or the catalog moved): fall back to what the OS knows.
            try { return AppLoader.getAll().map(e => e.manifest).filter(Boolean); } catch (e2) { return []; }
        }
    }

    // ---- the check ----

    // Looks for a newer operating system. The browser fetches the worker
    // script; when it changed, the new worker installs the new core by
    // itself and waits for the machine to restart.
    async function checkOsUpdate() {
        let reg = null;
        try { reg = await navigator.serviceWorker.getRegistration(); } catch (e) { return null; }
        if (!reg) return null;
        try { await reg.update(); } catch (e) { /* offline or unchanged */ }

        let worker = reg.waiting || reg.installing;
        if (!worker) return null;
        if (worker.state === 'installing') {
            // The new worker is unpacking the new core right now.
            osDownloading = true;
            setState({ status: 'downloading', message: 'Downloading the operating system update…' });
            worker = await waitForWorker(worker);
        }
        if (!worker || worker.state === 'redundant') return null;

        const current = await currentCoreVersion();
        const info = await workerMessage(worker, 'core-status', 15000);
        const version = (info && info.ok && info.version) ? info.version : '';
        // A worker that only brings a fresher app catalog is not an update.
        if (version && current && version === current) return null;
        if (!version && !current) return null;
        return { version, current, worker };
    }

    // The installed apps that have a newer version in the catalog.
    async function checkAppUpdates() {
        const catalog = await fetchLatestCatalog();
        const byId = new Map();
        for (const man of catalog) if (man && man.id) byId.set(man.id, man);

        const out = [];
        let records = [];
        try { records = Packages.getInstalled(); } catch (e) { records = []; }
        for (const rec of records) {
            if (!rec || !rec.id) continue;
            const installedMan = rec.manifest;
            if (!installedMan) continue;
            // The apps that ship inside the operating system are updated by
            // the operating system update itself.
            if (installedMan.distribution === 'builtin') continue;
            const latest = byId.get(rec.id);
            if (!latest || !latest.version) continue;
            const from = installedMan.version || '0';
            if (compareVersions(latest.version, from) <= 0) continue;
            out.push({
                id: rec.id,
                name: latest.name || installedMan.name || rec.id,
                version: latest.version,
                installedVersion: from
            });
        }
        return out;
    }

    // ---- the download ----

    function packageUrl(id) {
        return './packages/' + encodeURIComponent(id) + '.w12pkg';
    }

    async function fetchPackage(id) {
        try {
            const res = await fetch(packageUrl(id), { cache: 'no-store' });
            if (!res.ok) throw new Error('package-download-failed');
            return new Uint8Array(await res.arrayBuffer());
        } catch (e) {
            return null;
        }
    }

    function pendingPath() {
        return [...PENDING_DIR, PENDING_FILE];
    }

    function ensurePendingDir() {
        shellWrite(() => {
            let path = [];
            for (const part of PENDING_DIR) {
                const parent = path;
                path = [...path, part];
                if (!FileSystem.itemExists(path)) FileSystem.createFolder(parent, part);
            }
        });
    }

    async function savePendingPackage(id, bytes) {
        ensurePendingDir();
        const blob = new Blob([bytes]);
        return await FileSystem.writeFileBlob(PENDING_DIR, id + '.w12pkg', blob, 'w12pkg');
    }

    async function readPendingPackage(id) {
        const path = [...PENDING_DIR, id + '.w12pkg'];
        try {
            if (!FileSystem.isBlobFile(path)) return null;
            const blob = await FileSystem.readFileBlob(path);
            if (!blob) return null;
            return new Uint8Array(await blob.arrayBuffer());
        } catch (e) {
            return null;
        }
    }

    function writePending(payload) {
        ensurePendingDir();
        shellWrite(() => {
            FileSystem.writeFile(pendingPath(), JSON.stringify(payload, null, 2));
        });
        try { FileSystem.flushAsync(); } catch (e) { /* the snapshot is written anyway */ }
    }

    function readPending() {
        try {
            const raw = FileSystem.readFile(pendingPath());
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return null;
            return parsed;
        } catch (e) {
            return null;
        }
    }

    function clearPending() {
        shellWrite(() => {
            if (FileSystem.itemExists(pendingPath())) FileSystem.permanentDelete(pendingPath());
        });
        try { FileSystem.flushAsync(); } catch (e) { /* best effort */ }
    }

    // Downloads everything that was found and keeps it until the restart.
    async function downloadUpdates(os, apps) {
        setState({ status: 'downloading', message: 'Downloading updates…', progress: 0 });

        // The operating system is downloaded by the new service worker itself
        // (it unpacks the core into OPFS); the app packages are fetched here.
        const pendingApps = [];
        const total = Math.max(1, apps.length);
        for (let i = 0; i < apps.length; i++) {
            const app = apps[i];
            setState({ message: `Downloading ${app.name}…`, progress: i / total });
            const bytes = await fetchPackage(app.id);
            if (!bytes) continue;
            const saved = await savePendingPackage(app.id, bytes);
            if (!saved) continue;
            pendingApps.push({ id: app.id, name: app.name, version: app.version, file: app.id + '.w12pkg' });
        }

        writePending({
            // 'pending' stands for a new system whose version the worker
            // could not report: what matters is that it is on disk.
            os: os ? (os.version || 'pending') : null,
            osCurrent: os ? os.current : '',
            apps: pendingApps,
            createdAt: Date.now()
        });

        setState({
            status: 'ready',
            message: 'Restart to finish installing',
            progress: 1,
            osVersion: os ? os.version : '',
            osCurrent: os ? os.current : '',
            osPending: !!os
        });

        recordHistory({
            title: pendingApps.length
                ? `Updates for ${pendingApps.length} app${pendingApps.length === 1 ? '' : 's'}`
                : 'Operating system update',
            version: os ? os.version : pendingApps.map(a => a.version).join(', '),
            type: os ? 'os' : 'apps',
            status: 'downloaded',
            details: pendingApps.map(a => a.name + ' ' + a.version).join(', ')
        });

        notifyRestart();
    }

    // ---- the history ----

    function history() {
        try {
            const raw = Registry.getString(HISTORY_KEY, HISTORY_VALUE, '');
            if (!raw) return [];
            const list = JSON.parse(raw);
            return Array.isArray(list) ? list : [];
        } catch (e) {
            return [];
        }
    }

    function recordHistory(entry) {
        try {
            const list = history();
            list.unshift({
                id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                date: new Date().toISOString(),
                title: String(entry.title || 'Update'),
                version: String(entry.version || ''),
                type: entry.type || 'os',
                status: entry.status || 'installed',
                details: String(entry.details || '')
            });
            const trimmed = list.slice(0, MAX_HISTORY);
            Registry.set(HISTORY_KEY, HISTORY_VALUE, 'REG_SZ', JSON.stringify(trimmed));
            return trimmed;
        } catch (e) {
            return history();
        }
    }

    // ---- the restart ----

    function notifyRestart() {
        if (notified) return;
        notified = true;
        try {
            Notifications.action(
                'Restart to update',
                'Windows 12 has downloaded updates. Restart to finish installing them.',
                {
                    sticky: true,
                    actions: [
                        { label: 'Restart now', value: 'restart' },
                        { label: 'Later', value: 'later' }
                    ],
                    onAction: (value) => {
                        if (value === 'restart') restartNow();
                        else notified = false;
                    }
                }
            );
        } catch (e) { /* the notification is optional */ }
    }

    function restartNow() {
        try { location.reload(); } catch (e) { /* noop */ }
    }

    // ---- the public cycle ----

    async function check(options = {}) {
        if (busy) return snapshot();
        busy = true;
        try {
            setState({ status: 'checking', message: 'Checking for updates…', progress: 0, error: null });

            if (!NetworkStatus.isOnline()) {
                setState({ status: 'error', message: 'You\'re offline. Connect to the internet to check for updates.', error: 'offline' });
                return snapshot();
            }

            const os = await checkOsUpdate();
            const apps = await checkAppUpdates();
            const current = os ? os.current : (state.osCurrent || await currentCoreVersion());

            setState({
                osCurrent: current,
                osVersion: os ? os.version : '',
                osPending: !!os,
                apps,
                lastCheck: Date.now()
            });

            if (!os && !apps.length) {
                setState({
                    status: 'idle',
                    message: 'You\'re up to date',
                    progress: 1,
                    lastResult: 'You\'re up to date'
                });
                return snapshot();
            }

            await downloadUpdates(os, apps);
            return snapshot();
        } catch (e) {
            setState({
                status: 'error',
                message: 'Unable to check for updates. Check your connection and try again.',
                error: String((e && e.message) || e)
            });
            return snapshot();
        } finally {
            busy = false;
        }
    }

    // Applies a downloaded update: the app packages are installed and the
    // new operating system is activated. The caller restarts the page.
    async function applyPending() {
        const pending = readPending();
        if (!pending) return null;
        const apps = Array.isArray(pending.apps) ? pending.apps : [];
        if (!pending.os && !apps.length) { clearPending(); return null; }

        setState({ status: 'applying', message: 'Working on updates…', progress: 0 });

        // The installed apps have to be known before they are updated: an
        // update keeps the scope and the folder of the app it replaces.
        try { Packages.rescan(); } catch (e) { /* the scan is optional */ }

        const total = Math.max(1, apps.length);
        for (let i = 0; i < apps.length; i++) {
            const app = apps[i];
            const bytes = await readPendingPackage(app.file || (app.id + '.w12pkg'));
            if (!bytes) continue;
            const rec = Packages.getRecord(app.id);
            try {
                await Packages.install({ type: 'package', id: app.id, bytes }, {
                    scope: rec ? rec.scope : 'user',
                    path: rec ? rec.path : undefined,
                    allowReplace: true,
                    onProgress: (p, label) => setState({
                        message: label || `Installing ${app.name}…`,
                        progress: (i + Math.max(0, Math.min(1, p || 0))) / total
                    })
                });
            } catch (e) {
                recordHistory({
                    title: app.name,
                    version: app.version || '',
                    type: 'app',
                    status: 'failed',
                    details: String((e && e.message) || e)
                });
            }
        }

        // Hand the machine over to the new operating system: the waiting
        // worker takes over and the page reloads into it.
        let activated = false;
        try {
            const reg = await navigator.serviceWorker.getRegistration();
            const waiting = reg && reg.waiting;
            if (waiting) {
                // Wait for the new worker to take over before the page
                // reloads, otherwise the restart would boot the old system
                // and the update would be lost.
                const changed = new Promise((resolve) => {
                    navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
                    setTimeout(resolve, 8000);
                });
                waiting.postMessage({ type: 'skip-waiting' });
                await changed;
                activated = true;
            }
        } catch (e) { /* the worker stays as it is */ }

        recordHistory({
            title: pending.os ? 'Operating system update' : 'App updates',
            version: pending.os || apps.map(a => a.version).join(', '),
            type: pending.os ? 'os' : 'apps',
            status: 'installed',
            details: apps.map(a => a.name + ' ' + a.version).join(', ')
        });

        clearPending();
        setState({ status: 'restarting', message: 'Restarting…', progress: 1 });
        return { activated };
    }

    // ---- lifecycle ----

    function init() {
        // The version of the operating system that is running right now.
        currentCoreVersion().then(v => { if (v) setState({ osCurrent: v }); });

        // The service worker reports the progress of the core download.
        try {
            navigator.serviceWorker.addEventListener('message', (event) => {
                const data = event.data || {};
                if (data.type === 'core-progress' && data.total) {
                    const ratio = Math.max(0, Math.min(1, (data.done || 0) / data.total));
                    if (osDownloading || state.status === 'downloading') {
                        setState({ progress: Math.max(state.progress, ratio * 0.9) });
                    }
                }
            });
        } catch (e) { /* no service worker (tests) */ }

        if (firstCheckTimer) clearTimeout(firstCheckTimer);
        firstCheckTimer = setTimeout(() => {
            if (autoCheckEnabled()) check({ manual: false });
        }, FIRST_CHECK_MS);

        if (timer) clearInterval(timer);
        timer = setInterval(() => {
            if (autoCheckEnabled() && !busy) check({ manual: false });
        }, AUTO_CHECK_MS);

        // A pending update is applied at the next start.
        try {
            const pending = readPending();
            if (pending && (pending.os || (pending.apps && pending.apps.length))) {
                setState({ status: 'ready', message: 'Restart to finish installing', osVersion: pending.os || '' });
            }
        } catch (e) { /* no pending update */ }
    }

    function destroy() {
        if (timer) { clearInterval(timer); timer = null; }
        if (firstCheckTimer) { clearTimeout(firstCheckTimer); firstCheckTimer = null; }
    }

    return {
        init, destroy, check, applyPending, restartNow,
        getState: snapshot, history, recordHistory,
        autoCheckEnabled, setAutoCheck,
        isBusy: () => busy,
        readPending
    };
})();

export default UpdateService;
