// Engine3D — WebGL renderer.
// Design goals:
//  - one GL program per material *feature signature* (not per material) —
//    changing colors/textures never recompiles;
//  - interleaved VBOs + VAOs (core WebGL2, OES_vertex_array_object fallback);
//  - frustum culling on world bounding spheres;
//  - opaque pass sorted front-to-back (early-z), transparent back-to-front;
//  - instanced meshes via vertexAttribDivisor (core WebGL2, ANGLE fallback);
//  - single directional shadow map (RGBA-packed depth, 3x3 PCF) so it works
//    on WebGL1 without depth textures.
// GLSL is ES 1.00 everywhere, so the same sources run on WebGL1 and WebGL2.
// Import-safe under Node (all GL work happens after construction with a canvas).

import { Vec3, Mat4, scratch } from './math.js';
import { Mesh, InstancedMesh, DirectionalLight, PointLight, SpotLight } from './scene.js';

const MAX_DIR = 2;
const MAX_POINT = 8;
const MAX_SPOT = 4;

// ------------------------------------------------------------------ shaders

const VERT_COMMON = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec2 aUv;
#ifdef USE_INSTANCING
attribute vec4 aInstance0;
attribute vec4 aInstance1;
attribute vec4 aInstance2;
attribute vec4 aInstance3;
#endif
uniform mat4 uModel;
uniform mat4 uViewProjection;
uniform mat3 uNormalMatrix;
uniform vec2 uUvRepeat;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vUv;
void main() {
#ifdef USE_INSTANCING
    mat4 model = uModel * mat4(aInstance0, aInstance1, aInstance2, aInstance3);
#else
    mat4 model = uModel;
#endif
    vec4 world = model * vec4(aPosition, 1.0);
    vWorldPos = world.xyz;
#ifdef USE_TEXTURE
    vUv = aUv * uUvRepeat;
#else
    vUv = aUv;
#endif
#ifdef USE_NORMALS
    vNormal = uNormalMatrix * aNormal;
#endif
    gl_Position = uViewProjection * world;
}
`;

const PACK_GLSL = `
vec4 packDepth(float v) {
    vec4 enc = vec4(1.0, 255.0, 65025.0, 16581375.0) * v;
    enc = fract(enc);
    enc -= enc.yzww * vec4(1.0/255.0, 1.0/255.0, 1.0/255.0, 0.0);
    return enc;
}
float unpackDepth(vec4 rgba) {
    return dot(rgba, vec4(1.0, 1.0/255.0, 1.0/65025.0, 1.0/16581375.0));
}
`;

function buildFragmentShader(shading, hasTexture, hasNormals, shadows, fog) {
    const parts = [`precision highp float;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uEmissive;
uniform float uOpacity;
uniform float uShininess;
uniform vec3 uCameraPos;`];
    if (hasTexture) parts.push(`uniform sampler2D uTexture;`);
    if (shading !== 'basic') {
        parts.push(`uniform vec3 uAmbient;
uniform vec3 uDirColors[${MAX_DIR}];
uniform vec3 uDirDirs[${MAX_DIR}];
uniform int uDirCount;
uniform vec3 uPointColors[${MAX_POINT}];
uniform vec4 uPointPos[${MAX_POINT}];
uniform int uPointCount;
uniform vec3 uSpotColors[${MAX_SPOT}];
uniform vec4 uSpotPos[${MAX_SPOT}];
uniform vec3 uSpotDirs[${MAX_SPOT}];
uniform vec2 uSpotAngle[${MAX_SPOT}];
uniform int uSpotCount;`);
        if (shadows && hasNormals) {
            parts.push(`uniform sampler2D uShadowMap;
uniform mat4 uShadowMatrix;
uniform float uShadowBias;`, PACK_GLSL);
        }
    }
    if (fog) parts.push(`uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;`);

    const body = [];
    body.push(`vec4 texel = vec4(1.0);
#ifdef USE_TEXTURE
    texel = texture2D(uTexture, vUv);
