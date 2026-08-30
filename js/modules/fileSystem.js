const FileSystem = (() => {
    let root = {};

    function init() {
        root = {
            type: 'folder',
            name: 'This PC',
            children: {
                'Desktop': {
                    type: 'folder',
                    name: 'Desktop',
                    children: {
                        'New Folder': { type: 'folder', name: 'New Folder', children: {} },
                        'notes.txt': { type: 'file', name: 'notes.txt', content: 'Welcome to Windows 12!\nThis is a virtual filesystem.', ext: 'txt', modified: Date.now() },
                        'todo.txt': { type: 'file', name: 'todo.txt', content: '- Build OS\n- Add features\n- Have fun', ext: 'txt', modified: Date.now() }
                    }
                },
                'Documents': {
                    type: 'folder',
                    name: 'Documents',
                    children: {
                        'Projects': {
                            type: 'folder',
                            name: 'Projects',
                            children: {
                                'readme.txt': { type: 'file', name: 'readme.txt', content: 'Project files go here.', ext: 'txt', modified: Date.now() }
                            }
                        },
                        'report.txt': { type: 'file', name: 'report.txt', content: 'Quarterly Report\n================\n\nRevenue: $1,000,000\nExpenses: $500,000\nProfit: $500,000', ext: 'txt', modified: Date.now() },
                        'budget.txt': { type: 'file', name: 'budget.txt', content: 'Budget Plan\n-----------\nMarketing: $10,000\nDevelopment: $25,000\nOperations: $15,000', ext: 'txt', modified: Date.now() },
                        'meeting-notes.txt': { type: 'file', name: 'meeting-notes.txt', content: 'Meeting Notes - Aug 30\n======================\n- Discussed roadmap\n- Assigned tasks\n- Next meeting: Friday', ext: 'txt', modified: Date.now() }
                    }
                },
                'Downloads': {
                    type: 'folder',
                    name: 'Downloads',
                    children: {
                        'setup-guide.txt': { type: 'file', name: 'setup-guide.txt', content: 'Setup Guide\n===========\n1. Extract files\n2. Run installer\n3. Follow prompts', ext: 'txt', modified: Date.now() },
                        'changelog.txt': { type: 'file', name: 'changelog.txt', content: 'v1.0.0 - Initial release\nv1.0.1 - Bug fixes\nv1.1.0 - New features', ext: 'txt', modified: Date.now() }
                    }
                },
                'Pictures': {
                    type: 'folder',
                    name: 'Pictures',
                    children: {
                        'Wallpapers': { type: 'folder', name: 'Wallpapers', children: {} },
                        'Screenshots': { type: 'folder', name: 'Screenshots', children: {} }
                    }
                },
                'Music': {
                    type: 'folder',
                    name: 'Music',
                    children: {}
                },
                'Videos': {
                    type: 'folder',
                    name: 'Videos',
                    children: {}
                }
            }
        };
    }

    function getNode(path) {
        if (!path || path.length === 0) return root;
        let current = root;
        for (const segment of path) {
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
        return true;
    }

    function createFile(path, name, content = '', ext = '') {
        const parent = getNode(path);
        if (!parent || parent.type !== 'folder') return false;
        if (parent.children[name]) return false;
        parent.children[name] = { type: 'file', name, content, ext, modified: Date.now() };
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
        return true;
    }

    function deleteItem(path) {
        if (path.length === 0) return false;
        const name = path[path.length - 1];
        const parentPath = path.slice(0, -1);
        const parent = getNode(parentPath);
        if (!parent || parent.type !== 'folder') return false;
        if (!parent.children[name]) return false;
        delete parent.children[name];
        return true;
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
        return true;
    }

    function itemExists(path) {
        return getNode(path) !== null;
    }

    function isFolder(path) {
        const node = getNode(path);
        return node !== null && node.type === 'folder';
    }

    return { init, getNode, getChildren, createFolder, createFile, readFile, writeFile, deleteItem, renameItem, itemExists, isFolder };
})();

export default FileSystem;
