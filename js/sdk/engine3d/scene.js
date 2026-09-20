// Engine3D — scene graph: nodes, transforms, meshes, instancing, lights,
// raycasting. Transforms are dirty-flag cached: a local matrix is only
// recomputed when position/rotation/scale change, world matrices only when
// an ancestor changed.
// Import-safe under Node.

import { Vec3, Mat4, Quat, scratch } from './math.js';
import { BufferGeometry } from './geometry.js';

let nextNodeId = 1;

export class Node {
    constructor(name = '') {
        this.id = nextNodeId++;
        this.name = name;
        this.parent = null;
        this.children = [];
        this.position = Vec3.create();
        this.rotation = Vec3.create();          // Euler XYZ radians, YXZ applied
        this.scale = Vec3.create(1, 1, 1);
        this.quaternion = Quat.create();        // kept in sync with rotation
        this.visible = true;
        this.matrixLocal = Mat4.create();       // dirty-flag cached
        this.matrixWorld = Mat4.create();
        this._localDirty = true;
        this._worldDirty = true;
        this.castShadows = false;
        this.receiveShadows = false;
        this.frustumCulled = true;
        this.userData = {};
    }

    setPosition(x, y, z) { this.position[0] = x; this.position[1] = y; this.position[2] = z; return this.invalidate(); }
    setRotation(x, y, z) { this.rotation[0] = x; this.rotation[1] = y; this.rotation[2] = z; return this.invalidate(); }
    setScale(x, y = x, z = x) { this.scale[0] = x; this.scale[1] = y; this.scale[2] = z; return this.invalidate(); }

    invalidate() {
        this._localDirty = true;
        this._worldDirty = true;
        for (const c of this.children) c.invalidate();
        return this;
    }

    add(child) {
        if (child.parent) child.parent.remove(child);
        child.parent = this;
        this.children.push(child);
        child.invalidate();
        return this;
    }

    remove(child) {
        const i = this.children.indexOf(child);
        if (i >= 0) {
            this.children.splice(i, 1);
            child.parent = null;
            child.invalidate();
        }
        return this;
    }

    traverse(fn) {
        fn(this);
        for (const c of this.children) c.traverse(fn);
    }

    updateMatrixWorld(parentDirty = false) {
        const dirty = this._localDirty || this._worldDirty || parentDirty;
        if (this._localDirty) {
            Quat.fromEuler(this.quaternion, this.rotation[0], this.rotation[1], this.rotation[2]);
            Mat4.fromQuatPosScale(this.matrixLocal, this.quaternion, this.position, this.scale);
            this._localDirty = false;
        }
        if (dirty) {
            if (this.parent) {
                Mat4.multiply(this.matrixWorld, this.parent.matrixWorld, this.matrixLocal);
            } else {
                Mat4.copy(this.matrixWorld, this.matrixLocal);
            }
            this._worldDirty = false;
        }
        // children see "parent changed" even if this node didn't move
        const childDirty = dirty;
        for (const c of this.children) c.updateMatrixWorld(childDirty);
        return dirty;
    }

    getWorldPosition(out = Vec3.create()) {
        return Mat4.getTranslation(out, this.matrixWorld);
    }
}

export class Group extends Node {
    constructor(name = 'group') {
        super(name);
    }
}

export class Mesh extends Node {
    constructor(geometry, material, name = 'mesh') {
        super(name);
        this.geometry = geometry || new BufferGeometry();
        this.material = material || null;
        this.castShadows = true;
        this.receiveShadows = true;
        this._worldBoundingSphere = null;   // cache: { center, radius } in world space
    }

    /** World-space bounding sphere (recomputed when the mesh moves or geometry changes). */
    getWorldBoundingSphere() {
        const g = this.geometry;
        if (!g.boundingSphere) g.computeBoundingSphere();
        if (!this._worldBoundingSphere || this._worldBoundingSphere.geometry !== g
            || this._worldDirty) {
            const bs = g.boundingSphere;
            const center = Vec3.transformMat4(Vec3.create(), bs.center, this.matrixWorld);
            // uniform scale approximation via max column length
            const m = this.matrixWorld;
            const sx = Math.hypot(m[0], m[1], m[2]);
            const sy = Math.hypot(m[4], m[5], m[6]);
            const sz = Math.hypot(m[8], m[9], m[10]);
            const radius = bs.radius * Math.max(sx, sy, sz);
            this._worldBoundingSphere = { center, radius, geometry: g };
        }
        return this._worldBoundingSphere;
    }

