// Engine3D — math core.
// Plain-function math on Float32Arrays with explicit `out` parameters, mirroring
// the gl-matrix layout (column-major mat4). No allocations inside hot helpers
// unless `out` is omitted; the engine reuses scratch matrices/quaternions.
// Import-safe under Node (no DOM access at module scope).

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;
export const EPSILON = 1e-6;

// ---------------------------------------------------------------- Vec3

export const Vec3 = {
    create(x = 0, y = 0, z = 0) {
        const v = new Float32Array(3);
        v[0] = x; v[1] = y; v[2] = z;
        return v;
    },
    set(out, x, y, z) { out[0] = x; out[1] = y; out[2] = z; return out; },
    copy(out, a) { out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; return out; },
    add(out, a, b) {
        out[0] = a[0] + b[0]; out[1] = a[1] + b[1]; out[2] = a[2] + b[2];
        return out;
    },
    sub(out, a, b) {
        out[0] = a[0] - b[0]; out[1] = a[1] - b[1]; out[2] = a[2] - b[2];
        return out;
    },
    scale(out, a, s) {
        out[0] = a[0] * s; out[1] = a[1] * s; out[2] = a[2] * s;
        return out;
    },
    addScaled(out, a, b, s) {
        out[0] = a[0] + b[0] * s; out[1] = a[1] + b[1] * s; out[2] = a[2] + b[2] * s;
        return out;
    },
    dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; },
    cross(out, a, b) {
        const ax = a[0], ay = a[1], az = a[2];
        const bx = b[0], by = b[1], bz = b[2];
        out[0] = ay * bz - az * by;
        out[1] = az * bx - ax * bz;
        out[2] = ax * by - ay * bx;
        return out;
    },
    length(a) { return Math.hypot(a[0], a[1], a[2]); },
    distance(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); },
    normalize(out, a) {
        const l = Math.hypot(a[0], a[1], a[2]);
        if (l > EPSILON) {
            const inv = 1 / l;
            out[0] = a[0] * inv; out[1] = a[1] * inv; out[2] = a[2] * inv;
        } else {
            out[0] = 0; out[1] = 0; out[2] = 0;
        }
        return out;
    },
    lerp(out, a, b, t) {
        out[0] = a[0] + (b[0] - a[0]) * t;
        out[1] = a[1] + (b[1] - a[1]) * t;
        out[2] = a[2] + (b[2] - a[2]) * t;
        return out;
    },
    min(out, a, b) {
        out[0] = Math.min(a[0], b[0]); out[1] = Math.min(a[1], b[1]); out[2] = Math.min(a[2], b[2]);
        return out;
    },
    max(out, a, b) {
        out[0] = Math.max(a[0], b[0]); out[1] = Math.max(a[1], b[1]); out[2] = Math.max(a[2], b[2]);
        return out;
    },
    /** Transform `a` by `m` with perspective divide. */
    transformMat4(out, a, m) {
        const x = a[0], y = a[1], z = a[2];
        const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
        out[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
        out[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
        out[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
        return out;
    },
    /** Transform `a` by `m` ignoring translation (normals/directions). */
    transformDirection(out, a, m) {
        const x = a[0], y = a[1], z = a[2];
        out[0] = m[0] * x + m[4] * y + m[8] * z;
        out[1] = m[1] * x + m[5] * y + m[9] * z;
        out[2] = m[2] * x + m[6] * y + m[10] * z;
        return Vec3.normalize(out, out);
    },
    transformQuat(out, a, q) {
        const x = a[0], y = a[1], z = a[2];
        const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
        const ix = qw * x + qy * z - qz * y;
        const iy = qw * y + qz * x - qx * z;
        const iz = qw * z + qx * y - qy * x;
        const iw = -qx * x - qy * y - qz * z;
        out[0] = ix * qw + iw * -qx + iy * -qz - iz * -qy;
        out[1] = iy * qw + iw * -qy + iz * -qx - ix * -qz;
        out[2] = iz * qw + iw * -qz + ix * -qy - iy * -qx;
        return out;
    },
    /** Array-friendly accessor: v.get(0,1,2). */
    clone(a) { return Vec3.create(a[0], a[1], a[2]); },
};

// ---------------------------------------------------------------- Quat

export const Quat = {
    create(x = 0, y = 0, z = 0, w = 1) {
        const q = new Float32Array(4);
        q[0] = x; q[1] = y; q[2] = z; q[3] = w;
        return q;
    },
    identity(out) { out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 1; return out; },
    copy(out, a) { out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; out[3] = a[3]; return out; },
    setAxisAngle(out, axis, rad) {
        const half = rad * 0.5;
        const s = Math.sin(half);
        out[0] = axis[0] * s; out[1] = axis[1] * s; out[2] = axis[2] * s;
        out[3] = Math.cos(half);
        return out;
    },
    /** Euler angles in radians, YXZ order (yaw → pitch → roll, FPS-friendly). */
    fromEuler(out, x, y, z) {
        const hx = x * 0.5, hy = y * 0.5, hz = z * 0.5;
        const cx = Math.cos(hx), sx = Math.sin(hx);
        const cy = Math.cos(hy), sy = Math.sin(hy);
        const cz = Math.cos(hz), sz = Math.sin(hz);
        out[0] = sx * cy * cz + cx * sy * sz;
        out[1] = cx * sy * cz - sx * cy * sz;
        out[2] = cx * cy * sz + sx * sy * cz;
        out[3] = cx * cy * cz - sx * sy * sz;
        return out;
    },
    normalize(out, a) {
        let l = Math.hypot(a[0], a[1], a[2], a[3]);
        if (l <= EPSILON) { out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 1; return out; }
        l = 1 / l;
        out[0] = a[0] * l; out[1] = a[1] * l; out[2] = a[2] * l; out[3] = a[3] * l;
        return out;
    },
    multiply(out, a, b) {
        const ax = a[0], ay = a[1], az = a[2], aw = a[3];
        const bx = b[0], by = b[1], bz = b[2], bw = b[3];
        out[0] = ax * bw + aw * bx + ay * bz - az * by;
        out[1] = ay * bw + aw * by + az * bx - ax * bz;
        out[2] = az * bw + aw * bz + ax * by - ay * bx;
        out[3] = aw * bw - ax * bx - ay * by - az * bz;
        return out;
    },
    slerp(out, a, b, t) {
        let bx = b[0], by = b[1], bz = b[2], bw = b[3];
        let cosHalf = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
        if (cosHalf < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; cosHalf = -cosHalf; }
        if (cosHalf > 0.9995) {
            out[0] = a[0] + (bx - a[0]) * t;
            out[1] = a[1] + (by - a[1]) * t;
            out[2] = a[2] + (bz - a[2]) * t;
            out[3] = a[3] + (bw - a[3]) * t;
            return Quat.normalize(out, out);
        }
        const theta = Math.acos(cosHalf);
        const sinTheta = Math.sin(theta);
        const wa = Math.sin((1 - t) * theta) / sinTheta;
        const wb = Math.sin(t * theta) / sinTheta;
        out[0] = a[0] * wa + bx * wb;
        out[1] = a[1] * wa + by * wb;
        out[2] = a[2] * wa + bz * wb;
        out[3] = a[3] * wa + bw * wb;
        return out;
    },
};

// ---------------------------------------------------------------- Mat4
// Column-major, Float32Array(16) — matches WebGL uniformMatrix4fv directly.

export const Mat4 = {
    create() {
        const m = new Float32Array(16);
        m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
        return m;
    },
    identity(out) {
        out.fill(0);
        out[0] = 1; out[5] = 1; out[10] = 1; out[15] = 1;
        return out;
    },
    copy(out, a) { out.set(a); return out; },

    perspective(out, fovY, aspect, near, far) {
        const f = 1 / Math.tan(fovY / 2);
        const nf = 1 / (near - far);
        out.fill(0);
        out[0] = f / aspect;
        out[5] = f;
        out[10] = (far + near) * nf;
        out[11] = -1;
        out[14] = 2 * far * near * nf;
        return out;
    },
    ortho(out, left, right, bottom, top, near, far) {
        const lr = 1 / (left - right), bt = 1 / (bottom - top), nf = 1 / (near - far);
        out.fill(0);
        out[0] = -2 * lr;
        out[5] = -2 * bt;
        out[10] = 2 * nf;
        out[12] = (left + right) * lr;
        out[13] = (top + bottom) * bt;
        out[14] = (far + near) * nf;
        out[15] = 1;
        return out;
    },
    lookAt(out, eye, center, up) {
        let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
        let len = Math.hypot(zx, zy, zz);
        if (len <= EPSILON) { zz = 1; len = 1; }
        zx /= len; zy /= len; zz /= len;
        let xx = up[1] * zz - up[2] * zy;
        let xy = up[2] * zx - up[0] * zz;
        let xz = up[0] * zy - up[1] * zx;
        len = Math.hypot(xx, xy, xz);
        if (len <= EPSILON) {
            // up parallel to view dir — nudge
            xx = 1; xy = 0; xz = 0;
        } else {
            xx /= len; xy /= len; xz /= len;
        }
        const yx = zy * xz - zz * xy;
        const yy = zz * xx - zx * xz;
        const yz = zx * xy - zy * xx;
        out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
        out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
        out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
        out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
        out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
        out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
        out[15] = 1;
        return out;
    },
    multiply(out, a, b) {
        const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
        const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
        const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
        const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
        for (let i = 0; i < 4; i++) {
            const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
            out[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
            out[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
            out[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
            out[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
        }
        return out;
    },
    invert(out, a) {
        const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
        const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
        const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
        const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
        const b00 = a00 * a11 - a01 * a10;
        const b01 = a00 * a12 - a02 * a10;
        const b02 = a00 * a13 - a03 * a10;
        const b03 = a01 * a12 - a02 * a11;
        const b04 = a01 * a13 - a03 * a11;
        const b05 = a02 * a13 - a03 * a12;
        const b06 = a20 * a31 - a21 * a30;
        const b07 = a20 * a32 - a22 * a30;
        const b08 = a20 * a33 - a23 * a30;
        const b09 = a21 * a32 - a22 * a31;
        const b10 = a21 * a33 - a23 * a31;
        const b11 = a22 * a33 - a23 * a32;
        let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
        if (!det) return Mat4.identity(out);
        det = 1 / det;
        out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
        out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
        out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
        out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
        out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
        out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
        out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
        out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
        out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
        out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
        out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
        out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
        out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
        out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
        out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
        out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
        return out;
    },
    transpose(out, a) {
        if (out === a) {
            const a01 = a[1], a02 = a[2], a03 = a[3], a12 = a[6], a13 = a[7], a23 = a[11];
            out[1] = a[4]; out[2] = a[8]; out[3] = a[12];
            out[4] = a01; out[6] = a[9]; out[7] = a[13];
            out[8] = a02; out[9] = a12; out[11] = a[14];
            out[12] = a03; out[13] = a13; out[14] = a23;
        } else {
            out[0] = a[0]; out[1] = a[4]; out[2] = a[8]; out[3] = a[12];
            out[4] = a[1]; out[5] = a[5]; out[6] = a[9]; out[7] = a[13];
            out[8] = a[2]; out[9] = a[6]; out[10] = a[10]; out[11] = a[14];
            out[12] = a[3]; out[13] = a[7]; out[14] = a[11]; out[15] = a[15];
        }
        return out;
    },
    /** out = T(position) * R(quaternion) * S(scale) */
    fromQuatPosScale(out, q, p, s) {
        const x = q[0], y = q[1], z = q[2], w = q[3];
        const x2 = x + x, y2 = y + y, z2 = z + z;
        const xx = x * x2, xy = x * y2, xz = x * z2;
        const yy = y * y2, yz = y * z2, zz = z * z2;
        const wx = w * x2, wy = w * y2, wz = w * z2;
        const sx = s[0], sy = s[1], sz = s[2];
        out[0] = (1 - (yy + zz)) * sx;
        out[1] = (xy + wz) * sx;
        out[2] = (xz - wy) * sx;
        out[3] = 0;
        out[4] = (xy - wz) * sy;
        out[5] = (1 - (xx + zz)) * sy;
        out[6] = (yz + wx) * sy;
        out[7] = 0;
        out[8] = (xz + wy) * sz;
        out[9] = (yz - wx) * sz;
        out[10] = (1 - (xx + yy)) * sz;
        out[11] = 0;
        out[12] = p[0]; out[13] = p[1]; out[14] = p[2]; out[15] = 1;
        return out;
    },
    /** Extract translation (column 3). */
    getTranslation(out, m) {
        out[0] = m[12]; out[1] = m[13]; out[2] = m[14];
        return out;
    },
    /** Transform a point by the matrix (assumes no perspective divide needed). */
    transformPoint(out, m, p) {
        const x = p[0], y = p[1], z = p[2];
        out[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
        out[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
        out[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
        return out;
    },
};

// ---------------------------------------------------------------- misc

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/** Scratch objects shared by engine internals — never hold references across frames. */
export const scratch = {
    m0: Mat4.create(), m1: Mat4.create(), m2: Mat4.create(), m3: Mat4.create(),
    v0: Vec3.create(), v1: Vec3.create(), v2: Vec3.create(), v3: Vec3.create(),
    v4: Vec3.create(), v5: Vec3.create(),
    q0: Quat.create(),
};
