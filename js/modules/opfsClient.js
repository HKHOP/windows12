// Main-thread client for the OPFS worker (js/workers/opfsWorker.js).
//
// Owns a single dedicated worker and funnels every storage call through it
// with request/response ids. A worker-level failure (CSP blocks worker-src,
// spawn error, crash) permanently marks the client dead and rejects pending
// calls, so a broken worker surfaces as a clear error instead of hanging.
//
// Op surface mirrors the worker: writeFile / readFile / readText /
// removeEntry / stat / probe. All methods return Promises.
const OpfsClient = (() => {
    const WORKER_URL = new URL('../workers/opfsWorker.js', import.meta.url);

    let worker = null;
    let dead = false;
    let seq = 0;
    const pending = new Map();

    function fail(err) {
        dead = true;
        for (const entry of pending.values()) entry.reject(err);
        pending.clear();
        try { if (worker) worker.terminate(); } catch (e) { /* already gone */ }
        worker = null;
    }

    function ensureWorker() {
        if (dead) return null;
        if (worker) return worker;
        try {
            worker = new Worker(WORKER_URL);
        } catch (e) {
            dead = true;
            return null;
        }
        worker.onmessage = (e) => {
            const msg = e.data || {};
            const entry = pending.get(msg.id);
            if (!entry) return;
            pending.delete(msg.id);
            if (msg.ok) entry.resolve(msg.value);
            else entry.reject(Object.assign(new Error(msg.error || 'opfs-op-failed'), { name: msg.name || 'Error' }));
        };
        worker.onerror = () => fail(new Error('opfs-worker-error'));
        worker.onmessageerror = () => fail(new Error('opfs-worker-messageerror'));
        return worker;
    }

    function call(op, ...args) {
        const w = ensureWorker();
        if (!w) return Promise.reject(new Error('opfs-unavailable'));
        const id = ++seq;
        return new Promise((resolve, reject) => {
            pending.set(id, { resolve, reject });
            try {
                w.postMessage({ id, op, args });
            } catch (err) {
                pending.delete(id);
                reject(err);
            }
        });
    }

    function withTimeout(promise, ms) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('opfs-timeout')), ms);
            promise.then(
                (value) => { clearTimeout(timer); resolve(value); },
                (err) => { clearTimeout(timer); reject(err); }
            );
        });
    }

    // Capability probe: OPFS present, secure context, and a real
    // write/read/delete round-trip in the worker. Never throws, and never
    // hangs — a stalled worker is marked dead so the caller falls back.
    async function probe() {
        if (dead) return false;
        if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.getDirectory) return false;
        if (typeof isSecureContext !== 'undefined' && !isSecureContext) return false;
        try {
            return (await withTimeout(call('selftest'), 5000)) === true;
        } catch (e) {
            fail(new Error('opfs-probe-failed'));
            return false;
        }
    }

    return {
        probe,
        isDead: () => dead,
        writeFile: (path, data) => call('writeFile', path, data),
        readFile: (path) => call('readFile', path),
        readText: (path) => call('readText', path),
        removeEntry: (path, recursive) => call('removeEntry', path, recursive),
        stat: (path) => call('stat', path),
        terminate: () => fail(new Error('opfs-terminated'))
    };
})();

export default OpfsClient;
