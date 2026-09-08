// Large-file backend for the virtual filesystem (IndexedDB).
// localStorage caps at ~5MB total for the whole origin; Blobs here live
// under the real origin quota (often GBs). Values are stored raw — no
// base64 inflation. All methods are async and fail honestly (reject/false)
// on quota errors or missing IndexedDB support.
const BlobStore = (() => {
    const DB_NAME = 'windows12-blobs';
    const STORE_NAME = 'files';
    let dbPromise = null;

    function open() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise(resolve => {
            try {
                if (!('indexedDB' in window)) { resolve(null); return; }
                const req = indexedDB.open(DB_NAME, 1);
                req.onupgradeneeded = () => {
                    if (!req.result.objectStoreNames.contains(STORE_NAME)) {
                        req.result.createObjectStore(STORE_NAME);
                    }
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => resolve(null);
                req.onblocked = () => resolve(null);
            } catch (e) {
                resolve(null);
            }
        });
        try {
            if (navigator.storage && navigator.storage.persist) {
                navigator.storage.persist().catch(() => { /* best effort */ });
            }
        } catch (e) { /* noop */ }
        return dbPromise;
    }

    function run(mode, op) {
        return open().then(db => {
            if (!db) throw new Error('blobstore-unavailable');
            return new Promise((resolve, reject) => {
                let tx;
                try {
                    tx = db.transaction(STORE_NAME, mode);
                } catch (e) {
                    reject(e);
                    return;
                }
                let req;
                try {
                    req = op(tx.objectStore(STORE_NAME));
                } catch (e) {
                    reject(e);
                    return;
                }
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error || new Error('blobstore-failed'));
            });
        });
    }

    function put(key, blob) {
        return run('readwrite', store => store.put(blob, key));
    }

    function get(key) {
        return run('readonly', store => store.get(key)).then(v => (v === undefined ? null : v));
    }

    function del(key) {
        return run('readwrite', store => store.delete(key));
    }

    return { open, put, get, del };
})();

export default BlobStore;
