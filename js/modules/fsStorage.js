// Persistence for the virtual filesystem.
//
// The FileSystem module keeps the whole tree in memory and exposes a
// synchronous API; this module owns only the *persistence* of that tree and
// of the large ("blob") files, behind a small async interface:
//
//     id                       'opfs' | 'memory'
//     limited                  false for OPFS, true for the Live backend
//     loadTree()               Promise<tree|null>
//     saveTree(tree)           Promise<boolean>
//     putBlob(ref, blob)       Promise<boolean>
//     getBlob(ref, type)       Promise<Blob|null>
//     delBlob(ref)             Promise<void>
//     storageInfo()            Promise<{ backend, localBytes, usage, quota }>
//
// There are two backends:
//
//   opfs    the Origin Private File System (Chrome 86+ / Firefox 111+ /
//           Safari 15.2+) — the normal machine, everything persists.
//   memory  a Live session: the bootstrap in index.html found that this
//           browser cannot host the OS (no OPFS, no service worker, no
//           DecompressionStream, or no secure context) and the user chose to
//           run it anyway. Nothing is written to disk — the tree and the
//           blobs live in memory and a reload, restart or shutdown starts a
//           fresh machine, like a Live CD.
//
// OPFS layout (origin-private, invisible to the user):
//
//   w12/fs.json            the serialized tree snapshot (source of truth)
//   w12/blobs/<ref>       raw bytes for large user files
//   w12/core/<version>/…  the unpacked OS core (written by the service
//                          worker; the tree only *references* it, see
//                          js/modules/coreStore.js)
//
// All OPFS I/O runs in a dedicated worker (see opfsClient.js /
// opfsWorker.js) because Safari before 26 only exposes OPFS writes through
// createSyncAccessHandle(), which is worker-only.
import OpfsClient from './opfsClient.js';
import { coreFileUrl, liveMode } from './siteBase.js';

const TREE_PATH = 'w12/fs.json';
const BLOBS_DIR = 'w12/blobs';

// Core files are addressed with a 'core/' prefix and live outside the user's
// blob area, so a factory reset of w12/blobs never touches the OS itself.
const CORE_PREFIX = 'core/';

function blobPath(ref) {
    if (String(ref).startsWith(CORE_PREFIX)) return 'w12/' + ref;
    return BLOBS_DIR + '/' + ref;
}

const opfsBackend = {
    id: 'opfs',
    limited: false,

    // Whether the snapshot is known to exist on disk. Once it does, every
    // save first checks that it is still there: a snapshot that vanished
    // means the browser storage was cleared under the running OS, and
    // rewriting it would resurrect the data the user just deleted. The save
    // then reports 'lost' and FileSystem starts over from the defaults.
    treeKnown: false,

    async loadTree() {
        let text;
        try {
            text = await OpfsClient.readText(TREE_PATH);
        } catch (e) {
            return null;
        }
        try {
            const tree = JSON.parse(text);
            this.treeKnown = true;
            return tree;
        } catch (e) {
            return null;
        }
    },

    async saveTree(tree) {
        try {
            if (this.treeKnown) {
                const probe = await OpfsClient.stat(TREE_PATH);
                if (probe && probe.exists === false) {
                    this.treeKnown = false;
                    return 'lost';
                }
            }
            await OpfsClient.writeFile(TREE_PATH, JSON.stringify(tree));
            this.treeKnown = true;
            return true;
        } catch (e) {
            console.error('FileSystem: OPFS save failed:', e && e.message);
            return false;
        }
    },

    async putBlob(ref, blob) {
        try {
            // Pass the Blob straight through: the worker writes its bytes
            // without this thread ever materializing them.
            await OpfsClient.writeFile(blobPath(ref), blob);
            const check = await OpfsClient.stat(blobPath(ref));
            if (!check.exists || check.size !== blob.size) {
                try { await OpfsClient.removeEntry(blobPath(ref), false); } catch (e2) { /* best effort */ }
                return false;
            }
            return true;
        } catch (e) {
            return false;
        }
    },

    async getBlob(ref, type) {
        try {
            const file = await OpfsClient.readFile(blobPath(ref));
            // OPFS files carry no MIME type; restore it from the tree node.
            return type && file.type !== type ? new Blob([file], { type }) : file;
        } catch (e) {
            return null;
        }
    },

    async delBlob(ref) {
        try { await OpfsClient.removeEntry(blobPath(ref), false); } catch (e) { /* best effort */ }
    },

    async readCoreText(ref) {
        try {
            return await OpfsClient.readText(blobPath(ref));
        } catch (e) {
            return null;
        }
    },

    async storageInfo() {
        let localBytes = 0;
        try {
            const text = await OpfsClient.readText(TREE_PATH);
            localBytes = text ? text.length : 0;
        } catch (e) { /* noop */ }
        return { backend: 'opfs', localBytes, usage: null, quota: null };
    }
};

