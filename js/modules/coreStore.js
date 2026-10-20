// The OS core and the apps that ship with it.
//
// The operating system itself lives in the Origin Private File System, in
// w12/core/<version>/… — the service worker unpacks the core bundle there
// and serves it over the site URLs. Those bytes are the single source of
// truth for what the OS runs.
//
// This module brings that core into the virtual filesystem:
//
//   \Windows            a read-only mirror of the whole core, so the user
//                       can see the operating system's own files in File
//                       Explorer. It holds no bytes of its own: every entry
//                       points at the file the service worker installed.
//
//   \Program Files\<id> the builtin apps. They are ordinary app folders -
//                       a manifest plus code - exactly like an app the
//                       Store installed, so every app is launched the same
//                       way: from its own folder. The files point at the
//                       core, so nothing is copied.
//
// The \Windows mirror is read-only (fsGuard.js refuses every write). The
// builtin app folders are managed by the OS: they are refreshed at every
// boot and cannot be uninstalled.
import FileSystem from './fileSystem.js';
import OpfsClient from './opfsClient.js';
import { notifyTreeChanged } from './treeNotify.js';

// Where the read-only mirror lives in the virtual filesystem.
const TREE_ROOT = ['Windows'];

// Where the builtin apps live. It is the same place a Store app is
// installed for all users, because a builtin app IS installed for all users.
const APPS_ROOT = ['Program Files'];

// The core manifest is served by the service worker out of OPFS, so it always
// describes the core that is actually running — not a version some other
// worker may have installed in the meantime.
const MANIFEST_URL = new URL('../../core-manifest.json', import.meta.url).href;

let info = null;

function extOf(name) {
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(dot + 1) : '';
}

// Builds the folder/file skeleton for the mirror. Folders are plain tree
// nodes, files are blob references into the core area.
function buildChildren(paths, version, sizes) {
    const root = { children: {} };
    for (const rel of paths) {
        const parts = String(rel).split('/').filter(Boolean);
        if (!parts.length) continue;
        let node = root;
        for (let i = 0; i < parts.length - 1; i++) {
            const name = parts[i];
            if (!node.children[name]) node.children[name] = { type: 'folder', name, children: {} };
            node = node.children[name];
        }
        const name = parts[parts.length - 1];
        node.children[name] = {
            type: 'file', name, ext: extOf(name), modified: Date.now(),
            blobRef: 'core/' + version + '/' + parts.join('/'),
            size: (sizes && sizes[rel]) || 0, blobType: ''
        };
    }
    return root.children;
}

// True when the mirror already points at the given core version.
function isCurrent(version) {
    try {
        const node = FileSystem.getNode([...TREE_ROOT, 'js', 'main.js']);
        return !!node && node.blobRef === 'core/' + version + '/js/main.js';
    } catch (e) {
        return false;
    }
}

function asShell(fn) {
    const g = window._FSGuard;
    return g ? g.asShell(fn)() : fn();
}

// Writes the mirror into the tree. Runs as shell-owned work: it is an OS
// operation, never attributed to a focused app.
function sync(version, paths, sizes) {
    asShell(() => {
        if (!FileSystem.itemExists(TREE_ROOT)) {
            if (!FileSystem.createFolder(['/'], TREE_ROOT[0])) return;
        }
        FileSystem.setFolderContents(TREE_ROOT, buildChildren(paths, version, sizes));
    });
}

// The manifest of a builtin app, read from the core. It is written into the
// app folder as text, so the folder describes itself exactly like an
// installed app's folder does.
async function readCoreManifest(version, id) {
    try {
        const text = await OpfsClient.readText(`w12/core/${version}/js/apps/${id}/manifest.json`);
        const manifest = JSON.parse(text);
        if (!manifest || typeof manifest !== 'object') return null;
        if (typeof manifest.id !== 'string' || typeof manifest.name !== 'string') return null;
        return manifest;
    } catch (e) {
        return null;
    }
}

// Materializes the builtin apps as ordinary app folders under
// \Program Files. The files point at the core, so an app is never copied -
// and the folder is exactly what an installed app looks like, which means
// every app is launched the same way.
async function materializeApps(version, paths, sizes) {
    const ids = new Set();
    for (const rel of paths) {
        const m = /^js\/apps\/([^/]+)\//.exec(rel);
        if (m) ids.add(m[1]);
    }
    if (!ids.size) return;

    for (const id of ids) {
        const manifest = await readCoreManifest(version, id);
        if (!manifest) continue;

        const children = {};
        for (const rel of paths) {
            const prefix = 'js/apps/' + id + '/';
            if (!rel.startsWith(prefix)) continue;
            const parts = rel.slice(prefix.length).split('/').filter(Boolean);
            if (!parts.length) continue;
            let node = { children };
            for (let i = 0; i < parts.length - 1; i++) {
                const name = parts[i];
                if (!node.children[name]) node.children[name] = { type: 'folder', name, children: {} };
                node = node.children[name];
            }
            const name = parts[parts.length - 1];
            if (name === 'manifest.json') continue; // written as text below
            node.children[name] = {
                type: 'file', name, ext: extOf(name), modified: Date.now(),
                blobRef: 'core/' + version + '/' + rel,
                size: (sizes && sizes[rel]) || 0, blobType: ''
            };
        }
        children['manifest.json'] = {
            type: 'file', name: 'manifest.json', ext: 'json', modified: Date.now(),
            content: JSON.stringify(manifest, null, 4), size: 0, blobType: ''
        };

        const folder = [...APPS_ROOT, id];
        asShell(() => {
            if (!FileSystem.itemExists(APPS_ROOT)) {
                if (!FileSystem.createFolder(['/'], APPS_ROOT[0])) return;
            }
            if (!FileSystem.itemExists(folder)) {
                if (!FileSystem.createFolder(APPS_ROOT, id)) return;
            }
            FileSystem.setFolderContents(folder, children);
            // Mark it as part of the OS: it cannot be uninstalled.
            const node = FileSystem.getNode(folder);
            if (node) node.builtin = true;
        });
    }
}

// Reads the core manifest from the service worker and refreshes the mirror
// and the builtin app folders. Returns the core info, or null when no core
// is installed.
async function init() {
    let manifest = null;
    try {
        const response = await fetch(MANIFEST_URL, { cache: 'no-store' });
        if (response.ok) manifest = await response.json();
    } catch (e) {
        manifest = null;
    }
    if (!manifest || !manifest.version || !Array.isArray(manifest.paths)) return null;

    info = {
        version: manifest.version,
        files: manifest.files || manifest.paths.length,
        paths: manifest.paths,
        sizes: manifest.sizes || {}
    };

    if (!isCurrent(manifest.version)) sync(manifest.version, manifest.paths, manifest.sizes || {});
    await materializeApps(manifest.version, manifest.paths, manifest.sizes || {});
    // The worker serves app code out of the tree snapshot, so the new app
    // folders have to be on disk (and known to the worker) right away.
    await FileSystem.flushAsync();
    notifyTreeChanged();
    // The app catalog is built from the folders on disk, so it has to be
    // rebuilt now that the builtin apps have a home.
    try { window.dispatchEvent(new CustomEvent('apps-changed')); } catch (e) { /* noop */ }
    return info;
}

// True when the given path is inside the read-only OS core mirror.
function isCorePath(path) {
    const parts = Array.isArray(path) ? path.filter(p => p !== '/' && p !== '') : String(path || '').split('/');
    return parts[0] === TREE_ROOT[0];
}

function version() { return info ? info.version : null; }

export default { init, isCorePath, version, TREE_ROOT, APPS_ROOT };
