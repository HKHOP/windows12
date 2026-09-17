import FileSystem from './fileSystem.js';
import WindowManager from './windowManager.js';
import Popup from './popup.js';
import UIIcons from './uiIcons.js';

// FileAssociations — the complete "Open With" system.
//
// Two candidate tiers per extension:
//   handlers — manifest-declared (authoritative, wired by AppLoader), one
//              per extension via register()
//   viewers  — built-in fallbacks (Notepad/Photos/Terminal/Browser preview),
//              registered by File Explorer at boot via registerViewer()
//
// Plus persisted per-extension user defaults ("Always use this app") and
// the full Open With dialog. Resolution order: user default → manifest
// handler → first matching viewer.
//
// Display names/icons come from an injected provider (Taskbar sets it to
// AppMetadata) so this module never imports the taskbar graph (cycle).
const FileAssociations = (() => {
    const associations = new Map(); // ext -> { appId, openFn }
    const viewers = new Map();      // appId -> { extensions:Set, openFn }

    const DATA_DIR = ['/', 'system', 'programs data', 'fileAssociations'];
    const DEFAULTS_PATH = [...DATA_DIR, 'defaults.json'];

    let appInfoProvider = null;

    function setAppInfoProvider(fn) {
        appInfoProvider = fn;
    }

    function appInfo(appId) {
        try {
            if (appInfoProvider) {
                const info = appInfoProvider(appId) || {};
                return { name: info.name || appId, icon: info.icon || '' };
            }
        } catch { /* fall through */ }
        return { name: appId, icon: '' };
    }

    function register(appId, extensions, openFn) {
        extensions.forEach(ext => {
            associations.set(ext.toLowerCase(), { appId, openFn });
        });
    }

    function unregister(appId) {
        associations.forEach((val, key) => {
            if (val.appId === appId) associations.delete(key);
        });
        viewers.delete(appId);
        // Stale user defaults pointing at a removed app fall back cleanly.
        try {
            const defaults = readDefaults();
            let dirty = false;
            for (const ext of Object.keys(defaults)) {
                if (defaults[ext] === appId) {
                    delete defaults[ext];
                    dirty = true;
                }
            }
            if (dirty) writeDefaults(defaults);
        } catch { /* defaults unreadable — openDefault treats them as absent */ }
    }

    function registerViewer(appId, extensions, openFn) {
        viewers.set(appId, {
            extensions: new Set((extensions || []).map(e => String(e).toLowerCase())),
            openFn
        });
    }

    function getHandler(extension) {
        return associations.get(extension.toLowerCase()) || null;
    }

    function getViewers(extension) {
        const ext = extension.toLowerCase();
        const out = [];
        viewers.forEach((v, appId) => {
            if (v.extensions.has(ext)) out.push({ appId, openFn: v.openFn });
        });
        return out;
    }

    // Ordered open candidates for an extension: manifest handler first,
    // then matching built-in viewers. Each: { appId, kind, openFn }.
    function getCandidates(extension) {
        const ext = String(extension || '').toLowerCase();
        const list = [];
        const handler = associations.get(ext);
        if (handler) list.push({ appId: handler.appId, kind: 'handler', openFn: handler.openFn });
        for (const v of getViewers(ext)) {
            if (!list.some(c => c.appId === v.appId)) {
                list.push({ appId: v.appId, kind: 'viewer', openFn: v.openFn });
            }
        }
        return list;
    }

    // Every app that can open anything (for the dialog's "More apps").
    function getAllCapable() {
        const ids = new Set();
        associations.forEach(h => ids.add(h.appId));
        viewers.forEach((v, appId) => ids.add(appId));
        return [...ids];
    }

    // ---------- persisted user defaults ("Always use this app") ----------

    function ensureDir() {
        for (let i = 1; i <= DATA_DIR.length; i++) {
            const partial = DATA_DIR.slice(0, i);
            if (!FileSystem.itemExists(partial)) {
                FileSystem.createFolder(DATA_DIR.slice(0, i - 1), DATA_DIR[i - 1]);
            }
        }
    }

    function readDefaults() {
        try {
            const raw = FileSystem.readFile(DEFAULTS_PATH);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') return parsed;
            }
        } catch { /* corrupt -> empty */ }
        return {};
    }

    function writeDefaults(defaults) {
        try {
            ensureDir();
            const json = JSON.stringify(defaults);
            if (FileSystem.itemExists(DEFAULTS_PATH)) FileSystem.writeFile(DEFAULTS_PATH, json);
            else FileSystem.createFile(DATA_DIR, 'defaults.json', json, 'json');
        } catch { /* session-only */ }
    }

    function getDefault(extension) {
        const appId = readDefaults()[String(extension || '').toLowerCase()];
        if (!appId) return null;
        // A default whose app vanished (uninstalled) is treated as absent.
        if (!getCandidates(extension).some(c => c.appId === appId)) return null;
        return appId;
    }

    function setDefault(extension, appId) {
        const ext = String(extension || '').toLowerCase();
        if (!ext) return false;
        if (!getCandidates(ext).some(c => c.appId === appId)) return false;
        const defaults = readDefaults();
        defaults[ext] = appId;
        writeDefaults(defaults);
        return true;
    }

    function clearDefault(extension) {
        const ext = String(extension || '').toLowerCase();
        const defaults = readDefaults();
        if (defaults[ext]) {
            delete defaults[ext];
            writeDefaults(defaults);
            return true;
        }
        return false;
    }

    // ---------- opening ----------

    function openFile(path) {
        const ext = path[path.length - 1].split('.').pop().toLowerCase();
        const handler = associations.get(ext);
        if (!handler) return false;

        const content = FileSystem.readFile(path);
        if (content === null) return false;

        handler.openFn(path, content);
        return true;
    }

    // Resolve one candidate synchronously (no IO): user default first.
    function resolveCandidate(extension) {
        const ext = String(extension || '').toLowerCase();
        const candidates = getCandidates(ext);
        if (candidates.length === 0) return null;
        const def = getDefault(ext);
        if (def) {
            const match = candidates.find(c => c.appId === def);
            if (match) return match;
        }
        return candidates[0];
    }

    function fireCandidate(candidate, path, content) {
        try {
            candidate.openFn(path, content);
            return true;
        } catch (err) {
            console.error(`FileAssociations: ${candidate.appId} failed to open ${path[path.length - 1]}`, err);
            return false;
        }
    }

    // Open with the resolved default. Blob-backed files resolve to an
    // object URL; small files pass stored content. onOpened(appId) fires on
    // success (callers track recents there). Returns true when something
    // was (or is being) opened.
    function openDefault(path, onOpened) {
        const name = path[path.length - 1];
        const ext = getExtension(path);
        const candidate = resolveCandidate(ext);
        if (!candidate) return false;

        if (FileSystem.isBlobFile(path)) {
            FileSystem.readFileBlob(path).then(blob => {
                if (!blob) {
                    Popup.error('Open failed', `Could not read "${name}". The file data may be missing.`);
                    return;
                }
                if (fireCandidate(candidate, path, URL.createObjectURL(blob)) && onOpened) {
                    onOpened(candidate.appId);
                }
            });
            return true;
        }
        const content = FileSystem.readFile(path);
        if (content === null) {
            Popup.error('Open failed', `Could not read "${name}".`);
            return false;
        }
        if (!fireCandidate(candidate, path, content)) return false;
        if (onOpened) onOpened(candidate.appId);
        return true;
    }

    function openWith(path, appId, onOpened) {
        const ext = getExtension(path);
        const candidate = getCandidates(ext).find(c => c.appId === appId)
            || findAnyCandidate(appId);
        if (!candidate) return false;
        return openDefaultVia(candidate, path, onOpened);
    }

    function findAnyCandidate(appId) {
        const handler = [...associations.values()].find(h => h.appId === appId);
        if (handler) return { appId, kind: 'handler', openFn: handler.openFn };
        const viewer = viewers.get(appId);
        if (viewer) return { appId, kind: 'viewer', openFn: viewer.openFn };
        return null;
    }

    function openDefaultVia(candidate, path, onOpened) {
        const name = path[path.length - 1];
        if (FileSystem.isBlobFile(path)) {
            FileSystem.readFileBlob(path).then(blob => {
                if (!blob) {
                    Popup.error('Open failed', `Could not read "${name}". The file data may be missing.`);
                    return;
                }
                if (fireCandidate(candidate, path, URL.createObjectURL(blob)) && onOpened) {
                    onOpened(candidate.appId);
                }
            });
            return true;
        }
        const content = FileSystem.readFile(path);
        if (content === null) {
            Popup.error('Open failed', `Could not read "${name}".`);
            return false;
        }
        if (!fireCandidate(candidate, path, content)) return false;
        if (onOpened) onOpened(candidate.appId);
        return true;
    }

    // ---------- the Open With dialog ----------

    function esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Full UX: recommended apps, more-apps expander, "Always use this app",
    // single/double-click to open. onOpened(appId) fires on success.
    function openWithDialog(path, onOpened) {
        const name = path[path.length - 1];
        const ext = getExtension(path);
        const candidates = getCandidates(ext);
        const currentDefault = getDefault(ext);
        const moreIds = getAllCapable().filter(id => !candidates.some(c => c.appId === id));

        const rowHtml = (c, badge) => {
            const info = appInfo(c.appId);
            return `<div class="ow-app" data-app="${esc(c.appId)}" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;cursor:pointer;border:1px solid transparent;">
                <span style="width:24px;height:24px;display:inline-flex;flex-shrink:0;align-items:center;justify-content:center;">${info.icon}</span>
                <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;color:var(--text-primary);">${esc(info.name)}</span>
                ${badge ? `<span style="font-size:10px;color:var(--accent-color);border:1px solid var(--accent-color);border-radius:8px;padding:1px 7px;flex-shrink:0;">${badge}</span>` : ''}
            </div>`;
        };

        const html = `
            <div style="display:flex;flex-direction:column;height:100%;padding:16px;box-sizing:border-box;">
                <div style="font-size:13px;color:var(--text-primary);margin-bottom:4px;">How do you want to open <b>${esc(name)}</b>?</div>
                <div class="ow-list" style="flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:2px;margin:8px 0;">
                    ${candidates.length > 0
                        ? candidates.map(c => rowHtml(c,
                            c.appId === currentDefault ? 'Default'
                            : c.kind === 'handler' ? 'Recommended' : '')).join('')
                        : '<div style="font-size:12px;color:var(--text-secondary);padding:12px 4px;">No apps are registered for this file type.</div>'}
                    ${moreIds.length > 0 ? `
                        <div class="ow-more-toggle" style="font-size:12px;color:var(--accent-color);cursor:pointer;padding:8px 10px;">More apps &#9662;</div>
                        <div class="ow-more" style="display:none;flex-direction:column;gap:2px;">
                            ${moreIds.map(id => rowHtml({ appId: id, kind: 'viewer' }, '')).join('')}
                        </div>` : ''}
                </div>
                <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-primary);cursor:pointer;margin-bottom:12px;">
                    <input type="checkbox" class="ow-always" style="accent-color:var(--accent-color);"> Always use this app${ext ? ` for .${esc(ext)} files` : ''}
                </label>
                <div style="display:flex;justify-content:flex-end;gap:8px;">
                    <button class="ow-ok" style="padding:6px 24px;background:#0078D4;border:none;border-radius:4px;color:white;cursor:pointer;font-size:13px;font-weight:600;">OK</button>
                    <button class="ow-cancel" style="padding:6px 24px;background:rgba(255,255,255,0.08);border:1px solid var(--window-border);border-radius:4px;color:var(--text-primary);cursor:pointer;font-size:13px;">Cancel</button>
                </div>
            </div>
        `;

        const dlg = WindowManager.createWindow('fileExplorer', `Open ${name} with`, UIIcons.action('openWith', 16), html, {
            width: 400, height: 460, minWidth: 340, minHeight: 380, saveState: false
        });
        const el = dlg.element;
        let selected = candidates.length === 1 ? candidates[0].appId : null;
        const alwaysBox = el.querySelector('.ow-always');

        const paint = () => {
            el.querySelectorAll('.ow-app').forEach(row => {
                const on = row.dataset.app === selected;
                row.style.background = on ? 'rgba(0,120,212,0.2)' : '';
                row.style.borderColor = on ? 'var(--accent-color)' : 'transparent';
            });
        };

        const choose = () => {
            if (!selected) return;
            if (alwaysBox.checked) setDefault(ext, selected);
            WindowManager.closeWindow(dlg.id);
            openWith(path, selected, onOpened);
        };

        el.querySelectorAll('.ow-app').forEach(row => {
            row.addEventListener('click', () => {
                selected = row.dataset.app;
                paint();
            });
            row.addEventListener('dblclick', () => {
                selected = row.dataset.app;
                paint();
                choose();
            });
        });

        const moreToggle = el.querySelector('.ow-more-toggle');
        if (moreToggle) {
            moreToggle.addEventListener('click', () => {
                const more = el.querySelector('.ow-more');
                const open = more.style.display !== 'none';
                more.style.display = open ? 'none' : 'flex';
                moreToggle.innerHTML = open ? 'More apps &#9662;' : 'Fewer apps &#9652;';
            });
        }

        el.querySelector('.ow-ok').addEventListener('click', choose);
        el.querySelector('.ow-cancel').addEventListener('click', () => WindowManager.closeWindow(dlg.id));
        paint();
    }

    function getExtension(path) {
        const name = path[path.length - 1];
        const dot = name.lastIndexOf('.');
        return dot > -1 ? name.slice(dot + 1).toLowerCase() : '';
    }

    function getSupportedExtensions() {
        return Array.from(associations.keys());
    }

    return {
        register, unregister, registerViewer, getHandler, getViewers,
        getCandidates, getAllCapable,
        getDefault, setDefault, clearDefault,
        setAppInfoProvider,
        openFile, openDefault, openWith, openWithDialog,
        getExtension, getSupportedExtensions
    };
})();

export default FileAssociations;
