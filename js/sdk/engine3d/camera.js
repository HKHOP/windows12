// Engine3D — cameras and input controllers (orbit + fly).
// Controllers attach to the canvas element only (no document/window listeners),
// so windows that close tear everything down for free.
// Import-safe under Node (controls construct only when handed a live canvas).

import { Vec3, Mat4, Quat, clamp, scratch } from './math.js';
import { Node } from './scene.js';

export class Camera extends Node {
    constructor(name = 'camera') {
        super(name);
        this.projection = Mat4.create();
        this.view = Mat4.create();
        this.viewProj = Mat4.create();
        this.projectionDirty = true;
        this.castShadows = false;
        this.receiveShadows = false;
    }

    _updateView() {
        // view = inverse(world matrix)
        Mat4.invert(this.view, this.matrixWorld);
    }
}

export class PerspectiveCamera extends Camera {
    constructor(fovDeg = 60, aspect = 16 / 9, near = 0.1, far = 500, name = 'camera') {
        super(name);
        this.fov = fovDeg;
        this.aspect = aspect;
        this.near = near;
        this.far = far;
    }

    updateProjectionMatrix() {
        Mat4.perspective(this.projection, this.fov * (Math.PI / 180), this.aspect, this.near, this.far);
        this.projectionDirty = false;
        this._viewProjStale = true;   // force viewProj recompute even if transform is clean
    }

    updateMatrixWorld(parentDirty = false) {
        const wasDirty = super.updateMatrixWorld(parentDirty);
        if (wasDirty || this.projectionDirty || this._viewProjStale) {
            if (this.projectionDirty) this.updateProjectionMatrix();
            this._updateView();
            Mat4.multiply(this.viewProj, this.projection, this.view);
            this._viewProjStale = false;
        }
        return wasDirty;
    }

    /** Aim the camera at a world point (roll stays 0, YXZ Euler). */
    lookAt(target, _up = null) {
        const dir = scratch.v2;
        Vec3.sub(dir, target, this.position);
        Vec3.normalize(dir, dir);
        this.rotation[1] = Math.atan2(-dir[0], -dir[2]);       // yaw
        this.rotation[0] = Math.asin(clamp(dir[1], -1, 1));    // pitch
        this.rotation[2] = 0;
        this.invalidate();
        this.updateMatrixWorld();
        return this;
    }
}

// ------------------------------------------------------------------ controls

const BUTTON = { LEFT: 0, MIDDLE: 1, RIGHT: 2 };

export class OrbitControls {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {PerspectiveCamera} camera
     * @param {object} opts { target:[x,y,z], distance, minDistance, maxDistance, minPolar, maxPolar }
     */
    constructor(canvas, camera, opts = {}) {
        this.canvas = canvas;
        this.camera = camera;
        this.target = Vec3.clone(opts.target || [0, 0.5, 0]);
        this.minDistance = opts.minDistance ?? 0.5;
        this.maxDistance = opts.maxDistance ?? 200;
        this.minPolar = opts.minPolar ?? 0.05;
        this.maxPolar = opts.maxPolar ?? Math.PI - 0.05;
        this.enabled = true;
        this.onChange = null;

        const spherical = { yaw: 0.7, pitch: 0.5, dist: 6 };
        this._spherical = spherical;
        this._initFromCamera();
        this._dragging = 0;      // 0 none, 1 rotate, 2 pan
        this._lastX = 0;
        this._lastY = 0;
        this._keys = new Set();

        this._onDown = (e) => {
            if (!this.enabled) return;
            canvas.setPointerCapture?.(e.pointerId);
            this._dragging = e.button === BUTTON.RIGHT || e.shiftKey ? 2 : 1;
            this._lastX = e.clientX; this._lastY = e.clientY;
            e.preventDefault();
        };
        this._onMove = (e) => {
            if (!this.enabled || !this._dragging) return;
            const dx = e.clientX - this._lastX;
            const dy = e.clientY - this._lastY;
            this._lastX = e.clientX; this._lastY = e.clientY;
            if (this._dragging === 1) {
                spherical.yaw -= dx * 0.006;
                spherical.pitch = clamp(spherical.pitch + dy * 0.006, this.minPolar, this.maxPolar);
            } else {
                const panScale = spherical.dist * 0.0016;
                this._pan(-dx * panScale, dy * panScale);
            }
            this._apply();
            e.preventDefault();
        };
        this._onUp = () => { this._dragging = 0; };
        this._onWheel = (e) => {
            if (!this.enabled) return;
            const zoom = Math.exp(Math.sign(e.deltaY) * 0.12);
            spherical.dist = clamp(spherical.dist * zoom, this.minDistance, this.maxDistance);
            this._apply();
            e.preventDefault();
        };
        this._onContext = (e) => e.preventDefault();

        canvas.addEventListener('pointerdown', this._onDown);
        canvas.addEventListener('pointermove', this._onMove);
        canvas.addEventListener('pointerup', this._onUp);
        canvas.addEventListener('pointercancel', this._onUp);
        canvas.addEventListener('wheel', this._onWheel, { passive: false });
        canvas.addEventListener('contextmenu', this._onContext);
        this._apply();
    }

