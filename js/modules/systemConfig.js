const SystemConfig = (() => {
    const STORAGE_KEY = 'win12_config';
    const CONFIG_PATH = ['This PC', 'Documents', 'System', 'config.json'];

    const defaults = {
        accentColor: '#0078D4',
        backgroundStyle: 'gradient',
        wallpaper: 'gradient',
        taskbarOpacity: 85,
        windowAnimation: true,
        showSeconds: false,
        userName: 'User',
        darkMode: true
    };

    let config = { ...defaults };
    let onConfigChange = null;

    function init() {
        load();
    }

    function get(key) {
        return config[key];
    }

    function getAll() {
        return { ...config };
    }

    function set(key, value) {
        config[key] = value;
        save();
        apply();
        syncToFilesystem();
    }

    function setMultiple(obj) {
        Object.assign(config, obj);
        save();
        apply();
        syncToFilesystem();
    }

    function reset() {
        config = { ...defaults };
        save();
        apply();
        syncToFilesystem();
    }

    function apply() {
        const root = document.documentElement;
        root.style.setProperty('--accent-color', config.accentColor);

        const isDark = config.darkMode;
        root.setAttribute('data-theme', isDark ? 'dark' : 'light');

        const taskbar = document.getElementById('taskbar');
        if (taskbar) {
            const opacity = config.taskbarOpacity / 100;
            taskbar.style.background = isDark
                ? `rgba(32, 32, 32, ${opacity})`
                : `rgba(240, 240, 240, ${opacity})`;
        }

        const desktop = document.getElementById('desktop');
        if (desktop) {
            if (isDark) {
                const wallpapers = {
                    gradient: 'linear-gradient(135deg, #0a1628 0%, #1a1a3e 30%, #2d1b4e 60%, #0a1628 100%)',
                    blue: 'linear-gradient(135deg, #001a33 0%, #003366 50%, #001a33 100%)',
                    purple: 'linear-gradient(135deg, #1a0033 0%, #4a0080 50%, #1a0033 100%)',
                    green: 'linear-gradient(135deg, #001a00 0%, #004d00 50%, #001a00 100%)',
                    sunset: 'linear-gradient(135deg, #1a0a00 0%, #663300 30%, #cc6600 60%, #1a0a00 100%)',
                    solid: '#1a1a2e'
                };
                desktop.style.background = wallpapers[config.backgroundStyle] || wallpapers.gradient;
            } else {
                const wallpapers = {
                    gradient: 'linear-gradient(135deg, #e8f0fe 0%, #d0e0f5 30%, #c5d5f0 60%, #e8f0fe 100%)',
                    blue: 'linear-gradient(135deg, #e0f0ff 0%, #b0d4f1 50%, #e0f0ff 100%)',
                    purple: 'linear-gradient(135deg, #f0e8ff 0%, #d5c0f0 50%, #f0e8ff 100%)',
                    green: 'linear-gradient(135deg, #e8f5e8 0%, #c0e0c0 50%, #e8f5e8 100%)',
                    sunset: 'linear-gradient(135deg, #fff5e8 0%, #f0d5b0 50%, #fff5e8 100%)',
                    solid: '#e8e8f0'
                };
                desktop.style.background = wallpapers[config.backgroundStyle] || wallpapers.gradient;
            }
        }

        if (onConfigChange) onConfigChange(config);
    }

    function syncToFilesystem() {
        try {
            const FileSystem = window._FileSystem;
            if (FileSystem) {
                const json = JSON.stringify(config, null, 2);
                const parentPath = CONFIG_PATH.slice(0, -1);
                if (!FileSystem.itemExists(parentPath)) {
                    FileSystem.createFolder(['This PC', 'Documents'], 'System');
                }
                if (FileSystem.itemExists(CONFIG_PATH)) {
                    FileSystem.writeFile(CONFIG_PATH, json);
                } else {
                    FileSystem.createFile(parentPath, 'config.json', json, 'json');
                }
            }
        } catch (e) {}
    }

    function loadFromFilesystem() {
        try {
            const FileSystem = window._FileSystem;
            if (FileSystem && FileSystem.itemExists(CONFIG_PATH)) {
                const json = FileSystem.readFile(CONFIG_PATH);
                if (json) {
                    config = { ...defaults, ...JSON.parse(json) };
                    save();
                    apply();
                    return true;
                }
            }
        } catch (e) {}
        return false;
    }

    function loadFromStorage() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                config = { ...defaults, ...JSON.parse(stored) };
                return true;
            }
        } catch (e) {}
        return false;
    }

    function load() {
        if (!loadFromFilesystem()) {
            loadFromStorage();
        }
        syncToFilesystem();
        apply();
    }

    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
        } catch (e) {}
    }

    function onChange(cb) {
        onConfigChange = cb;
    }

    return { init, get, getAll, set, setMultiple, reset, apply, load, onChange, CONFIG_PATH, syncToFilesystem };
})();

export default SystemConfig;
