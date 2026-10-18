import FsStorage from './fsStorage.js';

const FileSystem = (() => {
    let root = {};
    let saveTimeout = null;
    // Selected persistence backend: OPFS when the browser supports it,
    // otherwise the original localStorage + IndexedDB pair. Chosen in
    // init(); see fsStorage.js for the probe and the fallback rules.
    let backend = null;
    // Access policy hook (multi-user AppData model): main.js injects
    // FSGuard.check here. Denying a call makes it return the usual
    // null/false failure value without touching the tree.
    let accessChecker = null;
    // Stricter hook for MUTATING operations only: main.js injects
    // FSGuard.checkWrite, which reuses the read policy but additionally
    // requires elevation for protected zones (e.g. /Program Files). Reads
    // keep using accessChecker, so File Explorer can still browse.
    let writeChecker = null;
    const RECYCLE_BIN_PATH = ['/', 'system', '$Recycle.Bin'];
    // Legacy backend ceiling: localStorage caps the whole serialized tree at
    // ~5MB, so one huge file can't silently take every save down with it.
    // The OPFS backend is quota-based and ignores this.
    const STORAGE_BUDGET = FsStorage.LEGACY_BUDGET;

    function getDefaultFS() {
        return {
            type: 'folder',
            name: '/',
            children: {
                'system': {
                    type: 'folder',
                    name: 'system',
                    children: {
                        'config.json': { type: 'file', name: 'config.json', content: '{}', ext: 'json', modified: Date.now() },
                        '$Recycle.Bin': {
                            type: 'folder',
                            name: '$Recycle.Bin',
                            children: {}
                        },
                        'desktop-layout.json': { type: 'file', name: 'desktop-layout.json', content: '{}', ext: 'json', modified: Date.now() }
                    }
                },
                'users': {
                    type: 'folder',
                    name: 'users',
                    children: {
                        'default': {
                            type: 'folder',
                            name: 'default',
                            children: {
                                'Desktop': {
                                    type: 'folder',
                                    name: 'Desktop',
                                    children: {}
                                },
                                'Documents': {
                                    type: 'folder',
                                    name: 'Documents',
                                    children: {
                                        'Projects': {
                                            type: 'folder',
                                            name: 'Projects',
                                            children: {}
                                        }
                                    }
                                },
                                'Downloads': {
                                    type: 'folder',
                                    name: 'Downloads',
                                    children: {}
                                },
                                'Pictures': {
                                    type: 'folder',
                                    name: 'Pictures',
                                    children: {
                                        'Wallpapers': { type: 'folder', name: 'Wallpapers', children: {} },
                                        'Screenshots': { type: 'folder', name: 'Screenshots', children: {} }
                                    }
                                },
                                'Music': { type: 'folder', name: 'Music', children: {} },
                                'Videos': { type: 'folder', name: 'Videos', children: {} }
                            }
                        }
                    }
                },
                'programs data': {
                    type: 'folder',
                    name: 'programs data',
                    children: {}
                }
            }
        };
    }

    // Async: the OPFS backend must read the tree snapshot back before the
    // synchronous API can answer any query. Callers must await this before
    // touching the filesystem (main.js does).
    async function init() {
        backend = await FsStorage.select();
        const loaded = await backend.loadTree();
        if (loaded) {
            root = loaded;
        } else {
            root = getDefaultFS();
            persistTree();
        }
        // Flush pending saves when the page unloads so a quick refresh
        // right after a big write has the best chance of persisting.
        window.addEventListener('beforeunload', () => {
            try { persistTree(); } catch (e) { /* noop */ }
        });
        return backend.id;
    }

    // Persistence is asynchronous (the OPFS backend writes through a worker),
    // so the sync helpers below report whether a write was *queued*, not
    // whether the bytes reached disk. Use flushAsync() when you can await.
    function persistTree() {
        if (!backend) return Promise.resolve(false);
        return Promise.resolve(backend.saveTree(root)).catch(() => false);
    }

    function save(immediate = false) {
        if (immediate) {
            persistTree();
            return true;
        }
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            saveTimeout = null;
            persistTree();
        }, 500);
        return true;
    }

    // Write through now and resolve once the snapshot is persisted. Prefer
    // this before any deliberate reload (sign-out, restart, update).
    function flushAsync() {
        if (saveTimeout) {
            clearTimeout(saveTimeout);
            saveTimeout = null;
        }
        return persistTree();
    }

    // Fire-and-forget flush for the many existing synchronous callers.
    function flush() {
        flushAsync();
        return true;
    }

    function serializedSize() {
        try {
            return JSON.stringify(root).length;
        } catch (e) {
            return Infinity;
        }
    }

    // Pre-flight check before writing a large file. The OPFS backend is
    // quota-based and always reports fit; the legacy backend keeps its
    // ~4.5MB localStorage ceiling.
    function wouldFit(extraBytes) {
        if (backend && !backend.limited) return true;
        return serializedSize() + (extraBytes || 0) < STORAGE_BUDGET;
    }

    // Diagnostics for the storage UI: the backend's own footprint plus the
    // real origin usage/quota (which also covers every blob store).
    async function storageInfo() {
        let base = { backend: backend ? backend.id : 'legacy', localBytes: 0 };
        try {
            if (backend) base = await backend.storageInfo();
        } catch (e) { /* keep defaults */ }
        let usage = null, quota = null;
        try {
            if (navigator.storage && navigator.storage.estimate) {
                const est = await navigator.storage.estimate();
                if (est) {
                    usage = typeof est.usage === 'number' ? est.usage : null;
                    quota = typeof est.quota === 'number' ? est.quota : null;
                }
            }
        } catch (e) { /* noop */ }
        return { ...base, usage, quota };
    }

    function backendId() {
        return backend ? backend.id : 'legacy';
    }

    function getNode(path) {
        if (!path || path.length === 0) return root;
        // Accept both array paths (['/', 'users', ...]) and split key
        // strings ('/users/...' -> ['', 'users', ...]): skip separators
        // and empty segments so both forms resolve identically.
        const segments = typeof path === 'string' ? path.split('/') : path;
        let current = root;
        for (const segment of segments) {
            if (segment === '/' || segment === '') continue;
            if (current.type !== 'folder' || !current.children[segment]) {
                return null;
            }
            current = current.children[segment];
        }
        return current;
    }

    function getChildren(path) {
        const node = getNode(path);
        if (!node || node.type !== 'folder') return [];
        return Object.entries(node.children).map(([name, item]) => ({
            name,
            type: item.type,
            ext: item.ext || '',
            modified: item.modified || 0,
            size: item.size ?? (item.content ? item.content.length : 0),
            blob: !!item.blobRef
        }));
    }

    function createFolder(path, name) {
        const parent = getNode(path);
        if (!parent || parent.type !== 'folder') return false;
        if (parent.children[name]) return false;
        parent.children[name] = { type: 'folder', name, children: {} };
        save();
        return true;
    }

    function createFile(path, name, content = '', ext = '') {
        const parent = getNode(path);
        if (!parent || parent.type !== 'folder') return false;
        if (parent.children[name]) return false;
        parent.children[name] = { type: 'file', name, content, ext, modified: Date.now() };
        save();
        return true;
    }

    function readFile(path) {
        const node = getNode(path);
        if (!node || node.type !== 'file') return null;
        // Blob-backed files have no inline content — use readFileBlob().
        if (node.blobRef) return null;
        return node.content ?? null;
    }

    function isBlobFile(path) {
        const node = getNode(path);
        return !!node && node.type === 'file' && !!node.blobRef;
    }

    function dropBlob(ref) {
        if (!ref || !backend) return;
        Promise.resolve(backend.delBlob(ref)).catch(() => { /* best effort cleanup */ });
    }

    // Free every blob a node (or folder subtree) points at. Packages store
    // their files as blob nodes, so removing a folder must not leak bytes.
    function dropBlobsRecursive(item) {
        if (!item) return;
        if (item.blobRef) dropBlob(item.blobRef);
        if (item.type === 'folder' && item.children) {
            for (const child of Object.values(item.children)) dropBlobsRecursive(child);
        }
    }

    function newBlobRef() {
        return 'blob_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e9).toString(36);
    }

    // Store a large file (audio, video, images) as raw bytes in IndexedDB.
    // The tree keeps a tiny pointer, so the snapshot never sees the bulk.
    // The write is read back and verified — a success return means the bytes
    // were confirmed on disk, never just "sent and hoped".
    // Returns Promise<boolean>.
    async function writeFileBlob(path, name, blob, ext = '') {
        const parent = getNode(path);
        if (!parent || parent.type !== 'folder') return false;
        if (!(blob instanceof Blob)) return false;
        if (!backend) return false;
        const ref = newBlobRef();
        try {
            if (!await backend.putBlob(ref, blob)) return false;
        } catch (e) {
            return false;
        }
        const existing = parent.children[name];
        if (existing && existing.type === 'file' && existing.blobRef && existing.blobRef !== ref) {
            dropBlob(existing.blobRef);
        }
        parent.children[name] = { type: 'file', name, ext, modified: Date.now(), blobRef: ref, size: blob.size, blobType: blob.type || '' };
        save();
        return true;
    }

    async function readFileBlob(path) {
        const node = getNode(path);
        if (!node || node.type !== 'file' || !node.blobRef) return null;
        if (!backend) return null;
        let blob = null;
        try {
            blob = await backend.getBlob(node.blobRef, node.blobType || '');
        } catch (e) {
            blob = null;
        }
        // Heal the MIME type for blobs written before blobType was recorded.
        if (blob && blob.type && node.blobType !== blob.type) {
            node.blobType = blob.type;
            save();
        }
        return blob;
    }

    function writeFile(path, content) {
        const node = getNode(path);
        if (!node || node.type !== 'file') return false;
        node.content = content;
        node.modified = Date.now();
        save();
        return true;
    }

    function deleteItem(path) {
        if (path.length === 0) return false;
        const name = path[path.length - 1];
        const parentPath = path.slice(0, -1);
        const parent = getNode(parentPath);
        if (!parent || parent.type !== 'folder') return false;
        if (!parent.children[name]) return false;

        const item = parent.children[name];
        const timestamp = Date.now();
        const recycleName = `${name}_${timestamp}`;

        const recycleBin = getNode(RECYCLE_BIN_PATH);
        if (recycleBin && recycleBin.type === 'folder') {
            recycleBin.children[recycleName] = JSON.parse(JSON.stringify(item));
            recycleBin.children[recycleName].name = recycleName;
            recycleBin.children[recycleName].originalName = name;
            recycleBin.children[recycleName].originalPath = parentPath.join('/');
            recycleBin.children[recycleName].deletedAt = timestamp;
        }

        delete parent.children[name];
        save();
        return true;
    }

    function permanentDelete(path) {
        if (path.length === 0) return false;
        const name = path[path.length - 1];
        const parentPath = path.slice(0, -1);
        const parent = getNode(parentPath);
        if (!parent || parent.type !== 'folder') return false;
        if (!parent.children[name]) return false;
        const item = parent.children[name];
        dropBlobsRecursive(item);
        delete parent.children[name];
        save();
        return true;
    }

    function restoreFromRecycleBin(recycleBinName) {
        const recycleBin = getNode(RECYCLE_BIN_PATH);
        if (!recycleBin || !recycleBin.children[recycleBinName]) return false;

        const item = recycleBin.children[recycleBinName];
        const originalPath = item.originalPath ? item.originalPath.split('/').filter(p => p) : null;
        const originalName = item.originalName || recycleBinName;

        if (originalPath) {
            const targetParent = getNode(originalPath);
            if (targetParent && targetParent.type === 'folder') {
                const restored = JSON.parse(JSON.stringify(item));
                restored.name = originalName;
                delete restored.originalName;
                delete restored.originalPath;
                delete restored.deletedAt;
                targetParent.children[originalName] = restored;
            }
        }

        delete recycleBin.children[recycleBinName];
        save();
        return true;
    }

    function emptyRecycleBin() {
        const recycleBin = getNode(RECYCLE_BIN_PATH);
        if (!recycleBin) return false;
        Object.values(recycleBin.children).forEach(item => dropBlobsRecursive(item));
        recycleBin.children = {};
        save();
        return true;
    }

    function getRecycleBinContent() {
        const recycleBin = getNode(RECYCLE_BIN_PATH);
        if (!recycleBin) return [];
        return Object.entries(recycleBin.children).map(([key, item]) => ({
            name: item.originalName || item.name,
            type: item.type,
            ext: item.ext || '',
            modified: item.deletedAt || item.modified || 0,
            size: item.size ?? (item.content ? item.content.length : 0),
            recycleKey: key,
            originalPath: item.originalPath || ''
        }));
    }

    function renameItem(path, newName) {
        if (path.length === 0) return false;
        const oldName = path[path.length - 1];
        const parentPath = path.slice(0, -1);
        const parent = getNode(parentPath);
        if (!parent || parent.type !== 'folder') return false;
        if (!parent.children[oldName]) return false;
        if (parent.children[newName]) return false;
        const item = parent.children[oldName];
        item.name = newName;
        parent.children[newName] = item;
        delete parent.children[oldName];
        save();
        return true;
    }

    function moveItem(srcPath, destPath) {
        if (srcPath.length === 0 || destPath.length === 0) return false;
        const name = srcPath[srcPath.length - 1];
        const srcParentPath = srcPath.slice(0, -1);
        const srcParent = getNode(srcParentPath);
        const destParent = getNode(destPath);
        if (!srcParent || srcParent.type !== 'folder') return false;
        if (!destParent || destParent.type !== 'folder') return false;
        if (!srcParent.children[name]) return false;
        if (destParent.children[name]) return false;
        destParent.children[name] = srcParent.children[name];
        delete srcParent.children[name];
        save();
        return true;
    }

    function itemExists(path) {
        return getNode(path) !== null;
    }

    function isFolder(path) {
        if (!path || path.length === 0) return true;
        if (path.length === 1 && path[0] === '/') return true;
        const node = getNode(path);
        return node !== null && node.type === 'folder';
    }

    // Reset filesystem to factory default (used by factory reset)
    function resetToDefault() {
        root = getDefaultFS();
        save(true); // immediate persist
    }

    // ---------- access policy (set by main.js -> FSGuard.check) ----------

    function setAccessChecker(fn) {
        accessChecker = typeof fn === 'function' ? fn : null;
    }

    function setWriteChecker(fn) {
        writeChecker = typeof fn === 'function' ? fn : null;
    }

    function allowed(path) {
        try {
            return !accessChecker || accessChecker(path) !== false;
        } catch {
            return true; // a broken policy must not wedge the FS
        }
    }

    function writeAllowed(path) {
        try {
            return !writeChecker || writeChecker(path) !== false;
        } catch {
            return true;
        }
    }

    function renameTarget(path, newName) {
        return [...path.slice(0, -1), newName];
    }

    // A mutation must satisfy both policies (OS zones short-circuit on the
    // read policy before any elevation prompt is raised).
    function canWrite(path) {
        return allowed(path) && writeAllowed(path);
    }

    return { setAccessChecker, setWriteChecker, init, save, flush, flushAsync, backendId, serializedSize, wouldFit, storageInfo, STORAGE_BUDGET, resetToDefault,
        // Guarded public surface: every path-reaching operation consults the
        // access checker first. Internal implementations above stay unguarded
        // so shell internals (recycle bin bookkeeping, migrations) can't be
        // blocked by their own guard.
        getNode: (p) => allowed(p) ? getNode(p) : null,
        getChildren: (p) => allowed(p) ? getChildren(p) : [],
        readFile: (p) => allowed(p) ? readFile(p) : null,
        writeFile: (p, c) => canWrite(p) ? writeFile(p, c) : false,
        createFile: (p, n, c, e) => canWrite([...p, n]) ? createFile(p, n, c, e) : false,
        createFolder: (p, n) => canWrite([...p, n]) ? createFolder(p, n) : false,
        writeFileBlob: async (p, n, b, e) => canWrite([...p, n]) ? writeFileBlob(p, n, b, e) : false,
        readFileBlob: async (p) => allowed(p) ? readFileBlob(p) : null,
        isBlobFile: (p) => allowed(p) ? isBlobFile(p) : false,
        deleteItem: (p) => canWrite(p) ? deleteItem(p) : false,
        permanentDelete: (p) => canWrite(p) ? permanentDelete(p) : false,
        renameItem: (p, n) => (canWrite(p) && canWrite(renameTarget(p, n))) ? renameItem(p, n) : false,
        moveItem: (s, d) => (canWrite(s) && canWrite([...d, s[s.length - 1]])) ? moveItem(s, d) : false,
        itemExists: (p) => allowed(p) ? itemExists(p) : false,
        isFolder: (p) => allowed(p) ? isFolder(p) : false,
        restoreFromRecycleBin, emptyRecycleBin, getRecycleBinContent };
})();

window._FileSystem = FileSystem;

export default FileSystem;
