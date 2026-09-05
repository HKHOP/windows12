import AppIcons from './appIcons.js';

const UserActivity = (() => {
    const MAX_RECENT = 6;
    let recentFiles = [];
    let recentApps = [];
    const ACTIVITY_PATH = ['/', 'system', 'programs data', 'userActivity', 'activity.json'];

    function getFS() { return window._FileSystem; }

    function ensureDir(path) {
        const fs = getFS();
        for (let i = 1; i <= path.length - 1; i++) {
            const partial = path.slice(0, i);
            if (!fs.itemExists(partial)) {
                const parent = path.slice(0, i - 1);
                fs.createFolder(parent, path[i - 1]);
            }
        }
    }

    function readJson(path, fallback) {
        try {
            const fs = getFS();
            const raw = fs.readFile(path);
            if (raw) return JSON.parse(raw);
        } catch {}
        return fallback;
    }

    function writeJson(path, data) {
        const fs = getFS();
        ensureDir(path);
        const name = path[path.length - 1];
        const parent = path.slice(0, -1);
        const json = JSON.stringify(data);
        if (fs.itemExists(path)) {
            fs.writeFile(path, json);
        } else {
            fs.createFile(parent, name, json, 'json');
        }
    }

    function init() {
        load();
    }

    function trackFileOpen(filePath, fileName) {
        recentFiles = recentFiles.filter(f => f.path !== filePath.join('/'));
        recentFiles.unshift({
            path: filePath.join('/'),
            name: fileName,
            timestamp: Date.now()
        });
        if (recentFiles.length > MAX_RECENT) recentFiles.length = MAX_RECENT;
        save();
    }

    function trackAppOpen(appId) {
        recentApps = recentApps.filter(a => a.id !== appId);
        recentApps.unshift({
            id: appId,
            timestamp: Date.now()
        });
        if (recentApps.length > 3) recentApps.length = 3;
        save();
    }

    function getRecommended() {
        const items = [];

        recentFiles.forEach(f => {
            items.push({
                type: 'file',
                name: f.name,
                path: f.path,
                timestamp: f.timestamp,
                detail: timeAgo(f.timestamp)
            });
        });

        recentApps.forEach(a => {
            items.push({
                type: 'app',
                id: a.id,
                name: getAppName(a.id),
                timestamp: a.timestamp,
                detail: timeAgo(a.timestamp)
            });
        });

        items.sort((a, b) => b.timestamp - a.timestamp);
        return items.slice(0, MAX_RECENT);
    }

    function getAppName(id) {
        const names = {
            settings: 'Settings',
            notepad: 'Notepad',
            fileExplorer: 'File Explorer',
            photos: 'Photos',
            calendar: 'Calendar',
            calculator: 'Calculator',
            clock: 'Clock',
            paint: 'Paint',
            taskManager: 'Task Manager',
            browser: 'Browser'
        };
        return names[id] || id;
    }

    function getAppIcon(id) {
        return AppIcons.get(id);
    }

    function getFileIcon(name) {
        const ext = name.split('.').pop().toLowerCase();
        const icons = {
            txt: '📝', md: '📋', json: '⚙️', js: '📜',
            html: '🌐', css: '🎨', png: '🖼️', jpg: '🖼️'
        };
        return icons[ext] || '📄';
    }

    function timeAgo(ts) {
        const diff = Date.now() - ts;
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    }

    function save() {
        try {
            writeJson(ACTIVITY_PATH, { recentFiles, recentApps });
        } catch (e) {}
    }

    function load() {
        try {
            const data = readJson(ACTIVITY_PATH, { recentFiles: [], recentApps: [] });
            recentFiles = data.recentFiles || [];
            recentApps = data.recentApps || [];
        } catch (e) {}
    }

    return { init, trackFileOpen, trackAppOpen, getRecommended, getAppIcon, getFileIcon };
})();

export default UserActivity;
