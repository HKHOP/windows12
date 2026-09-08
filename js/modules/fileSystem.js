import BlobStore from './blobStore.js';

const FileSystem = (() => {
    let root = {};
    let saveTimeout = null;
    const RECYCLE_BIN_PATH = ['/', 'system', '$Recycle.Bin'];
    const STORAGE_KEY = 'windows12-filesystem';
    // Stay under the typical ~5MB localStorage quota so one big file can
    // never silently fail to persist (and take the whole save down with it).
    const STORAGE_BUDGET = Math.floor(4.5 * 1024 * 1024);

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

    function init() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                root = JSON.parse(saved);
            } catch {
                root = getDefaultFS();
                save();
            }
        } else {
            root = getDefaultFS();
            save();
        }
        // Flush pending saves when the page unloads so a quick refresh
        // right after a big write can't lose it to the 500ms debounce.
        window.addEventListener('beforeunload', () => {
            try { flush(); } catch (e) { /* noop */ }
        });
    }

    function tryPersist() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
            return true;
        } catch (e) {
            console.error('FileSystem: Failed to save to localStorage:', e.name);
            return false;
        }
    }

    function save(immediate = false) {
        if (immediate) {
            return tryPersist();
        }
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            tryPersist();
            saveTimeout = null;
        }, 500);
        return true;
    }

    // Write through immediately and report whether it actually persisted.
    // Always use this after writing files larger than a few KB.
    function flush() {
        if (saveTimeout) {
            clearTimeout(saveTimeout);
            saveTimeout = null;
        }
        return tryPersist();
    }

    function serializedSize() {
        try {
            return JSON.stringify(root).length;
        } catch (e) {
            return Infinity;
        }
    }

    // Pre-flight check before writing a large file: estimates whether the
    // whole filesystem (plus extraBytes) still fits in the storage budget.
    function wouldFit(extraBytes) {
        return serializedSize() + (extraBytes || 0) < STORAGE_BUDGET;
    }

    // Diagnostics for the storage UI: localStorage footprint plus the real
    // origin usage/quota (covers IndexedDB blobs).
    async function storageInfo() {
        let localBytes = 0;
        try {
            localBytes = (localStorage.getItem(STORAGE_KEY) || '').length;
        } catch (e) { /* noop */ }
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
        return { localBytes, usage, quota };
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
        if (!ref) return;
        BlobStore.del(ref).catch(() => { /* best effort cleanup */ });
    }

    function newBlobRef() {
        return 'blob_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e9).toString(36);
    }

    // Store a large file (audio, video, images) as raw bytes in IndexedDB.
    // The tree keeps a tiny pointer, so localStorage never sees the bulk.
    // The write is read back and verified — a success return means the bytes
    // were confirmed on disk, never just "sent and hoped".
    // Returns Promise<boolean> — false means missing IDB support or quota.
    async function writeFileBlob(path, name, blob, ext = '') {
        const parent = getNode(path);
        if (!parent || parent.type !== 'folder') return false;
        if (!(blob instanceof Blob)) return false;
        const ref = newBlobRef();
        try {
            await BlobStore.put(ref, blob);
            const check = await BlobStore.get(ref);
            if (!check || check.size !== blob.size) {
                try { await BlobStore.del(ref); } catch (e2) { /* noop */ }
                return false;
            }
        } catch (e) {
            return false;
        }
        const existing = parent.children[name];
        if (existing && existing.type === 'file' && existing.blobRef && existing.blobRef !== ref) {
            dropBlob(existing.blobRef);
        }
        parent.children[name] = { type: 'file', name, ext, modified: Date.now(), blobRef: ref, size: blob.size };
        save();
        return true;
    }

    async function readFileBlob(path) {
        const node = getNode(path);
        if (!node || node.type !== 'file' || !node.blobRef) return null;
        try {
            return await BlobStore.get(node.blobRef);
        } catch (e) {
            return null;
        }
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
        if (item.blobRef) dropBlob(item.blobRef);
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
        Object.values(recycleBin.children).forEach(item => {
            if (item && item.blobRef) dropBlob(item.blobRef);
        });
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

    return { init, save, flush, serializedSize, wouldFit, storageInfo, getNode, getChildren, createFolder, createFile, readFile, writeFile, writeFileBlob, readFileBlob, isBlobFile, deleteItem, permanentDelete, restoreFromRecycleBin, emptyRecycleBin, getRecycleBinContent, renameItem, moveItem, itemExists, isFolder };
})();

window._FileSystem = FileSystem;

export default FileSystem;
