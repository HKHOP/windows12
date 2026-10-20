// Package Installer — opens .msi / .w12pkg package files.
//
// A package is a ZIP with the same layout the Store downloads: manifest.json
// and the app at the archive root. The installer may add installer.json and
// an installer/ folder for branding, a custom UI, EULA, features and
// headless/silent behavior. See APP_DEVELOPMENT_GUIDE.md.
import * as sdk from '../../sdk/index.js';
import AppIcons from '../../modules/appIcons.js';
import Packages from '../../modules/packages.js';
import Permissions from '../../modules/permissions.js';
import FileSystem from '../../modules/fileSystem.js';
import AppLoader from '../../modules/appLoader.js';
import Popup from '../../modules/popup.js';
import Notifications from '../../modules/notifications.js';
import Users from '../../modules/users.js';
import Zip from '../../modules/zip.js';
import { MANIFEST_DEFAULTS, mergeConfig, normalizeConfig, resolveCreate } from '../../modules/shortcutConfig.js';
import { mountWizard } from './scripts/wizard.js';
import { mountHeadless } from './scripts/headless.js';
import { mountCustom } from './scripts/custom.js';
import { injectStyles } from './scripts/styles.js';

const APP_ID = 'packageInstaller';
const APP_NAME = 'Package Installer';
const { createApp } = sdk;

function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function fileNameOf(path) {
    if (Array.isArray(path)) return path[path.length - 1] || 'package';
    const parts = String(path || '').split(/[\\/]/);
    return parts[parts.length - 1] || 'package';
}

function userId() {
    const current = Users.getCurrent();
    return current ? current.id : 'default';
}

function describeError(error) {
    if (!error) return 'The package could not be opened.';
    if (error.code === 'corrupt') return 'This file is not a valid app package. It may be damaged or incomplete.';
    if (error.code === 'missing-manifest') return 'This package does not contain a manifest.json at its root.';
    if (error.code === 'builtin') return error.message;
    if (error.code === 'identity') return error.message;
    if (error.code === 'unsupported-schema') return error.message;
    if (error.code === 'elevationDenied') return 'Administrator approval was denied, so the app was not installed.';
    return error.message || 'The package could not be opened.';
}

async function readPackageBytes(path, content) {
    if (content instanceof Blob) {
        return new Uint8Array(await content.arrayBuffer());
    }
    if (typeof content === 'string' && content.startsWith('blob:')) {
        let response;
        try {
            response = await fetch(content);
        } finally {
            try { URL.revokeObjectURL(content); } catch (e) { /* already gone */ }
        }
        if (!response.ok) throw new Error('The package file could not be read.');
        return new Uint8Array(await response.arrayBuffer());
    }

    try {
        const blob = await FileSystem.readFileBlob(path);
        if (blob) return new Uint8Array(await blob.arrayBuffer());
    } catch (e) { /* fall through to text */ }

    let text = typeof content === 'string' ? content : '';
    if (!text) {
        try { text = FileSystem.readFile(path) || ''; } catch (e) { text = ''; }
    }
    if (!text) throw new Error('The package file is empty or unavailable.');
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
    return bytes;
}

// Defaults every non-interactive flow (headless/silent and custom UI) gets.
function defaultOptions(inspection, existing) {
    const conf = inspection.installer;
    let scope = existing ? existing.scope : (conf && conf.defaultScope) || 'user';
    if (conf && (conf.scope === 'user' || conf.scope === 'system')) scope = conf.scope;
    if (existing) scope = existing.scope;
    const features = conf ? conf.features.filter(f => f.required || f.default).map(f => f.id) : [];
    const fields = {};
    if (conf) {
        for (const field of conf.fields) {
            fields[field.id] = field.default !== undefined
                ? field.default
                : (field.type === 'checkbox' ? false : '');
        }
    }
    const shortcutConfig = mergeConfig(
        normalizeConfig(inspection.manifest.shortcuts, MANIFEST_DEFAULTS),
        conf && conf.shortcuts ? conf.shortcuts : null
    );
    return { scope, features, fields, shortcuts: resolveCreate(shortcutConfig) };
}

