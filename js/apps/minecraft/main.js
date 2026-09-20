import WindowManager from '../../modules/windowManager.js';
import FileSystem from '../../modules/fileSystem.js';
import Popup from '../../modules/popup.js';
import Users from '../../modules/users.js';

const Minecraft = (() => {
    const APP_ID = 'minecraft';
    const DATA_DIR = () => Users.appData('minecraft');

    const icon = `<svg viewBox="0 0 24 24" fill="none">
        <path d="M12 2L22 7v10l-10 5L2 17V7l10-5z" fill="#8B5A2B"/>
        <path d="M12 2L22 7l-10 5L2 7l10-5z" fill="#7EC850"/>
        <path d="M12 12v10L2 17V7l10 5z" fill="#6B4423"/>
        <path d="M12 12l10-5v10l-10 5V12z" fill="#9B6B33"/>
        <path d="M12 2L22 7l-10 5L2 7l10-5z" fill="#7EC850"/>
        <path d="M2 7l10 5v2L2 9V7z" fill="#5da33a"/>
    </svg>`;

    // ------------------------------------------------------------------
    // World constants
    // ------------------------------------------------------------------
    const CHUNK = 16;
    const CHUNKS_X = 6, CHUNKS_Z = 6;          // 6x6 chunks
    const WORLD_X = CHUNK * CHUNKS_X;          // 96
    const WORLD_Z = CHUNK * CHUNKS_Z;          // 96
    const WORLD_H = 64;
    const WATER_LEVEL = 23;

    const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, SAND = 4, LOG = 5,
          LEAVES = 6, PLANK = 7, COBBLE = 8, BRICK = 9, GLASS = 10,
          WATER = 11, BEDROCK = 12;

    // tiles: [top, bottom, side] indices into the atlas
    const BLOCKS = {
        [GRASS]:   { name: 'Grass',       tiles: [0, 2, 1],    solid: true,  transparent: false },
        [DIRT]:    { name: 'Dirt',        tiles: [2, 2, 2],    solid: true,  transparent: false },
        [STONE]:   { name: 'Stone',       tiles: [3, 3, 3],    solid: true,  transparent: false },
        [SAND]:    { name: 'Sand',        tiles: [4, 4, 4],    solid: true,  transparent: false },
        [LOG]:     { name: 'Oak Log',     tiles: [6, 6, 5],    solid: true,  transparent: false },
        [LEAVES]:  { name: 'Leaves',      tiles: [7, 7, 7],    solid: true,  transparent: false },
        [PLANK]:   { name: 'Planks',      tiles: [8, 8, 8],    solid: true,  transparent: false },
        [COBBLE]:  { name: 'Cobblestone', tiles: [9, 9, 9],    solid: true,  transparent: false },
        [BRICK]:   { name: 'Bricks',      tiles: [10, 10, 10], solid: true,  transparent: false },
        [GLASS]:   { name: 'Glass',       tiles: [11, 11, 11], solid: true,  transparent: true  },
        [WATER]:   { name: 'Water',       tiles: [12, 12, 12], solid: false, transparent: true  },
        [BEDROCK]: { name: 'Bedrock',     tiles: [13, 13, 13], solid: true,  transparent: false },
    };

    const HOTBAR = [GRASS, DIRT, STONE, PLANK, COBBLE, BRICK, SAND, LOG, GLASS, LEAVES];

    // ------------------------------------------------------------------
    // Procedural texture atlas (8x2 tiles of 16px -> 128x32)
    // ------------------------------------------------------------------
    function makeAtlas() {
        const c = document.createElement('canvas');
        c.width = 128; c.height = 32;
        const ctx = c.getContext('2d');
        const rnd = mulberry32(1337);

        function px(tile, x, y, color) {
            const col = (tile % 8) * 16, row = Math.floor(tile / 8) * 16;
            ctx.fillStyle = color;
            ctx.fillRect(col + x, row + y, 1, 1);
        }
        function noiseTile(tile, base, variants, density) {
            for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
                let color = base;
                if (rnd() < density) color = variants[Math.floor(rnd() * variants.length)];
                px(tile, x, y, color);
            }
        }

        noiseTile(0, '#7cbd4b', ['#6fae42', '#8cc957', '#74b447', '#86c351'], 0.85);   // grass top
        // grass side: dirt with green strip on top
        noiseTile(1, '#9b6d49', ['#8a5f3e', '#a5774f', '#916544'], 0.8);
        for (let x = 0; x < 16; x++) {
            const depth = 2 + Math.floor(rnd() * 3);
            for (let y = 0; y < depth; y++) px(1, x, y, ['#7cbd4b', '#6fae42', '#86c351'][Math.floor(rnd() * 3)]);
        }
        noiseTile(2, '#9b6d49', ['#8a5f3e', '#a5774f', '#916544', '#7d5537'], 0.8);    // dirt
        noiseTile(3, '#8d8d8d', ['#7d7d7d', '#9a9a9a', '#868686', '#757575'], 0.8);    // stone
        noiseTile(4, '#dcd0a0', ['#d0c491', '#e6dba9', '#cbbf8c'], 0.7);               // sand
        // log side: vertical bark stripes
        for (let x = 0; x < 16; x++) {
            const shade = ['#6b4a2b', '#5d3f24', '#77522f'][x % 3];
            for (let y = 0; y < 16; y++) px(5, x, y, rnd() < 0.15 ? '#4e351e' : shade);
        }
        // log top: rings
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
            const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
            px(6, x, y, d > 6.5 ? '#5d3f24' : d > 4.5 ? '#a8834f' : d > 2.5 ? '#c9a86a' : '#a8834f');
        }
        noiseTile(7, '#3e7a28', ['#2f6420', '#4a8c30', '#356e24', '#285a1c'], 0.9);    // leaves
        // planks: horizontal boards
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
            const line = (y % 4 === 3) || (x === (y < 8 ? 5 : 11) && y % 4 !== 3);
            px(8, x, y, line ? '#6d4f2c' : ['#a07a45', '#96713e', '#aa8350'][Math.floor(rnd() * 3)]);
        }
        // cobblestone: blobs
        noiseTile(9, '#828282', ['#6e6e6e', '#969696', '#777777', '#a3a3a3'], 0.9);
        for (let i = 0; i < 6; i++) {
            const bx = Math.floor(rnd() * 13), by = Math.floor(rnd() * 13), s = 2 + Math.floor(rnd() * 2);
            ctx.fillStyle = '#5c5c5c';
            ctx.fillRect((9 % 8) * 16 + bx, Math.floor(9 / 8) * 16 + by, s, s);
        }
        // bricks
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
            const row = Math.floor(y / 4);
            const mortar = (y % 4 === 3) || ((x + (row % 2) * 4) % 8 === 7);
            px(10, x, y, mortar ? '#9a9a9a' : ['#9e4a35', '#a85240', '#93402e'][Math.floor(rnd() * 3)]);
        }
        // glass: mostly clear with frame + sparkle
        ctx.clearRect(11 % 8 * 16, Math.floor(11 / 8) * 16, 16, 16);
        for (let i = 0; i < 16; i++) {
            px(11, i, 0, '#dff3f5'); px(11, i, 15, '#dff3f5');
            px(11, 0, i, '#dff3f5'); px(11, 15, i, '#dff3f5');
        }
        for (let i = 2; i < 7; i++) { px(11, i, 9 - i, '#cfeef2'); px(11, i + 1, 9 - i, '#cfeef2'); }
        // water
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
            const w = Math.sin((x + y * 2) * 0.8) * 0.5 + 0.5;
            const b = 150 + Math.floor(w * 60 + rnd() * 20);
            px(12, x, y, `rgb(40,${90 + Math.floor(w * 30)},${b})`);
        }
        noiseTile(13, '#4a4a4a', ['#3a3a3a', '#5a5a5a', '#2f2f2f', '#666666'], 0.9);   // bedrock
        // white tile (index 14) for misc
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(14 % 8 * 16, Math.floor(14 / 8) * 16, 16, 16);
        return c;
    }

    // ------------------------------------------------------------------
    // PRNG + noise
    // ------------------------------------------------------------------
    function mulberry32(a) {
        return function () {
            a |= 0; a = a + 0x6D2B79F5 | 0;
            let t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }
    function hash2(x, z, seed) {
        let h = (seed | 0) ^ Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263);
        h = Math.imul(h ^ h >>> 13, 1274126177);
        h ^= h >>> 16;
        return (h >>> 0) / 4294967296;
    }
    function noise2(x, z, seed) {
        const xi = Math.floor(x), zi = Math.floor(z);
        const xf = x - xi, zf = z - zi;
        const a = hash2(xi, zi, seed), b = hash2(xi + 1, zi, seed);
        const c = hash2(xi, zi + 1, seed), d = hash2(xi + 1, zi + 1, seed);
        const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
        return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }

    // ------------------------------------------------------------------
    // World
    // ------------------------------------------------------------------
    function createWorld(seed) {
        const blocks = new Uint8Array(WORLD_X * WORLD_H * WORLD_Z);
        const idx = (x, y, z) => (y * WORLD_Z + z) * WORLD_X + x;

        const heights = new Int16Array(WORLD_X * WORLD_Z);
        for (let z = 0; z < WORLD_Z; z++) for (let x = 0; x < WORLD_X; x++) {
            const n = noise2(x / 42, z / 42, seed) * 24
                    + noise2(x / 16, z / 16, seed ^ 0x9e37) * 8
                    + noise2(x / 7, z / 7, seed ^ 0x51f3) * 3;
            heights[z * WORLD_X + x] = Math.max(6, Math.min(WORLD_H - 12, Math.floor(14 + n)));
        }

        for (let z = 0; z < WORLD_Z; z++) for (let x = 0; x < WORLD_X; x++) {
            const h = heights[z * WORLD_X + x];
            const beach = h <= WATER_LEVEL + 1;
            for (let y = 0; y <= Math.max(h, WATER_LEVEL); y++) {
                let id;
                if (y === 0) id = BEDROCK;
                else if (y < h - 3) id = STONE;
                else if (y < h) id = beach ? SAND : DIRT;
                else if (y === h) id = beach ? SAND : GRASS;
                else id = WATER; // y > h and <= WATER_LEVEL
                blocks[idx(x, y, z)] = id;
            }
        }

        // trees
        for (let z = 2; z < WORLD_Z - 2; z++) for (let x = 2; x < WORLD_X - 2; x++) {
            const h = heights[z * WORLD_X + x];
            if (h <= WATER_LEVEL + 1) continue;
            if (blocks[idx(x, h, z)] !== GRASS) continue;
            if (hash2(x, z, seed ^ 0x7ee5) > 0.012) continue;
            const th = 4 + Math.floor(hash2(x, z, seed ^ 0x1234) * 3);
            for (let dy = 1; dy <= th; dy++) blocks[idx(x, h + dy, z)] = LOG;
            const top = h + th;
            for (let dy = -2; dy <= 1; dy++) {
                const r = dy >= 0 ? 1 : 2;
                for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
                    if (dx === 0 && dz === 0 && dy <= 0) continue;
                    if (Math.abs(dx) === r && Math.abs(dz) === r && hash2(x + dx * 7, z + dz * 13, seed ^ dy) < 0.5) continue;
                    const y = top + dy, nx = x + dx, nz = z + dz;
                    if (nx < 0 || nx >= WORLD_X || nz < 0 || nz >= WORLD_Z || y >= WORLD_H) continue;
                    if (blocks[idx(nx, y, nz)] === AIR) blocks[idx(nx, y, nz)] = LEAVES;
                }
            }
        }

        return { blocks, idx, seed, edits: {} };
    }

    function heightAt(world, x, z) {
        for (let y = WORLD_H - 1; y >= 0; y--) {
            const id = world.blocks[world.idx(x, y, z)];
            if (id !== AIR && id !== WATER) return y;
        }
        return 0;
    }

    // ------------------------------------------------------------------
    // WebGL helpers
    // ------------------------------------------------------------------
    function compile(gl, vsSrc, fsSrc) {
        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, vsSrc); gl.compileShader(vs);
        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, fsSrc); gl.compileShader(fs);
        const prog = gl.createProgram();
        gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
        return prog;
    }

    const VS = `
        attribute vec3 aPos; attribute vec2 aUV; attribute float aShade;
        uniform mat4 uMVP;
        varying vec2 vUV; varying float vShade; varying float vDist;
        void main() {
            vUV = aUV; vShade = aShade;
            vec4 p = uMVP * vec4(aPos, 1.0);
            vDist = p.w;
            gl_Position = p;
        }`;
    const FS = `
        precision mediump float;
        uniform sampler2D uTex; uniform vec3 uFog; uniform vec2 uFogRange; uniform float uAlpha;
        varying vec2 vUV; varying float vShade; varying float vDist;
        void main() {
            vec4 c = texture2D(uTex, vUV);
            if (c.a < 0.05) discard;
            float fog = clamp((vDist - uFogRange.x) / (uFogRange.y - uFogRange.x), 0.0, 1.0);
            vec3 col = mix(c.rgb * vShade, uFog, fog);
            gl_FragColor = vec4(col, c.a * uAlpha);
        }`;
    const LINE_VS = `
        attribute vec3 aPos; uniform mat4 uMVP;
        void main() { gl_Position = uMVP * vec4(aPos, 1.0); }`;
    const LINE_FS = `
        precision mediump float; uniform vec4 uColor;
        void main() { gl_FragColor = uColor; }`;

    // mat4 helpers (column-major)
    function mat4Mul(a, b) {
        const o = new Float32Array(16);
        for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
            o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
        }
        return o;
    }
    function mat4Perspective(fov, aspect, near, far) {
        const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
        return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
    }
    function mat4RotX(a) {
        const c = Math.cos(a), s = Math.sin(a);
        return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
    }
    function mat4RotY(a) {
        const c = Math.cos(a), s = Math.sin(a);
        return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
    }
    function mat4Trans(x, y, z) {
        return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
    }

    // Face tables: 0=+x 1=-x 2=+y 3=-y 4=+z 5=-z
    const FACES = [
        { n: [1, 0, 0],  corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], uv: [[1, 0], [1, 1], [0, 1], [0, 0]], shade: 0.8 },
        { n: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], uv: [[1, 0], [1, 1], [0, 1], [0, 0]], shade: 0.8 },
        { n: [0, 1, 0],  corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]], shade: 1.0 },
        { n: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]], shade: 0.5 },
        { n: [0, 0, 1],  corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]], shade: 0.65 },
        { n: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]], shade: 0.65 },
    ];
    const FACE_IDX = [0, 1, 2, 0, 2, 3];

    // ------------------------------------------------------------------
    // Game
    // ------------------------------------------------------------------
    function launch() {
        const win = WindowManager.createWindow(APP_ID, 'Minecraft', icon, buildContent(), {
            width: 960, height: 600, minWidth: 480, minHeight: 320
        });

        const state = {
            alive: true, world: null, gl: null, canvas: null, atlasCanvas: null, atlasTex: null,
            prog: null, lineProg: null, chunkMeshes: [], dirty: new Set(),
            player: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, onGround: false, inWater: false },
            keys: {}, sel: 0, paused: true, started: false, touchMode: ('ontouchstart' in window) || navigator.maxTouchPoints > 0,
            highlightBuf: null, saveTimer: null, raf: 0, lastT: 0, fps: 0, frames: 0, fpsT: 0,
            breakTimer: null, placeTimer: null, holdBreak: false, holdPlace: false,
            lookDrag: null, joystick: null, target: null,
        };

        const root = win.element.querySelector('.mc-root');
        const canvas = root.querySelector('.mc-canvas');
        state.canvas = canvas;

        try {
            initGL();
            loadOrNewWorld();
        } catch (err) {
            root.querySelector('.mc-loading').textContent = 'Failed to start: ' + err.message;
            throw err;
        }
        buildHotbarUI();
        wireInput();
        wireOverlays();
        state.saveTimer = setInterval(() => saveGame(), 20000);
        state.raf = requestAnimationFrame(frame);

        WindowManager.setCloseHandler(APP_ID, () => {
            saveGame();
            cleanup();
            return true;
        });

        // ----------------------------------------------------------
        function buildContent() {
            const slots = HOTBAR.map((id, i) =>
                `<div class="mc-slot" data-i="${i}" title="${BLOCKS[id].name}"><canvas width="44" height="44"></canvas><span class="mc-key">${(i + 1) % 10}</span></div>`
            ).join('');
            return `
            <style>
                .mc-root { position:relative; width:100%; height:100%; background:#000; overflow:hidden; outline:none; font-family:'Segoe UI',sans-serif; user-select:none; }
                .mc-root canvas.mc-canvas { position:absolute; inset:0; width:100%; height:100%; display:block; cursor:crosshair; }
                .mc-cross { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); pointer-events:none; opacity:0.85; }
                .mc-cross::before, .mc-cross::after { content:''; position:absolute; background:#fff; mix-blend-mode:difference; }
                .mc-cross::before { width:18px; height:2px; left:-9px; top:-1px; }
                .mc-cross::after { width:2px; height:18px; left:-1px; top:-9px; }
                .mc-hotbar { position:absolute; left:50%; bottom:8px; transform:translateX(-50%); display:flex; gap:3px; padding:3px; background:rgba(0,0,0,0.45); border-radius:6px; }
                .mc-slot { position:relative; width:46px; height:46px; border:2px solid rgba(255,255,255,0.25); border-radius:4px; background:rgba(30,30,30,0.6); cursor:pointer; display:flex; align-items:center; justify-content:center; }
                .mc-slot.sel { border-color:#fff; background:rgba(70,70,70,0.8); }
                .mc-slot canvas { width:40px; height:40px; image-rendering:pixelated; }
                .mc-key { position:absolute; top:1px; left:3px; font-size:9px; color:rgba(255,255,255,0.6); }
                .mc-hud { position:absolute; top:6px; left:8px; color:#fff; font-size:11px; text-shadow:1px 1px 0 rgba(0,0,0,0.8); pointer-events:none; line-height:1.5; }
                .mc-overlay { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px; background:rgba(10,12,10,0.82); color:#fff; z-index:5; }
                .mc-overlay.hidden { display:none; }
                .mc-overlay h1 { font-size:42px; margin:0; letter-spacing:2px; color:#7ec850; text-shadow:3px 3px 0 #2c4a1e; font-weight:800; }
                .mc-overlay h2 { font-size:24px; margin:0; color:#fff; }
                .mc-btn { padding:10px 44px; font-size:16px; font-weight:600; color:#fff; background:#3a7d2c; border:2px solid #57a844; border-radius:4px; cursor:pointer; }
                .mc-btn:hover { background:#4a9638; }
                .mc-btn.secondary { background:#3a3a3a; border-color:#5a5a5a; }
                .mc-btn.secondary:hover { background:#4a4a4a; }
                .mc-help { color:#bbb; font-size:12px; line-height:1.8; text-align:center; }
                .mc-help b { color:#fff; background:rgba(255,255,255,0.12); padding:1px 6px; border-radius:3px; }
                .mc-loading { color:#7ec850; font-size:13px; }
                .mc-touch { position:absolute; inset:0; pointer-events:none; z-index:4; display:none; }
                .mc-root.touch .mc-touch { display:block; }
                .mc-joy { position:absolute; left:18px; bottom:70px; width:110px; height:110px; border-radius:50%; background:rgba(255,255,255,0.08); border:2px solid rgba(255,255,255,0.25); pointer-events:auto; }
                .mc-joy-knob { position:absolute; left:50%; top:50%; width:44px; height:44px; border-radius:50%; background:rgba(255,255,255,0.35); transform:translate(-50%,-50%); }
                .mc-jump { position:absolute; right:24px; bottom:84px; width:64px; height:64px; border-radius:50%; background:rgba(255,255,255,0.15); border:2px solid rgba(255,255,255,0.35); color:#fff; font-size:12px; font-weight:700; display:flex; align-items:center; justify-content:center; pointer-events:auto; }
            </style>
            <div class="mc-root" tabindex="0">
                <canvas class="mc-canvas"></canvas>
                <div class="mc-cross"></div>
                <div class="mc-hud"></div>
                <div class="mc-hotbar">${slots}</div>
                <div class="mc-touch">
                    <div class="mc-joy"><div class="mc-joy-knob"></div></div>
                    <div class="mc-jump">JUMP</div>
                </div>
                <div class="mc-overlay mc-start">
                    <h1>MINECRAFT</h1>
                    <div class="mc-loading">Generating world&hellip;</div>
                    <button class="mc-btn mc-play-btn" style="visibility:hidden;">Play</button>
                    <div class="mc-help">
                        <b>W A S D</b> move &nbsp; <b>Mouse</b> look &nbsp; <b>Left click</b> mine &nbsp; <b>Right click</b> place<br>
                        <b>Space</b> jump / swim &nbsp; <b>Shift</b> sneak &nbsp; <b>1-0 / wheel</b> select block &nbsp; <b>Esc</b> pause
                    </div>
                </div>
                <div class="mc-overlay mc-pause hidden">
                    <h2>Game Paused</h2>
                    <button class="mc-btn mc-resume-btn">Back to Game</button>
                    <button class="mc-btn secondary mc-new-btn">New World</button>
                    <div class="mc-help">Your world is saved automatically.</div>
                </div>
            </div>`;
        }

        // ----------------------------------------------------------
        function initGL() {
            const gl = canvas.getContext('webgl', { antialias: false });
            if (!gl) throw new Error('WebGL not supported');
            state.gl = gl;
            state.atlasCanvas = makeAtlas();

            const tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, state.atlasCanvas);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            state.atlasTex = tex;

            state.prog = compile(gl, VS, FS);
            state.lineProg = compile(gl, LINE_VS, LINE_FS);
            state.highlightBuf = gl.createBuffer();

            gl.enable(gl.DEPTH_TEST);
            gl.enable(gl.CULL_FACE);
            gl.clearColor(0.55, 0.78, 0.98, 1);

            const ro = new ResizeObserver(resize);
            root._resizeObserver = ro;
            ro.observe(root);
            resize();
        }

        function resize() {
            if (!state.alive) return;
            const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
            const w = Math.max(1, Math.floor(root.clientWidth * dpr));
            const h = Math.max(1, Math.floor(root.clientHeight * dpr));
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w; canvas.height = h;
                state.gl.viewport(0, 0, w, h);
            }
        }

        // ----------------------------------------------------------
        function loadOrNewWorld() {
            const saved = loadSaveData();
            if (saved) {
                state.world = createWorld(saved.seed);
                state.player.x = saved.player.x; state.player.y = saved.player.y;
                state.player.z = saved.player.z; state.player.yaw = saved.player.yaw;
                state.player.pitch = saved.player.pitch; state.sel = saved.player.sel | 0;
                for (const k in saved.edits) {
                    const [x, y, z] = k.split(',').map(Number);
                    setBlockRaw(state.world, x, y, z, saved.edits[k]);
                    state.world.edits[k] = saved.edits[k];
                }
            } else {
                state.world = createWorld((Math.random() * 0x7fffffff) | 0);
                const sx = WORLD_X >> 1, sz = WORLD_Z >> 1;
                state.player.x = sx + 0.5; state.player.z = sz + 0.5;
                state.player.y = heightAt(state.world, sx, sz) + 2.5;
            }
            rebuildAllMeshes();
            showPlayButton();
        }

        function ensureDataDir() {
            if (!FileSystem.itemExists(DATA_DIR())) {
                FileSystem.createFolder(Users.home(['AppData']), 'minecraft');
            }
        }
        function loadSaveData() {
            try {
                ensureDataDir();
                const raw = FileSystem.readFile([...DATA_DIR(), 'world.json']);
                if (!raw) return null;
                const data = JSON.parse(raw);
                return data && typeof data.seed === 'number' ? data : null;
            } catch { return null; }
        }
        function saveGame() {
            if (!state.world || !state.alive) return;
            try {
                ensureDataDir();
                const data = {
                    seed: state.world.seed,
                    player: { x: state.player.x, y: state.player.y, z: state.player.z, yaw: state.player.yaw, pitch: state.player.pitch, sel: state.sel },
                    edits: state.world.edits,
                };
                const json = JSON.stringify(data);
                const path = [...DATA_DIR(), 'world.json'];
                if (FileSystem.itemExists(path)) FileSystem.writeFile(path, json);
                else FileSystem.createFile(DATA_DIR(), 'world.json', json, 'json');
            } catch { /* storage full etc. — keep playing */ }
        }

        // ----------------------------------------------------------
        function getBlock(x, y, z) {
            if (x < 0 || x >= WORLD_X || y < 0 || y >= WORLD_H || z < 0 || z >= WORLD_Z) return AIR;
            return state.world.blocks[state.world.idx(x, y, z)];
        }
        function setBlockRaw(world, x, y, z, id) {
            world.blocks[world.idx(x, y, z)] = id;
        }
        function setBlock(x, y, z, id) {
            if (x < 0 || x >= WORLD_X || y < 0 || y >= WORLD_H || z < 0 || z >= WORLD_Z) return;
            setBlockRaw(state.world, x, y, z, id);
            state.world.edits[`${x},${y},${z}`] = id;
            const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
            state.dirty.add(cx + ',' + cz);
            if (x % CHUNK === 0) state.dirty.add((cx - 1) + ',' + cz);
            if (x % CHUNK === CHUNK - 1) state.dirty.add((cx + 1) + ',' + cz);
            if (z % CHUNK === 0) state.dirty.add(cx + ',' + (cz - 1));
            if (z % CHUNK === CHUNK - 1) state.dirty.add(cx + ',' + (cz + 1));
        }

        function tileUV(tile, fu, fv) {
            const col = tile % 8, row = Math.floor(tile / 8);
            const eps = 0.15 / 128;
            const u0 = col / 8 + eps, u1 = (col + 1) / 8 - eps;
            const v1 = 1 - row / 2 - eps, v0 = 1 - (row + 1) / 2 + eps;
            return [u0 + fu * (u1 - u0), v0 + fv * (v1 - v0)];
        }

        function buildChunkMesh(cx, cz) {
            const gl = state.gl;
            const opq = [], trn = [];
            const x0 = cx * CHUNK, z0 = cz * CHUNK;

            for (let x = x0; x < x0 + CHUNK; x++) {
                for (let z = z0; z < z0 + CHUNK; z++) {
                    for (let y = 0; y < WORLD_H; y++) {
                        const id = getBlock(x, y, z);
                        if (id === AIR) continue;
                        const info = BLOCKS[id];
                        const target = info.transparent ? trn : opq;
                        for (let f = 0; f < 6; f++) {
                            const face = FACES[f];
                            const n = getBlock(x + face.n[0], y + face.n[1], z + face.n[2]);
                            if (n !== AIR) {
                                const nInfo = BLOCKS[n];
                                if (!nInfo.transparent || n === id) continue;
                            }
                            const tile = f === 2 ? info.tiles[0] : f === 3 ? info.tiles[1] : info.tiles[2];
                            for (const ci of FACE_IDX) {
                                const c = face.corners[ci];
                                const [u, v] = tileUV(tile, face.uv[ci][0], face.uv[ci][1]);
                                target.push(x + c[0], y + c[1], z + c[2], u, v, face.shade);
                            }
                        }
                    }
                }
            }

            const key = cx + ',' + cz;
            let mesh = state.chunkMeshes[key];
            if (!mesh) mesh = state.chunkMeshes[key] = { opq: { buf: gl.createBuffer(), n: 0 }, trn: { buf: gl.createBuffer(), n: 0 } };
            upload(mesh.opq, opq); upload(mesh.trn, trn);

            function upload(m, arr) {
                gl.bindBuffer(gl.ARRAY_BUFFER, m.buf);
                if (arr.length) {
                    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
                    m.n = arr.length / 6;
                } else m.n = 0;
            }
        }

        function rebuildAllMeshes() {
            state.dirty.clear();
            for (let cz = 0; cz < CHUNKS_Z; cz++) for (let cx = 0; cx < CHUNKS_X; cx++) buildChunkMesh(cx, cz);
        }

        // ----------------------------------------------------------
        // Player physics
        // ----------------------------------------------------------
        const P_HALF = 0.3, P_HEIGHT = 1.8, EYE = 1.62;

        function blockSolid(id) {
            return id !== AIR && id !== WATER;
        }
        function aabbCollides(px, py, pz) {
            const x0 = Math.floor(px - P_HALF), x1 = Math.floor(px + P_HALF);
            const y0 = Math.floor(py), y1 = Math.floor(py + P_HEIGHT);
            const z0 = Math.floor(pz - P_HALF), z1 = Math.floor(pz + P_HALF);
            for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
                if (blockSolid(getBlock(x, y, z))) return true;
            }
            return false;
        }

        function physics(dt) {
            const p = state.player;
            const feet = getBlock(Math.floor(p.x), Math.floor(p.y + 0.2), Math.floor(p.z));
            const head = getBlock(Math.floor(p.x), Math.floor(p.y + EYE), Math.floor(p.z));
            p.inWater = feet === WATER || head === WATER;

            // input direction
            let mx = 0, mz = 0;
            const k = state.keys;
            if (k['KeyW'] || k['ArrowUp']) mz += 1;
            if (k['KeyS'] || k['ArrowDown']) mz -= 1;
            if (k['KeyA'] || k['ArrowLeft']) mx -= 1;
            if (k['KeyD'] || k['ArrowRight']) mx += 1;
            if (state.joystick) { mx += state.joystick.x; mz += -state.joystick.y; }
            const len = Math.hypot(mx, mz);
            if (len > 1) { mx /= len; mz /= len; }

            const sneak = k['ShiftLeft'] || k['ShiftRight'];
            const speed = p.inWater ? 2.6 : sneak ? 1.8 : 4.4;
            const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
            // horizontal forward = (sin yaw, -cos yaw); right = (cos yaw, sin yaw)
            const fx = sy, fz = -cy;
            const rx = cy, rz = sy;
            const wishX = (fx * mz + rx * mx) * speed;
            const wishZ = (fz * mz + rz * mx) * speed;
            const accel = p.onGround || p.inWater ? 14 : 5;
            p.vx += (wishX - p.vx) * Math.min(1, accel * dt);
            p.vz += (wishZ - p.vz) * Math.min(1, accel * dt);

            // gravity / jump / swim
            const jump = k['Space'] || state.jumpHeld;
            if (p.inWater) {
                p.vy -= 4.5 * dt;
                if (jump) p.vy = Math.min(p.vy + 14 * dt, 3.2);
                p.vy = Math.max(p.vy, -3);
            } else {
                p.vy -= 22 * dt;
                if (jump && p.onGround) { p.vy = 8.2; p.onGround = false; }
            }
            p.vy = Math.max(p.vy, -40);

            // integrate axis by axis
            p.onGround = false;
            let nx = p.x + p.vx * dt;
            if (!aabbCollides(nx, p.y, p.z)) p.x = nx; else p.vx = 0;
            let nz = p.z + p.vz * dt;
            if (!aabbCollides(p.x, p.y, nz)) p.z = nz; else p.vz = 0;
            let ny = p.y + p.vy * dt;
            if (!aabbCollides(p.x, ny, p.z)) {
                p.y = ny;
            } else {
                if (p.vy < 0) p.onGround = true;
                p.vy = 0;
            }

            // keep inside world bounds horizontally
            p.x = Math.min(WORLD_X - P_HALF - 0.01, Math.max(P_HALF + 0.01, p.x));
            p.z = Math.min(WORLD_Z - P_HALF - 0.01, Math.max(P_HALF + 0.01, p.z));
            if (p.y < -10) { // fell out — respawn
                p.x = WORLD_X >> 1; p.z = WORLD_Z >> 1;
                p.y = heightAt(state.world, p.x | 0, p.z | 0) + 2.5;
                p.vx = p.vy = p.vz = 0;
            }
        }

        // ----------------------------------------------------------
        // Raycast (DDA)
        // ----------------------------------------------------------
        function raycast() {
            const p = state.player;
            const cp = Math.cos(p.pitch), sp = Math.sin(p.pitch);
            const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
            const dir = [sy * cp, -sp, -cy * cp];
            let x = Math.floor(p.x), y = Math.floor(p.y + EYE), z = Math.floor(p.z);
            const stepX = dir[0] > 0 ? 1 : -1, stepY = dir[1] > 0 ? 1 : -1, stepZ = dir[2] > 0 ? 1 : -1;
            const tDX = Math.abs(1 / (dir[0] || 1e-9)), tDY = Math.abs(1 / (dir[1] || 1e-9)), tDZ = Math.abs(1 / (dir[2] || 1e-9));
            let tMX = (stepX > 0 ? (x + 1 - p.x) : (p.x - x)) * tDX;
            let tMY = (stepY > 0 ? (y + 1 - (p.y + EYE)) : ((p.y + EYE) - y)) * tDY;
            let tMZ = (stepZ > 0 ? (z + 1 - p.z) : (p.z - z)) * tDZ;
            let face = [0, 0, 0];
            for (let i = 0; i < 64; i++) {
                const id = getBlock(x, y, z);
                if (blockSolid(id)) return { x, y, z, id, face };
                if (tMX < tMY && tMX < tMZ) { if (tMX > 7) break; x += stepX; tMX += tDX; face = [-stepX, 0, 0]; }
                else if (tMY < tMZ) { if (tMY > 7) break; y += stepY; tMY += tDY; face = [0, -stepY, 0]; }
                else { if (tMZ > 7) break; z += stepZ; tMZ += tDZ; face = [0, 0, -stepZ]; }
            }
            return null;
        }

        function breakBlock() {
            const hit = state.target;
            if (!hit || hit.id === BEDROCK) return;
            playSound('dig');
            setBlock(hit.x, hit.y, hit.z, AIR);
        }
        function placeBlock() {
            const hit = state.target;
            if (!hit) return;
            const x = hit.x + hit.face[0], y = hit.y + hit.face[1], z = hit.z + hit.face[2];
            if (x < 0 || x >= WORLD_X || y < 0 || y >= WORLD_H || z < 0 || z >= WORLD_Z) return;
            const cur = getBlock(x, y, z);
            if (cur !== AIR && cur !== WATER) return;
            // don't place inside the player
            const p = state.player;
            const overlap = x + 1 > p.x - P_HALF && x < p.x + P_HALF &&
                            z + 1 > p.z - P_HALF && z < p.z + P_HALF &&
                            y + 1 > p.y && y < p.y + P_HEIGHT;
            if (overlap) return;
            playSound('place');
            setBlock(x, y, z, HOTBAR[state.sel]);
        }

        // ----------------------------------------------------------
        // Rendering
        // ----------------------------------------------------------
        function frame(t) {
            if (!state.alive) return;
            state.raf = requestAnimationFrame(frame);
            const dt = Math.min(0.05, (t - state.lastT) / 1000 || 0.016);
            state.lastT = t;

            state.frames++;
            if (t - state.fpsT > 500) { state.fps = Math.round(state.frames * 1000 / (t - state.fpsT)); state.frames = 0; state.fpsT = t; updateHud(); }

            if (!state.paused) physics(dt);

            // rebuild dirty chunks (max 2 per frame)
            let rebuilt = 0;
            for (const key of state.dirty) {
                const [cx, cz] = key.split(',').map(Number);
                if (cx >= 0 && cx < CHUNKS_X && cz >= 0 && cz < CHUNKS_Z) buildChunkMesh(cx, cz);
                state.dirty.delete(key);
                if (++rebuilt >= 2) break;
            }

            state.target = state.paused ? null : raycast();
            draw();
        }

        function draw() {
            const gl = state.gl;
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            const p = state.player;
            const aspect = canvas.width / Math.max(1, canvas.height);
            const proj = mat4Perspective(70 * Math.PI / 180, aspect, 0.08, 220);
            const view = mat4Mul(mat4RotX(p.pitch), mat4Mul(mat4RotY(p.yaw), mat4Trans(-p.x, -(p.y + EYE), -p.z)));
            const mvp = mat4Mul(proj, view);

            gl.useProgram(state.prog);
            gl.uniformMatrix4fv(gl.getUniformLocation(state.prog, 'uMVP'), false, mvp);
            gl.uniform3f(gl.getUniformLocation(state.prog, 'uFog'), 0.55, 0.78, 0.98);
            gl.uniform2f(gl.getUniformLocation(state.prog, 'uFogRange'), 55, 90);
            gl.uniform1f(gl.getUniformLocation(state.prog, 'uAlpha'), 1);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, state.atlasTex);
            gl.uniform1i(gl.getUniformLocation(state.prog, 'uTex'), 0);

            const aPos = gl.getAttribLocation(state.prog, 'aPos');
            const aUV = gl.getAttribLocation(state.prog, 'aUV');
            const aShade = gl.getAttribLocation(state.prog, 'aShade');
            gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aUV); gl.enableVertexAttribArray(aShade);

            function bindDraw(m, count) {
                if (!m.n) return;
                gl.bindBuffer(gl.ARRAY_BUFFER, m.buf);
                gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0);
                gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 24, 12);
                gl.vertexAttribPointer(aShade, 1, gl.FLOAT, false, 24, 20);
                gl.drawArrays(gl.TRIANGLES, 0, count || m.n);
            }

            for (const key in state.chunkMeshes) bindDraw(state.chunkMeshes[key].opq);

            // transparent pass (water, glass)
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.depthMask(false);
            gl.uniform1f(gl.getUniformLocation(state.prog, 'uAlpha'), 0.75);
            for (const key in state.chunkMeshes) bindDraw(state.chunkMeshes[key].trn);
            gl.depthMask(true);
            gl.disable(gl.BLEND);

            gl.disableVertexAttribArray(aPos); gl.disableVertexAttribArray(aUV); gl.disableVertexAttribArray(aShade);

            // block highlight
            if (state.target) {
                const { x, y, z } = state.target;
                const s = 0.004, lo = -s, hi = 1 + s;
                const c = [
                    lo, lo, lo, hi, lo, lo, hi, lo, hi, lo, lo, hi,
                    lo, hi, lo, hi, hi, lo, hi, hi, hi, lo, hi, hi,
                ];
                const edges = [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7];
                const verts = [];
                for (const i of edges) verts.push(x + c[i * 3], y + c[i * 3 + 1], z + c[i * 3 + 2]);
                gl.useProgram(state.lineProg);
                gl.uniformMatrix4fv(gl.getUniformLocation(state.lineProg, 'uMVP'), false, mvp);
                gl.uniform4f(gl.getUniformLocation(state.lineProg, 'uColor'), 0, 0, 0, 0.7);
                const aP = gl.getAttribLocation(state.lineProg, 'aPos');
                gl.bindBuffer(gl.ARRAY_BUFFER, state.highlightBuf);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
                gl.enableVertexAttribArray(aP);
                gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 12, 0);
                gl.drawArrays(gl.LINES, 0, verts.length / 3);
                gl.disableVertexAttribArray(aP);
            }
        }

        function updateHud() {
            const p = state.player;
            root.querySelector('.mc-hud').innerHTML =
                `Minecraft Classic &nbsp; ${state.fps} fps<br>` +
                `XYZ: ${p.x.toFixed(1)} / ${p.y.toFixed(1)} / ${p.z.toFixed(1)}` +
                (state.target ? `<br>Looking at: ${BLOCKS[state.target.id].name}` : '');
        }

        // ----------------------------------------------------------
        // Hotbar UI
        // ----------------------------------------------------------
        function drawIsoBlock(ctx, id) {
            const info = BLOCKS[id];
            const atlas = state.atlasCanvas;
            const S = 44, u = S / 32;
            ctx.imageSmoothingEnabled = false;
            ctx.clearRect(0, 0, S, S);
            const src = (tile) => [(tile % 8) * 16, Math.floor(tile / 8) * 16];
            const shade = (a) => {
                if (info.transparent) return;
                ctx.fillStyle = `rgba(0,0,0,${a})`;
                ctx.fillRect(0, 0, 16, 16);
            };
            const [tx, ty] = src(info.tiles[0]);
            const [sx, sy] = src(info.tiles[2]);

            // left face: origin at left corner (0, S/4)
            ctx.setTransform(u, 0.5 * u, 0, u, 0, S / 4);
            ctx.drawImage(atlas, sx, sy, 16, 16, 0, 0, 16, 16);
            shade(0.28);
            // right face: origin at bottom-center of top diamond (S/2, S/2)
            ctx.setTransform(u, -0.5 * u, 0, u, S / 2, S / 2);
            ctx.drawImage(atlas, sx, sy, 16, 16, 0, 0, 16, 16);
            shade(0.45);
            // top face: origin at top vertex (S/2, 0)
            ctx.setTransform(u, 0.5 * u, -u, 0.5 * u, S / 2, 0);
            ctx.drawImage(atlas, tx, ty, 16, 16, 0, 0, 16, 16);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
        }

        function buildHotbarUI() {
            const slots = root.querySelectorAll('.mc-slot');
            slots.forEach((slot, i) => {
                drawIsoBlock(slot.querySelector('canvas').getContext('2d'), HOTBAR[i]);
                slot.addEventListener('click', () => { selectSlot(i); root.focus(); });
                slot.addEventListener('pointerdown', (e) => e.stopPropagation());
            });
            selectSlot(0);
        }
        function selectSlot(i) {
            state.sel = i;
            root.querySelectorAll('.mc-slot').forEach((s, j) => s.classList.toggle('sel', j === i));
        }

        // ----------------------------------------------------------
        // Sound
        // ----------------------------------------------------------
        let audioCtx = null;
        function playSound(kind) {
            try {
                if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const t = audioCtx.currentTime;
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'triangle';
                if (kind === 'dig') { osc.frequency.setValueAtTime(180 + Math.random() * 60, t); osc.frequency.exponentialRampToValueAtTime(70, t + 0.09); }
                else { osc.frequency.setValueAtTime(320 + Math.random() * 60, t); osc.frequency.exponentialRampToValueAtTime(200, t + 0.08); }
                gain.gain.setValueAtTime(0.18, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
                osc.connect(gain).connect(audioCtx.destination);
                osc.start(t); osc.stop(t + 0.13);
            } catch { /* audio unavailable */ }
        }

        // ----------------------------------------------------------
        // Input
        // ----------------------------------------------------------
        function wireInput() {
            if (state.touchMode) root.classList.add('touch');

            root.addEventListener('keydown', onKeyDown);
            root.addEventListener('keyup', onKeyUp);
            window.addEventListener('blur', onBlur);

            canvas.addEventListener('contextmenu', (e) => e.preventDefault());
            root.addEventListener('wheel', (e) => {
                e.preventDefault();
                selectSlot((state.sel + (e.deltaY > 0 ? 1 : -1) + HOTBAR.length) % HOTBAR.length);
            }, { passive: false });

            if (state.touchMode) wireTouch();
            else wireMouse();

            document.addEventListener('pointerlockchange', onLockChange);
        }

        function onKeyDown(e) {
            if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
            state.keys[e.code] = true;
            if (e.code.startsWith('Digit')) {
                const n = +e.code.slice(5);
                selectSlot(n === 0 ? 9 : n - 1);
            }
            if (e.code === 'Escape' && !state.paused && !document.pointerLockElement) pause();
        }
        function onKeyUp(e) { state.keys[e.code] = false; }
        function onBlur() {
            state.keys = {};
            state.holdBreak = state.holdPlace = false;
            clearInterval(state.breakTimer);
            clearInterval(state.placeTimer);
        }
        function onLockChange() {
            if (!document.pointerLockElement && state.started && !state.paused && !state.touchMode) pause();
        }
        function onMouseUp(e) {
            if (e.button === 0) { state.holdBreak = false; clearInterval(state.breakTimer); }
            if (e.button === 2) { state.holdPlace = false; clearInterval(state.placeTimer); }
        }
        function onMouseMove(e) {
            if (document.pointerLockElement === state.canvas && !state.paused) {
                state.player.yaw += e.movementX * 0.0026;
                state.player.pitch += e.movementY * 0.0026;
                clampPitch();
            }
        }

        function wireMouse() {
            canvas.addEventListener('mousedown', (e) => {
                if (state.paused) return;
                if (!document.pointerLockElement) {
                    const req = canvas.requestPointerLock();
                    if (req && req.catch) req.catch(() => {});
                }
                root.focus();
                if (e.button === 0) {
                    breakBlock();
                    clearInterval(state.breakTimer);
                    state.holdBreak = true;
                    state.breakTimer = setInterval(() => { if (!state.paused) breakBlock(); }, 260);
                } else if (e.button === 2) {
                    placeBlock();
                    clearInterval(state.placeTimer);
                    state.holdPlace = true;
                    state.placeTimer = setInterval(() => { if (!state.paused) placeBlock(); }, 260);
                }
            });
            window.addEventListener('mouseup', onMouseUp);
            document.addEventListener('mousemove', onMouseMove);
        }
        function clampPitch() {
            const lim = 89 * Math.PI / 180;
            state.player.pitch = Math.max(-lim, Math.min(lim, state.player.pitch));
        }

        function wireTouch() {
            const joy = root.querySelector('.mc-joy');
            const knob = root.querySelector('.mc-joy-knob');
            const jump = root.querySelector('.mc-jump');

            joy.addEventListener('pointerdown', (e) => {
                joy.setPointerCapture(e.pointerId);
                state.joystick = { x: 0, y: 0, id: e.pointerId };
                moveJoy(e);
            });
            joy.addEventListener('pointermove', (e) => { if (state.joystick && e.pointerId === state.joystick.id) moveJoy(e); });
            const joyEnd = (e) => {
                if (state.joystick && e.pointerId === state.joystick.id) {
                    state.joystick = null;
                    knob.style.transform = 'translate(-50%,-50%)';
                }
            };
            joy.addEventListener('pointerup', joyEnd);
            joy.addEventListener('pointercancel', joyEnd);
            function moveJoy(e) {
                const r = joy.getBoundingClientRect();
                let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
                let dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
                const l = Math.hypot(dx, dy);
                if (l > 1) { dx /= l; dy /= l; }
                state.joystick.x = dx; state.joystick.y = dy;
                knob.style.transform = `translate(calc(-50% + ${dx * 30}px), calc(-50% + ${dy * 30}px))`;
            }

            jump.addEventListener('pointerdown', (e) => { e.stopPropagation(); state.jumpHeld = true; });
            jump.addEventListener('pointerup', () => state.jumpHeld = false);
            jump.addEventListener('pointercancel', () => state.jumpHeld = false);

            // look / mine / place on the canvas
            let look = null;
            canvas.addEventListener('pointerdown', (e) => {
                if (state.paused) return;
                root.focus();
                look = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
                canvas.setPointerCapture(e.pointerId);
                state.placeArm = setTimeout(() => {
                    if (look && look.moved < 12) { placeBlock(); state.holdPlace = true; look.placed = true; }
                }, 420);
            });
            canvas.addEventListener('pointermove', (e) => {
                if (!look || e.pointerId !== look.id) return;
                const dx = e.clientX - look.x, dy = e.clientY - look.y;
                look.moved += Math.abs(dx) + Math.abs(dy);
                state.player.yaw += dx * 0.006;
                state.player.pitch += dy * 0.006;
                clampPitch();
                look.x = e.clientX; look.y = e.clientY;
            });
            const touchEnd = (e) => {
                if (!look || e.pointerId !== look.id) return;
                clearTimeout(state.placeArm);
                state.holdPlace = false;
                if (!look.placed && look.moved < 12 && performance.now() - look.t < 300) breakBlock();
                look = null;
            };
            canvas.addEventListener('pointerup', touchEnd);
            canvas.addEventListener('pointercancel', touchEnd);
        }

        // ----------------------------------------------------------
        // Overlays / pause
        // ----------------------------------------------------------
        function showPlayButton() {
            const start = root.querySelector('.mc-start');
            start.querySelector('.mc-loading').textContent = state.world.edits && Object.keys(state.world.edits).length
                ? 'World loaded — welcome back!'
                : 'World ready!';
            start.querySelector('.mc-play-btn').style.visibility = 'visible';
        }
        function wireOverlays() {
            root.querySelector('.mc-play-btn').addEventListener('click', () => {
                state.started = true;
                resume();
            });
            root.querySelector('.mc-resume-btn').addEventListener('click', resume);
            root.querySelector('.mc-new-btn').addEventListener('click', async () => {
                const ok = await Popup.confirm('New World', 'Generate a fresh world? Your current world will be overwritten.');
                if (!ok) return;
                state.world = createWorld((Math.random() * 0x7fffffff) | 0);
                const sx = WORLD_X >> 1, sz = WORLD_Z >> 1;
                Object.assign(state.player, { x: sx + 0.5, z: sz + 0.5, y: heightAt(state.world, sx, sz) + 2.5, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0 });
                rebuildAllMeshes();
                saveGame();
                resume();
            });
        }
        function resume() {
            state.paused = false;
            root.querySelector('.mc-start').classList.add('hidden');
            root.querySelector('.mc-pause').classList.add('hidden');
            root.focus();
            if (!state.touchMode) {
                const req = canvas.requestPointerLock();
                if (req && req.catch) req.catch(() => {});
            }
        }
        function pause() {
            if (!state.started) return;
            state.paused = true;
            state.keys = {};
            state.holdBreak = state.holdPlace = false;
            saveGame();
            root.querySelector('.mc-pause').classList.remove('hidden');
            if (document.pointerLockElement) document.exitPointerLock();
        }

        // ----------------------------------------------------------
        function cleanup() {
            state.alive = false;
            cancelAnimationFrame(state.raf);
            clearInterval(state.saveTimer);
            clearInterval(state.breakTimer);
            clearInterval(state.placeTimer);
            window.removeEventListener('blur', onBlur);
            window.removeEventListener('mouseup', onMouseUp);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('pointerlockchange', onLockChange);
            if (document.pointerLockElement === state.canvas) document.exitPointerLock();
            if (root._resizeObserver) root._resizeObserver.disconnect();
            const gl = state.gl;
            if (gl) {
                for (const key in state.chunkMeshes) {
                    gl.deleteBuffer(state.chunkMeshes[key].opq.buf);
                    gl.deleteBuffer(state.chunkMeshes[key].trn.buf);
                }
                gl.deleteBuffer(state.highlightBuf);
                gl.deleteTexture(state.atlasTex);
            }
        }
    }

    return { launch };
})();

export default Minecraft;
