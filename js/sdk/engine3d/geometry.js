// Engine3D — geometry: buffer geometry container + parametric primitives.
// Every primitive returns interleaved-ready Float32Arrays (position/normal/uv)
// plus an index array. Non-indexed primitives are indexed at build time.
// Import-safe under Node.

import { Vec3 } from './math.js';

/** Convert triangle soup to a wireframe line index buffer (lazily cached). */
function buildWireframeIndex(indices) {
    const edges = new Set();
    const out = [];
    const push = (a, b) => {
        const lo = Math.min(a, b), hi = Math.max(a, b);
        const key = lo * 0x4000000 + hi;
        if (!edges.has(key)) { edges.add(key); out.push(lo, hi); }
    };
    for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i], b = indices[i + 1], c = indices[i + 2];
        push(a, b); push(b, c); push(c, a);
    }
    return indices instanceof Uint32Array
        ? new Uint32Array(out)
        : new Uint16Array(out);
}

export class BufferGeometry {
    constructor({ position, normal, uv, index, mode = 'TRIANGLES' } = {}) {
        this.position = position || null;   // Float32Array, 3 components
        this.normal = normal || null;       // Float32Array, 3 components
        this.uv = uv || null;               // Float32Array, 2 components
        this.index = index || null;         // Uint16Array | Uint32Array
        this.mode = mode;                   // TRIANGLES | LINES
        this.boundingSphere = null;         // { center: Vec3, radius }
        this._wireframeIndex = null;
    }

    computeBoundingSphere() {
        const p = this.position;
        if (!p || p.length === 0) {
            this.boundingSphere = { center: Vec3.create(), radius: 0 };
            return this;
        }
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (let i = 0; i < p.length; i += 3) {
            if (p[i] < minX) minX = p[i]; else if (p[i] > maxX) maxX = p[i];
            if (p[i + 1] < minY) minY = p[i + 1]; else if (p[i + 1] > maxY) maxY = p[i + 1];
            if (p[i + 2] < minZ) minZ = p[i + 2]; else if (p[i + 2] > maxZ) maxZ = p[i + 2];
        }
        const cx = (minX + maxX) * 0.5, cy = (minY + maxY) * 0.5, cz = (minZ + maxZ) * 0.5;
        let r2 = 0;
        for (let i = 0; i < p.length; i += 3) {
            const dx = p[i] - cx, dy = p[i + 1] - cy, dz = p[i + 2] - cz;
            const d = dx * dx + dy * dy + dz * dz;
            if (d > r2) r2 = d;
        }
        this.boundingSphere = {
            center: Vec3.create(cx, cy, cz),
            radius: Math.sqrt(r2),
        };
        return this;
    }

    /** Line index buffer covering every triangle edge (for wireframe rendering). */
    get wireframeIndex() {
        if (!this._wireframeIndex) {
            if (!this.index) {
                // generate trivial indices over the vertex list
                const count = this.position ? this.position.length / 3 : 0;
                const idx = new Uint16Array(count);
                for (let i = 0; i < count; i++) idx[i] = i;
                this.index = idx;
            }
            this._wireframeIndex = buildWireframeIndex(this.index);
        }
        return this._wireframeIndex;
    }

    get vertexCount() {
        return this.position ? this.position.length / 3 : 0;
    }

    get indexCount() {
        return this.index ? this.index.length : this.vertexCount;
    }
}

// ------------------------------------------------------------------ builders

function makeGeometry(position, normal, uv, index) {
    return new BufferGeometry({
        position: new Float32Array(position),
        normal: new Float32Array(normal),
        uv: new Float32Array(uv),
        index: index.length > 65535 ? new Uint32Array(index) : new Uint16Array(index),
    }).computeBoundingSphere();
}

