// Persistence for the virtual filesystem.
//
// The FileSystem module keeps the whole tree in memory and exposes a
// synchronous API; this module owns only the *persistence* of that tree and
// of the large ("blob") files, behind a small async interface:
//
//     id                       'opfs'
//     limited                  false (OPFS is quota-based, not size-capped)
//     loadTree()               Promise<tree|null>
//     saveTree(tree)           Promise<boolean>
//     putBlob(ref, blob)       Promise<boolean>
//     getBlob(ref, type)       Promise<Blob|null>
//     delBlob(ref)             Promise<void>
//     storageInfo()            Promise<{ backend, localBytes, usage, quota }>
//
// There is exactly one backend: the Origin Private File System (Chrome 86+ /
// Firefox 111+ / Safari 15.2+). The old localStorage + IndexedDB fallback has
// been removed — a browser without OPFS cannot run the OS.
//
// OPFS layout (origin-private, invisible to the user):
//
//   w12/fs.json            the serialized tree snapshot (source of truth)
//   w12/blobs/<ref>       raw bytes for large user files
//   w12/core/<version>/…  the unpacked OS core (written by the service
//                          worker; the tree only *references* it, see
//                          js/modules/coreStore.js)
//
// All I/O runs in a dedicated worker (see opfsClient.js / opfsWorker.js)
// because Safari before 26 only exposes OPFS writes through
// createSyncAccessHandle(), which is worker-only.
import OpfsClient from './opfsClient.js';

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
            return null;
        }
    },

    async delBlob(ref) {
        try { await OpfsClient.removeEntry(blobPath(ref), false); } catch (e) { /* best effort */ }
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

// OPFS is mandatory. The probe performs a real write/read/delete round-trip
// in the worker, so an unusable filesystem (private browsing, blocked worker,
// insecure context) is detected before the OS pretends to have a disk.
async function select() {
    let ok = false;
    try {
        ok = await OpfsClient.probe();
    } catch (e) {
        ok = false;
    }
    if (!ok) {
        throw new Error('Windows 12 needs the Origin Private File System, which this browser does not provide.');
    }

    // Ask for durable storage so the origin isn't evicted under pressure.
    try {
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { /* best effort */ });
    } catch (e) { /* noop */ }

    return opfsBackend;
}

export default { select, blobPath };
