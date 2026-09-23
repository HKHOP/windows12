// Apex Drive 3D — car entities, arcade physics and AI drivers.
import { buildCarBatches } from './geo.js';
import { clamp, nearestTrack, TRACK_W, WATER_Y, HALF } from './util.js';

export function makeCar() {
    return {
        x: 0, y: 0, z: 0, heading: 0,
        vx: 0, vz: 0, vy: 0, air: 0,
        speed: 0, steerVis: 0, spin: 0,
        boost: 100, boosting: false,
        lap: 0, frac: 0, sectors: 0, progress: 0,
        wrongWay: 0, finished: false, finishMs: 0,
        airborne: 0
    };
}

export function buildCarEntity(gl, mainHex, glassHex) {
    const parts = buildCarBatches(mainHex, glassHex);
    return {
        body: parts.body.build(gl),
        glow: parts.glow.build(gl),
        exh: parts.exh.build(gl),
        wheel: parts.wheelGeo.build(gl),
        wheelDefs: parts.wheels
    };
}

// One arcade-physics step. input: { throttle -1..1, steer -1..1, boost bool }.
// Returns ground info; mutates p.
export function stepCar(p, input, G, dt, isPlayer) {
    const nt = nearestTrack(G.samples, p.x, p.z);
    const onRoad = nt.d < TRACK_W / 2 + 3;
    const wantBoost = input.boost && p.boost > 1 && input.throttle > 0.1;
    p.boosting = wantBoost;
    if (wantBoost) p.boost = Math.max(0, p.boost - 32 * dt);
    else p.boost = Math.min(100, p.boost + (onRoad ? 9 : 13) * dt);

    const maxSpd = (wantBoost ? 80 : 53) * (onRoad ? 1 : 0.55);
    const accel = wantBoost ? 48 : 27;
    const fwdX = Math.sin(p.heading), fwdZ = Math.cos(p.heading);
    const curFwd = p.vx * fwdX + p.vz * fwdZ;

    if (input.throttle > 0) {
        const push = accel * input.throttle * dt * (curFwd < 0 ? 2.2 : 1);
        p.vx += fwdX * push; p.vz += fwdZ * push;
    } else if (input.throttle < 0) {
        if (curFwd > 1) { p.vx -= fwdX * 42 * dt; p.vz -= fwdZ * 42 * dt; }
        else { p.vx += fwdX * 16 * input.throttle * dt; p.vz += fwdZ * 16 * input.throttle * dt; }
    }
    // steering scales down with speed
    const spd = Math.hypot(p.vx, p.vz);
    const steerAuthority = 2.3 / (1 + spd * 0.05);
    if (spd > 0.5) p.heading += input.steer * steerAuthority * dt * (curFwd < -0.5 ? -1 : 1);
    p.steerVis += ((input.steer || 0) - p.steerVis) * Math.min(1, 10 * dt);

    // grip: bleed lateral slide (looser while boosting = drift feel)
    const grip = wantBoost ? 4.5 : 8;
    const nfx = Math.sin(p.heading), nfz = Math.cos(p.heading);
    const fSpeed = p.vx * nfx + p.vz * nfz;
    let lx = p.vx - nfx * fSpeed, lz = p.vz - nfz * fSpeed;
    const bleed = Math.min(1, grip * dt);
    lx *= (1 - bleed); lz *= (1 - bleed);
    // cap forward speed, gentle drag
    const capped = clamp(fSpeed, -17, maxSpd);
    const drag = Math.max(0, 1 - (onRoad ? 0.25 : 0.9) * dt);
    p.vx = (nfx * capped + lx) * drag;
    p.vz = (nfz * capped + lz) * drag;

    const oldX = p.x, oldZ = p.z;
    p.x = clamp(p.x + p.vx * dt, -HALF + 6, HALF - 6);
    p.z = clamp(p.z + p.vz * dt, -HALF + 6, HALF - 6);

    // solid obstacles: trees, rocks, parked rivals
    for (const c of G.colliders) {
        const dx = p.x - c.x, dz = p.z - c.z;
        const d = Math.hypot(dx, dz), min = c.r + 1.2;
        if (d < min && d > 0.001) {
            p.x = c.x + dx / d * min; p.z = c.z + dz / d * min;
            p.vx *= 0.45; p.vz *= 0.45;
            if (isPlayer && spd > 14) p.thud = true;
        }
    }
    if (G.rivals) {
        for (const r of G.rivals) {
            if (r === p) continue;
            const dx = p.x - r.x, dz = p.z - r.z;
            const d = Math.hypot(dx, dz);
            if (d < 3.4 && d > 0.001) {
                p.x = r.x + dx / d * 3.4; p.z = r.z + dz / d * 3.4;
                const push = 0.5;
                p.vx += dx / d * push; p.vz += dz / d * push;
            }
        }
    }

    // deep water blocks the car
    let ground = G.heightAt(p.x, p.z);
    if (ground < WATER_Y - 1.0) {
        p.x = oldX; p.z = oldZ;
        p.vx *= 0.3; p.vz *= 0.3;
        ground = G.heightAt(p.x, p.z);
    }

    // ramps: launch airborne
    p.airborne = 0;
    if (p.air === 0) {
        for (const r of G.ramps) {
            const dx = p.x - r.x, dz = p.z - r.z;
            if (Math.hypot(dx, dz) < 5 && spd > 12) {
                const dot = (p.vx * Math.sin(r.ry) + p.vz * Math.cos(r.ry)) / (spd || 1);
                if (dot > 0.35) { p.air = 0.001; p.vy = 7 + spd * 0.12; p.airborne = 1; break; }
            }
        }
    }
    if (p.air > 0) {
        p.air += dt;
        p.vy -= 18 * dt;
        p.y += p.vy * dt;
        if (p.y <= ground || p.air > 2.5) {
            p.y = ground; p.air = 0; p.vy = 0;
            if (isPlayer && p.air > 0.35) p.landed = true;
        }
    } else {
        p.y += (ground - p.y) * Math.min(1, 14 * dt);
        if (Math.abs(ground - p.y) < 0.02) p.y = ground;
    }

    p.speed = Math.hypot(p.vx, p.vz);
    p.spin += (p.speed / 0.44) * dt;
    p.frac = nt.frac;
    return { onRoad, Abi: nt };
}

