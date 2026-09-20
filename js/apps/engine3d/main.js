// 3D Sandbox — interactive showcase for the SDK Engine3D WebGL engine.
// Built entirely on the SDK: `Engine3D` from ../../sdk/index.js plus
// WindowManager/FileSystem/Popup for the OS integration.

import { Engine3D, FileSystem, Dialogs, Notifications, PointerLock, WindowManager as SDKWindowManager } from '../../sdk/index.js';
import WindowManager from '../../modules/windowManager.js';
import AppIcons from '../../modules/appIcons.js';
import Users from '../../modules/users.js';

// Bound lazily in bindEngine3D(): the registry <-> SDK import cycle leaves
// the Engine3D export uninitialized while this module body evaluates.
let Engine, GeometryFactory, Materials, Material, Mesh, AmbientLight, DirectionalLight, PointLight, Skybox, InstancedMesh;
function bindEngine3D() {
    ({ Engine, GeometryFactory, Materials, Material, Mesh, AmbientLight, DirectionalLight, PointLight, Skybox, InstancedMesh } = Engine3D);
}

const Engine3DApp = (() => {
    const icon = AppIcons.get('engine3d');
    const DATA_PATH = () => Users.appData('engine3d');
    const SCENE_FILE = [...DATA_PATH(), 'scene.json'];

    let win = null;
    let engine = null;
    let selected = null;
    let selectionMarker = null;
    let instancedField = null;
    let statsTimer = 0;
    let nextColor = 0;

    const PALETTE = [
        [0.95, 0.32, 0.28], [0.98, 0.74, 0.18], [0.30, 0.80, 0.40],
        [0.26, 0.62, 0.98], [0.70, 0.40, 0.95], [0.95, 0.45, 0.80],
    ];

    // ------------------------------------------------------------ UI

    function getContent() {
        return `
            <div style="display:flex;height:100%;background:#14161a;color:#dde1e6;overflow:hidden;">
                <div style="width:190px;flex-shrink:0;background:#1b1e24;border-right:1px solid #2a2f38;display:flex;flex-direction:column;padding:8px;gap:6px;overflow-y:auto;">
                    <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#8a93a2;padding:4px 2px;">Add object</div>
                    <div class="e3d-add-row" style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">
                        <button class="e3d-btn" data-add="box">Box</button>
                        <button class="e3d-btn" data-add="sphere">Sphere</button>
                        <button class="e3d-btn" data-add="cylinder">Cylinder</button>
                        <button class="e3d-btn" data-add="cone">Cone</button>
                        <button class="e3d-btn" data-add="torus">Torus</button>
                        <button class="e3d-btn" data-add="instanced">Instanced ×81</button>
                    </div>
                    <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#8a93a2;padding:8px 2px 2px;">Scene</div>
                    <button class="e3d-btn" id="e3d-toggle-grid">Grid: on</button>
                    <button class="e3d-btn" id="e3d-toggle-shadows">Shadows: on</button>
                    <button class="e3d-btn" id="e3d-toggle-wireframe">Wireframe: off</button>
                    <button class="e3d-btn" id="e3d-toggle-fog">Fog: off</button>
                    <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#8a93a2;padding:8px 2px 2px;">Camera</div>
                    <button class="e3d-btn" id="e3d-toggle-fly">Fly mode: off</button>
                    <button class="e3d-btn" id="e3d-reset-cam">Reset view</button>
                    <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#8a93a2;padding:8px 2px 2px;">File</div>
                    <button class="e3d-btn" id="e3d-save">Save scene</button>
                    <button class="e3d-btn" id="e3d-load">Load scene</button>
                    <div style="flex:1;"></div>
                    <div id="e3d-selection-panel" style="display:none;flex-direction:column;gap:4px;border-top:1px solid #2a2f38;padding-top:8px;">
                        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#8a93a2;">Selection</div>
                        <label style="font-size:11px;color:#8a93a2;display:flex;align-items:center;gap:6px;">Color
                            <input type="color" id="e3d-color" value="#4d9df2" style="width:100%;height:22px;background:#22262e;border:1px solid #2a2f38;border-radius:4px;cursor:pointer;">
                        </label>
                        <label style="font-size:11px;color:#8a93a2;display:flex;align-items:center;gap:6px;">Scale
                            <input type="range" id="e3d-scale" min="0.3" max="3" step="0.1" value="1" style="flex:1;cursor:pointer;">
                        </label>
                        <button class="e3d-btn" id="e3d-delete" style="color:#ff6b6b;">Delete (Del)</button>
                    </div>
                </div>
                <div style="flex:1;display:flex;flex-direction:column;position:relative;min-width:0;">
                    <div id="e3d-viewport" style="flex:1;position:relative;min-height:0;">
                        <canvas id="e3d-canvas" style="width:100%;height:100%;display:block;"></canvas>
                        <div id="e3d-stats" style="position:absolute;top:8px;left:8px;background:rgba(15,17,22,.75);border:1px solid #2a2f38;border-radius:6px;padding:6px 10px;font:11px/1.5 Consolas,monospace;color:#9fe8ff;pointer-events:none;white-space:pre;"></div>
                        <div id="e3d-hint" style="position:absolute;bottom:8px;left:8px;background:rgba(15,17,22,.75);border:1px solid #2a2f38;border-radius:6px;padding:5px 10px;font-size:11px;color:#8a93a2;pointer-events:none;">
                            Drag orbit · wheel zoom · shift-drag pan · click select · Del remove
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function q(selector) { return win.element.querySelector(selector); }

    // ------------------------------------------------------------ scene setup

    function defaultScene() {
        const scene = engine.scene;
        scene.background = new Skybox([0.18, 0.32, 0.6], [0.85, 0.88, 0.92]);

        scene.add(new AmbientLight(0.35));
        const sun = new DirectionalLight(1.0, [1, 0.96, 0.9]);
        sun.direction = [-0.6, -1, -0.45];
        sun.castShadows = true;
        scene.add(sun);
        const fill = new PointLight(0.7, [0.4, 0.6, 1], 18);
        fill.setPosition(-5, 3, -4);
        scene.add(fill);
        const warm = new PointLight(0.5, [1, 0.55, 0.25], 14);
        warm.setPosition(4, 2.5, 3);
        scene.add(warm);

        // ground
        const ground = new Mesh(GeometryFactory.plane(30, 30), Materials.standard([0.45, 0.48, 0.52], { shading: 'lambert' }), 'ground');
        ground.receiveShadows = true;
        ground.castShadows = false;
        scene.add(ground);

        // grid overlay
        const grid = new Mesh(GeometryFactory.grid(30, 30), Materials.grid(), 'grid');
        grid.castShadows = false;
        grid.receiveShadows = false;
        grid.setPosition(0, 0.01, 0);
        scene.add(grid);

        spawn('box', [-2.2, 0.5, 0], PALETTE[3]);
        spawn('sphere', [0, 0.6, -1.5], PALETTE[1]);
        spawn('torus', [2.2, 0.55, 0.4], PALETTE[4], { rotX: Math.PI / 2.4 });
        spawn('cylinder', [0.4, 0.75, 1.8], PALETTE[2]);
        spawn('cone', [-1, 0.5, 2.2], PALETTE[0]);
    }

    function geometryFor(kind) {
        switch (kind) {
            case 'box': return GeometryFactory.box(1, 1, 1);
            case 'sphere': return GeometryFactory.sphere(0.6, 32, 20);
            case 'cylinder': return GeometryFactory.cylinder(0.5, 0.5, 1.2, 28);
            case 'cone': return GeometryFactory.cone(0.6, 1.2, 28);
            case 'torus': return GeometryFactory.torus(0.5, 0.2, 18, 36);
            case 'plane': return GeometryFactory.plane(2, 2);
            default: return null;
        }
    }

    function spawn(kind, position, color, extra = {}) {
        if (kind === 'instanced') { spawnInstancedField(position); return null; }
        const geo = geometryFor(kind);
        if (!geo) return null;
        const mat = Materials.standard(color);
        const mesh = new Mesh(geo, mat, kind);
        mesh.castShadows = true;
        mesh.receiveShadows = true;
        mesh.userData.kind = kind;
        mesh.setPosition(position[0], position[1], position[2]);
        if (extra.rotX) mesh.setRotation(extra.rotX, 0, 0);
        engine.scene.add(mesh);
        return mesh;
    }

    /** Instancing demo: 9×9 spinning cubes from one draw call. */
    function spawnInstancedField(center) {
        if (instancedField) { engine.scene.remove(instancedField); instancedField = null; }
        const geo = GeometryFactory.box(0.4, 0.4, 0.4);
        const mat = new Engine3D.Material({ shading: 'phong', color: [0.95, 0.55, 0.15] });
        const field = new InstancedMesh(geo, mat, 81, 'instanced-field');
        field.castShadows = true;
        field.receiveShadows = true;
        let i = 0;
        for (let x = -4; x <= 4; x++) {
            for (let z = -4; z <= 4; z++) {
                const matrix = new Float32Array(16);
                matrix[0] = 1; matrix[5] = 1; matrix[10] = 1; matrix[15] = 1;
                matrix[12] = center[0] + x * 0.55;
                matrix[13] = 0.2 + Math.abs(Math.sin(x * 0.7 + z)) * 0.5;
                matrix[14] = center[2] + z * 0.55;
                field.setMatrixAt(i++, matrix);
            }
        }
        field.markInstancesDirty();
        engine.scene.add(field);
        instancedField = field;
    }

    function ensureSelectionMarker() {
        if (selectionMarker) return;
        const geo = GeometryFactory.box(1.08, 1.08, 1.08);
        const mat = new Material({ shading: 'basic', color: [1, 0.85, 0.2], wireframe: true, fog: false });
        selectionMarker = new Mesh(geo, mat, 'selection-marker');
        selectionMarker.castShadows = false;
        selectionMarker.receiveShadows = false;
        selectionMarker.visible = false;
        engine.scene.add(selectionMarker);
    }

    function select(mesh) {
        selected = mesh;
        const panel = q('#e3d-selection-panel');
        if (!mesh) {
            panel.style.display = 'none';
            if (selectionMarker) selectionMarker.visible = false;
            return;
        }
        ensureSelectionMarker();
        panel.style.display = 'flex';
        const rgb = mesh.material.color;
        q('#e3d-color').value = '#' + rgb.map((c) => Math.round(clamp01(c) * 255).toString(16).padStart(2, '0')).join('');
        q('#e3d-scale').value = mesh.scale[0];
    }

    function clamp01(v) { return Math.min(1, Math.max(0, v)); }

    // ------------------------------------------------------------ persistence

    function ensureDataDir() {
        if (!FileSystem.exists(DATA_PATH())) {
            FileSystem.createFolder(Users.home(['AppData']), 'engine3d');
        }
    }

    function serializeScene() {
        const objects = [];
        engine.scene.traverse((n) => {
            if (!n.userData || !n.userData.kind) return;
            if (n.parent !== engine.scene) return;
            objects.push({
                kind: n.userData.kind,
                position: [...n.position],
                rotation: [...n.rotation],
                scale: [...n.scale],
                color: [...n.material.color],
            });
        });
        return JSON.stringify({ version: 1, objects });
    }

    function clearUserObjects() {
        const doomed = engine.scene.children.filter((c) => c.userData && c.userData.kind && c !== instancedField);
        for (const d of doomed) engine.scene.remove(d);
        select(null);
    }

    function saveScene() {
        ensureDataDir();
        const json = serializeScene();
        if (FileSystem.itemExists(SCENE_FILE)) FileSystem.writeFile(SCENE_FILE, json);
        else FileSystem.createFile(DATA_PATH(), 'scene.json', json, 'json');
        Notifications.info('3D Sandbox', 'Scene saved to your AppData (engine3d/scene.json)', { appId: 'engine3d' });
    }

    function loadScene(silent = false) {
        ensureDataDir();
        const raw = FileSystem.readFile(SCENE_FILE);
        if (!raw) {
            if (!silent) Dialogs.alert('Load scene', 'No saved scene found yet. Save one first.');
            return;
        }
        try {
            const data = JSON.parse(raw);
            clearUserObjects();
            if (instancedField) { engine.scene.remove(instancedField); instancedField = null; }
            for (const o of data.objects || []) {
                const mesh = spawn(o.kind, o.position, o.color);
                if (mesh) {
                    mesh.setRotation(o.rotation[0], o.rotation[1], o.rotation[2]);
                    mesh.setScale(o.scale[0], o.scale[1], o.scale[2]);
                }
            }
            if (!silent) Notifications.info('3D Sandbox', `Scene loaded — ${(data.objects || []).length} objects`, { appId: 'engine3d' });
        } catch (e) {
            Dialogs.alert('Load scene', 'Saved scene is corrupted: ' + e.message);
        }
    }

    // ------------------------------------------------------------ stats + loop

    function updateStats(dt) {
        statsTimer += dt;
        if (statsTimer < 0.25) return;
        statsTimer = 0;
        const s = engine.stats;
        q('#e3d-stats').textContent =
            `fps ${s.fps}\ndraw calls ${s.drawCalls}\ntris ${fmt(s.triangles)}\nlines ${fmt(s.lines)}\nculled ${s.culled}\nprograms ${s.programs}`;
    }

    function fmt(n) {
        return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n);
    }

    let time = 0;

    function animate(dt) {
        time += dt;
        updateStats(dt);
        if (instancedField) {
            instancedField.setRotation(0, time * 0.3, 0);
        }
        if (selected && selectionMarker && selectionMarker.visible) {
            // marker follows selection
            const p = selected.getWorldPosition();
            const r = Math.max(selected.scale[0], selected.scale[1], selected.scale[2]);
            selectionMarker.setPosition(p[0], p[1], p[2]);
            selectionMarker.setScale(r, r, r);
            selectionMarker.setRotation(selected.rotation[0], selected.rotation[1], selected.rotation[2]);
        }
    }

    // ------------------------------------------------------------ events

    function wireUi() {
        q('.e3d-add-row').addEventListener('click', (e) => {
            const kind = e.target?.dataset?.add;
            if (!kind) return;
            const cam = engine.camera;
            const p = cam.getWorldPosition();
            const m = cam.matrixWorld;
            // spawn 4 units in front of the camera, projected onto the ground
            const fx = p[0] - m[8] * 4, fz = p[2] - m[10] * 4;
            const height = { box: 0.5, sphere: 0.6, cylinder: 0.6, cone: 0.6, torus: 0.55, instanced: 0 }[kind] ?? 0.5;
            const mesh = spawn(kind, [fx, kind === 'torus' ? height + 0.4 : height, fz], PALETTE[nextColor++ % PALETTE.length]);
            if (mesh) select(mesh);
        });

        const toggles = [
            ['#e3d-toggle-grid', (on) => {
                const grid = engine.scene.children.find((c) => c.name === 'grid');
                if (grid) grid.visible = on;
            }, true],
            ['#e3d-toggle-shadows', (on) => { engine.renderer.shadowsEnabled = on; }, true],
            ['#e3d-toggle-wireframe', (on) => {
                engine.scene.traverse((n) => {
                    if (n.userData && n.userData.kind && n.material) n.material.wireframe = on;
                });
            }, false],
            ['#e3d-toggle-fog', (on) => {
                engine.scene.fog = on ? { color: [0.72, 0.76, 0.82], near: 10, far: 32 } : null;
            }, false],
            ['#e3d-toggle-fly', (on) => {
                engine.setFlyMode(on);
                q('#e3d-hint').textContent = on
                    ? 'WASD move · Q/E down/up · mouse-look (click canvas) · wheel speed · Esc/pause'
                    : 'Drag orbit · wheel zoom · shift-drag pan · click select · Del remove';
            }, false],
        ];
        for (const [sel, apply, initial] of toggles) {
            const btn = q(sel);
            let state = initial;
            btn.textContent = btn.textContent.replace(/:.*$/, '') + ': ' + (state ? 'on' : 'off');
            btn.addEventListener('click', () => {
                state = !state;
                btn.textContent = btn.textContent.replace(/:.*$/, '') + ': ' + (state ? 'on' : 'off');
                apply(state);
            });
        }

        q('#e3d-reset-cam').addEventListener('click', () => {
            if (engine.orbit) {
                engine.camera.setPosition(0, 6, 10);
                engine.orbit.setTarget(0, 0.5, 0);
            }
        });

        q('#e3d-save').addEventListener('click', saveScene);
        q('#e3d-load').addEventListener('click', () => loadScene(false));

        // picking
        const canvas = q('#e3d-canvas');
        let downX = 0, downY = 0;
        canvas.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; });
        canvas.addEventListener('pointerup', (e) => {
            if (engine.fly.enabled) return;
            if (Math.hypot(e.clientX - downX, e.clientY - downY) > 4) return; // was a drag
            if (e.button !== 0) return;
            const hit = engine.pick(e.clientX, e.clientY, {
                skip: (m) => m === selectionMarker || m.name === 'grid' || m.name === 'ground',
            });
            select(hit ? hit.mesh : null);
            if (selectionMarker) {
                selectionMarker.visible = !!hit;
                if (hit) {
                    // box marker approximates the selection footprint
                    const p = hit.mesh.getWorldPosition();
                    const s = Math.max(...hit.mesh.scale);
                    selectionMarker.setPosition(p[0], p[1], p[2]);
                    selectionMarker.setScale(s, s, s);
                    selectionMarker.setRotation(hit.mesh.rotation[0], hit.mesh.rotation[1], hit.mesh.rotation[2]);
                }
            }
        });

        q('#e3d-color').addEventListener('input', (e) => {
            if (!selected) return;
            const hex = e.target.value;
            selected.material.color[0] = parseInt(hex.slice(1, 3), 16) / 255;
            selected.material.color[1] = parseInt(hex.slice(3, 5), 16) / 255;
            selected.material.color[2] = parseInt(hex.slice(5, 7), 16) / 255;
        });
        q('#e3d-scale').addEventListener('input', (e) => {
            if (!selected) return;
            const s = parseFloat(e.target.value);
            selected.setScale(s, s, s);
        });
        q('#e3d-delete').addEventListener('click', deleteSelected);

        // Delete key — scoped to the window element
        win.element.addEventListener('keydown', (e) => {
            if (e.key === 'Delete') { deleteSelected(); e.preventDefault(); }
        });
        win.element.tabIndex = -1;
    }

    function deleteSelected() {
        if (!selected) return;
        engine.scene.remove(selected);
        select(null);
    }

    // ------------------------------------------------------------ launch

    function launch() {
        bindEngine3D();
        win = WindowManager.createWindow('engine3d', '3D Sandbox', icon, getContent(), {
            width: 960, height: 640, minWidth: 560, minHeight: 400,
        });

        const canvas = win.element.querySelector('#e3d-canvas');
        engine = new Engine(canvas, {
            fov: 55, shadows: true, shadowMapSize: 1024, maxPixelRatio: 2,
            // route fly-mode mouse capture through the SDK so the OS virtual
            // cursor is parked while locked
            lock: {
                request: (el) => PointerLock.request(el, 'engine3d'),
                exit: () => PointerLock.exit(),
                isLocked: (el) => PointerLock.isLocked(el),
            },
        });
        defaultScene();
        engine.onFrame(animate);
        wireUi();
        engine.start();

        // pause the loop while minimized, dispose on close (SDK lifecycle bus)
        const unsubMinimize = SDKWindowManager.onMinimizeState((appId, id, minimized) => {
            if (id !== win.id) return;
            if (minimized) engine.stop();
            else engine.start();
        });
        const unsubClosed = SDKWindowManager.onClosed((appId, id) => {
            if (id !== win.id) return;
            engine.dispose();
            unsubMinimize();
            unsubClosed();
        });
    }

    return { launch };
})();

export default Engine3DApp;
