const Sounds = (() => {
    let ctx = null;

    function getCtx() {
        if (!ctx) {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }

    function getVolume() {
        try {
            if (window.SystemConfig) {
                return (window.SystemConfig.get('masterVolume') || 75) / 100;
            }
        } catch (e) {}
        return 0.75;
    }

    function playTone(freq, duration, type, vol, delay) {
        const c = getCtx();
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = type || 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, c.currentTime + (delay || 0));
        gain.gain.linearRampToValueAtTime(vol * getVolume(), c.currentTime + (delay || 0) + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + (delay || 0) + duration);
        osc.connect(gain);
        gain.connect(c.destination);
        osc.start(c.currentTime + (delay || 0));
        osc.stop(c.currentTime + (delay || 0) + duration);
    }

    function playNoise(duration, vol, delay) {
        const c = getCtx();
        const bufferSize = c.sampleRate * duration;
        const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.5;
        }
        const source = c.createBufferSource();
        source.buffer = buffer;
        const gain = c.createGain();
        const filter = c.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800;
        gain.gain.setValueAtTime(0, c.currentTime + (delay || 0));
        gain.gain.linearRampToValueAtTime(vol * getVolume(), c.currentTime + (delay || 0) + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + (delay || 0) + duration);
        source.connect(filter);
        filter.connect(gain);
        gain.connect(c.destination);
        source.start(c.currentTime + (delay || 0));
        source.stop(c.currentTime + (delay || 0) + duration);
    }

    function info() {
        playTone(880, 0.15, 'sine', 0.3, 0);
        playTone(1100, 0.2, 'sine', 0.25, 0.1);
    }

    function warn() {
        playTone(660, 0.2, 'triangle', 0.35, 0);
        playTone(550, 0.25, 'triangle', 0.3, 0.15);
    }

    function error() {
        playTone(440, 0.15, 'sawtooth', 0.2, 0);
        playTone(330, 0.2, 'sawtooth', 0.25, 0.12);
        playTone(220, 0.3, 'sawtooth', 0.2, 0.28);
    }

    function confirm() {
        playTone(660, 0.12, 'sine', 0.25, 0);
        playTone(880, 0.18, 'sine', 0.3, 0.08);
    }

    function recycleBin() {
        playNoise(0.4, 0.3, 0);
        playTone(200, 0.15, 'sine', 0.15, 0);
        playTone(150, 0.2, 'sine', 0.1, 0.15);
    }

    function click() {
        playTone(1000, 0.06, 'sine', 0.15, 0);
    }

    return { info, warn, error, confirm, recycleBin, click };
})();

export default Sounds;
