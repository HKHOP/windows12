// Apex Drive 3D — geometry batching, the detailed sports-car model, shaders.
import { mat4TRS, transformPoint, transformNormal, hexRgb, shade } from './util.js';

const CUBE_P = [
    1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, -1, 1, 1, 1, 1, -1, 1,
    -1, -1, 1, -1, 1, 1, -1, 1, -1, -1, -1, 1, -1, 1, -1, -1, -1, -1,
    -1, 1, 1, 1, 1, 1, 1, 1, -1, -1, 1, 1, 1, 1, -1, -1, 1, -1,
    -1, -1, -1, 1, -1, -1, 1, -1, 1, -1, -1, -1, 1, -1, 1, -1, -1, 1,
    -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, -1, 1, 1, 1, 1, -1, 1, 1,
    1, -1, -1, -1, -1, -1, -1, 1, -1, 1, -1, -1, -1, 1, -1, 1, 1, -1
];
const CUBE_N = [
    1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
    -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1
];

export class Batch {
    constructor() { this.pos = []; this.nrm = []; this.col = []; this.idx = []; }
    _push(px, py, pz, nx, ny, nz, c) {
        this.pos.push(px, py, pz); this.nrm.push(nx, ny, nz); this.col.push(c[0], c[1], c[2]);
        return this.pos.length / 3 - 1;
    }
    box(w, h, d, c, tx, ty, tz, ry, rx) {
        const m = mat4TRS(tx || 0, ty || 0, tz || 0, ry || 0, rx || 0);
        const sx = w / 2, sy = h / 2, sz = d / 2;
        for (let i = 0; i < 36; i++) {
            const p = transformPoint(m, CUBE_P[i * 3] * sx, CUBE_P[i * 3 + 1] * sy, CUBE_P[i * 3 + 2] * sz);
            const n = transformNormal(m, CUBE_N[i * 3], CUBE_N[i * 3 + 1], CUBE_N[i * 3 + 2]);
            this.idx.push(this._push(p[0], p[1], p[2], n[0], n[1], n[2], c));
        }
    }
    // cylinder along the X axis (wheels, exhausts)
    cylX(r, len, c, tx, ty, tz, seg) {
        seg = seg || 10;
        const ring = [];
        for (let i = 0; i < seg; i++) {
            const a = (i / seg) * Math.PI * 2;
            const ny = Math.cos(a), nz = Math.sin(a);
            ring.push([
                this._push(tx - len / 2, ty + ny * r, tz + nz * r, 0, ny, nz, c),
                this._push(tx + len / 2, ty + ny * r, tz + nz * r, 0, ny, nz, c)
            ]);
        }
        for (let i = 0; i < seg; i++) {
            const j = (i + 1) % seg;
            const a = ring[i], b = ring[j];
            this.idx.push(a[0], b[0], b[1], a[0], b[1], a[1]);
        }
        const cl = this._push(tx - len / 2, ty, tz, -1, 0, 0, shade(c, 0.9));
        const cr = this._push(tx + len / 2, ty, tz, 1, 0, 0, shade(c, 0.9));
        for (let i = 0; i < seg; i++) {
            const j = (i + 1) % seg;
            this.idx.push(cl, ring[j][0], ring[i][0]);
            this.idx.push(cr, ring[i][1], ring[j][1]);
        }
    }
    // cone along +Y (tree canopies): base ring at y0, apex at y1
    cone(r, y0, y1, c, tx, tz, seg) {
        seg = seg || 8;
        const base = [];
        for (let i = 0; i < seg; i++) {
            const a = (i / seg) * Math.PI * 2;
            const ca = Math.cos(a), sa = Math.sin(a);
            base.push(this._push(tx + ca * r, y0, tz + sa * r, ca * 0.7, 0.5, sa * 0.7, c));
        }
        const apex = this._push(tx, y1, tz, 0, 1, 0, shade(c, 1.08));
        const bc = this._push(tx, y0, tz, 0, -1, 0, shade(c, 0.7));
        for (let i = 0; i < seg; i++) {
            const j = (i + 1) % seg;
            this.idx.push(base[i], base[j], apex);
            this.idx.push(bc, base[i], base[j]);
        }
    }
    octa(r, c, tx, ty, tz) {
        const v = [
            this._push(tx + r, ty, tz, 1, 0, 0, c), this._push(tx - r, ty, tz, -1, 0, 0, c),
            this._push(tx, ty + r, tz, 0, 1, 0, c), this._push(tx, ty - r, tz, 0, -1, 0, c),
            this._push(tx, ty, tz + r, 0, 0, 1, c), this._push(tx, ty, tz - r, 0, 0, -1, c)
        ];
        const F = [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 0, 3], [1, 4, 3], [5, 1, 3], [0, 5, 3]];
        for (const f of F) this.idx.push(v[f[0]], v[f[1]], v[f[2]]);
    }
    build(gl) {
        const mesh = { count: this.idx.length, vbo: gl.createBuffer(), ibo: gl.createBuffer() };
        const n = this.pos.length / 3;
        const data = new Float32Array(n * 9);
        for (let i = 0; i < n; i++) {
            data[i * 9] = this.pos[i * 3]; data[i * 9 + 1] = this.pos[i * 3 + 1]; data[i * 9 + 2] = this.pos[i * 3 + 2];
            data[i * 9 + 3] = this.nrm[i * 3]; data[i * 9 + 4] = this.nrm[i * 3 + 1]; data[i * 9 + 5] = this.nrm[i * 3 + 2];
            data[i * 9 + 6] = this.col[i * 3]; data[i * 9 + 7] = this.col[i * 3 + 1]; data[i * 9 + 8] = this.col[i * 3 + 2];
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
        // Uint16 (not Uint32): UNSIGNED_INT indices need the
        // OES_element_index_uint extension, which many WebGL1 contexts lack.
        // Every Apex mesh is far below the 65535-vertex limit.
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(this.idx), gl.STATIC_DRAW);
        return mesh;
    }
}