function createSession({ app, win, bytes, inspection, existing, sourceName }) {
    const urls = new Set();
    const byPath = new Map(inspection.files.map(f => [f.path.toLowerCase(), f]));
    const assetCache = new Map();
    const moduleCache = new Map();
    const cleanups = [];
    let cancelled = false;
    let attempted = false;
    let disposed = false;

    const uid = userId();
    const id = inspection.manifest.id;
    const paths = {
        user: `\\Users\\${uid}\\AppData\\Programs\\${id}`,
        system: `\\Program Files\\${id}`
    };

    async function readEntry(path) {
        const file = byPath.get(String(path || '').toLowerCase());
        if (!file) return null;
        try {
            return await Zip.extractFile(bytes, file.entry);
        } catch (e) {
            return null;
        }
    }

    async function assetUrl(path) {
        if (!path) return null;
        const key = String(path).toLowerCase();
        if (assetCache.has(key)) return assetCache.get(key);
        const promise = (async () => {
            const data = await readEntry(path);
            if (!data) return null;
            const name = String(path).toLowerCase();
            let type = 'application/octet-stream';
            if (name.endsWith('.svg')) type = 'image/svg+xml';
            else if (name.endsWith('.png')) type = 'image/png';
            else if (name.endsWith('.jpg') || name.endsWith('.jpeg')) type = 'image/jpeg';
            else if (name.endsWith('.gif')) type = 'image/gif';
            else if (name.endsWith('.webp')) type = 'image/webp';
            else if (name.endsWith('.css')) type = 'text/css';
            else if (name.endsWith('.json')) type = 'application/json';
            const url = URL.createObjectURL(new Blob([data], { type }));
            urls.add(url);
            return url;
        })();
        assetCache.set(key, promise);
        return promise;
    }

    async function assetText(path) {
        const data = await readEntry(path);
        return data ? new TextDecoder().decode(data) : null;
    }

    async function moduleUrl(path) {
        const key = String(path).toLowerCase();
        if (moduleCache.has(key)) return moduleCache.get(key);
        const promise = (async () => {
            const data = await readEntry(path);
            if (!data) return null;
            const url = URL.createObjectURL(new Blob([data], { type: 'text/javascript' }));
            urls.add(url);
            return url;
        })();
        moduleCache.set(key, promise);
        return promise;
    }

    function dispose() {
        if (disposed) return;
        disposed = true;
        for (const fn of cleanups.splice(0)) {
            try { fn(); } catch (e) { /* cleanup is best-effort */ }
        }
        for (const url of urls) {
            try { URL.revokeObjectURL(url); } catch (e) { /* already gone */ }
        }
        urls.clear();
        assetCache.clear();
        moduleCache.clear();
    }

    async function install(options = {}) {
        if (attempted) throw new Error('An installation is already running in this window.');
        attempted = true;
        try {
            const result = await Packages.installArchive(bytes, {
                inspection,
                sourceName,
                scope: options.scope,
                features: options.features,
                fields: options.fields,
                shortcuts: options.shortcuts,
                allowReplace: options.allowReplace,
                isCancelled: () => cancelled,
                onProgress: options.onProgress
            });
            try { Permissions.grantAll(result.id); } catch (e) { /* consent UI already shown */ }
            return result;
        } finally {
            attempted = false;
        }
    }

    function notifyComplete(result) {
        const label = `${result.manifest.name} ${result.manifest.version}`;
        Notifications.action(APP_NAME, `${label} was ${result.updated ? 'updated' : 'installed'}.`, {
            appId: APP_ID,
            tag: `package-install-${result.id}`,
            actions: [
                { label: 'Open', value: 'open', primary: true },
                { label: 'Dismiss', value: 'dismiss' }
            ],
            onAction: (value) => {
                if (value === 'open') {
                    AppLoader.launchById(result.id).catch(() => {});
                }
            }
        });
    }

    function notifyError(name, error) {
        Notifications.info(APP_NAME, `${name} could not be installed: ${describeError(error)}`, {
            appId: APP_ID,
            tag: `package-install-${id}`,
            critical: true
        });
    }

    function notifyCancelled(name) {
        Notifications.info(APP_NAME, `${name} was not installed.`, {
            appId: APP_ID,
            tag: `package-install-${id}`
        });
    }

    return {
        app,
        win,
        bytes,
        inspection,
        existing,
        sourceName,
        userId: uid,
        paths,
        defaultOptions: defaultOptions(inspection, existing),
        assetUrl,
        assetText,
        assetBytes: readEntry,
        moduleUrl,
        importModule: moduleUrl,
        install,
        cancel: () => { cancelled = true; },
        isCancelled: () => cancelled,
        hasStartedInstall: () => attempted,
        close: () => { if (win) app.window.close(win.id); },
        setTitle: (title) => { if (win) app.window.setTitle(win.id, title); },
        launchInstalled: (appId) => { AppLoader.launchById(appId).catch(() => {}); },
        addCleanup: (fn) => { if (typeof fn === 'function') cleanups.push(fn); },
        dispose,
        notifyComplete,
        notifyError,
        notifyCancelled
    };
}

function reportOpenError(error) {
    if (error && error.cancelled) return;
    Popup.error('Cannot install this package', describeError(error));
}

async function runSilent(app, bytes, inspection, { sourceName, existing }) {
    const session = createSession({ app, win: null, bytes, inspection, existing, sourceName });
    try {
        const result = await session.install(defaultOptions(inspection, existing));
        session.notifyComplete(result);
    } catch (error) {
        if (error && error.cancelled) session.notifyCancelled(inspection.manifest.name);
        else session.notifyError(inspection.manifest.name, error);
    } finally {
        session.dispose();
    }
}

