// Engine3D — materials and textures.
// A Material is a plain data object (plus a few helpers) — the renderer turns
// it into a cached shader program keyed on its feature signature, so changing
// a color/texture never recompiles anything.
// Import-safe under Node.

import { Vec3 } from './math.js';

let nextMaterialId = 1;

export class Material {
    constructor(opts = {}) {
        this.id = nextMaterialId++;
        this.name = opts.name || '';
        // shading model: 'basic' (unlit) | 'lambert' | 'phong'
        this.shading = opts.shading || 'lambert';
        this.color = opts.color ? Vec3.clone(opts.color) : Vec3.create(0.8, 0.8, 0.8);
        this.emissive = opts.emissive ? Vec3.clone(opts.emissive) : Vec3.create(0, 0, 0);
        this.texture = opts.texture || null;      // Texture2D | CubeTexture | null
        this.shininess = opts.shininess ?? 32;
        this.opacity = opts.opacity ?? 1;
        this.transparent = opts.transparent ?? this.opacity < 1;
        this.wireframe = opts.wireframe ?? false;
        this.doubleSided = opts.doubleSided ?? false;
        this.depthWrite = opts.depthWrite ?? true;
        this.fog = opts.fog ?? true;              // participate in scene fog
        this.receiveShadows = opts.receiveShadows ?? true;
        this.castShadows = opts.castShadows ?? true;
        this.lines = opts.lines ?? false;         // render as LINES (grid/gizmos)
        this.blending = opts.blending || 'normal'; // 'normal' | 'additive'
        this.userData = {};
    }

    clone() {
        const m = new Material({
            name: this.name,
            shading: this.shading,
            color: Vec3.clone(this.color),
            emissive: Vec3.clone(this.emissive),
            texture: this.texture,
            shininess: this.shininess,
            opacity: this.opacity,
            transparent: this.transparent,
            wireframe: this.wireframe,
            doubleSided: this.doubleSided,
            depthWrite: this.depthWrite,
            fog: this.fog,
            receiveShadows: this.receiveShadows,
            castShadows: this.castShadows,
            lines: this.lines,
            blending: this.blending,
        });
        return m;
    }
}

/** Common material presets. */
export const Materials = {
    standard(color, opts = {}) {
        return new Material({ shading: 'phong', color, ...opts });
    },
    unlit(color, opts = {}) {
        return new Material({ shading: 'basic', color, ...opts });
    },
    grid(color = [0.35, 0.35, 0.38], opts = {}) {
        return new Material({
            shading: 'basic', color, lines: true, fog: true,
            castShadows: false, receiveShadows: false,
            transparent: true, opacity: 0.6, ...opts,
        });
    },
};

// ---------------------------------------------------------------- textures
// Textures wrap a canvas/image plus GL state hints. Actual GL upload happens
// in the renderer (it owns the GL context); a texture with no source yet can
// be filled later via setCanvas().

let nextTextureId = 1;

export class Texture2D {
    /**
     * @param {HTMLCanvasElement|HTMLImageElement|OffscreenCanvas} source
     */
    constructor(source = null, opts = {}) {
        this.id = nextTextureId++;
        this.source = source;
        this.width = source ? source.width : opts.width || 0;
        this.height = source ? source.height : opts.height || 0;
        this.repeat = opts.repeat || [1, 1];    // uv repeat factor
        this.filter = opts.filter || 'linear';  // 'nearest' | 'linear'
        this.generateMipmaps = opts.generateMipmaps ?? true;
        this.version = 0;                       // bump to re-upload
        this.gl = null;                         // renderer-managed handle cache
        if (source && this.width === 0) this.width = source.width || 1;
    }

    static fromCanvas(width, height, draw) {
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        draw(ctx, width, height);
        return new Texture2D(canvas, { repeat: [1, 1] });
    }

    /** Simple checkerboard — handy in place of real assets. */
    static checker(size = 128, cells = 8, colorA = '#9aa0a6', colorB = '#5f6368') {
        return Texture2D.fromCanvas(size, size, (ctx) => {
            const cell = size / cells;
            for (let y = 0; y < cells; y++) {
                for (let x = 0; x < cells; x++) {
                    ctx.fillStyle = (x + y) % 2 ? colorA : colorB;
                    ctx.fillRect(x * cell, y * cell, cell, cell);
                }
            }
        });
    }

    /** Noise texture (grayscale), useful for particles / roughness variation. */
    static noise(size = 64) {
        return Texture2D.fromCanvas(size, size, (ctx) => {
            const img = ctx.createImageData(size, size);
            for (let i = 0; i < img.data.length; i += 4) {
                const v = (Math.random() * 255) | 0;
                img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
                img.data[i + 3] = 255;
            }
            ctx.putImageData(img, 0, 0);
        });
    }

    setCanvas(canvas) {
        this.source = canvas;
        this.width = canvas.width;
        this.height = canvas.height;
        this.version++;
    }
}

/** Gradient sky dome driven by a fullscreen pass — no geometry, no texture. */
export class Skybox {
    constructor(top = [0.22, 0.4, 0.75], bottom = [0.85, 0.9, 0.95], horizon = null) {
        this.top = Vec3.clone(top);
        this.bottom = Vec3.clone(bottom);
        this.horizon = horizon ? Vec3.clone(horizon) : null;
        this.enabled = true;
    }
}