    _initFromCamera() {
        const eye = this.camera.getWorldPosition(scratch.v1);
        const dx = eye[0] - this.target[0];
        const dy = eye[1] - this.target[1];
        const dz = eye[2] - this.target[2];
        this._spherical.dist = Math.hypot(dx, dy, dz);
        this._spherical.pitch = Math.acos(clamp(dy / (this._spherical.dist || 1), -1, 1));
        this._spherical.yaw = Math.atan2(dx, dz);
    }

    _pan(dx, dy) {
        // pan along camera-right and camera-up (projected to keep Y up)
        const m = this.camera.matrixWorld;
        const right = Vec3.set(scratch.v2, m[0], m[1], m[2]);
        const up = Vec3.set(scratch.v3, m[4], m[5], m[6]);
        Vec3.addScaled(this.target, right, dx, this.target);
        Vec3.addScaled(this.target, up, dy, this.target);
    }

    _apply() {
        const { yaw, pitch, dist } = this._spherical;
        const sp = Math.sin(pitch), cp = Math.cos(pitch);
        const sy = Math.sin(yaw), cy = Math.cos(yaw);
        this.camera.position[0] = this.target[0] + dist * sp * sy;
        this.camera.position[1] = this.target[1] + dist * cp;
        this.camera.position[2] = this.target[2] + dist * sp * cy;
        // orient toward target: forward = -(sp·sy, cp, sp·cy), roll 0 (YXZ Euler)
        this.camera.rotation[1] = yaw;
        this.camera.rotation[0] = Math.asin(clamp(-cp, -1, 1));
        this.camera.rotation[2] = 0;
        this.camera.invalidate();
        if (this.onChange) this.onChange();
    }

    setTarget(x, y, z) {
        Vec3.set(this.target, x, y, z);
        this._apply();
        return this;
    }

    dispose() {
        const c = this.canvas;
        c.removeEventListener('pointerdown', this._onDown);
        c.removeEventListener('pointermove', this._onMove);
        c.removeEventListener('pointerup', this._onUp);
        c.removeEventListener('pointercancel', this._onUp);
        c.removeEventListener('wheel', this._onWheel);
        c.removeEventListener('contextmenu', this._onContext);
    }
}

