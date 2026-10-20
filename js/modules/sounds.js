const Sounds = (() => {
    let ctx = null;

    // Sound schemes change the character of every event that follows the
    // scheme. Events can override this individually in Personalization.
    const SCHEMES = {
        default: { label: 'Default', gain: 1, pitch: 1, wave: null, attack: 0.012, release: 1 },
        soft: { label: 'Soft', gain: 0.62, pitch: 0.94, wave: 'sine', attack: 0.03, release: 1.25 },
        classic: { label: 'Classic', gain: 0.85, pitch: 1.02, wave: 'triangle', attack: 0.008, release: 0.9 }
    };

    // One entry per customizable event. Notes are:
    // [frequency, start offset, duration, waveform, volume].
    // Adding a new sound is just another entry here.
    const EVENTS = {
        error: {
            label: 'Error',
            notes: [
                [392, 0, 0.18, 'sawtooth', 0.14],
                [311.13, 0.12, 0.24, 'sawtooth', 0.14],
                [233.08, 0.3, 0.42, 'triangle', 0.16]
            ],
            noise: { delay: 0.28, duration: 0.18, volume: 0.05, cutoff: 400 }
        },
        warning: {
            label: 'Warning',
            notes: [
                [659.25, 0, 0.18, 'triangle', 0.2],
                [523.25, 0.14, 0.32, 'triangle', 0.18]
            ],
            harmonic: 0.08
        },
        info: {
            label: 'Information',
            notes: [
                [1046.5, 0, 0.18, 'sine', 0.17],
                [1318.51, 0.09, 0.3, 'sine', 0.15]
            ],
            harmonic: 0.18
        },
        confirm: {
            label: 'Confirmation',
            notes: [
                [659.25, 0, 0.15, 'sine', 0.17],
                [987.77, 0.08, 0.28, 'sine', 0.19]
            ],
            harmonic: 0.16
        },
        notification: {
            label: 'Notification',
            notes: [
                [1318.51, 0, 0.16, 'sine', 0.16],
                [1760, 0.08, 0.34, 'sine', 0.12]
            ],
            harmonic: 0.2
        },
        login: {
            label: 'Sign in',
            notes: [
                [523.25, 0, 0.24, 'sine', 0.15],
                [659.25, 0.12, 0.24, 'sine', 0.15],
                [783.99, 0.24, 0.5, 'sine', 0.17]
            ],
            harmonic: 0.12
        },
        logout: {
            label: 'Sign out',
            notes: [
                [783.99, 0, 0.24, 'sine', 0.13],
                [659.25, 0.12, 0.26, 'sine', 0.12],
                [523.25, 0.24, 0.46, 'sine', 0.1]
            ],
            harmonic: 0.1
        },
        recycle: {
            label: 'Recycle Bin',
            notes: [
                [196, 0, 0.18, 'sine', 0.12],
                [146.83, 0.12, 0.28, 'sine', 0.1]
            ],
            noise: { delay: 0, duration: 0.32, volume: 0.12, cutoff: 900 }
        },
        keyboard: {
            label: 'Keyboard click',
            notes: [[1250, 0, 0.05, 'sine', 0.07]]
        },
        click: {
            label: 'UI click',
            hidden: true,
            notes: [[1000, 0, 0.05, 'sine', 0.08]]
        }
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

    function envelope(gain, peak, start, end, attack) {
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(peak, start + Math.max(0.005, attack));
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
    }

    function playNote(c, note, scheme, harmonic, volume) {
        const [freq, start, duration, type, level] = note;
        const t = c.currentTime + start;
        const end = t + duration * scheme.release;
        const peak = (level || 0.1) * scheme.gain * volume;
        if (peak <= 0) return;

        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = scheme.wave || type || 'sine';
        osc.frequency.setValueAtTime(freq * scheme.pitch, t);
        envelope(gain, peak, t, end, scheme.attack);
        osc.connect(gain);
        gain.connect(c.destination);
        osc.start(t);
        osc.stop(end + 0.02);

        if (harmonic > 0) {
            const shimmer = c.createOscillator();
            const shimmerGain = c.createGain();
            shimmer.type = 'sine';
            shimmer.frequency.setValueAtTime(freq * 2 * scheme.pitch, t);
            envelope(shimmerGain, peak * harmonic, t, end, scheme.attack);
            shimmer.connect(shimmerGain);
            shimmerGain.connect(c.destination);
            shimmer.start(t);
            shimmer.stop(end + 0.02);
        }
    }

    function playNoise(c, spec, scheme, volume) {
        const duration = spec.duration || 0.25;
        const delay = spec.delay || 0;
        const t = c.currentTime + delay;
        const end = t + duration * scheme.release;
        const peak = (spec.volume || 0.1) * scheme.gain * volume;
        if (peak <= 0) return;

        const size = Math.max(1, Math.floor(c.sampleRate * duration));
        const buffer = c.createBuffer(1, size, c.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * 0.5;

        const source = c.createBufferSource();
        source.buffer = buffer;
        const filter = c.createBiquadFilter();
        filter.type = 'lowpass';
        const cutoff = spec.cutoff || 800;
        filter.frequency.setValueAtTime(cutoff, t);
        filter.frequency.exponentialRampToValueAtTime(Math.max(80, cutoff * 0.35), end);
        const gain = c.createGain();
        envelope(gain, peak, t, end, 0.01);
        source.connect(filter);
        filter.connect(gain);
        gain.connect(c.destination);
        source.start(t);
        source.stop(end + 0.02);
    }

    // Play one system event. `force` is used by the Settings preview buttons so
    // a muted shell can still be auditioned without changing the setting.
    function play(id, force) {
        const def = EVENTS[id];
        if (!def) return false;

        const config = getConfig();
        if (!force && config.soundEnabled === false) return false;

        const styles = config.soundEventStyles || {};
        const style = styles[id] || 'scheme';
        if (style === 'off') return false;

        const schemeName = style === 'scheme' ? (config.soundScheme || 'default') : style;
        const scheme = SCHEMES[schemeName] || SCHEMES.default;
        const volume = getVolume();
        if (volume <= 0) return false;

        const c = getCtx();
        if (!c) return false;

        try {
            (def.notes || []).forEach(note => playNote(c, note, scheme, def.harmonic || 0, volume));
            if (def.noise) playNoise(c, def.noise, scheme, volume);
            return true;
        } catch (e) {
            return false;
        }
    }

    function events() {
        return Object.entries(EVENTS)
            .filter(([, def]) => !def.hidden)
            .map(([id, def]) => ({ id, label: def.label }));
    }

    function schemes() {
        return Object.entries(SCHEMES).map(([id, def]) => ({ id, label: def.label }));
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
    // first interaction so async sounds (sign-in, notifications) can play.
    if (typeof document !== 'undefined') {
        const unlock = () => getCtx();
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
