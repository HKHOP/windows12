const FileSystem = (() => {
    let root = {};
    const RECYCLE_BIN_PATH = ['/', 'system', '$Recycle.Bin'];
    const STORAGE_KEY = 'windows12-filesystem';

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
    }

    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
        } catch (e) {
            console.error('FileSystem: Failed to save to localStorage:', e.name);
        }
    }

    function getNode(path) {
        if (!path || path.length === 0) return root;
        let current = root;
        for (const segment of path) {
            if (segment === '/') continue;
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
            size: item.content ? item.content.length : 0
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
        return node.content;
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
            recycleBin.children[recycleName].originalPath = path.join('/');
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
            size: item.content ? item.content.length : 0,
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

    function itemExists(path) {
        return getNode(path) !== null;
    }

    function isFolder(path) {
        if (!path || path.length === 0) return true;
        if (path.length === 1 && path[0] === '/') return true;
        const node = getNode(path);
        return node !== null && node.type === 'folder';
    }

    return { init, getNode, getChildren, createFolder, createFile, readFile, writeFile, deleteItem, permanentDelete, restoreFromRecycleBin, emptyRecycleBin, getRecycleBinContent, renameItem, itemExists, isFolder };
})();

window._FileSystem = FileSystem;

export default FileSystem;
