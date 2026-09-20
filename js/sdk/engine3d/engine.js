// Engine3D — high-level engine facade: canvas + renderer + scene + camera +
// render loop, resize handling, picking, and per-frame hooks.
//
//   const engine = createEngine(canvas, { shadows: true });
//   const camera = engine.camera;
//   engine.onFrame((dt) => update(dt));
//   engine.start();
//
// Import-safe under Node; everything touching the DOM happens inside the
// Engine constructor / methods, never at module scope.

import { Vec3, Mat4, clamp } from './math.js';
import { BufferGeometry, GeometryFactory } from './geometry.js';
import { Material, Materials, Texture2D, Skybox } from './materials.js';
import { Node, Group, Mesh, InstancedMesh, Scene, Light, AmbientLight, DirectionalLight, PointLight, SpotLight, Raycaster } from './scene.js';
import { Camera, PerspectiveCamera, OrbitControls, FlyControls } from './camera.js';
import { Renderer } from './renderer.js';

export class Engine {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {object} opts {
     *   fov, near, far, shadows, shadowMapSize, clearColor, maxPixelRatio,
     *   orbit: true, fly: false, target
     * }
     */
    constructor(canvas, opts = {}) {
        this.canvas = canvas;
        this.scene = new Scene();
        this.renderer = new Renderer(canvas, opts);
        this.camera = new PerspectiveCamera(opts.fov || 60, 1, opts.near || 0.1, opts.far || 500);
        this.scene.add(this.camera);
        this._running = false;
        this._frameCallbacks = [];
        this._lastTime = 0;
        this._fpsEMA = 60;
        this._minimized = false;

        canvas.tabIndex = 0;
        canvas.style.outline = 'none';
        canvas.style.display = 'block';
        canvas.style.touchAction = 'none';

        if (opts.orbit !== false) {
            this.orbit = new OrbitControls(canvas, this.camera, { target: opts.target || [0, 0.5, 0] });
        }
        this.fly = new FlyControls(canvas, this.camera, {
            pointerLock: opts.flyPointerLock ?? true,
            lock: opts.lock || null,
        });

        // input hygiene: stop the canvas from stealing page scroll, allow focus
        this._onCanvasClick = () => canvas.focus();
        canvas.addEventListener('pointerdown', this._onCanvasClick);
        this._preventScroll = (e) => e.preventDefault();
        canvas.addEventListener('touchstart', this._preventScroll, { passive: false });

        // resize handling
        this._resizeObserver = null;
        if (typeof ResizeObserver !== 'undefined') {
            this._resizeObserver = new ResizeObserver(() => this._syncSize());
            this._resizeObserver.observe(canvas);
        } else {
            this._onWinResize = () => this._syncSize();
            window.addEventListener('resize', this._onWinResize);
        }
        this._syncSize();

        // auto-pause while the tab (or OS window) is hidden
        this._onVisibility = () => {
            if (document.hidden) this._lastTime = 0;
        };
        document.addEventListener('visibilitychange', this._onVisibility);
    }

    _syncSize() {
        const parent = this.canvas.parentElement;
        if (!parent) return;
        const rect = parent.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return;
        const style = this.canvas.style;
        if (style.width !== '100%') { style.width = '100%'; style.height = '100%'; }
        this.renderer.resize(rect.width, rect.height);
        this.camera.aspect = rect.width / Math.max(rect.height, 1);
        this.camera.updateProjectionMatrix();
    }

    /** Register a per-frame callback `(dtSeconds, engine)`. */
    onFrame(fn) {
        this._frameCallbacks.push(fn);
        return this;
    }

    offFrame(fn) {
        const i = this._frameCallbacks.indexOf(fn);
        if (i >= 0) this._frameCallbacks.splice(i, 1);
        return this;
    }

    start() {
        if (this._running) return this;
        this._running = true;
        this._lastTime = performance.now();
        const loop = (now) => {
            if (!this._running) return;
            const dt = Math.min((now - this._lastTime) / 1000, 0.1); // clamp spikes (tab switch)
            this._lastTime = now;
            if (dt > 0) this._fpsEMA += (1 / dt - this._fpsEMA) * 0.08;
            this.fly.update(dt);
            for (const fn of this._frameCallbacks) fn(dt, this);
            this.render();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
        return this;
    }

    stop() {
        this._running = false;
        return this;
    }

    get isRunning() { return this._running; }

    render() {
        this.scene.updateMatrixWorld();
        this.renderer.render(this.scene, this.camera);
    }

    get stats() {
        const s = this.renderer.stats;
        return {
            fps: Math.round(this._fpsEMA),
            drawCalls: s.drawCalls,
            triangles: s.triangles,
            lines: s.lines,
            culled: s.culled,
            geometries: s.geometries,
            programs: s.programs,
        };
    }

    /** NDC ray + nearest hit. `x`/`y` are canvas-relative CSS pixels. */
    pick(x, y, opts = {}) {
        const rect = this.canvas.getBoundingClientRect();
        const ndcX = ((x - rect.left) / rect.width) * 2 - 1;
        const ndcY = -(((y - rect.top) / rect.height) * 2 - 1);
        const ray = Raycaster.fromCamera(this.camera, ndcX, ndcY);
        const hit = Raycaster.intersect(ray, this.scene, opts);
        return hit ? { ...hit, ray } : null;
    }

    pickInstance(x, y, instancedMesh) {
        const rect = this.canvas.getBoundingClientRect();
        const ndcX = ((x - rect.left) / rect.width) * 2 - 1;
        const ndcY = -(((y - rect.top) / rect.height) * 2 - 1);
        const ray = Raycaster.fromCamera(this.camera, ndcX, ndcY);
        const hit = Raycaster.intersectInstance(ray, instancedMesh);
        return hit ? { ...hit, ray } : null;
    }

    setFlyMode(on) {
        this.fly.setEnabled(on);
        if (this.orbit) this.orbit.enabled = !on;
        if (!on) this.canvas.style.cursor = '';
        else this.canvas.style.cursor = 'crosshair';
        return this;
    }

    dispose() {
        this.stop();
        this.orbit?.dispose();
        this.fly.dispose();
        this.canvas.removeEventListener('pointerdown', this._onCanvasClick);
        this.canvas.removeEventListener('touchstart', this._preventScroll);
        document.removeEventListener('visibilitychange', this._onVisibility);
        if (this._resizeObserver) this._resizeObserver.disconnect();
        else window.removeEventListener('resize', this._onWinResize);
        this.renderer.dispose();
    }
}

/** Convenience creator — the primary SDK entry point. */
export function createEngine(canvas, opts = {}) {
    return new Engine(canvas, opts);
}

// ------------------------------------------------------------------ namespace

export const Engine3D = {
    version: '1.0.0',
    Engine,
    createEngine,
    // scene
    Scene, Node, Group, Mesh, InstancedMesh,
    // lights
    Light, AmbientLight, DirectionalLight, PointLight, SpotLight,
    // camera + controls
    Camera, PerspectiveCamera, OrbitControls, FlyControls,
    // geometry + material
    BufferGeometry, GeometryFactory, Material, Materials, Texture2D, Skybox,
    // picking
    Raycaster,
};

export default Engine3D;
