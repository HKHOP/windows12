const UserActivity = (() => {
    const MAX_RECENT = 6;
    let recentFiles = [];
    let recentApps = [];

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
            photos: 'Photos'
        };
        return names[id] || id;
    }

    function getAppIcon(id) {
        const icons = {
            settings: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
            notepad: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="4" y="2" width="16" height="20" rx="2" fill="#1E88E5"/><rect x="7" y="6" width="10" height="1.5" rx="0.5" fill="white"/><rect x="7" y="9.5" width="8" height="1.5" rx="0.5" fill="white"/><rect x="7" y="13" width="10" height="1.5" rx="0.5" fill="white"/></svg>`,
            fileExplorer: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M3 7V17C3 18.1 3.9 19 5 19H19C20.1 19 21 18.1 21 17V9C21 7.9 20.1 7 19 7H11L9 5H5C3.9 5 3 5.9 3 7Z" fill="#FFC107"/><path d="M3 7H21V9H3V7Z" fill="#FFD54F"/></svg>`,
            photos: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" fill="#0078D4"/><circle cx="9" cy="10" r="2.5" fill="white"/><path d="M3 17L8 12L12 16L16 11L21 17V19C21 20.1 20.1 21 19 21H5C3.9 21 3 20.1 3 19V17Z" fill="white"/></svg>`
        };
        return icons[id] || `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="2" fill="#666"/></svg>`;
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
            localStorage.setItem('win12_recentFiles', JSON.stringify(recentFiles));
            localStorage.setItem('win12_recentApps', JSON.stringify(recentApps));
        } catch (e) {}
    }

    function load() {
        try {
            const files = localStorage.getItem('win12_recentFiles');
            const apps = localStorage.getItem('win12_recentApps');
            if (files) recentFiles = JSON.parse(files);
            if (apps) recentApps = JSON.parse(apps);
        } catch (e) {}
    }

    return { init, trackFileOpen, trackAppOpen, getRecommended, getAppIcon, getFileIcon };
})();

export default UserActivity;