    invalidate() {
        this._worldBoundingSphere = null;
        return super.invalidate();
    }
}

/** Per-instance drawing of one geometry with an instance matrix buffer. */
export class InstancedMesh extends Mesh {
    constructor(geometry, material, count, name = 'instanced') {
        super(geometry, material, name);
        this.count = count;
        this.instanceMatrices = new Float32Array(count * 16); // column-major mat4s
        this._gpuDirty = true;                                 // instance buffer needs re-upload
        this.boundingRadius = null;   // optional: override world cull radius per instance
    }

    setMatrixAt(i, m) {
        if (i < 0 || i >= this.count) return this;
        this.instanceMatrices.set(m, i * 16);
        this._gpuDirty = true;
        return this;
    }

    getMatrixAt(i, out) {
        if (i < 0 || i >= this.count) return out;
        out.set(this.instanceMatrices.subarray(i * 16, i * 16 + 16));
        return out;
    }

    /** Mark the instance buffer for re-upload (after mutating instanceMatrices directly). */
    markInstancesDirty() { this._gpuDirty = true; }

    getWorldBoundingSphere() {
        // whole-buffer cull: local geometry sphere grown by the instance range
        const g = this.geometry;
        if (!g.boundingSphere) g.computeBoundingSphere();
        if (!this._worldBoundingSphere || this._worldDirty) {
            const bs = g.boundingSphere;
            const center = Vec3.transformMat4(Vec3.create(), bs.center, this.matrixWorld);
            const m = this.matrixWorld;
            const sx = Math.hypot(m[0], m[1], m[2]);
            const sy = Math.hypot(m[4], m[5], m[6]);
            const sz = Math.hypot(m[8], m[9], m[10]);
            const scale = Math.max(sx, sy, sz);
            let radius = bs.radius * scale;
            if (this.boundingRadius != null) radius = this.boundingRadius * scale;
            this._worldBoundingSphere = { center, radius, geometry: g };
        }
        return this._worldBoundingSphere;
    }
}

// ------------------------------------------------------------------ lights

export class Light extends Node {
    constructor(name = 'light') {
        super(name);
        this.color = Vec3.create(1, 1, 1);
        this.intensity = 1;
        this.castShadows = false;
        this.isLight = true;
    }
    setColor(r, g, b) { this.color[0] = r; this.color[1] = g; this.color[2] = b; return this; }
}

export class AmbientLight extends Light {
    constructor(intensity = 0.4, color = [1, 1, 1]) {
        super('ambient');
        this.intensity = intensity;
        this.setColor(...color);
    }
}

export class DirectionalLight extends Light {
    constructor(intensity = 1, color = [1, 1, 1]) {
        super('directional');
        this.intensity = intensity;
        this.setColor(...color);
        this.direction = Vec3.create(-0.5, -1, -0.35);  // normalized on upload
        this.shadowMapSize = 2048;
        this.shadowBias = 0.0015;
        this.shadowRange = 40;      // ortho half-extent of the shadow camera
        this.shadowNear = 0.1;
        this.shadowFar = 120;
    }
}

export class PointLight extends Light {
    constructor(intensity = 1, color = [1, 1, 1], range = 15) {
        super('point');
        this.intensity = intensity;
        this.setColor(...color);
        this.range = range;
    }
}

export class SpotLight extends Light {
    constructor(intensity = 1, color = [1, 1, 1], range = 25, angleDeg = 35) {
        super('spot');
        this.intensity = intensity;
        this.setColor(...color);
        this.range = range;
        this.angle = angleDeg * (Math.PI / 180);
        this.direction = Vec3.create(0, -1, 0);
        this.penumbra = 0.25;
    }
}

// ------------------------------------------------------------------ scene

export class Scene extends Node {
    constructor(name = 'scene') {
        super(name);
        this.background = null;   // null → renderer clear color; Skybox → gradient pass
        this.fog = null;          // { color: Vec3, near, far } or null
        this._lights = { ambient: null, directional: [], point: [], spot: [] };
    }

    setFog(color, near, far) {
        this.fog = { color: Vec3.clone(color), near, far };
        return this;
    }