// ---------------------------------------------------------------------------
// Live (in-memory) backend
// ---------------------------------------------------------------------------
//
// A Live session keeps the whole machine — tree and blobs — in memory. The
// OS core is not copied either: core files are read from the site itself, so
// a Live boot costs nothing but the page. There is no snapshot to load, so
// every start is a brand-new machine with the factory tree.
const LIVE_BLOB_LIMIT = 256 * 1024 * 1024;

// Reads a core file ('core/<version>/…'): from the site in a Live session,
// from OPFS otherwise. Returns null when the bytes are gone.
async function readCoreBlob(ref, type) {
    if (liveMode()) {
        try {
            const response = await fetch(coreFileUrl(ref), { cache: 'no-store' });
            if (!response.ok) return null;
            const blob = await response.blob();
            return type && blob.type !== type ? new Blob([blob], { type }) : blob;
        } catch (e) {
            return null;
        }
    }
    try {
        return await OpfsClient.readFile(blobPath(ref));
    } catch (e) {
        return null;
    }
}

const memoryBackend = {
    id: 'memory',
    limited: true,
    treeKnown: true,
    // ref -> Blob, and the bytes they cost (a Live session has no disk quota,
    // so the tab's memory is the ceiling).
    blobs: new Map(),
    bytes: 0,
    snapshotBytes: 0,

    async loadTree() {
        return null;
    },

    async saveTree(tree) {
        try { this.snapshotBytes = JSON.stringify(tree).length; } catch (e) { /* keep the last size */ }
        return true;
    },

    async putBlob(ref, blob) {
        if (!(blob instanceof Blob)) return false;
        if (this.bytes + blob.size > LIVE_BLOB_LIMIT) return false;
        const existing = this.blobs.get(ref);
        if (existing) this.bytes -= existing.size;
        this.blobs.set(ref, blob);
        this.bytes += blob.size;
        return true;
    },

    async getBlob(ref, type) {
        if (String(ref).startsWith(CORE_PREFIX)) return readCoreBlob(ref, type);
        const blob = this.blobs.get(ref);
        if (!blob) return null;
        return type && blob.type !== type ? new Blob([blob], { type }) : blob;
    },

    async delBlob(ref) {
        const blob = this.blobs.get(ref);
        if (!blob) return;
        this.bytes -= blob.size;
        this.blobs.delete(ref);
    },

    async readCoreText(ref) {
        const blob = await readCoreBlob(ref, '');
        if (!blob) return null;
        try { return await blob.text(); } catch (e) { return null; }
    },

    async storageInfo() {
        return {
            backend: 'memory',
            localBytes: this.snapshotBytes,
            usage: this.bytes,
            quota: LIVE_BLOB_LIMIT
        };
    }
};

let selected = null;

// Picks the backend. A Live boot (see index.html) always runs in memory. When
// the page is not Live but the OPFS probe fails anyway — private browsing, a
// blocked worker, an evicted store — the machine still starts, in memory,
// instead of showing a black screen.
async function select() {
    if (selected) return selected;

    if (liveMode()) {
        selected = memoryBackend;
        return selected;
    }

    let ok = false;
    try {
        ok = await OpfsClient.probe();
    } catch (e) {
        ok = false;
    }
    if (!ok) {
        selected = memoryBackend;
        return selected;
    }

    // Ask for durable storage so the origin isn't evicted under pressure.
    try {
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { /* best effort */ });
    } catch (e) { /* noop */ }

    selected = opfsBackend;
    return selected;
}

// Text of a file in the OS core ('core/<version>/…'), wherever this boot
// keeps it. Used by the \Windows mirror to read the builtin app manifests.
async function readCoreText(ref) {
    const backend = selected || opfsBackend;
    return backend.readCoreText(ref);
}

export default { select, blobPath, readCoreText, isLive: liveMode };