// Detailed sports car (~20 parts). Local space: +Z forward, origin at ground.
export function buildCarBatches(mainHex, glassHex) {
    const main = hexRgb(mainHex), glass = hexRgb(glassHex);
    const dark = [0.08, 0.08, 0.1], trim = [0.12, 0.12, 0.15];
    const body = new Batch(), glow = new Batch();
    body.box(2.0, 0.55, 4.3, main, 0, 0.62, 0);                          // chassis
    body.box(1.8, 0.38, 1.1, shade(main, 0.85), 0, 0.52, 2.35);           // nose
    body.box(1.7, 0.3, 0.9, shade(main, 1.12), 0, 0.98, -1.2);            // rear deck
    body.box(1.5, 0.55, 2.0, glass, 0, 1.12, -0.2);                       // cabin
    body.box(1.42, 0.12, 1.15, main, 0, 1.45, -0.3);                      // roof
    body.box(1.44, 0.07, 0.75, shade(glass, 1.5), 0, 1.1, 0.98, 0, -0.45);// windshield
    body.box(1.4, 0.07, 0.55, shade(glass, 1.3), 0, 1.12, -1.28, 0, 0.4); // rear glass
    body.box(2.06, 0.34, 0.42, trim, 0, 0.36, 2.2);                       // bumpers
    body.box(2.06, 0.34, 0.42, trim, 0, 0.36, -2.2);
    body.box(2.14, 0.12, 3.4, trim, 0, 0.2, 0);                           // splitter tray
    body.box(0.16, 0.3, 2.7, trim, 1.02, 0.32, 0);                        // skirts
    body.box(0.16, 0.3, 2.7, trim, -1.02, 0.32, 0);
    body.box(1.95, 0.09, 0.5, trim, 0, 1.32, -2.18);                      // spoiler wing
    body.box(1.95, 0.06, 0.14, main, 0, 1.38, -2.18);
    body.box(0.12, 0.5, 0.3, trim, 0.7, 1.0, -2.18);                      // struts
    body.box(0.12, 0.5, 0.3, trim, -0.7, 1.0, -2.18);
    body.box(0.22, 0.12, 0.18, main, 1.05, 1.05, 0.55);                   // mirrors
    body.box(0.22, 0.12, 0.18, main, -1.05, 1.05, 0.55);
    body.box(0.5, 0.22, 0.1, dark, 0, 0.42, 2.42);                        // grille
    const exh = new Batch();
    exh.cylX(0.09, 0.3, [0.7, 0.7, 0.75], 0.45, 0.3, -2.35);
    exh.cylX(0.09, 0.3, [0.7, 0.7, 0.75], -0.45, 0.3, -2.35);
    glow.box(0.36, 0.16, 0.08, [0.85, 0.95, 1.0], 0.6, 0.66, 2.42);        // headlights
    glow.box(0.36, 0.16, 0.08, [0.85, 0.95, 1.0], -0.6, 0.66, 2.42);
    glow.box(1.6, 0.13, 0.08, [1.0, 0.12, 0.15], 0, 0.78, -2.42);         // tail bar
    glow.box(0.5, 0.06, 0.02, [1.0, 0.85, 0.3], 0, 0.35, 2.44);
    const wheelGeo = new Batch();
    wheelGeo.cylX(0.44, 0.36, [0.07, 0.07, 0.08]);
    wheelGeo.cylX(0.2, 0.38, [0.65, 0.65, 0.7]);                          // hub
    return {
        body, glow, exh, wheelGeo,
        wheels: [
            { x: 1.02, y: 0.44, z: 1.45, steer: true },
            { x: -1.02, y: 0.44, z: 1.45, steer: true },
            { x: 1.02, y: 0.44, z: -1.45, steer: false },
            { x: -1.02, y: 0.44, z: -1.45, steer: false }
        ]
    };
}

