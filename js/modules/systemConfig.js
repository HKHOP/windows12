import Users from './users.js';

const SystemConfig = (() => {
    // Config is per-user, stored in the account's OS data. The legacy
    // global /system/config.json is migrated to the first account by
    // Users.init(); fileExplorer still references CONFIG_PATH (dynamic).
    function configPath() {
        return Users.userData(['config.json']);
    }

    // Shell-owned FS access: shield from fsGuard app attribution (config
    // writes triggered from an app like Settings are OS state, not the app's).
    function asShell(fn) {
        return (...args) => {
            const g = window._FSGuard;
            if (g) return g.asShell(fn)(...args);
            return fn(...args);
        };
    }

    function ensureParentDirs(path) {
        try {
            const FileSystem = window._FileSystem;
            if (!FileSystem) return;
            for (let i = 1; i <= path.length - 1; i++) {
                const partial = path.slice(0, i);
                if (!FileSystem.itemExists(partial)) {
                    FileSystem.createFolder(path.slice(0, i - 1), path[i - 1]);
                }
            }
        } catch (e) { /* best effort */ }
    }

    // Touch devices get the on-screen keyboard out of the box (it replaces
    // the native iOS/Android keyboard); desktops default to off but can
    // opt in from Settings > System > Touch keyboard.
    const HAS_TOUCH = (typeof window !== 'undefined') &&
        (('ontouchstart' in window) || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0));

    const defaults = {
        accentColor: '#0078D4',
        backgroundStyle: 'gradient',
        wallpaper: 'gradient',
        taskbarOpacity: 85,
        taskbarPosition: 'bottom',
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
        snapAuto: true,
        virtualTouchpadEnabled: false,
        touchpadSensitivity: 1.6,
        touchKeyboardEnabled: HAS_TOUCH,
        touchKeyboardAutoShow: true,
        touchKeyboardTrayButton: true,
        touchKeyboardBounds: null,
        // 'generic' = full keyboard (Esc/Ctrl/Alt/Tab row), 'simple' =
        // phone-style without them, null = auto (simple on touch hw).
        touchKeyboardMode: null,
        cursorTheme: 'default',
        cursorSize: 'normal',
        cursorStyle: 'modern'
    };

    let config = { ...defaults };
    let onConfigChange = null;
    let nativeWidth = window.innerWidth;
    let nativeHeight = window.innerHeight;

    // userName is a live alias of the signed-in account (Users is the
    // source of truth since multi-user). The cached config value is only
    // a fallback for contexts where Users isn't resolved yet.
    function accountName() {
        try {
            const u = Users.getCurrent();
            if (u && u.name) return u.name;
        } catch { /* Users not ready — use cache */ }
        return null;
    }

    function displayName() {
        return accountName() || config.userName || 'User';
    }

    function init() {
        nativeWidth = window.innerWidth;
        nativeHeight = window.innerHeight;
        load();
    }

    function get(key) {
        if (key === 'userName') return displayName();
        return config[key];
    }

    function getAll() {
        return { ...config, userName: displayName() };
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
        if (key === 'userName') {
            renameAccountTo(value);
            return;
        }
        config[key] = value;
        save();
        apply();
        syncToFilesystem();
    }

    function setMultiple(obj) {
        const rest = { ...(obj || {}) };
        if (Object.hasOwn(rest, 'userName')) {
            const name = rest.userName;
            delete rest.userName;
            Object.assign(config, rest);
            save();
            apply();
            syncToFilesystem();
            renameAccountTo(name);
            return;
        }
        Object.assign(config, rest);
        save();
        apply();
        syncToFilesystem();
    }

    // Route a display-name change through the account record (source of
    // truth) and keep the cached config value in step. Never calls set()
    // recursively — Users.renameAccount mirrors back to config.json via
    // plain FS, so there is no loop.
    function renameAccountTo(name) {
        const clean = String(name || '').trim();
        if (!clean) return;
        try {
            const cur = Users.getCurrent();
            if (cur && typeof Users.renameAccount === 'function') {
                Users.renameAccount(cur.id, clean);
            }
        } catch { /* keep cache-only */ }
        if (config.userName !== clean) {
            config.userName = clean;
            save();
            apply();
            syncToFilesystem();
        }
        try { window.dispatchEvent(new CustomEvent('user-info-changed')); } catch { /* noop */ }
    }

    function reset() {
        const keepName = config.userName;
        config = { ...defaults, userName: keepName };
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

        // Taskbar edge: bottom (default), top, left, right. Exposed as
        // html[data-taskbar] — all layout adapts via CSS attribute selectors.
        const validPositions = ['bottom', 'top', 'left', 'right'];
        const taskbarPosition = validPositions.includes(config.taskbarPosition)
            ? config.taskbarPosition
            : 'bottom';
        root.setAttribute('data-taskbar', taskbarPosition);

        if (config.brightness !== undefined) {
            document.body.style.filter = `brightness(${config.brightness / 100})`;
        }

        applyResolution();

        // Mouse cursor theme + size + style (real mouse via Cursor stylesheet,
        // virtual touchpad cursor via themed SVG). Guarded so config can
        // apply even if the Cursor module hasn't loaded yet.
        const cursorTheme = config.cursorTheme || 'default';
        const cursorSize = config.cursorSize || 'normal';
        const cursorStyle = config.cursorStyle || 'modern';
        root.setAttribute('data-cursor-theme', cursorTheme);
        root.setAttribute('data-cursor-size', cursorSize);
        root.setAttribute('data-cursor-style', cursorStyle);
        try {
            const C = window._Cursor;
            if (C && typeof C.applyFromConfig === 'function') {
                C.applyFromConfig(cursorTheme, cursorSize, cursorStyle);
            }
        } catch (e) { /* cursor applies on next boot / settings change */ }

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

        if (onConfigChange) onConfigChange(getAll());
    }

    const syncToFilesystem = asShell(function syncToFilesystem() {
        try {
            const FileSystem = window._FileSystem;
            if (FileSystem) {
                const json = JSON.stringify(config, null, 2);
                const path = configPath();
                ensureParentDirs(path);
                const parentPath = path.slice(0, -1);
                if (FileSystem.itemExists(path)) {
                    FileSystem.writeFile(path, json);
                } else {
                    FileSystem.createFile(parentPath, 'config.json', json, 'json');
                }
            }
        } catch (e) {}
    });

    const loadFromFilesystem = asShell(function loadFromFilesystem() {
        try {
            const FileSystem = window._FileSystem;
            const path = configPath();
            if (FileSystem && FileSystem.itemExists(path)) {
                const json = FileSystem.readFile(path);
                if (json) {
                    config = { ...defaults, ...JSON.parse(json) };
                    apply();
                    return true;
                }
            }
        } catch (e) {}
        return false;
    });

    function load() {
        loadFromFilesystem();
        healAccountName();
        syncToFilesystem();
        apply();
    }

    // One-time-per-boot convergence for pre-existing split-brain stores:
    // the account record and the cached config userName can disagree
    // (name set via legacy personalization after multi-user, or a rename
    // that persisted to only one store). Prefer whichever side holds a
    // real (non-default) name; the account wins ties.
    function healAccountName() {
        try {
            const acc = Users.getCurrent();
            const accName = acc && acc.name ? String(acc.name) : '';
            const cfgName = config.userName ? String(config.userName) : '';
            const accCustom = accName && accName !== 'User';
            const cfgCustom = cfgName && cfgName !== 'User';
            if (!accCustom && cfgCustom && acc) {
                try { Users.renameAccount(acc.id, cfgName); } catch { /* keep cache */ }
            } else if (accName && config.userName !== accName) {
                config.userName = accName;
            }
        } catch { /* keep whatever loaded */ }
    }

    function save() {
        syncToFilesystem();
    }

    function onChange(cb) {
        onConfigChange = cb;
    }

    return {
        init, get, getAll, set, setMultiple, reset, apply, load, onChange,
        get CONFIG_PATH() { return configPath(); },
        syncToFilesystem,
        getNativeWidth, getNativeHeight, getResolutionOptions, getCurrentResolution
    };
})();

export default SystemConfig;
