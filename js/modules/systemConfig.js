const SystemConfig = (() => {
    const CONFIG_PATH = ['/', 'system', 'config.json'];

    const defaults = {
        accentColor: '#0078D4',
        backgroundStyle: 'gradient',
        wallpaper: 'gradient',
        taskbarOpacity: 85,
        windowAnimation: true,
        showSeconds: false,
        userName: 'User',
        darkMode: true,
        scaling: 'auto',
        brightness: 80,
        nightLight: false,
        displayResolution: 'native',
        displayOrientation: 'landscape',
        masterVolume: 75,
        outputDevice: 'Speakers (Realtek Audio)',
        inputDevice: 'Microphone (Realtek Audio)',
        notificationAlerts: true,
        appNotifications: { 'File Explorer': true, 'Notepad': true, 'Settings': true, 'Task Manager': true },
        powerMode: 'balanced',
        screenTimeout: '5 minutes',
        sleepTimeout: '15 minutes',
        snapLayouts: true,
        snapBar: true,
        snapAuto: true
    };

    let config = { ...defaults };
    let onConfigChange = null;
    let nativeWidth = window.innerWidth;
    let nativeHeight = window.innerHeight;

    function init() {
        nativeWidth = window.innerWidth;
        nativeHeight = window.innerHeight;
        load();
    }

    function get(key) {
        return config[key];
    }

    function getAll() {
        return { ...config };
    }

    function getNativeWidth() { return nativeWidth; }
    function getNativeHeight() { return nativeHeight; }

    function getResolutionOptions() {
        const w = nativeWidth;
        const h = nativeHeight;
        const aspect = w / h;

        const commonResolutions = [
            [3840, 2160], [2560, 1440], [1920, 1200], [1920, 1080],
            [1600, 900], [1440, 900], [1366, 768], [1280, 720],
            [1024, 768], [800, 600]
        ];

        const options = [];
        let addedNative = false;

        for (const [cw, ch] of commonResolutions) {
            if (cw <= w && ch <= h) {
                const ratio = cw / ch;
                if (Math.abs(ratio - aspect) < 0.05) {
                    const label = `${cw}x${ch}`;
                    const isNative = cw === w && ch === h;
                    if (isNative) addedNative = true;
                    options.push({ width: cw, height: ch, label, isNative });
                }
            }
        }

        if (!addedNative) {
            options.unshift({ width: w, height: h, label: `${w}x${h}`, isNative: true });
        }

        if (options.length === 0) {
            options.push({ width: w, height: h, label: `${w}x${h}`, isNative: true });
        }

        return options;
    }

    function getCurrentResolution() {
        const res = config.displayResolution;
        if (!res || res === 'native') {
            return { width: nativeWidth, height: nativeHeight };
        }
        const parts = res.split('x');
        return { width: parseInt(parts[0]), height: parseInt(parts[1]) };
    }

    function applyResolution() {
        const root = document.documentElement;
        const target = getCurrentResolution();

        if (target.width === nativeWidth && target.height === nativeHeight) {
            root.style.setProperty('--res-scale', '1');
        } else {
            const scaleX = nativeWidth / target.width;
            const scaleY = nativeHeight / target.height;
            const scale = Math.min(scaleX, scaleY);
            root.style.setProperty('--res-scale', scale.toFixed(4));
        }
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

        if (config.brightness !== undefined) {
            document.body.style.filter = `brightness(${config.brightness / 100})`;
        }

        applyResolution();

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
                    // system folder should already exist
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
                    apply();
                    return true;
                }
            }
        } catch (e) {}
        return false;
    }

    function load() {
        loadFromFilesystem();
        syncToFilesystem();
        apply();
    }

    function save() {
        syncToFilesystem();
    }

    function onChange(cb) {
        onConfigChange = cb;
    }

    return {
        init, get, getAll, set, setMultiple, reset, apply, load, onChange,
        CONFIG_PATH, syncToFilesystem,
        getNativeWidth, getNativeHeight, getResolutionOptions, getCurrentResolution
    };
})();

export default SystemConfig;