export const GeometryFactory = {
    /** Axis-aligned box, 1×1×1 centered at origin. */
    box(width = 1, height = 1, depth = 1) {
        const x = width / 2, y = height / 2, z = depth / 2;
        const positions = [], normals = [], uvs = [], indices = [];
        const faces = [
            // [normal, corner (4, CCW from outside)]
            [[0, 0, 1], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]],
            [[0, 0, -1], [x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]],
            [[1, 0, 0], [x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]],
            [[-1, 0, 0], [-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]],
            [[0, 1, 0], [-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]],
            [[0, -1, 0], [-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]],
        ];
        const faceUV = [[0, 0], [1, 0], [1, 1], [0, 1]];
        for (const [n, ...corners] of faces) {
            const base = positions.length / 3;
            for (let i = 0; i < 4; i++) {
                positions.push(...corners[i]);
                normals.push(...n);
                uvs.push(faceUV[i][0], faceUV[i][1]);
            }
            indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
        return makeGeometry(positions, normals, uvs, indices);
    },

    /** UV sphere (lat/long). */
    sphere(radius = 0.5, widthSegments = 24, heightSegments = 16) {
        const positions = [], normals = [], uvs = [], indices = [];
        for (let iy = 0; iy <= heightSegments; iy++) {
            const v = iy / heightSegments;
            const theta = v * Math.PI;
            const sinT = Math.sin(theta), cosT = Math.cos(theta);
            for (let ix = 0; ix <= widthSegments; ix++) {
                const u = ix / widthSegments;
                const phi = u * Math.PI * 2;
                const sinP = Math.sin(phi), cosP = Math.cos(phi);
                const nx = cosP * sinT, ny = cosT, nz = sinP * sinT;
                positions.push(nx * radius, ny * radius, nz * radius);
                normals.push(nx, ny, nz);
                uvs.push(u, 1 - v);
            }
        }
        const stride = widthSegments + 1;
        for (let iy = 0; iy < heightSegments; iy++) {
            for (let ix = 0; ix < widthSegments; ix++) {
                const a = iy * stride + ix;
                const b = a + stride;
                indices.push(a, b, a + 1, b, b + 1, a + 1);
            }
        }
        return makeGeometry(positions, normals, uvs, indices);
    },

    /** Ground plane on XZ facing +Y. */
    plane(width = 1, depth = 1, segX = 1, segZ = 1) {
        const positions = [], normals = [], uvs = [], indices = [];
        const hx = width / 2, hz = depth / 2;
        for (let iz = 0; iz <= segZ; iz++) {
            for (let ix = 0; ix <= segX; ix++) {
                const u = ix / segX, v = iz / segZ;
                positions.push(-hx + u * width, 0, -hz + v * depth);
                normals.push(0, 1, 0);
                uvs.push(u, v);
            }
        }
        const stride = segX + 1;
        for (let iz = 0; iz < segZ; iz++) {
            for (let ix = 0; ix < segX; ix++) {
                const a = iz * stride + ix;
                const b = a + stride;
                indices.push(a, b, a + 1, a + 1, b, b + 1);
            }
        }
        return makeGeometry(positions, normals, uvs, indices);
    },

    /** Cylinder along Y (each ring's normal is smoothed for the side wall). */
    cylinder(radiusTop = 0.5, radiusBottom = 0.5, height = 1, radialSegments = 24) {
        const positions = [], normals = [], uvs = [], indices = [];
        const half = height / 2;
        // smooth slope normal for tapered walls
        const slope = (radiusBottom - radiusTop) / height;
        const nScale = 1 / Math.hypot(1, Math.abs(slope));
        const sideNY = -slope * nScale;

        const ringStart = (radius, y) => {
            const base = positions.length / 3;
            for (let i = 0; i <= radialSegments; i++) {
                const phi = (i / radialSegments) * Math.PI * 2;
                const cosP = Math.cos(phi), sinP = Math.sin(phi);
                positions.push(cosP * radius, y, sinP * radius);
                normals.push(cosP * nScale, sideNY, sinP * nScale);
                uvs.push(i / radialSegments, y < 0 ? 0 : 1);
            }
            return base;
        };

        const bottom = ringStart(radiusBottom, -half);
        const top = ringStart(radiusTop, half);
        for (let i = 0; i < radialSegments; i++) {
            const a0 = bottom + i, a1 = bottom + i + 1;
            const b0 = top + i, b1 = top + i + 1;
            indices.push(a0, a1, b1, b1, b0, a0);
        }
        // end caps as triangle fans
        const cap = (radius, y, ny) => {
            const capBase = positions.length / 3;
            positions.push(0, y, 0);
            normals.push(0, ny, 0);
            uvs.push(0.5, 0.5);
            for (let i = 0; i <= radialSegments; i++) {
                const phi = (i / radialSegments) * Math.PI * 2;
                const cosP = Math.cos(phi), sinP = Math.sin(phi);
                positions.push(cosP * radius, y, sinP * radius);
                normals.push(0, ny, 0);
                uvs.push(cosP * 0.5 + 0.5, sinP * 0.5 + 0.5);
            }
            for (let i = 1; i <= radialSegments; i++) {
                if (ny < 0) indices.push(capBase, capBase + i + 1, capBase + i);
                else indices.push(capBase, capBase + i, capBase + i + 1);
            }
        };
        if (radiusBottom > 0) cap(radiusBottom, -half, -1);
        if (radiusTop > 0) cap(radiusTop, half, 1);
        return makeGeometry(positions, normals, uvs, indices);
    },

    /** Cone along Y (pointing up). */
    cone(radius = 0.5, height = 1, radialSegments = 24) {
        return GeometryFactory.cylinder(0, radius, height, radialSegments);
    },

    /** Torus lying on XZ. */
    torus(radius = 0.5, tube = 0.2, radialSegments = 16, tubularSegments = 32) {
        const positions = [], normals = [], uvs = [], indices = [];
        for (let j = 0; j <= radialSegments; j++) {
            const v = j / radialSegments * Math.PI * 2;
            const cosV = Math.cos(v), sinV = Math.sin(v);
            for (let i = 0; i <= tubularSegments; i++) {
                const u = i / tubularSegments * Math.PI * 2;
                const cosU = Math.cos(u), sinU = Math.sin(u);
                const x = (radius + tube * cosV) * cosU;
                const y = tube * sinV;
                const z = (radius + tube * cosV) * sinU;
                positions.push(x, y, z);
                normals.push(cosV * cosU, sinV, cosV * sinU);
                uvs.push(i / tubularSegments, j / radialSegments);
            }
        }
        const stride = tubularSegments + 1;
        for (let j = 0; j < radialSegments; j++) {
            for (let i = 0; i < tubularSegments; i++) {
                const a = j * stride + i, b = a + stride;
                indices.push(a, b, a + 1, b, b + 1, a + 1);
            }
        }
        return makeGeometry(positions, normals, uvs, indices);
    },

    /** Flat line grid on XZ (render with a lines material). */
    grid(size = 10, divisions = 10) {
        const step = size / divisions;
        const half = size / 2;
        const positions = [];
        for (let i = 0; i <= divisions; i++) {
            const p = -half + i * step;
            positions.push(p, 0, -half, p, 0, half);   // lines along Z
            positions.push(-half, 0, p, half, 0, p);   // lines along X
        }
        const count = positions.length / 3;
        const index = new Uint16Array(count);
        for (let i = 0; i < count; i++) index[i] = i;
        return new BufferGeometry({
            position: new Float32Array(positions),
            normal: null, uv: null, index,
            mode: 'LINES',
        }).computeBoundingSphere();
    },
};
