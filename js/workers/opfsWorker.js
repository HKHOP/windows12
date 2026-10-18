// OPFS worker — the only write path that works everywhere OPFS exists.
//
// Safari shipped OPFS reads in 15.2 but did not ship
// FileSystemFileHandle.createWritable() (main-thread async writes) until
// Safari 26, so the one write API common to every OPFS-capable browser
// (Chrome 102+, Firefox 111+, Safari 15.2+ — including every iOS browser,
// which is all WebKit) is createSyncAccessHandle(), and the spec exposes it
// only inside dedicated Web Workers. Every OPFS byte the OS persists
// therefore goes through this file.
//
// This is intentionally a classic (not module) worker: it has no imports,
// and classic workers are supported by every browser in our compatibility
// floor (module workers only reached Firefox in 114).
//
// Protocol: the main thread posts { id, op, args }. We answer with
// { id, ok: true, value } or { id, ok: false, error, name }. Ops run
// serialized through a promise chain so two handles to the same file can
// never interleave.
//
// Bytes move as Blob/File objects (structured-clone by reference), never as
// histograms of copied ArrayBuffers, so multi-hundred-MB media is not
// duplicated in JS memory.

const encoder = new TextEncoder();

let rootPromise = null;
function opfsRoot() {
    if (!rootPromise) rootPromise = navigator.storage.getDirectory();
    return rootPromise;
}

async function dirByParts(parts, create) {
    let dir = await opfsRoot();
    for (const part of parts) {
        dir = await dir.getDirectoryHandle(part, { create: !!create });
    }
    return dir;
}

// "a/b/c.txt" -> { dir: ['a','b'], name: 'c.txt' }
function splitPath(path) {
    const parts = String(path).split('/').filter(Boolean);
    const name = parts.pop();
    return { dir: parts, name };
}

async function fileByPath(path, create) {
    const { dir, name } = splitPath(path);
    const parent = await dirByParts(dir, create);
    return parent.getFileHandle(name, { create: !!create });
}

// data: string (text), Blob/File (raw bytes), or ArrayBuffer/TypedArray.
async function writeFile(path, data) {
    const handle = await fileByPath(path, true);
    const access = await handle.createSyncAccessHandle();
    try {
        let bytes;
        if (typeof data === 'string') bytes = encoder.encode(data);
        else if (data instanceof Blob) bytes = new Uint8Array(await data.arrayBuffer());
        else bytes = new Uint8Array(data);

        // Early Safari exposed truncate/write/flush/close as async; all
        // current implementations are synchronous. Awaiting a plain number
        // is harmless, so this shape is correct on both.
        await access.truncate(0);
        if (bytes.byteLength) await access.write(bytes, { at: 0 });
        await access.flush();
    } finally {
        await access.close();
    }
    return true;
}

// Returns a File (a Blob) — the browser keeps it backed by its own storage,
// so it never has to cross the boundary as a copied buffer.
async function readFile(path) {
    const handle = await fileByPath(path, false);
    return handle.getFile();
}

async function readText(path) {
    const handle = await fileByPath(path, false);
    return (await handle.getFile()).text();
}

async function removeEntry(path, recursive) {
    const { dir, name } = splitPath(path);
    try {
        const parent = await dirByParts(dir, false);
        await parent.removeEntry(name, { recursive: !!recursive });
        return true;
    } catch (e) {
        if (e && (e.name === 'NotFoundError' || e.name === 'TypeError')) return false;
        throw e;
    }
}

async function stat(path) {
    try {
        const handle = await fileByPath(path, false);
        const file = await handle.getFile();
        return { exists: true, size: file.size, lastModified: file.lastModified };
    } catch (e) {
        return { exists: false };
    }
}

// Real write/read/delete probe — this is what detects Firefox Private
// Browsing (getDirectory throws) and any browser with no usable write path.
async function selftest() {
    const probe = '_opfs_probe_' + Math.random().toString(36).slice(2);
    const payload = 'w12:' + Date.now();
    await writeFile(probe, payload);
    const back = await readText(probe);
    await removeEntry(probe, false);
    return back === payload;
}

const OPS = { writeFile, readFile, readText, removeEntry, stat, selftest };

let queue = Promise.resolve();
self.onmessage = (e) => {
    const { id, op, args } = e.data || {};
    queue = queue
        .then(() => {
            if (!Object.prototype.hasOwnProperty.call(OPS, op)) throw new Error('unknown-op:' + op);
            return OPS[op].apply(null, args || []);
        })
        .then(
            (value) => self.postMessage({ id, ok: true, value }),
            (err) => self.postMessage({
                id,
                ok: false,
                error: (err && err.message) || String(err),
                name: err && err.name
            })
        );
};