function openFromExplorer(host, session, sdkNamespace) {
    const inspection = session.inspection;
    const conf = inspection.installer;
    if (conf && conf.mode === 'headless') {
        return mountHeadless(host, session, session.defaultOptions);
    }
    if (conf && conf.ui) {
        return mountCustom(host, session, sdkNamespace).catch((error) => {
            if (session.hasStartedInstall()) throw error;
            Notifications.info(APP_NAME, 'The custom installer UI could not be loaded. Using the standard wizard.', {
                appId: APP_ID,
                tag: `package-ui-${inspection.manifest.id}`
            });
            host.replaceChildren();
            return mountWizard(host, session);
        });
    }
    return mountWizard(host, session);
}

/**
 * File-association entry: called with the file path and the content the File
 * Explorer read (a blob URL for binary files, inline text otherwise).
 */
async function open(path, content) {
    if (!path) return launch();
    let bytes;
    let inspection;
    try {
        bytes = await readPackageBytes(path, content);
        if (!(bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b)) {
            throw new Error('This file is not a ZIP-based app package (.msi / .w12pkg).');
        }
        inspection = await Packages.inspectArchive(bytes);
    } catch (error) {
        reportOpenError(error);
        return;
    }

    const sourceName = fileNameOf(path);
    const record = Packages.getRecord(inspection.manifest.id);
    // A package folder whose manifest cannot be parsed is still an install
    // record, but the wizard can't show update details for it. Let the
    // install pipeline report the unreadable install instead.
    const existing = record && record.manifest ? record : null;
    const app = createApp({ id: APP_ID, name: APP_NAME });
    injectStyles();

    if (inspection.installer && inspection.installer.mode === 'silent') {
        await runSilent(app, bytes, inspection, { sourceName, existing });
        return;
    }

    const title = inspection.installer && inspection.installer.mode === 'headless'
        ? `Installing ${inspection.manifest.name}`
        : `${inspection.manifest.name} Setup`;
    const win = app.window.create({
        title,
        icon: AppIcons.get(APP_ID),
        content: '<div class="pi-host" style="height:100%;min-height:0;display:flex;"></div>',
        width: 720,
        height: 540,
        minWidth: 400,
        minHeight: 380,
        saveState: false
    });

    const session = createSession({
        app,
        win,
        bytes,
        inspection,
        existing,
        sourceName
    });
    app.lifecycle.onWindowClose(win.id, () => {
        session.cancel();
        return true;
    });
    const onClosed = (event) => {
        if (!event.detail || event.detail.id !== win.id) return;
        window.removeEventListener('window-closed', onClosed);
        session.cancel();
        session.dispose();
    };
    window.addEventListener('window-closed', onClosed);

    const host = win.element.querySelector('.pi-host');
    try {
        await openFromExplorer(host, session, sdk);
    } catch (error) {
        if (!host.isConnected) return;
        session.dispose();
        reportOpenError(error);
        app.window.close(win.id);
    }
}

function launch() {
    const app = createApp({ id: APP_ID, name: APP_NAME });
    injectStyles();
    const win = app.window.create({
        title: APP_NAME,
        icon: AppIcons.get(APP_ID),
        content: `
            <div style="height:100%;box-sizing:border-box;padding:28px;display:flex;flex-direction:column;gap:12px;background:#202020;color:#fff;font-family:'Segoe UI Variable','Segoe UI',sans-serif;">
                <div style="display:flex;align-items:center;gap:14px;">
                    <div style="width:56px;height:56px;flex-shrink:0;">${AppIcons.get(APP_ID)}</div>
                    <div>
                        <div style="font-size:19px;font-weight:600;">${esc(APP_NAME)}</div>
                        <div style="font-size:12px;color:#9e9e9e;">Install .msi and .w12pkg app packages</div>
                    </div>
                </div>
                <p style="font-size:13px;line-height:1.55;color:#c9c9c9;margin:8px 0 0;">
                    Double-click a package file in File Explorer to start its setup wizard.
                    Developers can customize the wizard with <code style="font-family:Consolas,monospace;color:#8ecdf7;">installer.json</code>
                    and an optional <code style="font-family:Consolas,monospace;color:#8ecdf7;">installer/ui.js</code>.
                </p>
                <p style="font-size:12px;color:#8e8e8e;margin:0;">
                    Packages install per user by default; system-wide installs are available when the
                    installer allows it and require administrator approval.
                </p>
                <div style="margin-top:auto;display:flex;gap:8px;">
                    <button type="button" class="pi-empty-browse" style="background:#0078d4;border:none;color:#fff;border-radius:5px;padding:8px 16px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;">Open File Explorer</button>
                    <button type="button" class="pi-empty-close" style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.18);color:#fff;border-radius:5px;padding:8px 16px;font:inherit;font-size:13px;cursor:pointer;">Close</button>
                </div>
            </div>`,
        width: 560,
        height: 330,
        minWidth: 400,
        minHeight: 280
    });
    win.element.querySelector('.pi-empty-browse').addEventListener('click', () => {
        app.apps.launch('fileExplorer').catch((error) => {
            Popup.error(APP_NAME, error.message || 'File Explorer could not be opened.');
        });
    });
    win.element.querySelector('.pi-empty-close').addEventListener('click', () => {
        app.window.close(win.id);
    });
}

export default {
    launch,
    open,
    icon: () => AppIcons.get(APP_ID)
};