#endif
    vec3 baseColor = uColor * texel.rgb;
    float alpha = uOpacity;
    vec3 outgoing;`);
    if (shading === 'basic') {
        body.push(`outgoing = baseColor + uEmissive;`);
    } else {
        body.push(`
    vec3 N = normalize(vNormal);
    vec3 V = normalize(uCameraPos - vWorldPos);
    float shadow = 1.0;`);
        if (shadows && hasNormals) {
            body.push(`
    {
        vec4 sc = uShadowMatrix * vec4(vWorldPos, 1.0);
        vec3 proj = sc.xyz / sc.w * 0.5 + 0.5;
        if (proj.z <= 1.0 && proj.x >= 0.0 && proj.x <= 1.0 && proj.y >= 0.0 && proj.y <= 1.0) {
            float lit = 0.0;
            for (int dy = -1; dy <= 1; dy++) {
                for (int dx = -1; dx <= 1; dx++) {
                    vec2 o = vec2(float(dx), float(dy)) * (1.0 / 2048.0);
                    float d = unpackDepth(texture2D(uShadowMap, proj.xy + o));
                    lit += (proj.z - uShadowBias <= d) ? 1.0 : 0.0;
                }
            }
            shadow = lit / 9.0;
        }
    }`);
        }
        body.push(`
    vec3 lightAccum = uAmbient * baseColor;
    for (int i = 0; i < ${MAX_DIR}; i++) {
        if (i >= uDirCount) break;
        vec3 L = normalize(-uDirDirs[i]);
        float nl = max(dot(N, L), 0.0) * shadow;
        vec3 contrib = uDirColors[i] * nl;
#ifdef USE_PHONG
        vec3 H = normalize(L + V);
        contrib += uDirColors[i] * pow(max(dot(N, H), 0.0), uShininess) * 0.35 * shadow;
#endif
        lightAccum += contrib * baseColor;
    }
    for (int i = 0; i < ${MAX_POINT}; i++) {
        if (i >= uPointCount) break;
        vec3 toL = uPointPos[i].xyz - vWorldPos;
        float dist = length(toL);
        float falloff = clamp(1.0 - dist / uPointPos[i].w, 0.0, 1.0);
        falloff *= falloff;
        vec3 L = toL / max(dist, 0.0001);
        float nl = max(dot(N, L), 0.0);
        vec3 contrib = uPointColors[i] * (nl * falloff);
#ifdef USE_PHONG
        vec3 H = normalize(L + V);
        contrib += uPointColors[i] * pow(max(dot(N, H), 0.0), uShininess) * 0.35 * falloff;
#endif
        lightAccum += contrib * baseColor;
    }
    for (int i = 0; i < ${MAX_SPOT}; i++) {
        if (i >= uSpotCount) break;
        vec3 toL = uSpotPos[i].xyz - vWorldPos;
        float dist = length(toL);
        float falloff = clamp(1.0 - dist / uSpotPos[i].w, 0.0, 1.0);
        falloff *= falloff;
        vec3 L = toL / max(dist, 0.0001);
        float cone = clamp((dot(L, -uSpotDirs[i]) - uSpotAngle[i].y) /
                           max(uSpotAngle[i].x - uSpotAngle[i].y, 0.001), 0.0, 1.0);
        float nl = max(dot(N, L), 0.0) * cone;
        lightAccum += uSpotColors[i] * (nl * falloff) * baseColor;
    }
    outgoing = lightAccum + uEmissive;`);
    }
    if (fog) {
        body.push(`
    float fogDepth = length(uCameraPos - vWorldPos);
    float fogFactor = clamp((fogDepth - uFogNear) / max(uFogFar - uFogNear, 0.001), 0.0, 1.0);
    outgoing = mix(outgoing, uFogColor, fogFactor);`);
    }
    body.push(`    gl_FragColor = vec4(outgoing, alpha);`);
    parts.push(`void main() {`, ...body, `}`);
    return parts.join('\n');
}

const SHADOW_VERT = `attribute vec3 aPosition;
#ifdef USE_INSTANCING
attribute vec4 aInstance0;
attribute vec4 aInstance1;
attribute vec4 aInstance2;
attribute vec4 aInstance3;
#endif
uniform mat4 uModel;
uniform mat4 uLightViewProjection;
void main() {
#ifdef USE_INSTANCING
    mat4 model = uModel * mat4(aInstance0, aInstance1, aInstance2, aInstance3);
#else
    mat4 model = uModel;
#endif
    gl_Position = uLightViewProjection * model * vec4(aPosition, 1.0);
}`;

const SHADOW_FRAG = `precision highp float;
${PACK_GLSL}
void main() {
    gl_FragColor = packDepth(gl_FragCoord.z);
}`;

const SKY_VERT = `attribute vec2 aPosition;
varying vec2 vNdc;
void main() {
    vNdc = aPosition;
    gl_Position = vec4(aPosition, 0.9999, 1.0);
}`;

const SKY_FRAG = `precision highp float;
varying vec2 vNdc;
uniform mat4 uInvViewProjection;
uniform vec3 uCameraPos;
uniform vec3 uSkyTop;
uniform vec3 uSkyBottom;
void main() {
    vec4 far = uInvViewProjection * vec4(vNdc, 1.0, 1.0);
    vec3 dir = normalize(far.xyz / far.w - uCameraPos);
    float t = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(uSkyBottom, uSkyTop, pow(t, 0.9));
    gl_FragColor = vec4(col, 1.0);
}`;

// ------------------------------------------------------------------ helpers

function compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Engine3D shader compile failed: ${log}\n---\n${source}`);
    }
    return shader;
}

function linkProgram(gl, vsSource, fsSource) {
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vsSource));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fsSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error(`Engine3D program link failed: ${log}`);
    }
    return program;
}

function extractFrustumPlanes(m, out /* Float32Array(24) */) {
    // 6 planes × (nx, ny, nz, d), column-major matrix
    const sets = [
        [m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]],   // left
        [m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]],   // right
        [m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]],   // bottom
        [m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]],   // top
        [m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]],  // near
        [m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]],  // far
    ];
    for (let i = 0; i < 6; i++) {
        const [x, y, z, w] = sets[i];
        const len = Math.hypot(x, y, z) || 1;
        out[i * 4] = x / len;
        out[i * 4 + 1] = y / len;
        out[i * 4 + 2] = z / len;
        out[i * 4 + 3] = w / len;
    }
    return out;
}

