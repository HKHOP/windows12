// Apex Drive 3D — open-world construction: terrain, track ribbon, scenery.
import { Batch } from './geo.js';
import {
    baseHeight, nearestTrack, hexRgb, shade, clamp, lerp, smoothstep, vnoise, hash2,
    WORLD, HALF, WATER_Y, TRACK_W
} from './util.js';

const GRID_N = 110;

export function buildWorld(gl, samples) {
    // ---- terrain heights (flattened near the track) ----
    const verts = GRID_N + 1;
    const H = new Float32Array(verts * verts);
    const nearD = new Float32Array(verts * verts);
    const nearY = new Float32Array(verts * verts);
    for (let j = 0; j < verts; j++) {
        for (let i = 0; i < verts; i++) {
            const x = (i / GRID_N - 0.5) * WORLD, z = (j / GRID_N - 0.5) * WORLD;
            const raw = baseHeight(x, z);
            const nt = nearestTrack(samples, x, z);
            const k = idx(i, j);
            nearD[k] = nt.d; nearY[k] = nt.s.y;
            const blend = 1 - smoothstep(10, 30, nt.d);
            H[k] = lerp(raw, nt.s.y, blend);
        }
    }
    function idx(i, j) { return j * verts + i; }
    function heightAt(x, z) {
        const fx = clamp((x / WORLD + 0.5) * GRID_N, 0, GRID_N - 0.001);
        const fz = clamp((z / WORLD + 0.5) * GRID_N, 0, GRID_N - 0.001);
        const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
        return lerp(lerp(H[idx(i, j)], H[idx(i + 1, j)], u), lerp(H[idx(i, j + 1)], H[idx(i + 1, j + 1)], u), v);
    }

    // ---- terrain mesh with painted biomes ----
    const grass = hexRgb('#4a9c3f'), grass2 = hexRgb('#67b34c'), sand = hexRgb('#d9c27a');
    const rock = hexRgb('#7a756e'), snow = hexRgb('#e8edf2'), verge = hexRgb('#5da24a');
    const tb = new Batch();
    const P = [], N = [], C = [], I = [];
    for (let j = 0; j < verts; j++) {
        for (let i = 0; i < verts; i++) {
            const x = (i / GRID_N - 0.5) * WORLD, z = (j / GRID_N - 0.5) * WORLD;
            const h = H[idx(i, j)];
            const hx = H[idx(Math.min(i + 1, GRID_N), j)] - H[idx(Math.max(i - 1, 0), j)];
            const hz = H[idx(i, Math.min(j + 1, GRID_N))] - H[idx(i, Math.max(i - 1, 0))];
            const step = WORLD / GRID_N;
            let nx = -hx / (2 * step), nz = -hz / (2 * step), ny = 1;
            const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
            const slope = 1 - ny;
            const vn = vnoise(x * 0.05, z * 0.05);
            let c;
            if (h < WATER_Y + 0.7) c = sand;
            else if (slope > 0.28) c = rock;
            else if (h > 30) c = snow;
            else if (h > 15) c = [lerp(grass[0], rock[0], (h - 15) / 15), lerp(grass[1], rock[1], (h - 15) / 15), lerp(grass[2], rock[2], (h - 15) / 15)];
            else c = [lerp(grass[0], grass2[0], vn), lerp(grass[1], grass2[1], vn), lerp(grass[2], grass2[2], vn)];
            if (nearD[idx(i, j)] < 13 && h > WATER_Y + 0.7) c = verge;
            P.push(x, h, z); N.push(nx, ny, nz); C.push(c[0], c[1], c[2]);
        }
    }
    for (let j = 0; j < GRID_N; j++) {
        for (let i = 0; i < GRID_N; i++) {
            const a = idx(i, j), b = idx(i + 1, j), c2 = idx(i, j + 1), d = idx(i + 1, j + 1);
            I.push(a, c2, b, b, c2, d);
        }
    }
    tb.pos = P; tb.nrm = N; tb.col = C; tb.idx = I;
    const terrain = tb.build(gl);

    // ---- water ----
    const wb = new Batch();
    wb.box(WORLD, 0.4, WORLD, [0.16, 0.42, 0.62], 0, WATER_Y - 0.25, 0);
    const water = wb.build(gl);

    // ---- track ribbon + curbs + center dashes + start line ----
    const road = new Batch(), curb = new Batch(), paint = new Batch();
    const S = samples.length, hw = TRACK_W / 2;
    const red = [0.85, 0.12, 0.15], white = [0.92, 0.92, 0.92], asphalt = [0.21, 0.22, 0.25];
    function ribbon(batch, w0, w1, yOff, colorFn) {
        const b = { base: batch.pos.length / 3 };
        for (let i = 0; i <= S; i++) {
            const s = samples[i % S];
            const y = s.y + yOff;
            b['l' + i] = batch._push(s.x + s.nx * w1, y, s.z + s.nz * w1, 0, 1, 0, colorFn(i, 1));
            b['r' + i] = batch._push(s.x + s.nx * w0, y, s.z + s.nz * w0, 0, 1, 0, colorFn(i, -1));
        }
        for (let i = 0; i < S; i++) {
            const l0 = b['l' + i], r0 = b['r' + i], l1 = b['l' + (i + 1)], r1 = b['r' + (i + 1)];
            batch.idx.push(l0, r0, l1, r0, r1, l1);
        }
    }
    const vn2 = (i) => vnoise(i * 0.7, 3.3) * 0.05;
    ribbon(road, -hw, hw, 0.18, (i) => shade(asphalt, 1 + vn2(i)));
    ribbon(curb, hw, hw + 1.4, 0.2, (i) => (Math.floor(i / 6) % 2 ? red : white));
    ribbon(curb, -hw - 1.4, -hw, 0.2, (i) => (Math.floor(i / 6) % 2 ? white : red));
    // center dashes
    for (let i = 0; i < S; i += 10) {
        const s0 = samples[i], s1 = samples[(i + 4) % S];
        const y = (s0.y + s1.y) / 2 + 0.22;
        const a = paint._push(s0.x - s0.nx * 0.35, y, s0.z - s0.nz * 0.35, 0, 1, 0, white);
        const b2 = paint._push(s0.x + s0.nx * 0.35, y, s0.z + s0.nz * 0.35, 0, 1, 0, white);
        const c3 = paint._push(s1.x - s1.nx * 0.35, y, s1.z - s1.nz * 0.35, 0, 1, 0, white);
        const d = paint._push(s1.x + s1.nx * 0.35, y, s1.z + s1.nz * 0.35, 0, 1, 0, white);
        paint.idx.push(a, b2, c3, b2, d, c3);
    }
    // start line
    {
        const s = samples[0], y = s.y + 0.24;
        const a = paint._push(s.x - s.nx * hw, y, s.z - s.nz * hw, 0, 1, 0, white);
        const b2 = paint._push(s.x + s.nx * hw, y, s.z + s.nz * hw, 0, 1, 0, white);
        const sB = samples[2];
        const c3 = paint._push(sB.x - sB.nx * hw, sB.y + 0.24, sB.z - sB.nz * hw, 0, 1, 0, [0.15, 0.15, 0.15]);
        const d = paint._push(sB.x + sB.nx * hw, sB.y + 0.24, sB.z + sB.nz * hw, 0, 1, 0, [0.15, 0.15, 0.15]);
        paint.idx.push(a, b2, c3, b2, d, c3);
    }
    const track = road.build(gl), curbs = curb.build(gl), lines = paint.build(gl);

    // ---- start gantry ----
    const gb = new Batch();
    {
        const s = samples[0];
        const lx = s.x + s.nx * (hw + 2), lz = s.z + s.nz * (hw + 2);
        const rx = s.x - s.nx * (hw + 2), rz = s.z - s.nz * (hw + 2);
        gb.box(0.8, 7, 0.8, [0.15, 0.15, 0.18], lx, s.y + 3.5, lz);
        gb.box(0.8, 7, 0.8, [0.15, 0.15, 0.18], rx, s.y + 3.5, rz);
        const mx = (lx + rx) / 2, mz = (lz + rz) / 2;
        const yaw = Math.atan2(s.tx, s.tz) + Math.PI / 2;
        gb.box(Math.hypot(lx - rx, lz - rz), 1.4, 1.0, [0.7, 0.1, 0.16], mx, s.y + 7, mz, yaw);
    }
    const gantry = gb.build(gl);

    // ---- scenery placement ----
    const colliders = [];
    const trunkB = new Batch(), leafB = new Batch(), rockB = new Batch();
    const trunkC = [0.32, 0.2, 0.12], leafC = hexRgb('#2d7a2c'), leafC2 = hexRgb('#3f9440'), rockC = hexRgb('#6f6a63');
    let placed = 0, guard = 0;
    while (placed < 230 && guard++ < 4000) {
        const x = (hash2(placed * 3 + 11, guard * 7 + 1) - 0.5) * (WORLD - 60);
        const z = (hash2(placed * 5 + 71, guard * 13 + 5) - 0.5) * (WORLD - 60);
        const h = baseHeight(x, z);
        if (h < WATER_Y + 1.2 || h > 26) continue;
        if (nearestTrack(samples, x, z).d < 17) continue;
        let ok = true;
        for (const c of colliders) { if (Math.hypot(x - c.x, z - c.z) < 7) { ok = false; break; } }
        if (!ok) continue;
        const gy = heightAt(x, z);
        const s = 0.8 + hash2(placed, 999) * 0.9;
        const Person = hash2(placed * 7, 313) > 0.5;
        trunkB.box(0.7 * s, 2.6 * s, 0.7 * s, trunkC, x, gy + 1.3 * s, z);
        const lc = Person ? leafC : leafC2;
        leafB.cone(2.4 * s, gy + 2.2 * s, gy + 5.2 * s, lc, x, z);
        leafB.cone(1.7 * s, gy + 3.8 * s, gy + 6.2 * s, shade(lc, 1.06), x, z);
        colliders.push({ x, z, r: 1.1 });
        placed++;
    }
    placed = 0; guard = 0;
    while (placed < 90 && guard++ < 3000) {
        const x = (hash2(placed * 11 + 401, guard * 3 + 9) - 0.5) * (WORLD - 60);
        const z = (hash2(placed * 13 + 601, guard * 17 + 2) - 0.5) * (WORLD - 60);
        const h = baseHeight(x, z);
        if (h < WATER_Y + 0.8) continue;
        if (nearestTrack(samples, x, z).d < 15) continue;
        const gy = heightAt(x, z);
        const s = 0.7 + hash2(placed * 3, 777) * 1.8;
        rockB.box(2.2 * s, 1.4 * s, 1.8 * s, shade(rockC, 0.9 + hash2(placed, 21) * 0.25), x, gy + 0.5 * s, z, hash2(placed, 55));
        colliders.push({ x, z, r: 1.6 * s });
        placed++;
    }
    const trunks = trunkB.build(gl), leaves = leafB.build(gl), rocks = rockB.build(gl);

    // ---- ramps (wedges) ----
    const ramps = [];
    const rampB = new Batch();
    const rampSpots = [[-40, -60, 0.6], [90, 60, 2.4], [-160, 40, 1.2], [60, -140, 5.2], [200, -40, 3.6], [-90, 120, 4.4]];
    const rampC = hexRgb('#e8912d');
    for (const [rx, rz, ry] of rampSpots) {
        if (nearestTrack(samples, rx, rz).d < 20) continue;
        const gy = heightAt(rx, rz);
        rampB.box(6, 0.5, 9, rampC, rx, gy + 1.1, rz, ry, 0);
        rampB.box(6, 2.2, 0.6, shade(rampC, 0.8), rx - Math.sin(ry) * 0 - Math.cos(ry) * 0, gy + 0.4, rz, ry, 0);
        // sloped deck
        const cs = Math.cos(ry), sn = Math.sin(ry);
        rampB.box(6, 0.4, 10, shade(rampC, 1.1), rx - sn * 0, gy + 1.6, rz, ry, -0.32);
        rampB.box(0.4, 1.6, 9, [0.9, 0.9, 0.9], rx + cs * 3, gy + 1.4, rz - sn * 3, ry, 0);
        rampB.box(0.4, 1.6, 9, [0.9, 0.9, 0.9], rx - cs * 3, gy + 1.4, rz + sn * 3, ry, 0);
        ramps.push({ x: rx, z: rz, ry });
    }
    const rampMesh = rampB.build(gl);

    // ---- boost pads on the track ----
    const pads = [];
    const padB = new Batch();
    for (let k = 0; k < 8; k++) {
        const s = samples[Math.floor((k + 0.5) * S / 8) % S];
        pads.push({ x: s.x, z: s.z });
        padB.box(5, 0.15, 3, [0.13, 0.85, 0.95], s.x, s.y + 0.3, s.z, Math.atan2(s.tx, s.tz));
    }
    const padMesh = padB.build(gl);

    // ---- gold rings for free roam ----
    const rings = [];
    let rg = 0, tries = 0;
    while (rings.length < 12 && tries++ < 800) {
        const x = (hash2(rg * 17 + 5, tries * 29 + 3) - 0.5) * (WORLD - 120);
        const z = (hash2(rg * 23 + 9, tries * 31 + 7) - 0.5) * (WORLD - 120);
        rg++;
        if (baseHeight(x, z) < WATER_Y + 1.5) continue;
        if (nearestTrack(samples, x, z).d < 18) continue;
        rings.push({ x, y: heightAt(x, z) + 3, z, taken: 0 });
    }

    // ---- start pose ----
    const s0 = samples[0];
    const startPose = {
        x: s0.x - s0.tx * 12, z: s0.z - s0.tz * 12,
        heading: Math.atan2(s0.tx, s0.tz)
    };
    startPose.y = heightAt(startPose.x, startPose.z);

    let trackLen = 0;
    for (let i = 0; i < S; i++) {
        const a = samples[i], b = samples[(i + 1) % S];
        trackLen += Math.hypot(b.x - a.x, b.z - a.z);
    }

    return {
        heightAt, samples, trackLen, colliders, pads, ramps, rings, startPose,
        meshes: { terrain, water, track, curbs, lines, gantry, trunks, leaves, rocks, rampMesh, padMesh }
    };
}