    /** Re-collect visible lights (cheap walk; call once per frame before render). */
    collectLights() {
        const L = this._lights;
        L.ambient = null;
        L.directional.length = 0;
        L.point.length = 0;
        L.spot.length = 0;
        this.traverse((n) => {
            if (!n.isLight || !n.visible) return;
            if (n instanceof AmbientLight) L.ambient = n;
            else if (n instanceof DirectionalLight) L.directional.push(n);
            else if (n instanceof PointLight) L.point.push(n);
            else if (n instanceof SpotLight) L.spot.push(n);
        });
        return L;
    }

    get lights() { return this._lights; }
}

// ------------------------------------------------------------------ picking

function raySphere(origin, dir, center, radius) {
    const ox = origin[0] - center[0], oy = origin[1] - center[1], oz = origin[2] - center[2];
    const b = ox * dir[0] + oy * dir[1] + oz * dir[2];
    const c = ox * ox + oy * oy + oz * oz - radius * radius;
    const disc = b * b - c;
    if (disc < 0) return -1;
    const t = -b - Math.sqrt(disc);
    return t >= 0 ? t : (-b + Math.sqrt(disc) >= 0 ? 0 : -1);
}

function rayTriangle(origin, dir, a, b, c, maxDist) {
    // Möller–Trumbore
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
    const e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
    const px = dir[1] * e2z - dir[2] * e2y;
    const py = dir[2] * e2x - dir[0] * e2z;
    const pz = dir[0] * e2y - dir[1] * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (det > -1e-8 && det < 1e-8) return -1;
    const invDet = 1 / det;
    const tx = origin[0] - a[0], ty = origin[1] - a[1], tz = origin[2] - a[2];
    const u = (tx * px + ty * py + tz * pz) * invDet;
    if (u < 0 || u > 1) return -1;
    const qx = ty * e1z - tz * e1y;
    const qy = tz * e1x - tx * e1z;
    const qz = tx * e1y - ty * e1x;
    const v = (dir[0] * qx + dir[1] * qy + dir[2] * qz) * invDet;
    if (v < 0 || u + v > 1) return -1;
    const t = (e2x * qx + e2y * qy + e2z * qz) * invDet;
    return (t >= 0 && t < maxDist) ? t : -1;
}

export class Raycaster {
    /**
     * Build a ray from camera + NDC coordinates.
     * @param {Camera} camera
     * @param {number} ndcX -1..1
     * @param {number} ndcY -1..1
     */
    static fromCamera(camera, ndcX, ndcY) {
        const origin = camera.getWorldPosition(Vec3.create());
        const dir = Vec3.create();
        // invert viewProj to unproject a point on the far plane
        const inv = Mat4.invert(scratch.m0, camera.viewProj);
        const far = Vec3.set(scratch.v0, ndcX, ndcY, 1);
        Mat4.transformPoint(dir, inv, far); // ignore perspective divide — far plane w=1
        Vec3.sub(dir, dir, origin);
        Vec3.normalize(dir, dir);
        return { origin: Vec3.clone(origin), direction: dir };
    }