// ------------------------------------------------------------------ renderer

export class Renderer {
    constructor(canvas, opts = {}) {
        this.canvas = canvas;
        this.maxPixelRatio = opts.maxPixelRatio ?? 2;
        this.clearColor = opts.clearColor || [0.08, 0.08, 0.1];
        this.shadowsEnabled = opts.shadows ?? true;
        this._pixelRatio = 1;

        const attrs = { antialias: true, alpha: false, powerPreference: 'high-performance' };
        let gl = canvas.getContext('webgl2', attrs);
        this.isWebGL2 = !!gl;
        if (!gl) gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
        if (!gl) throw new Error('Engine3D: WebGL is not available in this context.');
        this.gl = gl;

        if (!this.isWebGL2) {
            this._extIndexUint = gl.getExtension('OES_element_index_uint');
            this._extInstancing = gl.getExtension('ANGLE_instanced_arrays');
        }

        this._geometryCache = new Map();    // BufferGeometry → gpu mesh
        this._programCache = new Map();     // key → program record
        this._textureCache = new Map();     // Texture2D → gl texture (versioned)

        // scratch uniform staging
        this._dirColors = new Float32Array(MAX_DIR * 3);
        this._dirDirs = new Float32Array(MAX_DIR * 3);
        this._pointColors = new Float32Array(MAX_POINT * 3);
        this._pointPos = new Float32Array(MAX_POINT * 4);
        this._spotColors = new Float32Array(MAX_SPOT * 3);
        this._spotPos = new Float32Array(MAX_SPOT * 4);
        this._spotDirs = new Float32Array(MAX_SPOT * 3);
        this._spotAngle = new Float32Array(MAX_SPOT * 2);

        this.stats = { drawCalls: 0, triangles: 0, lines: 0, culled: 0, geometries: this._geometryCache.size, programs: this._programCache.size };
        this._frustum = new Float32Array(24);
        this._items = [];
        this._transparentItems = [];
        this._normalMatrix = new Float32Array(9);
        this._shadowMatrix = Mat4.create();
        this._biasMatrix = Mat4.create();
        this._biasMatrix.set([0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0.5, 0, 0.5, 0.5, 0.5, 1]);
        this._initShadowTarget(opts.shadowMapSize || 2048);
        this._initSky();
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
    }

    // ------------------------------------------------------------ setup