// AI: follow the racing line with a personal offset and rubber-banding.
export function updateAI(p, G, dt, cfg) {
    const S = G.samples.length;
    const look = G.samples[Math.floor(p.aiS) % S];
    const ahead = G.samples[(Math.floor(p.aiS) + Math.floor(6 + p.speed * 0.35)) % S];
    const tx = ahead.x + ahead.nx * p.aiOff - p.x;
    const tz = ahead.z + ahead.nz * p.aiOff - p.z;
    const want = Math.atan2(tx, tz);
    let dh = want - p.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const gap = (cfg && cfg.gap) || 0;
    const target = (cfg.base + clamp(gap * 0.06, -6, 9)) * (0.94 + p.aiVar * 0.12);
    const cur = p.vx * Math.sin(p.heading) + p.vz * Math.cos(p.heading);
    const input = {
        throttle: cur < target ? 1 : (cur > target + 6 ? -0.35 : 0.15),
        steer: clamp(dh * 2.4, -1, 1),
        boost: Math.abs(dh) < 0.15 && cur > 20 && p.boost > 60
    };
    const info = stepCar(p, input, G, dt, false);
    const nt = nearestTrack(G.samples, p.x, p.z);
    // advance course position, handling wrap
    let f = nt.frac;
    if (p.aiLast == null) p.aiLast = f;
    let df = f - p.aiLast;
    if (df < -0.5) { p.lap++; p.sectors = 0xFF; }
    else if (df > 0.5) { p.lap--; }
    p.aiLast = f;
    p.aiS = (p.aiS + p.speed * dt * 1.35) % S;
    void look; void info;
    return input;
}

export function resetAIProgress(p, G, slot) {
    const s = G.samples[Math.floor(slot * G.samples.length) % G.samples.length];
    p.x = s.x - s.tx * 10 - s.nx * slot * 4;
    p.z = s.z - s.tz * 10 - s.nz * slot * 4;
    p.heading = Math.atan2(s.tx, s.tz);
    p.vx = 0; p.vz = 0; p.y = G.heightAt(p.x, p.z);
    p.lap = 0; p.aiS = 0; p.aiLast = null;
    p.sectors = 0; p.finished = false;
}