    /**
     * Raycast a scene. Returns nearest { mesh, distance, point } or null.
     * @param {{origin, direction}} ray
     * @param {Scene} scene
     * @param {object} opts { skip: (mesh)=>bool }
     */
    static intersect(ray, scene, opts = {}) {
        const { origin, direction } = ray;
        let best = null;
        let bestDist = Infinity;
        const hitPoint = Vec3.create();
        const tri = [Vec3.create(), Vec3.create(), Vec3.create()];
        const localOrigin = Vec3.create(), localDir = Vec3.create();
        const invWorld = scratch.m1;

        scene.traverse((node) => {
            if (!(node instanceof Mesh) || !node.visible) return;
            if (opts.skip && opts.skip(node)) return;
            if (node instanceof InstancedMesh) return; // per-instance picking: use pickInstanced
            if (node.frustumCulled) {
                const bs = node.getWorldBoundingSphere();
                if (raySphere(origin, direction, bs.center, bs.radius) < 0) return;
            }
            const g = node.geometry;
            if (!g.position) return;
            let maxLocal = bestDist;
            Mat4.invert(invWorld, node.matrixWorld);
            Vec3.transformMat4(localOrigin, origin, invWorld);
            Vec3.transformDirection(localDir, direction, invWorld);
            const scaleBack = Math.hypot(localDir[0], localDir[1], localDir[2]) || 1;
            Vec3.scale(localDir, localDir, 1 / scaleBack);
            maxLocal = bestDist * scaleBack;

            const pos = g.position;
            const idx = g.index;
            const testTri = (ia, ib, ic) => {
                const o3 = ia * 3, o6 = ib * 3, o9 = ic * 3;
                Vec3.set(tri[0], pos[o3], pos[o3 + 1], pos[o3 + 2]);
                Vec3.set(tri[1], pos[o6], pos[o6 + 1], pos[o6 + 2]);
                Vec3.set(tri[2], pos[o9], pos[o9 + 1], pos[o9 + 2]);
                const t = rayTriangle(localOrigin, localDir, tri[0], tri[1], tri[2], maxLocal);
                if (t >= 0) {
                    const worldT = t / scaleBack;
                    if (worldT < bestDist) {
                        bestDist = worldT;
                        Vec3.addScaled(hitPoint, origin, direction, worldT);
                        best = { mesh: node, distance: worldT, point: Vec3.clone(hitPoint) };
                        return true;
                    }
                }
                return false;
            };
            if (idx) {
                for (let i = 0; i < idx.length; i += 3) {
                    if (testTri(idx[i], idx[i + 1], idx[i + 2])) maxLocal = bestDist * scaleBack;
                }
            } else {
                for (let i = 0; i < pos.length / 3; i += 3) {
                    if (testTri(i, i + 1, i + 2)) maxLocal = bestDist * scaleBack;
                }
            }
        });
        return best;
    }

    /**
     * Pick an InstancedMesh: returns nearest { mesh, instanceId, distance, point } or null.
     */
    static intersectInstance(ray, im) {
        const { origin, direction } = ray;
        let best = null;
        let bestDist = Infinity;
        const g = im.geometry;
        if (!g.position || !g.boundingSphere) g.computeBoundingSphere();
        const bs = g.boundingSphere;
        const pos = g.position;
        const idx = g.index;
        const m = scratch.m2;
        const localOrigin = Vec3.create(), localDir = Vec3.create(), center = Vec3.create();
        const tri = [Vec3.create(), Vec3.create(), Vec3.create()];
        for (let i = 0; i < im.count; i++) {
            m.set(im.instanceMatrices.subarray(i * 16, i * 16 + 16));
            Mat4.transformPoint(center, m, bs.center);
            const sx = Math.hypot(m[0], m[1], m[2]);
            const sy = Math.hypot(m[4], m[5], m[6]);
            const sz = Math.hypot(m[8], m[9], m[10]);
            const radius = bs.radius * Math.max(sx, sy, sz);
            if (raySphere(origin, direction, center, radius) < 0) continue;
            Mat4.invert(scratch.m3, m);
            Vec3.transformMat4(localOrigin, origin, scratch.m3);
            Vec3.transformDirection(localDir, direction, scratch.m3);
            const back = Math.hypot(localDir[0], localDir[1], localDir[2]) || 1;
            Vec3.scale(localDir, localDir, 1 / back);
            const test = (ia, ib, ic) => {
                const o3 = ia * 3, o6 = ib * 3, o9 = ic * 3;
                Vec3.set(tri[0], pos[o3], pos[o3 + 1], pos[o3 + 2]);
                Vec3.set(tri[1], pos[o6], pos[o6 + 1], pos[o6 + 2]);
                Vec3.set(tri[2], pos[o9], pos[o9 + 1], pos[o9 + 2]);
                const t = rayTriangle(localOrigin, localDir, tri[0], tri[1], tri[2], bestDist * back);
                if (t >= 0) {
                    const worldT = t / back;
                    if (worldT < bestDist) {
                        bestDist = worldT;
                        const p = Vec3.create();
                        Vec3.addScaled(p, origin, direction, worldT);
                        best = { mesh: im, instanceId: i, distance: worldT, point: p };
                    }
                }
            };
            if (idx) {
                for (let k = 0; k < idx.length; k += 3) test(idx[k], idx[k + 1], idx[k + 2]);
            } else {
                for (let k = 0; k < pos.length / 3; k += 3) test(k, k + 1, k + 2);
            }
        }
        return best;
    }
}
