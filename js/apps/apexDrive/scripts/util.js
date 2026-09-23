// Apex Drive 3D — shared math, noise, terrain field and track spline.
export function mat4Identity() {
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}
export function mat4Mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
}
export function mat4Perspective(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}
export function mat4LookAt(ex, ey, ez, cx, cy, cz, ux, uy, uz) {
    let zx = ex - cx, zy = ey - cy, zz = ez - cz;
    let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    let xx = uy * zz - uz * zy, xy = uz * zx - ux * zz, xz = ux * zy - uy * zx;
    l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([
        xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
        -(xx * ex + xy * ey + xz * ez), -(yx * ex + yy * ey + yz * ez), -(zx * ex + zy * ey + zz * ez), 1
    ]);
}
// M = T * Ry * Rx (translation + yaw + pitch)
export function mat4TRS(tx, ty, tz, ry, rx) {
    const cy = Math.cos(ry || 0), sy = Math.sin(ry || 0);
    const cx = Math.cos(rx || 0), sx = Math.sin(rx || 0);
    return new Float32Array([
        cy, 0, -sy, 0,
        sy * sx, cx, cy * sx, 0,
        sy * cx, -sx, cy * cx, 0,
        tx, ty, tz, 1
    ]);
}
export function transformPoint(m, x, y, z) {
    return [
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14]
    ];
}
export function transformNormal(m, x, y, z) {
    const nx = m[0] * x + m[4] * y + m[8] * z;
    const ny = m[1] * x + m[5] * y + m[9] * z;
    const nz = m[2] * x + m[6] * y + m[10] * z;
    const l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
}
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function smoothstep(a, b, x) {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
}

export const WORLD = 800;
export const HALF = WORLD / 2;
export const WATER_Y = 0;
export const TRACK_W = 15;
export const RACE_LAPS = 3;

export function hash2(x, z) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ 0x5bf03635;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}
export function vnoise(x, z) {
    const xi = Math.floor(x), zi = Math.floor(z);
    const xf = x - xi, zf = z - zi;
    const a = hash2(xi, zi), b = hash2(xi + 1, zi);
    const c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
    const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// Rolling terrain with a central lake basin and mountain walls at the rim.
export function baseHeight(x, z) {
    let h = vnoise(x * 0.008, z * 0.008) * 16
          + vnoise(x * 0.03 + 7.3, z * 0.03 + 3.1) * 4.5
          + vnoise(x * 0.09 + 13.7, z * 0.09 + 29.2) * 1.2;
    h -= 9.5;
    const dl = Math.hypot(x - 150, z - 170);
    h -= 7 * (1 - smoothstep(20, 110, dl));
    const r = Math.max(Math.abs(x), Math.abs(z));
    const m = smoothstep(250, HALF - 10, r);
    h += m * m * 70;
    return h;
}

export const TRACK_POINTS = [
    [10, -190], [150, -165], [225, -80], [190, 40], [230, 150],
    [120, 205], [-20, 175], [-140, 195], [-225, 110], [-205, -30], [-120, -120], [-60, -185]
];
export const TRACK_SEG = 36;

export function catmull(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
export function buildTrackSamples() {
    const n = TRACK_POINTS.length;
    const pts = [];
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < TRACK_SEG; j++) {
            const t = j / TRACK_SEG;
            const p0 = TRACK_POINTS[(i - 1 + n) % n], p1 = TRACK_POINTS[i];
            const p2 = TRACK_POINTS[(i + 1) % n], p3 = TRACK_POINTS[(i + 2) % n];
            pts.push([catmull(p0[0], p1[0], p2[0], p3[0], t), catmull(p0[1], p1[1], p2[1], p3[1], t)]);
        }
    }
    let ys = pts.map(p => baseHeight(p[0], p[1]));
    for (let pass = 0; pass < 4; pass++) {
        const next = new Array(ys.length);
        for (let i = 0; i < ys.length; i++) {
            next[i] = (ys[(i - 1 + ys.length) % ys.length] + ys[i] * 2 + ys[(i + 1) % ys.length]) / 4;
        }
        ys = next;
    }
    // Keep the road above the waterline (causeway through lowlands), then
    // smooth once more so the clamp introduces no kinks.
    ys = ys.map(y => Math.max(y, 1.4));
    {
        const next = new Array(ys.length);
        for (let i = 0; i < ys.length; i++) {
            next[i] = (ys[(i - 1 + ys.length) % ys.length] + ys[i] * 2 + ys[(i + 1) % ys.length]) / 4;
        }
        ys = next.map(y => Math.max(y, 1.2));
    }
    const samples = [];
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        let tx = q[0] - p[0], tz = q[1] - p[1];
        const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
        samples.push({ x: p[0], y: ys[i], z: p[1], tx, tz, nx: -tz, nz: tx });
    }
    return samples;
}
export function nearestTrack(samples, x, z) {
    let best = 1e18, bi = 0;
    for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        const dx = x - s.x, dz = z - s.z;
        const d = dx * dx + dz * dz;
        if (d < best) { best = d; bi = i; }
    }
    return { d: Math.sqrt(best), i: bi, s: samples[bi], frac: bi / samples.length };
}

export function hexRgb(hex) {
    return [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
}
export function shade(rgb, f) {
    return [clamp(rgb[0] * f, 0, 1), clamp(rgb[1] * f, 0, 1), clamp(rgb[2] * f, 0, 1)];
}
export function fmtTime(ms) {
    if (ms == null || !isFinite(ms)) return '--';
    const m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60, d = Math.floor(ms / 100) % 10;
    return m + ':' + String(s).padStart(2, '0') + '.' + d;
}