export class FlyControls {
    /**
     * First-person controller: WASD move, mouse-look (drag or pointer lock),
     * Space/Shift up-down, wheel adjusts speed.
     * @param {HTMLCanvasElement} canvas
     * @param {PerspectiveCamera} camera
     * @param {object} opts { speed=5, lookSensitivity=0.0035, pointerLock=true }
     */
    constructor(canvas, camera, opts = {}) {
        this.canvas = canvas;
        this.camera = camera;
        this.enabled = false;              // toggle from the app when fly mode activates
        this.speed = opts.speed ?? 5;
        this.lookSensitivity = opts.lookSensitivity ?? 0.0035;
        this.pointerLockEnabled = opts.pointerLock ?? true;
        // Optional lock adapter: { request(el), exit(), isLocked(el) } — lets apps
        // route through the SDK PointerLock (parks the OS virtual cursor).
        this.lockAdapter = opts.lock || null;
        this.maxPitch = Math.PI / 2 - 0.01;
        this.keys = new Set();
        this._dragLook = false;
        this._lastX = 0;
        this._lastY = 0;
        this._velocity = Vec3.create();

        this._onDown = (e) => {
            if (!this.enabled) return;
            if (this.pointerLockEnabled) {
                if (this.lockAdapter) this.lockAdapter.request(canvas);
                else canvas.requestPointerLock?.();
            } else {
                this._dragLook = true;
                this._lastX = e.clientX; this._lastY = e.clientY;
            }
        };
        this._onMove = (e) => {
            if (!this.enabled) return;
            const locked = this.lockAdapter
                ? this.lockAdapter.isLocked(canvas)
                : document.pointerLockElement === canvas;
            if (!locked && !this._dragLook) return;
            const dx = e.movementX || 0;
            const dy = e.movementY || 0;
            this.camera.rotation[1] -= dx * this.lookSensitivity;
            this.camera.rotation[0] = clamp(this.camera.rotation[0] - dy * this.lookSensitivity, -this.maxPitch, this.maxPitch);
            this.camera.invalidate();
        };
        this._onUp = () => { this._dragLook = false; };
        this._onWheel = (e) => {
            if (!this.enabled) return;
            this.speed = clamp(this.speed * Math.exp(-Math.sign(e.deltaY) * 0.15), 0.5, 60);
            e.preventDefault();
        };
        this._onKeyDown = (e) => { if (this.enabled) this.keys.add(e.code); };
        this._onKeyUp = (e) => { this.keys.delete(e.code); };
        this._onBlur = () => this.keys.clear();

        canvas.addEventListener('pointerdown', this._onDown);
        canvas.addEventListener('pointermove', this._onMove);
        canvas.addEventListener('pointerup', this._onUp);
        canvas.addEventListener('wheel', this._onWheel, { passive: false });
        canvas.addEventListener('keydown', this._onKeyDown);
        canvas.addEventListener('keyup', this._onKeyUp);
        canvas.addEventListener('blur', this._onBlur);
    }

    setEnabled(on) {
        this.enabled = on;
        if (!on) {
            this.keys.clear();
            if (this.lockAdapter) this.lockAdapter.exit();
            else if (document.pointerLockElement === this.canvas) document.exitPointerLock?.();
        }
    }

    /** Advance the camera for this frame. */
    update(dt) {
        if (!this.enabled) return;
        const keys = this.keys;
        const move = scratch.v0;
        Vec3.set(move, 0, 0, 0);
        const m = this.camera.matrixWorld;
        const fwd = Vec3.set(scratch.v1, -m[8], -m[9], -m[10]);
        const right = Vec3.set(scratch.v2, m[0], m[1], m[2]);
        if (keys.has('KeyW') || keys.has('ArrowUp')) Vec3.addScaled(move, fwd, 1, move);
        if (keys.has('KeyS') || keys.has('ArrowDown')) Vec3.addScaled(move, fwd, -1, move);
        if (keys.has('KeyD') || keys.has('ArrowRight')) Vec3.addScaled(move, right, 1, move);
        if (keys.has('KeyA') || keys.has('ArrowLeft')) Vec3.addScaled(move, right, -1, move);
        if (keys.has('KeyE') || keys.has('Space')) move[1] += 1;
        if (keys.has('KeyQ') || keys.has('ShiftLeft')) move[1] -= 1;
        const l = Vec3.length(move);
        if (l > 0) {
            Vec3.scale(move, move, 1 / l);
            // exponential smoothing — frame-rate independent
            const t = 1 - Math.exp(-dt * 12);
            Vec3.scale(move, move, this.speed * t);
            Vec3.add(this.camera.position, this.camera.position, move);
            this.camera.invalidate();
        }
    }

    dispose() {
        const c = this.canvas;
        c.removeEventListener('pointerdown', this._onDown);
        c.removeEventListener('pointermove', this._onMove);
        c.removeEventListener('pointerup', this._onUp);
        c.removeEventListener('wheel', this._onWheel);
        c.removeEventListener('keydown', this._onKeyDown);
        c.removeEventListener('keyup', this._onKeyUp);
        c.removeEventListener('blur', this._onBlur);
    }
}
