import Users from './users.js';
import Registry from './registry.js';

const SystemConfig = (() => {
    // The per-user settings live in the registry, in this profile's own hive
    // (HKCU\Software\Windows 12\Shell), so every profile has its own and the
    // Registry Editor shows them. The old per-user config.json is migrated
    // into it once.
    const USER_KEY = 'HKCU\\Software\\Windows 12\\Shell';

    // The legacy location, kept only for that one-time migration.
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


    // Touch devices get the on-screen keyboard out of the box (it replaces
    // the native iOS/Android keyboard); desktops default to off but can
    // opt in from Settings > System > Touch keyboard.
    const HAS_TOUCH = (typeof window !== 'undefined') &&
        (('ontouchstart' in window) || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0));

    // Custom image wallpaper: stored as a virtual-FS path array so the
    // object/data URL (session-only) is rebuilt from the file on every
    // boot. Fit keywords mirror Windows: fill=cover, fit=contain.
    const WALLPAPER_FITS = ['fill', 'fit', 'stretch', 'tile', 'center'];
    const WALLPAPER_MIME = {
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml'
    };
    let activeWallpaperURL = null;
    let activeWallpaperPath = null;
    let wallpaperSeq = 0;

    function sanitizeWallpaperImage(v) {
        if (!Array.isArray(v) || v.length === 0) return null;
        if (!v.every(s => typeof s === 'string' && s)) return null;
        return [...v];
    }

    function wallpaperMime(path) {
        const leaf = String((path && path[path.length - 1]) || '');
        const dot = leaf.lastIndexOf('.');
        const ext = (dot >= 0 ? leaf.slice(dot + 1) : '').toLowerCase();
        return WALLPAPER_MIME[ext] || null;
    }

    // Shell-owned read: wallpaper files live under /system/users/**, which
    // fsGuard denies to app-attributed callers (e.g. apply() re-running
    // while Settings is focused). Rendering OS chrome is shell work.
    const resolveWallpaperURL = asShell(async function resolveWallpaperURL(path) {
        try {
            const FileSystem = window._FileSystem;
            const clean = sanitizeWallpaperImage(path);
            const mime = clean && wallpaperMime(clean);
            if (!FileSystem || !clean || !mime) return null;
            let node = null;
            try { node = FileSystem.getNode(clean); } catch { return null; }
            if (!node || node.type !== 'file') return null;
            if (node.blobRef) {
                const blob = await FileSystem.readFileBlob(clean);
                if (!blob) return null;
                return URL.createObjectURL(blob);
            }
            const content = FileSystem.readFile(clean);
            if (content == null) return null;
            const text = String(content).trim();
            if (/^data:image\//i.test(text)) return text;
            if (mime === 'image/svg+xml') {
                return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text);
            }
            return null;
        } catch { return null; }
    });

    function setWallpaperImageProps(desktop, url, fit) {
        const f = WALLPAPER_FITS.includes(fit) ? fit : 'fill';
        desktop.style.backgroundImage = `url("${String(url).replace(/"/g, '%22')}")`;
        if (f === 'fill') {
            desktop.style.backgroundSize = 'cover';
            desktop.style.backgroundPosition = 'center';
            desktop.style.backgroundRepeat = 'no-repeat';
        } else if (f === 'fit') {
            desktop.style.backgroundSize = 'contain';
            desktop.style.backgroundPosition = 'center';
            desktop.style.backgroundRepeat = 'no-repeat';
        } else if (f === 'stretch') {
            desktop.style.backgroundSize = '100% 100%';
            desktop.style.backgroundPosition = 'center';
            desktop.style.backgroundRepeat = 'no-repeat';
        } else if (f === 'tile') {
            desktop.style.backgroundSize = 'auto';
            desktop.style.backgroundPosition = 'left top';
            desktop.style.backgroundRepeat = 'repeat';
        } else { // center
            desktop.style.backgroundSize = 'auto';
            desktop.style.backgroundPosition = 'center';
            desktop.style.backgroundRepeat = 'no-repeat';
        }
    }

    function clearWallpaperImageProps(desktop) {
        if (!desktop) return;
        desktop.style.backgroundImage = '';
        desktop.style.backgroundSize = '';
        desktop.style.backgroundPosition = '';
        desktop.style.backgroundRepeat = '';
    }

    function dropActiveWallpaperURL() {
        if (activeWallpaperURL && activeWallpaperURL.startsWith('blob:')) {
            try { URL.revokeObjectURL(activeWallpaperURL); } catch { /* noop */ }
        }
        activeWallpaperURL = null;
        activeWallpaperPath = null;
    }

    function samePath(a, b) {
        if (!a || !b || a.length !== b.length) return false;
        return a.every((s, i) => s === b[i]);
    }

    // Applies the configured image wallpaper to a desktop element.
    // Returns true when an image is configured; false when there is none.
    // The file is read only on cache miss (boot / path change) so routine
    // repaints never re-hit the FS — and never nag a consent dialog at an
    // unrelated focused app. A failed load keeps the stored path and the
    // gradient fallback (never wipes the user's setting on a transient
    // denial). Shared by apply() and VirtualDesktops.
    function applyImageWallpaper(desktop) {
        const path = sanitizeWallpaperImage(config.wallpaperImage);
        if (!path || !desktop) return false;
        if (activeWallpaperURL && samePath(activeWallpaperPath, path)) {
            setWallpaperImageProps(desktop, activeWallpaperURL, config.wallpaperFit);
            return true;
        }
        const mySeq = ++wallpaperSeq;
        resolveWallpaperURL(path).then(url => {
            if (mySeq !== wallpaperSeq) {
                if (url && url.startsWith('blob:')) {
                    try { URL.revokeObjectURL(url); } catch { /* noop */ }
                }
                return;
            }
            if (!url) return; // keep path + gradient; retry on next cache miss
            dropActiveWallpaperURL();
            activeWallpaperURL = url;
            activeWallpaperPath = [...path];
            setWallpaperImageProps(desktop, url, config.wallpaperFit);
        }).catch(() => { /* gradient fallback stays */ });
        return true;
    }

    function setWallpaperImage(path) {
        if (path === null || path === undefined) {
            config.wallpaperImage = null;
        } else {
            const clean = sanitizeWallpaperImage(path);
            if (!clean || !wallpaperMime(clean)) return false;
            config.wallpaperImage = clean;
        }
        wallpaperSeq++; // cancel any in-flight load from the old path
        save();
        apply();
        syncToFilesystem();
        return true;
    }

    function setWallpaperFit(fit) {
        if (!WALLPAPER_FITS.includes(fit)) return false;
        config.wallpaperFit = fit;
        save();
        apply();
        syncToFilesystem();
        return true;
    }

    // Display URL for previews/pickers (prefers the live cache so a
    // preview never re-hits the FS while another app is focused).
    function wallpaperImageURL() {
        const path = sanitizeWallpaperImage(config.wallpaperImage);
        if (path && activeWallpaperURL && samePath(activeWallpaperPath, path)) {
            return Promise.resolve(activeWallpaperURL);
        }
        return resolveWallpaperURL(path);
    }

    const defaults = {
        accentColor: '#0078D4',
        backgroundStyle: 'gradient',
        wallpaper: 'gradient',
        wallpaperImage: null,
        wallpaperFit: 'fill',
        taskbarOpacity: 85,
        taskbarPosition: 'bottom',
        // Taskbar grouping: 'always' (one button per app), 'never' (one button per window), 'whenFull' (group when taskbar overflows)
        taskbarGrouping: 'always',
        windowAnimation: true,
        showSeconds: false,
        userName: 'User',
        darkMode: true,
        scaling: 'auto',
        brightness: 80,
        nightLight: false,
        displayResolution: 'native',
        masterVolume: 75,
        soundEnabled: true,
        soundEventStyles: {
            error: 'on',
            warning: 'on',
            info: 'on',
            confirm: 'on',
            notification: 'on',
            login: 'on',
            logout: 'on',
            recycle: 'on',
            keyboard: 'on'
        },
        soundEventFiles: {
            error: null,
            warning: null,
            info: null,
            confirm: null,
            notification: null,
            login: null,
            logout: null,
            recycle: null,
            keyboard: null
        },
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
        cursorStyle: 'modern',
        // Windows Update checks for updates in the background. The user can
        // turn it off in Settings > Windows Update.
        autoCheckUpdates: true
    };

    let config = { ...defaults };
    let onConfigChange = null;
    let nativeWidth = window.innerWidth;
    let nativeHeight = window.innerHeight;

    // Device-level display settings (resolution and DPI scaling).
    // Unlike the rest of the config these are machine-wide, not per-profile:
    // they are stored in one global file so every profile — and the
    // login/lock screens, which render before any profile is active — share
    // them. Changing them is privileged (Settings raises a UAC prompt).
    const GLOBAL_KEYS = ['scaling', 'displayResolution'];
    let globalConfig = {
        scaling: defaults.scaling,
        displayResolution: defaults.displayResolution
    };

    // Gradient wallpapers, shared by apply() and the login/lock screens
    // (which mirror the administrator's personalization before any profile
    // is activated).
    const WALLPAPERS_DARK = {
        gradient: 'linear-gradient(135deg, #0a1628 0%, #1a1a3e 30%, #2d1b4e 60%, #0a1628 100%)',
        blue: 'linear-gradient(135deg, #001a33 0%, #003366 50%, #001a33 100%)',
        purple: 'linear-gradient(135deg, #1a0033 0%, #4a0080 50%, #1a0033 100%)',
        green: 'linear-gradient(135deg, #001a00 0%, #004d00 50%, #001a00 100%)',
        sunset: 'linear-gradient(135deg, #1a0a00 0%, #663300 30%, #cc6600 60%, #1a0a00 100%)',
        solid: '#1a1a2e'
    };
    const WALLPAPERS_LIGHT = {
        gradient: 'linear-gradient(135deg, #e8f0fe 0%, #d0e0f5 30%, #c5d5f0 60%, #e8f0fe 100%)',
        blue: 'linear-gradient(135deg, #e0f0ff 0%, #b0d4f1 50%, #e0f0ff 100%)',
        purple: 'linear-gradient(135deg, #f0e8ff 0%, #d5c0f0 50%, #f0e8ff 100%)',
        green: 'linear-gradient(135deg, #e8f5e8 0%, #c0e0c0 50%, #e8f5e8 100%)',
        sunset: 'linear-gradient(135deg, #fff5e8 0%, #f0d5b0 50%, #fff5e8 100%)',
        solid: '#e8e8f0'
    };

    function wallpaperGradient(style, isDark) {
        const table = isDark ? WALLPAPERS_DARK : WALLPAPERS_LIGHT;
        return table[style] || table.gradient;
    }

    // Read another profile's theme WITHOUT activating it. Used by the
    // login/lock screens, which dress themselves with the primary
    // administrator's personalization (shell read: /system/users is OS-only).
    const readThemeFor = asShell(function readThemeFor(userId) {
        const fallback = {
            accentColor: defaults.accentColor, backgroundStyle: 'gradient', darkMode: true,
            wallpaperImage: null, wallpaperFit: 'fill'
        };
        try {
            const FileSystem = window._FileSystem;
            const path = Users.userDataFor(userId, ['config.json']);
            if (FileSystem && FileSystem.itemExists(path)) {
                const cfg = JSON.parse(FileSystem.readFile(path) || '{}') || {};
                return {
                    accentColor: cfg.accentColor || defaults.accentColor,
                    backgroundStyle: cfg.backgroundStyle || 'gradient',
                    darkMode: cfg.darkMode !== false,
                    wallpaperImage: sanitizeWallpaperImage(cfg.wallpaperImage),
                    wallpaperFit: WALLPAPER_FITS.includes(cfg.wallpaperFit) ? cfg.wallpaperFit : 'fill'
                };
            }
        } catch (e) { /* defaults */ }
        return fallback;
    });


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
        loadGlobal();
        load();
    }

    // Foreground session changed: drop the previous profile's cached config
    // (and any live wallpaper URL) and reload this user's. main.js calls this
    // after Users.setCurrent().
    function activate() {
        nativeWidth = window.innerWidth;
        nativeHeight = window.innerHeight;
        wallpaperSeq++;                 // cancel any in-flight image load
        dropActiveWallpaperURL();
        config = { ...defaults };
        loadGlobal();                   // machine-wide display settings
        load();
    }

    function get(key) {
        if (key === 'userName') return displayName();
        if (isGlobalKey(key)) return globalConfig[key];
        return config[key];
    }

    function getAll() {
        // Global display keys overlay the per-user config so callers always
        // see the effective value, wherever it is stored.
        return { ...config, ...globalConfig, userName: displayName() };
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
        const res = globalConfig.displayResolution;
        if (!res || res === 'native') {
            return { width: nativeWidth, height: nativeHeight };
        }
        const parts = res.split('x');
        return { width: parseInt(parts[0]), height: parseInt(parts[1]) };
    }

    function applyResolution() {
        const root = document.documentElement;
        // Apple touch devices must never run under body zoom — it mis-sizes
        // iframe inner viewports in Safari (see iframeViewportFix.js).
        if (window._isAppleTouch) {
            root.style.setProperty('--res-scale', '1');
            return;
        }
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

    function isGlobalKey(key) {
        return GLOBAL_KEYS.includes(key);
    }

    function set(key, value) {
        if (key === 'userName') {
            renameAccountTo(value);
            return;
        }
        if (isGlobalKey(key)) {
            setGlobal(key, value);
            return;
        }
        config[key] = value;
        save();
        apply();
        syncToFilesystem();
    }

    function setMultiple(obj) {
        const rest = { ...(obj || {}) };
        // Machine-wide display keys never land in the per-user config.
        const globals = {};
        GLOBAL_KEYS.forEach(k => {
            if (Object.hasOwn(rest, k)) { globals[k] = rest[k]; delete rest[k]; }
        });
        if (Object.keys(globals).length > 0) setGlobals(globals);
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

    // Factory reset: reset ALL config including userName
    function factoryReset() {
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

        const wallpaperEl = document.getElementById('wallpaper') || document.getElementById('desktop');
        if (wallpaperEl) {
            const wallpapers = isDark ? WALLPAPERS_DARK : WALLPAPERS_LIGHT;
            // Gradient is always painted first: it is the plain-style
            // result and the letterbox backdrop behind a custom image.
            wallpaperEl.style.background = wallpapers[config.backgroundStyle] || wallpapers.gradient;
            if (sanitizeWallpaperImage(config.wallpaperImage)) {
                applyImageWallpaper(wallpaperEl);
            } else {
                config.wallpaperImage = null;
                wallpaperSeq++; // cancel any in-flight image load
                dropActiveWallpaperURL();
                clearWallpaperImageProps(wallpaperEl);
            }
        }

        if (onConfigChange) onConfigChange(getAll());
    }

    const syncToFilesystem = asShell(function syncToFilesystem() {
        try {
            // The per-user settings live in the registry, under this
            // profile's own hive (HKCU\Software\Windows 12\Shell) - so every
            // profile has its own, and the Registry Editor shows them.
            const persisted = { ...config };
            GLOBAL_KEYS.forEach(k => { delete persisted[k]; });
            Registry.setObject(USER_KEY, persisted, encodeValue);
        } catch (e) {}
    });

    // The value kinds and the way they come back: a number stays a number, a
    // boolean stays a boolean, an object is stored as JSON.
    function encodeValue(key, value) {
        if (value === null || value === undefined) return { kind: 'REG_SZ', data: '' };
        if (typeof value === 'number') return { kind: 'REG_DWORD', data: value };
        if (typeof value === 'boolean') return { kind: 'REG_SZ', data: value ? 'true' : 'false' };
        if (typeof value === 'object') return { kind: 'REG_SZ', data: JSON.stringify(value) };
        return { kind: 'REG_SZ', data: String(value) };
    }

    function decodeValue(key, raw) {
        const sample = defaults[key];
        if (raw === '' || raw === undefined || raw === null) {
            if (sample && typeof sample === 'object') return sample;
            return sample === undefined ? '' : sample;
        }
        if (typeof sample === 'boolean') return raw === 'true' || raw === '1';
        if (typeof sample === 'number') {
            const n = Number(raw);
            return Number.isFinite(n) ? n : sample;
        }
        if (sample && typeof sample === 'object') {
            try { return JSON.parse(raw); } catch { return sample; }
        }
        return String(raw);
    }

    const loadFromFilesystem = asShell(function loadFromFilesystem() {
        try {
            const stored = Registry.getObject(USER_KEY);
            const keys = Object.keys(stored);
            if (keys.length) {
                for (const key of keys) {
                    if (!Object.hasOwn(defaults, key)) continue;
                    config[key] = decodeValue(key, stored[key]);
                }
                config.wallpaperImage = sanitizeWallpaperImage(config.wallpaperImage);
                if (!WALLPAPER_FITS.includes(config.wallpaperFit)) config.wallpaperFit = 'fill';
                apply();
                return true;
            }

            // First run on the registry: move the old per-user file into
            // HKCU, once.
            const migrated = Registry.migrateOnce('config-to-hkcu', () => {
                const FileSystem = window._FileSystem;
                const path = configPath();
                if (!FileSystem || !FileSystem.itemExists(path)) return;
                const json = FileSystem.readFile(path);
                if (!json) return;
                const data = JSON.parse(json) || {};
                const moved = {};
                for (const key of Object.keys(data)) {
                    if (!Object.hasOwn(defaults, key)) continue;
                    if (GLOBAL_KEYS.includes(key)) continue;
                    moved[key] = data[key];
                }
                Registry.setObject(USER_KEY, moved, encodeValue);
            });
            if (migrated) {
                const stored = Registry.getObject(USER_KEY);
                for (const key of Object.keys(stored)) {
                    if (!Object.hasOwn(defaults, key)) continue;
                    config[key] = decodeValue(key, stored[key]);
                }
                config.wallpaperImage = sanitizeWallpaperImage(config.wallpaperImage);
                if (!WALLPAPER_FITS.includes(config.wallpaperFit)) config.wallpaperFit = 'fill';
                apply();
                return true;
            }
        } catch (e) { /* keep the defaults */ }
        return false;
    });

    function load() {
        loadFromFilesystem();
        healAccountName();
        syncToFilesystem();
        apply();
    }

    // ---------- machine-wide display settings ----------
    //
    // Resolution and DPI scaling belong to the device, not to a profile:
    // they live in one global file (outside the per-user config) so every
    // profile and the login/lock screens share them. main.js primes them
    // with initGlobal() before the first sign-in.

    // The machine-wide display settings live in HKLM, so they belong to the
    // device and not to a profile.
    const GLOBAL_KEY = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Video';

    function globalConfigPath() {
        return ['/', 'system', 'programs data', 'display', 'settings.json'];
    }

    const persistGlobal = asShell(function persistGlobal() {
        try {
            // The machine-wide display settings are a machine setting, so they
            // live in HKLM - not in a profile's hive.
            Registry.setObject(GLOBAL_KEY, globalConfig, (key, value) => ({
                kind: typeof value === 'number' ? 'REG_DWORD' : 'REG_SZ',
                data: value === null || value === undefined ? '' : String(value)
            }));
        } catch (e) { /* best effort */ }
    });

    const loadGlobalFromFilesystem = asShell(function loadGlobalFromFilesystem() {
        try {
            const stored = Registry.getObject(GLOBAL_KEY);
            const keys = Object.keys(stored);
            if (keys.length) {
                GLOBAL_KEYS.forEach(k => {
                    if (stored[k] !== undefined) globalConfig[k] = stored[k];
                });
                return true;
            }
            // First run on the registry: move the old device file into HKLM,
            // once.
            const migrated = Registry.migrateOnce('display-to-hklm', () => {
                const FileSystem = window._FileSystem;
                const path = globalConfigPath();
                if (!FileSystem || !FileSystem.itemExists(path)) return;
                const data = JSON.parse(FileSystem.readFile(path) || '{}') || {};
                const moved = {};
                GLOBAL_KEYS.forEach(k => { if (data[k] !== undefined) moved[k] = data[k]; });
                Registry.setObject(GLOBAL_KEY, moved);
            });
            if (migrated) {
                const stored = Registry.getObject(GLOBAL_KEY);
                GLOBAL_KEYS.forEach(k => {
                    if (stored[k] !== undefined) globalConfig[k] = stored[k];
                });
                return true;
            }
        } catch (e) { /* keep defaults */ }
        return false;
    });

    // Upgrade path: installs from before the display settings were global
    // stored them per profile. Adopt the primary administrator's values as
    // the machine-wide ones so the device doesn't jump back to defaults.
    const seedGlobalFromAdmin = asShell(function seedGlobalFromAdmin() {
        try {
            const FileSystem = window._FileSystem;
            const adminId = Users.primaryAdminId();
            if (!FileSystem || !adminId) return false;
            const path = Users.userDataFor(adminId, ['config.json']);
            if (!FileSystem.itemExists(path)) return false;
            const cfg = JSON.parse(FileSystem.readFile(path) || '{}') || {};
            let touched = false;
            GLOBAL_KEYS.forEach(k => {
                if (cfg[k] !== undefined) { globalConfig[k] = cfg[k]; touched = true; }
            });
            return touched;
        } catch (e) { return false; }
    });

    function loadGlobal() {
        if (!loadGlobalFromFilesystem()) {
            if (seedGlobalFromAdmin()) persistGlobal();
        }
    }

    // Scaling's zoom factor lives in its own module; nudge it after a global
    // scaling change (window._Scaling is wired in main.js).
    function notifyScaling(key) {
        if (key !== 'scaling') return;
        try { if (window._Scaling) window._Scaling.apply(); } catch (e) { /* not ready */ }
    }

    // Persist + apply a machine-wide display patch. This is the low-level
    // writer; the user-facing path is Settings, which raises UAC first.
    function setGlobals(patch) {
        let touched = false;
        GLOBAL_KEYS.forEach(k => {
            if (Object.hasOwn(patch, k)) { globalConfig[k] = patch[k]; touched = true; }
        });
        if (!touched) return false;
        persistGlobal();
        apply();
        notifyScaling('scaling');
        return true;
    }

    function setGlobal(key, value) {
        if (!isGlobalKey(key)) return false;
        return setGlobals({ [key]: value });
    }

    // Phase-1 boot (no profile yet): load the device display settings and
    // paint the resolution scale, so the boot/login/lock screens honour them.
    function initGlobal() {
        nativeWidth = window.innerWidth;
        nativeHeight = window.innerHeight;
        loadGlobal();
        applyResolution();
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
        init, initGlobal, activate, get, getAll, set, setMultiple, reset, factoryReset, apply, load, onChange,
        isGlobalKey, setGlobal, setGlobals, loadGlobal,
        get CONFIG_PATH() { return configPath(); },
        syncToFilesystem,
        setWallpaperImage, setWallpaperFit, applyImageWallpaper, wallpaperImageURL,
        wallpaperGradient, readThemeFor, resolveWallpaperURL, setWallpaperImageProps,
        getNativeWidth, getNativeHeight, getResolutionOptions, getCurrentResolution
    };
})();

export default SystemConfig;
