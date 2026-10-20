import FileSystem from './fileSystem.js';

const Sounds = (() => {
    let ctx = null;
    let preloaded = false;
    const bufferCache = new Map();
    const customCache = new Map();

    // Schemes keep the presets' pitch intact and only change level and top-end
    // softness. Never pitch-shift a user's own file.
    const SCHEMES = {
        default: { label: 'Default', gain: 1, filter: 0 },
        soft: { label: 'Soft', gain: 0.7, filter: 2200 },
        classic: { label: 'Classic', gain: 0.9, filter: 6000 }
    };

    const EVENTS = {
        error: { label: 'Error', file: 'error.wav' },
        warning: { label: 'Warning', file: 'warning.wav' },
        info: { label: 'Information', file: 'info.wav' },
        confirm: { label: 'Confirmation', file: 'confirm.wav' },
        notification: { label: 'Notification', file: 'notification.wav' },
        login: { label: 'Sign in', file: 'login.wav' },
        logout: { label: 'Sign out', file: 'logout.wav' },
        recycle: { label: 'Recycle Bin', file: 'recycle.wav' },
        keyboard: { label: 'Keyboard click', file: 'keyboard.wav' },
        click: { label: 'UI click', hidden: true, file: 'click.wav' }
    };

    function getCtx() {
        if (ctx) {
            if (ctx.state === 'suspended') ctx.resume().catch(() => {});
            return ctx;
        }
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return null;
        try {
            ctx = new Ctor();
        } catch (e) {
            return null;
        }
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        return ctx;
    }

    function getConfig() {
        try {
            return (window.SystemConfig && window.SystemConfig.getAll()) || {};
        } catch (e) {
            return {};
        }
    }

    function getVolume() {
        const value = Number(getConfig().masterVolume);
        if (!Number.isFinite(value)) return 0.75;
        return Math.max(0, Math.min(1, value / 100));
    }

    function asShell(fn) {
        const guard = window._FSGuard;
        if (guard) return guard.asShell(fn)();
        return fn();
    }

    function assetUrl(file) {
        return new URL('../../assets/sounds/' + file, import.meta.url).href;
    }

    function loadBuffer(url) {
        if (bufferCache.has(url)) return bufferCache.get(url);
        const promise = (async () => {
            const c = getCtx();
            if (!c) return null;
            try {
                const res = await fetch(url);
                if (!res.ok) return null;
                return await c.decodeAudioData(await res.arrayBuffer());
            } catch (e) {
                return null;
            }
        })();
        bufferCache.set(url, promise);
        promise.then(buffer => { if (!buffer) bufferCache.delete(url); });
        return promise;
    }

    function loadCustomBuffer(path) {
        const node = asShell(() => FileSystem.getNode(path));
        if (!node || node.type !== 'file') return Promise.resolve(null);
        const key = path.join('/') + '|' + (node.modified || 0) + '|' + (node.size || 0);
        if (customCache.has(key)) return customCache.get(key);

        const promise = (async () => {
            const c = getCtx();
            if (!c) return null;
            try {
                let bytes = null;
                if (asShell(() => FileSystem.isBlobFile(path))) {
                    const blob = await asShell(() => FileSystem.readFileBlob(path));
                    if (!blob) return null;
                    bytes = await blob.arrayBuffer();
                } else {
                    const text = asShell(() => FileSystem.readFile(path));
                    if (!text || !/^data:audio\//i.test(text)) return null;
                    const res = await fetch(text);
                    bytes = await res.arrayBuffer();
                }
                return await c.decodeAudioData(bytes);
            } catch (e) {
                return null;
            }
        })();

        customCache.set(key, promise);
        promise.then(buffer => { if (!buffer) customCache.delete(key); });
        if (customCache.size > 12) customCache.delete(customCache.keys().next().value);
        return promise;
    }

    function playBuffer(buffer, gain, filterFreq) {
        const c = getCtx();
        if (!c || !buffer) return false;
        const source = c.createBufferSource();
        const volume = c.createGain();
        source.buffer = buffer;
        volume.gain.value = Math.max(0, Math.min(1, gain));

        let tail = source;
        if (filterFreq) {
            const filter = c.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = filterFreq;
            filter.Q.value = 0.5;
            tail.connect(filter);
            tail = filter;
        }
        tail.connect(volume);
        volume.connect(c.destination);
        source.start();
        return true;
    }

    function playPreset(event, scheme, volume) {
        void loadBuffer(assetUrl(event.file)).then(buffer => {
            if (buffer) playBuffer(buffer, volume * scheme.gain, scheme.filter);
        });
    }

    function playCustom(event, path, scheme, volume) {
        void loadCustomBuffer(path).then(buffer => {
            if (buffer) playBuffer(buffer, volume * Math.min(1, scheme.gain), scheme.filter);
            else playPreset(event, scheme, volume);
        });
    }

    // Play one system event. `force` is used by the Settings preview buttons so
    // a muted shell can still be auditioned without changing the setting.
    function play(id, force) {
        const event = EVENTS[id];
        if (!event) return false;

        const config = getConfig();
        if (!force && config.soundEnabled === false) return false;

        const styles = config.soundEventStyles || {};
        const style = styles[id] || 'scheme';
        if (style === 'off') return false;

        const schemeName = style === 'scheme' ? (config.soundScheme || 'default') : style;
        const scheme = SCHEMES[schemeName] || SCHEMES.default;
        const volume = getVolume();
        if (volume <= 0) return false;

        const files = config.soundEventFiles || {};
        const custom = Array.isArray(files[id]) ? files[id] : null;
        if (custom && asShell(() => FileSystem.itemExists(custom))) {
            playCustom(event, custom, scheme, volume);
        } else {
            playPreset(event, scheme, volume);
        }
        return true;
    }

    function preload() {
        if (preloaded) return;
        preloaded = true;
        Object.values(EVENTS).forEach(event => { void loadBuffer(assetUrl(event.file)); });
    }

    function events() {
        return Object.entries(EVENTS)
            .filter(([, event]) => !event.hidden)
            .map(([id, event]) => ({ id, label: event.label }));
    }

    function schemes() {
        return Object.entries(SCHEMES).map(([id, scheme]) => ({ id, label: scheme.label }));
    }

    const info = () => play('info');
    const warn = () => play('warning');
    const error = () => play('error');
    const confirm = () => play('confirm');
    const notification = () => play('notification');
    const login = () => play('login');
    const logout = () => play('logout');
    const recycleBin = () => play('recycle');
    const click = () => play('click');

    // Browsers only allow audio after a user gesture. Prime the context on the
    // first interaction, then decode the small preset set in the background so
    // notifications and sign-in sounds start without a fetch delay.
    if (typeof document !== 'undefined') {
        const unlock = () => {
            if (!getCtx()) return;
            setTimeout(preload, 250);
        };
        document.addEventListener('pointerdown', unlock, { once: true, capture: true, passive: true });
        document.addEventListener('keydown', unlock, { once: true, capture: true });
    }

    return {
        play, events, schemes,
        info, warn, error, confirm, notification,
        login, logout, recycleBin, click
    };
})();

export default Sounds;
