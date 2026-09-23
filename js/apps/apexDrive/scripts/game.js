// Apex Drive 3D — game orchestration: GL setup, loop, laps, camera, input.
import { Batch, buildCarBatches, compile, VS, FS, WVS, WFS } from './geo.js';
import { buildWorld } from './world.js';
import { makeCar, buildCarEntity, stepCar, updateAI, resetAIProgress } from './car.js';
import { makeAudio } from './audio.js';
import { getHud, updateHud, drawMinimap, showFinal, hideFinal } from './hud.js';
import {
    mat4Identity, mat4Mul, mat4Perspective, mat4LookAt, mat4TRS,
    clamp, lerp, smoothstep, buildTrackSamples, nearestTrack,
    fmtTime, WORLD, HALF, WATER_Y, TRACK_W, RACE_LAPS
} from './util.js';

let cachedSamples = null;

export function startGame(env) {
    const { root, app, mode, rec, saveRec, onQuit, onRetry } = env;
    const canvas = root.querySelector('.ax-3d');
    const H = getHud(root);
    const audio = makeAudio();
    audio.ensure();

    const gl = canvas.getContext('webgl', { antialias: true });
    if (!gl) throw new Error('WebGL is not available on this device.');
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.clearColor(0.55, 0.74, 0.9, 1);

    const prog = compile(gl, VS, FS);
    const wprog = compile(gl, WVS, WFS);
    const L = {
        mvp: gl.getUniformLocation(prog, 'uMVP'),
        model: gl.getUniformLocation(prog, 'uModel'),
        sun: gl.getUniformLocation(prog, 'uSun'),
        fog: gl.getUniformLocation(prog, 'uFog'),
        fogRange: gl.getUniformLocation(prog, 'uFogRange'),
        emissive: gl.getUniformLocation(prog, 'uEmissive')
    };
    gl.useProgram(prog);
    gl.uniform3f(L.sun, 0.5, 0.75, 0.4);
    gl.uniform3f(L.fog, 0.62, 0.74, 0.86);
    gl.uniform2f(L.fogRange, 140, 520);
    gl.enableVertexAttribArray(0); gl.enableVertexAttribArray(1); gl.enableVertexAttribArray(2);

    if (!cachedSamples) cachedSamples = buildTrackSamples();
    const samples = cachedSamples;
    const G = buildWorld(gl, samples);
    G.rivals = [];

    // ---- cars ----
    const playerEnt = buildCarEntity(gl, '#e11d48', '#0f172a');
    const aiCols = [['#2563eb', '#0f172a'], ['#16a34a', '#0f172a'], ['#eab308', '#111111']];
    const aiEnts = aiCols.map(c => buildCarEntity(gl, c[0], c[1]));
    const player = makeCar();
    const ais = [makeCar(), makeCar(), makeCar()];
    const aiCfg = [
        { base: 40, off: -4, gap: 0 }, { base: 42.5, off: 3.5, gap: 0 }, { base: 45, off: 0, gap: 0 }
    ];
    ais.forEach((a, i) => { a.aiOff = aiCfg[i].off; a.aiVar = Math.random(); a.color = aiCols[i][0]; });
    G.rivals = [player, ...ais];

    function gridSlot(slot) {
        const s = samples[(samples.length - 14 - slot * 9) % samples.length];
        return { x: s.x - s.tx * 4 - s.nx * (slot % 2 ? 3.4 : -3.4), z: s.z - s.tz * 4 - s.nz * (slot % 2 ? 3.4 : -3.4), h: Math.atan2(s.tx, s.tz) };
    }
    if (mode === 'race') {
        const slots = [gridSlot(3), gridSlot(0), gridSlot(1), gridSlot(2)];
        [player, ...ais].forEach((c, i) => {
            c.x = slots[i].x; c.z = slots[i].z; c.heading = slots[i].h;
            c.vx = 0; c.vz = 0; c.y = G.heightAt(c.x, c.z);
            c.lap = 0; c.frac = nearestTrack(samples, c.x, c.z).frac;
            c.sectorsSeen = new Set(); c.finished = false;
        });
        ais.forEach((a) => { a.aiS = nearestTrack(samples, a.x, a.z).i; a.aiLast = null; });
    } else {
        player.x = 40; player.z = -40; player.heading = 0.8;
        player.y = G.heightAt(40, -40);
        ais.forEach((a, i) => {
            a.x = -60 + i * 30; a.z = 80 - i * 40; a.heading = Math.random() * 6.28;
            a.y = G.heightAt(a.x, a.z);
            a.aiS = nearestTrack(samples, a.x, a.z).i; a.aiLast = null;
        });
    }

    // ---- shared ring mesh (free roam) ----
    const ringB = new Batch();
    ringB.octa(1.6, [1.0, 0.75, 0.15], 0, 0, 0);
    const ringMesh = ringB.build(gl);

    // ---- state ----
    const S = {
        mode, player, ais, G, rec, finished: false,
        keys: {}, camMode: 0, camPos: [player.x - Math.sin(player.heading) * 10, player.y + 5, player.z - Math.cos(player.heading) * 10],
        race: { countdown: 3.6, lastCount: 4, timeMs: 0, lapStart: 0, lapTimes: [], running: false },
        roam: { timeMs: 0, rings: 0 },
        alive: true, lastT: 0, hudT: 0, mapT: 0, time: 0
    };
    if (mode === 'race') { S.race.running = false; }

    H.hud.classList.add('on');
    H.map.classList.add('on');
    hideFinal(H);
    H.msg.textContent = ''; H.sub.textContent = '';
    root.focus();

    // ---- input ----
    function onKeyDown(e) {
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
        if (e.repeat) return;
        S.keys[e.code] = true;
        if (e.code === 'KeyR') resetPlayer();
        if (e.code === 'KeyC') cycleCam();
        if (e.code === 'KeyN') toggleMute();
        if (e.code === 'Escape') quit();
    }
    function onKeyUp(e) { S.keys[e.code] = false; }
    function onBlur() { S.keys = {}; }
    root.addEventListener('keydown', onKeyDown);
    root.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    // touch buttons
    const tKeys = {};
    root.querySelectorAll('.ax-tbtn').forEach(btn => {
        const cls = btn.classList;
        const name = cls.contains('t-left') ? 'left' : cls.contains('t-right') ? 'right'
            : cls.contains('t-gas') ? 'gas' : cls.contains('t-brake') ? 'brake' : 'boost';
        const dn = (e) => { e.preventDefault(); tKeys[name] = true; };
        const up = (e) => { e.preventDefault(); tKeys[name] = false; };
        btn.addEventListener('pointerdown', dn);
        btn.addEventListener('pointerup', up);
        btn.addEventListener('pointercancel', up);
        btn.addEventListener('pointerleave', up);
    });
    if (('ontouchstart' in window) || navigator.maxTouchPoints > 0) {
        root.classList.add('touch');
        root.querySelector('.ax-touch').classList.add('on');
    }
    function readInput() {
        const k = S.keys;
        return {
            throttle: ((k['KeyW'] || k['ArrowUp'] || tKeys.gas) ? 1 : 0) + ((k['KeyS'] || k['ArrowDown'] || tKeys.brake) ? -1 : 0),
            steer: ((k['KeyA'] || k['ArrowLeft'] || tKeys.left) ? -1 : 0) + ((k['KeyD'] || k['ArrowRight'] || tKeys.right) ? 1 : 0),
            boost: !!(k['Space'] || tKeys.boost)
        };
    }

    function cycleCam() {
        S.camMode = (S.camMode + 1) % 2;
        root.querySelector('.b-cam').textContent = S.camMode === 0 ? 'Camera: Chase' : 'Camera: Far';
    }
    function toggleMute() {
        audio.setMuted(!audio.isMuted());
        root.querySelector('.b-sound').textContent = audio.isMuted() ? 'Sound: Off' : 'Sound: On';
    }
    root.querySelector('.b-cam').addEventListener('click', cycleCam);
    root.querySelector('.b-sound').addEventListener('click', toggleMute);
    root.querySelector('.b-reset').addEventListener('click', resetPlayer);
    root.querySelector('.b-quit').addEventListener('click', quit);

    function resetPlayer() {
        if (S.finished) return;
        const p = player;
        if (mode === 'race') {
            const nt = nearestTrack(samples, p.x, p.z);
            const s = nt.s;
            p.x = s.x; p.z = s.z; p.heading = Math.atan2(s.tx, s.tz);
        } else {
            p.x = 40; p.z = -40; p.heading = 0.8;
        }
        p.vx = 0; p.vz = 0; p.vy = 0; p.air = 0;
        p.y = G.heightAt(p.x, p.z);
        audio.blip(300, 0.15, 0.12);
    }

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(1, Math.floor(root.clientWidth * dpr));
        const h = Math.max(1, Math.floor(root.clientHeight * dpr));
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w; canvas.height = h;
            gl.viewport(0, 0, w, h);
        }
    }
    const ro = new ResizeObserver(resize);
    ro.observe(root);
    resize();

    // ---- drawing ----
    const IDENT = mat4Identity();
    function drawMesh(mesh, model, emissive) {
        gl.uniformMatrix4fv(L.model, false, model);
        gl.uniform1f(L.emissive, emissive ? 1 : 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 36, 12);
        gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 36, 24);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
        gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
    }
    function carModel(p) {
        return mat4TRS(p.x, p.y, p.z, p.heading, 0);
    }
    function drawCar(ent, p) {
        const cm = carModel(p);
        drawMesh(ent.body, cm, 0);
        drawMesh(ent.glow, cm, 1);
        drawMesh(ent.exh, cm, 0);
        for (let i = 0; i < 4; i++) {
            const w = ent.wheelDefs[i];
            const steer = w.steer ? p.steerVis * 0.45 : 0;
            const local = mat4Mul(mat4TRS(w.x, w.y, w.z, steer, 0), mat4TRS(0, 0, 0, 0, p.spin));
            drawMesh(ent.wheel, mat4Mul(cm, local), 0);
        }
        if (p.boosting) {
            const flame = mat4Mul(cm, mat4TRS(0, 0.6, -2.9 - Math.random() * 0.7, 0, 0));
            // scaled exhaust glow: reuse wheel mesh scaled is complex — draw glow box via ring mesh trick
            drawMesh(ent.glow, flame, 1);
        }
    }

    function render() {
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        const aspect = canvas.width / Math.max(1, canvas.height);
        const proj = mat4Perspective(62 * Math.PI / 180, aspect, 0.3, 1400);
        const cp = S.camPos, p = player;
        const look = [p.x + Math.sin(p.heading) * 6, p.y + 1.8, p.z + Math.cos(p.heading) * 6];
        const view = mat4LookAt(cp[0], cp[1], cp[2], look[0], look[1], look[2], 0, 1, 0);
        const vp = mat4Mul(proj, view);
        gl.useProgram(prog);
        gl.uniformMatrix4fv(L.mvp, false, vp);
        const M = G.meshes;
        drawMesh(M.terrain, IDENT, 0);
        drawMesh(M.water, IDENT, 0);
        drawMesh(M.track, IDENT, 0);
        drawMesh(M.curbs, IDENT, 0);
        drawMesh(M.lines, IDENT, 1);
        drawMesh(M.gantry, IDENT, 0);
        drawMesh(M.trunks, IDENT, 0);
        drawMesh(M.leaves, IDENT, 0);
        drawMesh(M.rocks, IDENT, 0);
        drawMesh(M.rampMesh, IDENT, 0);
        drawMesh(M.padMesh, IDENT, 1);
        if (mode === 'roam') {
            for (const r of G.rings) {
                if (r.taken > 0) continue;
                const bob = Math.sin(S.time * 2 + r.x) * 0.5;
                const rm = mat4Mul(mat4TRS(r.x, r.y + bob, r.z, 0, 0), mat4TRS(0, 0, 0, S.time * 1.5, 0.4));
                drawMesh(ringMesh, rm, 1);
            }
        }
        ais.forEach((a, i) => drawCar(aiEnts[i], a));
        drawCar(playerEnt, player);
    }

    // ---- race logic ----
    function raceUpdate(dt) {
        const R = S.race, p = player;
        if (R.countdown > 0) {
            R.countdown -= dt;
            const n = Math.ceil(R.countdown - 0.4);
            if (n !== R.lastCount && n >= 0) {
                R.lastCount = n;
                H.msg.textContent = n > 0 ? String(n) : 'GO!';
                H.sub.textContent = n > 0 ? 'Get ready...' : '';
                audio.blip(n > 0 ? 440 : 880, n > 0 ? 0.15 : 0.4, 0.2);
                if (n <= 0) setTimeout(() => { if (S.alive && !S.finished) { H.msg.textContent = ''; } }, 900);
            }
            if (R.countdown <= 0.4 && !R.running) { R.running = true; R.lapStart = 0; }
            return;
        }
        R.timeMs += dt * 1000;
        const prevFrac = p.prevFrac == null ? p.frac : p.prevFrac;
        const sector = Math.floor(p.frac * 8) % 8;
        if (sector !== 0) p.sectorsSeen.add(sector);
        if (prevFrac > 0.9 && p.frac < 0.1) {
            // crossed the start line
            const valid = [1, 2, 3, 4, 5, 6, 7].every(s => p.sectorsSeen.has(s));
            if (p.lap === 0 && !valid) {
                R.lapStart = R.timeMs; // race start
            } else if (valid) {
                const lapMs = R.timeMs - R.lapStart;
                R.lapStart = R.timeMs;
                R.lapTimes.push(lapMs);
                p.lap++;
                H.sub.textContent = 'Lap ' + p.lap + ' — ' + fmtTime(lapMs);
                setTimeout(() => { if (S.alive) H.sub.textContent = ''; }, 2500);
                audio.blip(660, 0.2, 0.18);
                if (lapMs < (rec.bestLapMs || Infinity)) {
                    rec.bestLapMs = Math.round(lapMs);
                    saveRec();
                    app.notify.info('Apex Drive 3D', 'New best lap: ' + fmtTime(lapMs));
                }
                if (p.lap >= RACE_LAPS && !S.finished) finishRace();
            } else {
                H.sub.textContent = 'Missed a checkpoint — lap not counted';
                setTimeout(() => { if (S.alive) H.sub.textContent = ''; }, 2500);
            }
            p.sectorsSeen = new Set();
        }
        p.prevFrac = p.frac;
        // wrong way?
        const s = nearestTrack(samples, p.x, p.z).s;
        const dot = p.vx * s.tx + p.vz * s.tz;
        if (dot < -4 && p.speed > 6) {
            p.wrongWay += dt;
            H.warn.style.display = p.wrongWay > 1 ? 'block' : 'none';
        } else { p.wrongWay = 0; H.warn.style.display = 'none'; }
    }

    function finishRace() {
        S.finished = true;
        player.finished = true;
        player.finishMs = S.race.timeMs;
        const results = [{ name: 'You', ms: S.race.timeMs, you: true }];
        ais.forEach((a, i) => {
            if (!a.finished) a.finishMs = S.race.timeMs + (a.lap + a.frac - (player.lap)) * -14000 + (i + 1) * 3500 + Math.random() * 4000;
            results.push({ name: 'Rival ' + (i + 1), ms: a.finishMs });
        });
        results.sort((a, b) => a.ms - b.ms);
        const place = results.findIndex(r => r.you);
        if (S.race.timeMs < (rec.bestRaceMs || Infinity)) {
            rec.bestRaceMs = Math.round(S.race.timeMs);
            saveRec();
        }
        audio.blip(880, 0.4, 0.2);
        const medals = ['1st Place!', '2nd Place', '3rd Place', '4th Place'];
        showFinal(H,
            results.map(r => [(r.you ? 'You' : r.name), fmtTime(r.ms)]),
            medals[place],
            'Total ' + fmtTime(S.race.timeMs) + ' · Best lap ' + fmtTime(Math.min(...S.race.lapTimes)),
            () => quit(),
            () => { const q = onRetry; destroy(); q(); }
        );
    }

    // ---- per-frame update ----
    function update(dt) {
        S.time += dt;
        if (mode === 'race' && !S.finished) raceUpdate(dt);
        if (mode === 'roam') S.roam.timeMs += dt * 1000;

        const locked = mode === 'race' && (S.race.countdown > 0.4 || S.finished);
        const input = locked ? { throttle: 0, steer: 0, boost: false } : readInput();
        const info = stepCar(player, input, G, dt, true);
        if (player.thud) { player.thud = false; audio.blip(120, 0.12, 0.15, 'square'); }
        if (player.landed) { player.landed = false; audio.blip(200, 0.1, 0.12, 'triangle'); }

        // boost pads
        for (const pad of G.pads) {
            const dx = player.x - pad.x, dz = player.z - pad.z;
            if (dx * dx + dz * dz < 30 && Math.abs(player.y - G.heightAt(pad.x, pad.z)) < 3) {
                if (player.boost < 99) {
                    player.boost = Math.min(100, player.boost + 45);
                    const s = nearestTrack(samples, pad.x, pad.z).s;
                    player.vx += s.tx * 6; player.vz += s.tz * 6;
                    audio.blip(990, 0.18, 0.14);
                }
            }
        }
        // rings (free roam)
        if (mode === 'roam') {
            for (const r of G.rings) {
                if (r.taken > 0) { r.taken -= dt; continue; }
                const dx = player.x - r.x, dz = player.z - r.z;
                if (dx * dx + dz * dz < 22 && Math.abs((player.y + 1) - r.y) < 3.2) {
                    r.taken = 6; S.roam.rings++;
                    rec.ringsTotal = (rec.ringsTotal || 0) + 1;
                    audio.blip(1320, 0.2, 0.16);
                    H.sub.textContent = S.roam.rings + ' ring' + (S.roam.rings === 1 ? '' : 's') + ' collected!';
                    setTimeout(() => { if (S.alive) H.sub.textContent = ''; }, 1800);
                }
            }
            const kmh = player.speed * 3.6;
            if (kmh > (rec.topSpeedKmh || 0)) { rec.topSpeedKmh = Math.round(kmh); }
        }

        // AI
        ais.forEach((a, i) => {
            if (mode === 'race' && S.finished) return;
            const gap = (a.lap + a.frac) - (player.lap + player.frac);
            updateAI(a, G, dt, { base: aiCfg[i].base, gap: mode === 'race' ? gap : 0 });
            if (mode === 'race' && !a.finished && a.lap >= RACE_LAPS) {
                a.finished = true; a.finishMs = S.race.timeMs;
            }
        });

        // camera
        const dist = S.camMode === 0 ? 10 : 14, height = S.camMode === 0 ? 4.2 : 7;
        const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
        const tx = player.x - fx * dist, tz = player.z - fz * dist;
        const ty = Math.max(player.y + height, G.heightAt(tx, tz) + 1.6);
        const k = Math.min(1, (mode === 'race' && S.race.countdown > 0 ? 2.5 : 7) * dt);
        S.camPos[0] += (tx - S.camPos[0]) * k;
        S.camPos[1] += (ty - S.camPos[1]) * k;
        S.camPos[2] += (tz - S.camPos[2]) * k;

        audio.setEngine(player.speed * 3.6, player.boosting, !S.finished);
        updateHud(H, S);
        S.mapT += dt;
        if (S.mapT > 0.12) { S.mapT = 0; drawMinimap(H, S); }
        void info;
    }

    // ---- main loop ----
    let raf = 0;
    function frame(t) {
        if (!S.alive) return;
        raf = requestAnimationFrame(frame);
        const dt = Math.min(0.05, (t - S.lastT) / 1000 || 0.016);
        S.lastT = t;
        if (!root.isConnected) { quit(); return; }
        update(dt);
        render();
    }
    raf = requestAnimationFrame(frame);

    function quit() {
        if (!S.alive) return;
        saveRec();
        destroy();
        onQuit();
    }
    function destroy() {
        S.alive = false;
        cancelAnimationFrame(raf);
        ro.disconnect();
        audio.dispose();
        root.removeEventListener('keydown', onKeyDown);
        root.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('blur', onBlur);
        H.hud.classList.remove('on');
        H.map.classList.remove('on');
        H.warn.style.display = 'none';
        hideFinal(H);
    }

    return { destroy, quit };
}