export const VS = `
attribute vec3 aPos; attribute vec3 aNrm; attribute vec3 aCol;
uniform mat4 uMVP; uniform mat4 uModel;
varying vec3 vCol; varying vec3 vNrm; varying float vDist;
void main() {
    vCol = aCol;
    vNrm = mat3(uModel[0].xyz, uModel[1].xyz, uModel[2].xyz) * aNrm;
    vec4 wp = uModel * vec4(aPos, 1.0);
    vec4 cp = uMVP * wp;
    vDist = length(cp.xyz);
    gl_Position = cp;
}`;
export const FS = `
precision mediump float;
uniform vec3 uSun; uniform vec3 uFog; uniform vec2 uFogRange;
uniform float uEmissive;
varying vec3 vCol; varying vec3 vNrm; varying float vDist;
void main() {
    vec3 n = normalize(vNrm);
    float diff = max(dot(n, uSun), 0.0);
    vec3 lit = vCol * (0.45 + diff * 0.75);
    lit += vCol * max(n.y, 0.0) * 0.12;
    vec3 col = mix(lit, vCol, uEmissive);
    float f = clamp((vDist - uFogRange.x) / (uFogRange.y - uFogRange.x), 0.0, 1.0);
    gl_FragColor = vec4(mix(col, uFog, f), 1.0);
}`;
export const WVS = `
attribute vec3 aPos; uniform mat4 uMVP;
void main() { gl_Position = uMVP * vec4(aPos, 1.0); }`;
export const WFS = `
precision mediump float; uniform vec4 uColor;
void main() { gl_FragColor = uColor; }`;

export function compile(gl, vs, fs) {
    function sh(type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
    }
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos'); gl.bindAttribLocation(p, 1, 'aNrm'); gl.bindAttribLocation(p, 2, 'aCol');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
}
