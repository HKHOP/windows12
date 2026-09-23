// Apex Drive 3D — procedural engine audio + UI blips (raw WebAudio).
export function makeAudio() {
    let ctx = null, osc = null, gain = null, filt = null;
    let muted = false;
    function ensure() {
        if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
        try {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
            osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 60;
            filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 700;
            gain = ctx.createGain(); gain.gain.value = 0;
            osc.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
            osc.start();
        } catch (e) { ctx = null; }
    }
    function setEngine(speedKmh, boosting, active) {
        if (!ctx || !osc) return;
        const t = ctx.currentTime;
        const f = 55 + speedKmh * 2.4 + (boosting ? 60 : 0);
        osc.frequency.setTargetAtTime(f, t, 0.06);
        filt.frequency.setTargetAtTime(boosting ? 1600 : 700, t, 0.1);
        gain.gain.setTargetAtTime(!muted && active ? 0.045 : 0, t, 0.09);
    }
    function blip(freq, dur, vol, type) {
        if (!ctx || muted) return;
        try {
            const t = ctx.currentTime;
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.type = type || 'sine'; o.frequency.value = freq;
            g.gain.setValueAtTime(vol || 0.15, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + (dur || 0.12));
            o.connect(g); g.connect(ctx.destination);
            o.start(t); o.stop(t + (dur || 0.12) + 0.02);
        } catch (e) { /* ignore */ }
    }
    function dispose() {
        try { if (osc) osc.stop(); if (ctx) ctx.close(); } catch (e) { /* ignore */ }
        ctx = null;
    }
    return {
        ensure, setEngine, blip, dispose,
        setMuted(m) { muted = m; },
        isMuted() { return muted; }
    };
}
