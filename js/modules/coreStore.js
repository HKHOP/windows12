// The OS core mirror.
//
// The operating system itself lives in the Origin Private File System, in
// w12/core/<version>/… — the service worker unpacks the core bundle there
// and serves it over the canonical site URLs. Those bytes are the single
// source of truth for what the OS runs.
//
// This module mirrors that directory into the virtual filesystem, under
// \Windows, so the user can see the operating system's own files in File
// Explorer. The mirror holds no bytes of its own: every entry is a pointer
// to the file the service worker installed, so the tree stays small and the
// contents are always exactly what runs.
//
// The mirror is read-only. Writes are refused by fsGuard.js (the whole
// \Windows subtree is a hard deny, not an elevation prompt), so the OS can
// never be edited from inside itself.
import FileSystem from './fileSystem.js';

// Where the mirror lives in the virtual filesystem.
const TREE_ROOT = ['Windows'];

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

// Reads the core manifest from the service worker and refreshes the mirror.
// Returns the core info, or null when no core is installed.
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
    return info;
}

// True when the given path is inside the read-only OS core mirror.
function isCorePath(path) {
    const parts = Array.isArray(path) ? path.filter(p => p !== '/' && p !== '') : String(path || '').split('/');
    return parts[0] === TREE_ROOT[0];
}

function version() { return info ? info.version : null; }

export default { init, isCorePath, version, TREE_ROOT };
