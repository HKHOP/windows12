// Persistent storage backends for the virtual filesystem.
//
// The FileSystem module keeps the whole tree in memory and exposes a
// synchronous API; this module owns only the *persistence* of that tree and
// of the large ("blob") files, behind a small async interface:
//
//     id                       'opfs' | 'legacy'
//     limited                  true when the backend has a hard size cap
//     loadTree()               Promise<tree|null>
//     saveTree(tree)           Promise<boolean>
//     putBlob(ref, blob)       Promise<boolean>
//     getBlob(ref, type)       Promise<Blob|null>
//     delBlob(ref)             Promise<void>
//     storageInfo()            Promise<{ backend, localBytes, usage, quota }>
//
// Two backends exist:
//
//   opfs   — Origin Private File System (Chrome 86+/Firefox 111+/Safari
//            15.2+). The tree is one JSON snapshot; large files are real
//            files. Quota-based, so no 4.5MB ceiling. All I/O runs in a
//            dedicated worker (see opfsClient.js / opfsWorker.js) because
//            Safari before 26 only exposes OPFS writes through
//            createSyncAccessHandle(), which is worker-only.
//
//   legacy — the original localStorage tree + IndexedDB blob store. Used
//            automatically whenever OPFS is missing or unusable (old
//            browsers, Firefox/Safari Private Browsing, HTTP, CSP-blocked
//            workers). Behaviour here is unchanged from before OPFS.
//
// OPFS is preferred whenever the probe succeeds; existing legacy data is
// copied forward non-destructively, so the fallback path keeps working.
import BlobStore from './blobStore.js';
import OpfsClient from './opfsClient.js';

// --- legacy (localStorage + IndexedDB) --------------------------------------
const LEGACY_KEY = 'windows12-filesystem';
const LEGACY_BUDGET = Math.floor(4.5 * 1024 * 1024);

// --- OPFS layout (origin-private, invisible to the user) --------------------
//   w12/fs.json        the serialized tree snapshot (source of truth)
//   w12/blobs/<ref>    raw bytes for large files
const TREE_PATH = 'w12/fs.json';
const BLOBS_DIR = 'w12/blobs';
function blobPath(ref) {
    return BLOBS_DIR + '/' + ref;
}

const legacyBackend = {
    id: 'legacy',
    limited: true,

    async loadTree() {
        let saved = null;
        try { saved = localStorage.getItem(LEGACY_KEY); } catch (e) { /* storage disabled */ }
        if (!saved) return null;
        try {
            return JSON.parse(saved);
        } catch (e) {
            return null;
        }
    },

    async saveTree(tree) {
        try {
            localStorage.setItem(LEGACY_KEY, JSON.stringify(tree));
            return true;
        } catch (e) {
            console.error('FileSystem: localStorage save failed:', e.name);
            return false;
        }
    },

    async putBlob(ref, blob) {
        try {
            await BlobStore.put(ref, blob);
            const check = await BlobStore.get(ref);
            if (!check || check.size !== blob.size) {
                try { await BlobStore.del(ref); } catch (e2) { /* best effort */ }
                return false;
            }
            return true;
        } catch (e) {
            return false;
        }
    },

    async getBlob(ref) {
        try {
            return await BlobStore.get(ref);
        } catch (e) {
            return null;
        }
    },

    async delBlob(ref) {
        try { await BlobStore.del(ref); } catch (e) { /* best effort */ }
    },

    async storageInfo() {
        let localBytes = 0;
        try { localBytes = (localStorage.getItem(LEGACY_KEY) || '').length; } catch (e) { /* noop */ }
        return { backend: 'legacy', localBytes, usage: null, quota: null };
    }
};

// One-time, non-destructive copy of the localStorage tree into OPFS. Leaves
// the localStorage copy untouched so the legacy fallback still has data.
// Returns false only when the copy was needed and failed — the caller then
// keeps the legacy backend rather than showing an empty OPFS filesystem.
async function migrateLegacyTree() {
    try {
        const existing = await OpfsClient.stat(TREE_PATH);
        if (existing.exists) return true;
    } catch (e) {
        return false;
    }
    let legacy = null;
    try { legacy = localStorage.getItem(LEGACY_KEY); } catch (e) { legacy = null; }
    if (!legacy) return true; // nothing to migrate — OPFS starts fresh
    try {
        await OpfsClient.writeFile(TREE_PATH, legacy);
        return true;
    } catch (e) {
        return false;
    }
}

const opfsBackend = {
    id: 'opfs',
    limited: false,

    async loadTree() {
        let text;
        try {
            text = await OpfsClient.readText(TREE_PATH);
        } catch (e) {
            return null;
        }
        try {
            return JSON.parse(text);
        } catch (e) {
            return null;
        }
    },

    async saveTree(tree) {
        try {
            await OpfsClient.writeFile(TREE_PATH, JSON.stringify(tree));
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
            // Bytes written before the OPFS migration may still live only in
            // IndexedDB. Serve them and copy them forward for next time.
            const legacy = await legacyBackend.getBlob(ref);
            if (!legacy) return null;
            try {
                await OpfsClient.writeFile(blobPath(ref), legacy);
            } catch (e2) { /* serve from legacy this time */ }
            return legacy;
        }
    },

    async delBlob(ref) {
        try { await OpfsClient.removeEntry(blobPath(ref), false); } catch (e) { /* best effort */ }
        // Clear the legacy copy too so nothing can resurrect it.
        try { await BlobStore.del(ref); } catch (e) { /* best effort */ }
    },

    async storageInfo() {
        let localBytes = 0;
        try { localBytes = (localStorage.getItem(LEGACY_KEY) || '').length; } catch (e) { /* noop */ }
        return { backend: 'opfs', localBytes, usage: null, quota: null };
    }
};

// Chooses the backend for this session. Never throws: any probe failure
// (unsupported browser, private browsing, insecure context, blocked worker)
// falls back to the legacy backend.
async function select() {
    let ok = false;
    try {
        ok = await OpfsClient.probe();
    } catch (e) {
        ok = false;
    }
    if (!ok) return legacyBackend;

    // Ask for durable storage so the origin isn't evicted under pressure.
    try {
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { /* best effort */ });
    } catch (e) { /* noop */ }

    // Copy any existing legacy data forward. If that copy was needed but
    // failed (e.g. quota), stay on the legacy backend so the user still sees
    // their files instead of a fresh OPFS filesystem.
    if (!await migrateLegacyTree()) return legacyBackend;
    return opfsBackend;
}

export default { select, LEGACY_KEY, LEGACY_BUDGET };