    _initShadowTarget(size) {
        const gl = this.gl;
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        const depth = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, size, size);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        this._shadow = { fbo, tex, size };
    }

    _initSky() {
        const gl = this.gl;
        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const program = linkProgram(gl, SKY_VERT, SKY_FRAG);
        const record = {
            program,
            u: {
                uInvViewProjection: gl.getUniformLocation(program, 'uInvViewProjection'),
                uCameraPos: gl.getUniformLocation(program, 'uCameraPos'),
                uSkyTop: gl.getUniformLocation(program, 'uSkyTop'),
                uSkyBottom: gl.getUniformLocation(program, 'uSkyBottom'),
            },
            aPosition: gl.getAttribLocation(program, 'aPosition'),
            vbo,
        };
        this._sky = record;
    }

    // ------------------------------------------------------------ programs

    _programKey(material, instancing, shadows, fog) {
        return [
            material.shading,
            material.texture ? 'tex' : 'notex',
            material.lines ? 'lines' : 'mesh',
            instancing ? 'inst' : 'no-inst',
            shadows ? 'shadow' : 'noshadow',
            fog ? 'fog' : 'nofog',
            material.blending,
        ].join('|');
    }

    _getProgram(material, instancing, shadows, fog) {
        const hasNormals = !material.lines;
        const key = this._programKey(material, instancing, shadows, fog);
        let record = this._programCache.get(key);
        if (record) return record;

        const gl = this.gl;
        const defines = [];
        if (material.texture) defines.push('#define USE_TEXTURE');
        if (hasNormals && material.shading !== 'basic') defines.push('#define USE_NORMALS');
        if (instancing) defines.push('#define USE_INSTANCING');
        if (material.shading === 'phong') defines.push('#define USE_PHONG');
        if (fog) defines.push('#define USE_FOG');
        const vs = defines.join('\n') + '\n' + VERT_COMMON;
        const useShadows = shadows && hasNormals && material.shading !== 'basic' && material.receiveShadows !== false;
        const fs = defines.join('\n') + '\n' + buildFragmentShader(
            material.shading, !!material.texture, hasNormals, useShadows, fog
        );
        const program = linkProgram(gl, vs, fs);

        record = {
            program,
            key,
            useShadows,
            attributes: {
                aPosition: gl.getAttribLocation(program, 'aPosition'),
                aNormal: gl.getAttribLocation(program, 'aNormal'),
                aUv: gl.getAttribLocation(program, 'aUv'),
                aInstance: [
                    gl.getAttribLocation(program, 'aInstance0'),
                    gl.getAttribLocation(program, 'aInstance1'),
                    gl.getAttribLocation(program, 'aInstance2'),
                    gl.getAttribLocation(program, 'aInstance3'),
                ],
            },
            u: {},
            uniform: (name) => {
                if (!(name in record.u)) record.u[name] = gl.getUniformLocation(program, name);
                return record.u[name];
            },
        };
        this._programCache.set(key, record);
        this.stats.programs = this._programCache.size;
        return record;
    }

    // ------------------------------------------------------------ resources

    _uploadGeometry(geometry) {
        const gl = this.gl;
        const stride = 8 * 4; // pos3 + normal3 + uv2
        const vertexCount = geometry.vertexCount;
        const data = new Float32Array(vertexCount * 8);
        const pos = geometry.position;
        const nor = geometry.normal;
        const uv = geometry.uv;
        for (let v = 0; v < vertexCount; v++) {
            const o = v * 8;
            data[o] = pos ? pos[v * 3] : 0;
            data[o + 1] = pos ? pos[v * 3 + 1] : 0;
            data[o + 2] = pos ? pos[v * 3 + 2] : 0;
            data[o + 3] = nor ? nor[v * 3] : 0;
            data[o + 4] = nor ? nor[v * 3 + 1] : 0;
            data[o + 5] = nor ? nor[v * 3 + 2] : 0;
            data[o + 6] = uv ? uv[v * 2] : 0;
            data[o + 7] = uv ? uv[v * 2 + 1] : 0;
        }
        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

        let indexType = null;
        let ibo = null;
        let count = vertexCount;
        const indices = geometry.index;
        if (indices) {
            ibo = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
            const use32 = indices instanceof Uint32Array || vertexCount > 65535;
            if (use32 && !this.isWebGL2 && !this._extIndexUint) {
                throw new Error('Engine3D: geometry needs 32-bit indices but OES_element_index_uint is unavailable.');
            }
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
            indexType = use32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
            count = indices.length;
        }

        // wireframe twin (only built if someone renders this mesh as wireframe)
        const gpu = { vbo, ibo, count, indexType, mode: geometry.mode, stride, vao: null, wireIbo: null, wireVao: null, wireCount: 0 };
        gpu.wireCount = 0;
        this._geometryCache.set(geometry, gpu);
        this.stats.geometries = this._geometryCache.size;
        return gpu;
    }

    _wireIndexFor(geometry, gpu) {
        if (!gpu.wireIbo) {
            const gl = this.gl;
            const wire = geometry.wireframeIndex;
            gpu.wireIbo = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gpu.wireIbo);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, wire, gl.STATIC_DRAW);
            gpu.wireCount = wire.length;
        }
        return gpu;
    }

    /** Bind VAO-less attribute layout for a program. */
    _bindGeometry(gpu, progRecord, instanced) {
        const gl = this.gl;
        const attr = progRecord.attributes;
        gl.bindBuffer(gl.ARRAY_BUFFER, gpu.vbo);
        if (attr.aPosition >= 0) {
            gl.enableVertexAttribArray(attr.aPosition);
            gl.vertexAttribPointer(attr.aPosition, 3, gl.FLOAT, false, gpu.stride, 0);
        }
        if (attr.aNormal >= 0) {
            gl.enableVertexAttribArray(attr.aNormal);
            gl.vertexAttribPointer(attr.aNormal, 3, gl.FLOAT, false, gpu.stride, 12);
        }
        if (attr.aUv >= 0) {
            gl.enableVertexAttribArray(attr.aUv);
            gl.vertexAttribPointer(attr.aUv, 2, gl.FLOAT, false, gpu.stride, 24);
        }
        if (instanced && attr.aInstance[0] >= 0) {
            gl.bindBuffer(gl.ARRAY_BUFFER, gpu.instanceVbo);
            for (let i = 0; i < 4; i++) {
                const loc = attr.aInstance[i];
                if (loc < 0) continue;
                gl.enableVertexAttribArray(loc);
                gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 64, i * 16);
                this._vertexAttribDivisor(loc, 1);
            }
        }
    }

    /** Drop divisor-1 state after an instanced draw so later programs aren't poisoned. */
    _resetInstanceAttribs(progRecord) {
        const gl = this.gl;
        for (const loc of progRecord.attributes.aInstance) {
            if (loc < 0) continue;
            this._vertexAttribDivisor(loc, 0);
            gl.disableVertexAttribArray(loc);
        }
    }

    _vertexAttribDivisor(loc, d) {
        if (this.isWebGL2) this.gl.vertexAttribDivisor(loc, d);
        else if (this._extInstancing) this._extInstancing.vertexAttribDivisorANGLE(loc, d);
    }

    _drawElementsInstanced(mode, count, type, instances) {
        const gl = this.gl;
        if (this.isWebGL2) gl.drawElementsInstanced(mode, count, type, 0, instances);
        else if (this._extInstancing) this._extInstancing.drawElementsInstancedANGLE(mode, count, type, 0, instances);
        else gl.drawElements(mode, count, type, 0);
    }

    _getInstancedGpu(mesh, geometry, gpu) {
        const gl = this.gl;
        if (!gpu.instanceVbo) {
            gpu.instanceVbo = gl.createBuffer();
        }
        if (mesh._gpuDirty) {
            gl.bindBuffer(gl.ARRAY_BUFFER, gpu.instanceVbo);
            gl.bufferData(gl.ARRAY_BUFFER, mesh.instanceMatrices, gl.DYNAMIC_DRAW);
            mesh._gpuDirty = false;
        }
        return gpu;
    }

    _getTexture(texture) {
        const gl = this.gl;
        let record = this._textureCache.get(texture);
        if (record && record.version === texture.version) return record.glTexture;
        if (!record) {
            record = { glTexture: gl.createTexture(), version: -1 };
            this._textureCache.set(texture, record);
        }
        gl.bindTexture(gl.TEXTURE_2D, record.glTexture);
        const src = texture.source;
        if (!src) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 0, 255, 255]));
        } else {
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
        }
        const pot = texture.width > 0 && texture.height > 0 &&
            (texture.width & (texture.width - 1)) === 0 && (texture.height & (texture.height - 1)) === 0;
        const mip = texture.generateMipmaps && pot;
        const filter = texture.filter === 'nearest' ? gl.NEAREST : gl.LINEAR;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : filter);
        const wrap = pot ? gl.REPEAT : gl.CLAMP_TO_EDGE;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
        if (mip) gl.generateMipmap(gl.TEXTURE_2D);
        record.version = texture.version;
        return record.glTexture;
    }

    _normalFromMatrix(m, out) {
        // inverse-transpose upper 3x3 (matrices here are affine, so adjugate trick)
        const a = m[0], b = m[1], c = m[2];
        const d = m[4], e = m[5], f = m[6];
        const g = m[8], h = m[9], i = m[10];
        const A = e * i - f * h, B = f * g - d * i, C = d * h - e * g;
        let det = a * A + b * B + c * C;
        if (!det) det = 1;
        const id = 1 / det;
        out[0] = A * id; out[1] = B * id; out[2] = C * id;
        out[3] = (c * h - b * i) * id; out[4] = (a * i - c * g) * id; out[5] = (b * g - a * h) * id;
        out[6] = (b * f - c * e) * id; out[7] = (c * d - a * f) * id; out[8] = (a * e - b * d) * id;
        return out;
    }

    // ------------------------------------------------------------ frame

    /**
     * Render one frame.
     * @param {Scene} scene
     * @param {Camera} camera (updateMatrixWorld already called)
     */
    render(scene, camera) {
        const gl = this.gl;
        const stats = this.stats;
        stats.drawCalls = 0;
        stats.triangles = 0;
        stats.lines = 0;
        stats.culled = 0;

        const lights = scene.collectLights();
        extractFrustumPlanes(camera.viewProj, this._frustum);

        // gather visible meshes
        const items = this._items;
        items.length = 0;
        const transparent = this._transparentItems;
        transparent.length = 0;
        scene.traverse((node) => {
            if (!(node instanceof Mesh) || !node.visible || !node.material) return;
            if (node.frustumCulled) {
                const bs = node.getWorldBoundingSphere();
                let outside = false;
                for (let p = 0; p < 6; p++) {
                    const o = p * 4;
                    if (this._frustum[o] * bs.center[0] + this._frustum[o + 1] * bs.center[1] +
                        this._frustum[o + 2] * bs.center[2] + this._frustum[o + 3] < -bs.radius) {
                        outside = true; break;
                    }
                }
                if (outside) { stats.culled++; return; }
            }
            const mat = node.material;
            const dist2 = (() => {
                const bs = node.getWorldBoundingSphere();
                const dx = bs.center[0] - camera.matrixWorld[12];
                const dy = bs.center[1] - camera.matrixWorld[13];
                const dz = bs.center[2] - camera.matrixWorld[14];
                return dx * dx + dy * dy + dz * dz;
            })();
            const item = { node, mat, dist2 };
            if (mat.transparent) transparent.push(item);
            else items.push(item);
        });

        // shadow pass first (fills _shadowMapTexture for lit shaders)
        const shadowLight = this.shadowsEnabled ? lights.directional.find((l) => l.castShadows) : null;
        let shadowActive = false;
        if (shadowLight) shadowActive = this._renderShadowMap(scene, shadowLight, items, transparent);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this._drawWidth, this._drawHeight);
        gl.clearColor(this.clearColor[0], this.clearColor[1], this.clearColor[2], 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // sky gradient behind everything
        if (scene.background && scene.background.enabled && !scene.background.isCube) {
            this._renderSky(camera, scene.background);
        }

        // opaque: front-to-back for early-z
        items.sort((a, b) => a.dist2 - b.dist2);
        for (const item of items) this._drawItem(scene, camera, item, lights, shadowActive, false);
        // transparent: back-to-front
        transparent.sort((a, b) => b.dist2 - a.dist2);
        if (transparent.length) {
            gl.enable(gl.BLEND);
            for (const item of transparent) this._drawItem(scene, camera, item, lights, shadowActive, true);
            gl.disable(gl.BLEND);
        }
    }

    _renderShadowMap(scene, light, opaqueItems, transparentItems) {
        const gl = this.gl;
        const sh = this._shadow;
        // light view: from scene center along -direction
        const dir = Vec3.normalize(scratch.v0, light.direction);
        // center of the lit set: average of cast-shadow item centers
        let cx = 0, cy = 0, cz = 0, n = 0, radius = 10;
        for (const item of [...opaqueItems, ...transparentItems]) {
            if (!item.node.castShadows) continue;
            const bs = item.node.getWorldBoundingSphere();
            cx += bs.center[0]; cy += bs.center[1]; cz += bs.center[2]; n++;
            radius = Math.max(radius, bs.radius);
        }
        if (!n) return false;
        cx /= n; cy /= n; cz /= n;
        const range = Math.min(light.shadowRange, radius * 2.5 + 8);
        const eye = Vec3.set(scratch.v1, cx - dir[0] * 60, cy - dir[1] * 60, cz - dir[2] * 60);
        const view = Mat4.lookAt(scratch.m0, eye, Vec3.set(scratch.v2, cx, cy, cz), Vec3.set(scratch.v3, 0, 1, 0));
        const proj = Mat4.ortho(scratch.m2, -range, range, -range, range, light.shadowNear, light.shadowFar);
        Mat4.multiply(this._shadowMatrix, proj, view);
        // bias matrix: NDC [-1,1] → uv [0,1] (safe: multiply caches `a` up front)
        Mat4.multiply(this._shadowMatrix, this._biasMatrix, this._shadowMatrix);

        gl.bindFramebuffer(gl.FRAMEBUFFER, sh.fbo);
        gl.viewport(0, 0, sh.size, sh.size);
        gl.clearColor(1, 1, 1, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.FRONT); // reduce acne on lit faces

        const progRecord = this._shadowProgram || (this._shadowProgram = this._makeShadowProgram());
        gl.useProgram(progRecord.program);
        gl.uniformMatrix4fv(progRecord.uniform('uLightViewProjection'), false, Mat4.multiply(scratch.m3, proj, view));

        for (const item of opaqueItems) this._shadowDrawItem(item, progRecord);
        for (const item of transparentItems) this._shadowDrawItem(item, progRecord);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.cullFace(gl.BACK);
        return true;
    }

    _shadowDrawItem(item, progRecord) {
        const node = item.node;
        if (!node.castShadows || node.material.castShadows === false) return;
        const geometry = node.geometry;
        if (!geometry || !geometry.position) return;
        let gpu = this._geometryCache.get(geometry);
        if (!gpu) { try { gpu = this._uploadGeometry(geometry); } catch { return; } }
        this._drawDepth(node, gpu, progRecord);
    }

    _makeShadowProgram() {
        const gl = this.gl;
        const program = linkProgram(gl, SHADOW_VERT, SHADOW_FRAG);
        return {
            program,
            attributes: {
                aPosition: gl.getAttribLocation(program, 'aPosition'),
                aInstance: [
                    gl.getAttribLocation(program, 'aInstance0'),
                    gl.getAttribLocation(program, 'aInstance1'),
                    gl.getAttribLocation(program, 'aInstance2'),
                    gl.getAttribLocation(program, 'aInstance3'),
                ],
            },
            uniform: (name) => {
                if (!this._shadowUniforms) this._shadowUniforms = {};
                if (!(name in this._shadowUniforms)) this._shadowUniforms[name] = gl.getUniformLocation(program, name);
                return this._shadowUniforms[name];
            },
        };
    }

    _drawDepth(node, gpu, progRecord) {
        const gl = this.gl;
        const instanced = node instanceof InstancedMesh;
        if (instanced) this._getInstancedGpu(node, node.geometry, gpu);
        this._bindGeometry(gpu, progRecord, instanced);
        gl.uniformMatrix4fv(progRecord.uniform('uModel'), false, node.matrixWorld);
        const indices = gpu.ibo;
        if (indices) {
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
            if (instanced) {
                this._drawElementsInstanced(gl.TRIANGLES, gpu.count, gpu.indexType, node.count);
                this._resetInstanceAttribs(progRecord);
            } else {
                gl.drawElements(gl.TRIANGLES, gpu.count, gpu.indexType, 0);
            }
        } else {
            gl.drawArrays(gl.TRIANGLES, 0, gpu.count);
        }
        this.stats.drawCalls++;
    }

    _renderSky(camera, background) {
        const gl = this.gl;
        const sky = this._sky;
        gl.useProgram(sky.program);
        gl.depthMask(false);
        gl.disable(gl.DEPTH_TEST);
        gl.bindBuffer(gl.ARRAY_BUFFER, sky.vbo);
        gl.enableVertexAttribArray(sky.aPosition);
        gl.vertexAttribPointer(sky.aPosition, 2, gl.FLOAT, false, 0, 0);
        Mat4.invert(scratch.m0, camera.viewProj);
        gl.uniformMatrix4fv(sky.u.uInvViewProjection, false, scratch.m0);
        gl.uniform3fv(sky.u.uCameraPos, camera.matrixWorld.subarray(12, 15));
        gl.uniform3fv(sky.u.uSkyTop, background.top);
        gl.uniform3fv(sky.u.uSkyBottom, background.bottom);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        this.stats.drawCalls++;
    }

    _drawItem(scene, camera, item, lights, shadowActive, isTransparent) {
        const gl = this.gl;
        const node = item.node;
        const mat = item.mat;
        const instanced = node instanceof InstancedMesh;

        let gpu = this._geometryCache.get(node.geometry);
        if (!gpu) gpu = this._uploadGeometry(node.geometry);
        // wireframe twin only makes sense for triangle geometry — a LINES
        // geometry already carries line indices
        const wantsLines = mat.wireframe || mat.lines;
        if (wantsLines && gpu.mode !== 'LINES') gpu = this._wireIndexFor(node.geometry, gpu);
        if (instanced) this._getInstancedGpu(node, node.geometry, gpu);

        const progRecord = this._getProgram(mat, instanced, shadowActive, !!scene.fog && mat.fog);
        gl.useProgram(progRecord.program);
        this._bindGeometry(gpu, progRecord, instanced);

        // global state
        if (mat.doubleSided) gl.disable(gl.CULL_FACE); else gl.enable(gl.CULL_FACE);
        if (isTransparent) {
            gl.blendFunc(gl.SRC_ALPHA, mat.blending === 'additive' ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
            if (!mat.depthWrite) gl.depthMask(false);
        }

        // matrices
        gl.uniformMatrix4fv(progRecord.uniform('uModel'), false, node.matrixWorld);
        gl.uniformMatrix4fv(progRecord.uniform('uViewProjection'), false, camera.viewProj);
        if (progRecord.attributes.aNormal >= 0 && mat.shading !== 'basic' && !mat.lines) {
            this._normalFromMatrix(node.matrixWorld, this._normalMatrix);
            gl.uniformMatrix3fv(progRecord.uniform('uNormalMatrix'), false, this._normalMatrix);
        }
        gl.uniform3fv(progRecord.uniform('uCameraPos'), camera.matrixWorld.subarray(12, 15));

        // material uniforms
        gl.uniform3fv(progRecord.uniform('uColor'), mat.color);
        gl.uniform3fv(progRecord.uniform('uEmissive'), mat.emissive);
        gl.uniform1f(progRecord.uniform('uOpacity'), mat.opacity);
        gl.uniform1f(progRecord.uniform('uShininess'), mat.shininess);
        gl.uniform2f(progRecord.uniform('uUvRepeat'), mat.texture ? mat.texture.repeat[0] : 1, mat.texture ? mat.texture.repeat[1] : 1);
        let textureUnit = 0;
        if (mat.texture) {
            const tex = this._getTexture(mat.texture);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.uniform1i(progRecord.uniform('uTexture'), 0);
            textureUnit = 1;
        }

        // lighting
        if (mat.shading !== 'basic' && !mat.lines) {
            const amb = lights.ambient;
            const ambient = scratch.v0;
            if (amb) Vec3.scale(ambient, amb.color, amb.intensity);
            else Vec3.set(ambient, 0.18, 0.18, 0.2);
            gl.uniform3fv(progRecord.uniform('uAmbient'), ambient);
            const dc = this._dirColors, dd = this._dirDirs;
            for (let i = 0; i < Math.min(lights.directional.length, MAX_DIR); i++) {
                const l = lights.directional[i];
                Vec3.scale(scratch.v1, l.color, l.intensity);
                dc.set(scratch.v1, i * 3);
                Vec3.normalize(scratch.v2, l.direction);
                dd.set(scratch.v2, i * 3);
            }
            gl.uniform1i(progRecord.uniform('uDirCount'), Math.min(lights.directional.length, MAX_DIR));
            gl.uniform3fv(progRecord.uniform('uDirColors'), dc);
            gl.uniform3fv(progRecord.uniform('uDirDirs'), dd);
            const pc = this._pointColors, pp = this._pointPos;
            const pcount = Math.min(lights.point.length, MAX_POINT);
            for (let i = 0; i < pcount; i++) {
                const l = lights.point[i];
                Vec3.scale(scratch.v1, l.color, l.intensity);
                pc.set(scratch.v1, i * 3);
                const wp = l.getWorldPosition(scratch.v2);
                pp[i * 4] = wp[0]; pp[i * 4 + 1] = wp[1]; pp[i * 4 + 2] = wp[2]; pp[i * 4 + 3] = l.range;
            }
            gl.uniform1i(progRecord.uniform('uPointCount'), pcount);
            gl.uniform3fv(progRecord.uniform('uPointColors'), pc);
            gl.uniform4fv(progRecord.uniform('uPointPos'), pp);
            const sc = this._spotColors, sp = this._spotPos, sd = this._spotDirs, sa = this._spotAngle;
            const scount = Math.min(lights.spot.length, MAX_SPOT);
            for (let i = 0; i < scount; i++) {
                const l = lights.spot[i];
                Vec3.scale(scratch.v1, l.color, l.intensity);
                sc.set(scratch.v1, i * 3);
                const wp = l.getWorldPosition(scratch.v2);
                sp[i * 4] = wp[0]; sp[i * 4 + 1] = wp[1]; sp[i * 4 + 2] = wp[2]; sp[i * 4 + 3] = l.range;
                Vec3.normalize(scratch.v3, l.direction);
                sd.set(scratch.v3, i * 3);
                const cosOuter = Math.cos(l.angle);
                const cosInner = Math.cos(l.angle * (1 - l.penumbra));
                sa[i * 2] = cosInner; sa[i * 2 + 1] = cosOuter;
            }
            gl.uniform1i(progRecord.uniform('uSpotCount'), scount);
            gl.uniform3fv(progRecord.uniform('uSpotColors'), sc);
            gl.uniform4fv(progRecord.uniform('uSpotPos'), sp);
            gl.uniform3fv(progRecord.uniform('uSpotDirs'), sd);
            gl.uniform2fv(progRecord.uniform('uSpotAngle'), sa);

            if (shadowActive && progRecord.useShadows) {
                gl.activeTexture(gl.TEXTURE0 + textureUnit);
                gl.bindTexture(gl.TEXTURE_2D, this._shadow.tex);
                gl.uniform1i(progRecord.uniform('uShadowMap'), textureUnit);
                gl.uniformMatrix4fv(progRecord.uniform('uShadowMatrix'), false, this._shadowMatrix);
                gl.uniform1f(progRecord.uniform('uShadowBias'), lights.directional.find((l) => l.castShadows)?.shadowBias ?? 0.0015);
            }
        }

        // fog
        if (scene.fog && mat.fog) {
            gl.uniform3fv(progRecord.uniform('uFogColor'), scene.fog.color);
            gl.uniform1f(progRecord.uniform('uFogNear'), scene.fog.near);
            gl.uniform1f(progRecord.uniform('uFogFar'), scene.fog.far);
        }

        // draw
        const instances = instanced ? node.count : 1;
        const wire = wantsLines && gpu.mode !== 'LINES' && gpu.wireIbo;
        let mode, count, type;
        if (wire) {
            mode = gl.LINES;
            count = gpu.wireCount;
            type = node.geometry.wireframeIndex instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
        } else if (gpu.ibo) {
            mode = gpu.mode === 'LINES' ? gl.LINES : gl.TRIANGLES;
            count = gpu.count;
            type = gpu.indexType;
        } else {
            mode = gpu.mode === 'LINES' ? gl.LINES : gl.TRIANGLES;
            count = gpu.count;
            type = null;
        }
        if (type) {
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, wire ? gpu.wireIbo : gpu.ibo);
            if (instanced) this._drawElementsInstanced(mode, count, type, instances);
            else gl.drawElements(mode, count, type, 0);
        } else {
            if (instanced) this._drawArraysInstanced(mode, count, instances);
            else gl.drawArrays(mode, 0, count);
        }
        if (instanced) this._resetInstanceAttribs(progRecord);
        if (isTransparent && !mat.depthWrite) gl.depthMask(true);
        this.stats.drawCalls++;
        if (mode === gl.TRIANGLES) this.stats.triangles += (count / 3) * instances;
        else this.stats.lines += (count / 2) * instances;
    }

    _drawArraysInstanced(mode, count, instances) {
        const gl = this.gl;
        if (this.isWebGL2) gl.drawArraysInstanced(mode, 0, count, instances);
        else if (this._extInstancing) this._extInstancing.drawArraysInstancedANGLE(mode, 0, count, instances);
        else gl.drawArrays(mode, 0, count);
    }

    _indexTypeFor(wire) {
        return wire instanceof Uint32Array ? this.gl.UNSIGNED_INT : this.gl.UNSIGNED_SHORT;
    }

    // ------------------------------------------------------------ sizing

    resize(width, height, pixelRatio = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio)) {
        this._pixelRatio = pixelRatio;
        const w = Math.max(1, Math.floor(width * pixelRatio));
        const h = Math.max(1, Math.floor(height * pixelRatio));
        if (this.canvas.width !== w) this.canvas.width = w;
        if (this.canvas.height !== h) this.canvas.height = h;
        this._drawWidth = w;
        this._drawHeight = h;
        this.gl.viewport(0, 0, w, h);
        return this;
    }

    /** Drop cached GL resources for a geometry that was disposed. */
    disposeGeometry(geometry) {
        const gl = this.gl;
        const gpu = this._geometryCache.get(geometry);
        if (!gpu) return;
        gl.deleteBuffer(gpu.vbo);
        if (gpu.ibo) gl.deleteBuffer(gpu.ibo);
        if (gpu.instanceVbo) gl.deleteBuffer(gpu.instanceVbo);
        this._geometryCache.delete(geometry);
        this.stats.geometries = this._geometryCache.size;
    }

    dispose() {
        const gl = this.gl;
        for (const gpu of this._geometryCache.values()) {
            gl.deleteBuffer(gpu.vbo);
            if (gpu.ibo) gl.deleteBuffer(gpu.ibo);
            if (gpu.wireIbo) gl.deleteBuffer(gpu.wireIbo);
            if (gpu.instanceVbo) gl.deleteBuffer(gpu.instanceVbo);
        }
        this._geometryCache.clear();
        for (const record of this._programCache.values()) gl.deleteProgram(record.program);
        this._programCache.clear();
        for (const record of this._textureCache.values()) gl.deleteTexture(record.glTexture);
        this._textureCache.clear();
        gl.deleteTexture(this._shadow.tex);
        gl.deleteFramebuffer(this._shadow.fbo);
    }
}
