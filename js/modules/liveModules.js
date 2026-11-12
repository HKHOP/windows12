// In-memory ES-module loader for a Live session (see siteBase.js).
//
// A Live session has no service worker to serve an app's code out of the
// virtual filesystem, and nothing it wrote exists on the website - so an
// app that was installed from the Store lives only in memory, and its
// modules can only be reached through blob: URLs.
//
// This module turns an app folder in the (in-memory) virtual filesystem
// into a living ES module graph:
//
//   1. The entry file (and, recursively, every .js/.mjs file it imports
//      from the app folder) is read from the virtual filesystem.
//   2. Every static/dynamic import specifier is rewritten: a specifier that
//      stays inside the app folder becomes the blob: URL of that file (its
//      own imports are rewritten the same way); a specifier that points at
//      the shell ('../../modules/...') becomes the site's canonical URL, so
//      the app and the shell share the very same module instances; URLs
//      with a scheme (https:, data:, blob:) are left untouched.
//   3. The rewritten module is imported from its blob URL.
//
// The blob URLs are kept alive as long as the app might run and revoked on
// uninstall/update (releaseLiveApp), which the app loader calls from its
// dropModule(). A file that is missing, or a circular import, fails the
// import with a descriptive error instead of hanging.
import FileSystem from './fileSystem.js';
import { fileUrl } from './siteBase.js';

const JS_MIME = 'text/javascript';

const SCHEME_RE = /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|\/\/)/;
const JS_EXT_RE = /\.m?js$/i;
// import/export ... from 'spec' | import 'spec' | import('spec')
const SPEC_RE = /(\bimport|\bexport)(\s[^'"()]*?)\sfrom\s*(['"])([^'"]+)\3|\bimport\s*(['"])([^'"]+)\5|\bimport\s*\(\s*(['"])([^'"]+)\7\s*\)/g;

function folderKeyOf(folderParts) {
    return (Array.isArray(folderParts) ? folderParts : [])
        .filter(p => p !== '/' && p !== '')
        .join('/');
}

function splitRel(rel) {
    return String(rel || '').replace(/\\/g, '/').split('/').filter(Boolean);
}

function dirOf(rel) {
    const segs = splitRel(rel);
    segs.pop();
    return segs;
}

// Resolve a relative specifier against the directory of the importing file.
// Returns the path relative to the app root, or null when it escapes it.
function resolveInApp(dirSegments, spec) {
    const out = [...dirSegments];
    for (const part of String(spec).split('/')) {
        if (!part || part === '.') continue;
        if (part === '..') {
            if (!out.length) return null;
            out.pop();
            continue;
        }
        if (part.includes(':')) return null;
        out.push(part);
    }
    return out.join('/');
}

const shell = (fn) => {
    const g = window._FSGuard;
    return g ? g.asShell(fn)() : fn();
};

function isJsFile(rel) {
    return JS_EXT_RE.test(String(rel || ''));
}

// Finds the actual module file for a relative specifier: './util' may mean
// 'util.js', 'util.mjs' or 'util/index.js'. Returns the path relative to the
// app root, or null.
function probeModule(folderParts, rel) {
    const candidates = [rel, rel + '.js', rel + '.mjs', rel + '/index.js', rel + '/index.mjs'];
    for (const candidate of candidates) {
        if (!isJsFile(candidate)) continue;
        const node = shell(() => FileSystem.getNode([...folderParts, ...splitRel(candidate)]));
        if (node && node.type === 'file') return candidate;
    }
    return null;
}

function specOf(match) {
    return match[4] || match[6] || match[8];
}

function rebuildMatch(match, replacement) {
    if (match[4] !== undefined) return match[1] + match[2] + ' from ' + match[3] + replacement + match[3];
    if (match[6] !== undefined) return 'import ' + match[5] + replacement + match[5];
    return 'import(' + match[7] + replacement + match[7] + ')';
}

async function resolveReplacement(spec, folderParts, relPath, state, chain) {
    if (SCHEME_RE.test(spec)) return spec;
    if (!String(spec).startsWith('.')) {
        throw new Error(`Live mode cannot resolve the bare module "${spec}" imported by "${relPath}". Apps may only import relative paths.`);
    }
    const inner = resolveInApp(dirOf(relPath), spec);
    if (inner !== null) {
        const found = probeModule(folderParts, inner);
        if (found) return moduleUrl(folderParts, found, state, chain);
        throw new Error(`Live mode could not find "${spec}" (imported by "${relPath}") inside the app folder.`);
    }
    // Outside the app folder (e.g. '../../modules/...'): the site's
    // canonical URL, so the app shares the shell's module instances.
    try {
        return new URL(spec, fileUrl(folderParts, relPath)).href;
    } catch (e) {
        throw new Error(`Live mode could not resolve "${spec}" (imported by "${relPath}").`);
    }
}

async function rewriteSource(text, folderParts, relPath, state, chain) {
    const matches = [];
    let match;
    SPEC_RE.lastIndex = 0;
    while ((match = SPEC_RE.exec(text)) !== null) {
        const spec = specOf(match);
        if (spec) matches.push({ match, spec });
    }
    if (!matches.length) return text;
    const replacements = await Promise.all(matches.map(({ spec }) => resolveReplacement(spec, folderParts, relPath, state, chain)));
    let out = '';
    let cursor = 0;
    for (let i = 0; i < matches.length; i++) {
        out += text.slice(cursor, matches[i].match.index) + rebuildMatch(matches[i].match, replacements[i]);
        cursor = matches[i].match.index + matches[i].match[0].length;
    }
    return out + text.slice(cursor);
}

// The blob URL of one file inside an app folder, with its own imports
// already rewritten. `chain` holds the keys of the ancestors currently being
// assembled; a module that re-enters itself through that chain is a true
// circular import and throws, while concurrent siblings awaiting the same
// file share one in-flight promise.
async function moduleUrl(folderParts, relPath, state, chain) {
    const key = folderKeyOf(folderParts) + '|' + String(relPath).toLowerCase();
    const ancestry = Array.isArray(chain) ? chain : [];
    if (ancestry.includes(key)) {
        throw new Error(`Live mode cannot load the circular import "${relPath}".`);
    }
    const cached = state.cache.get(key);
    if (cached) return cached;
    const promise = (async () => {
        const vpath = [...folderParts, ...splitRel(relPath)];
        const text = await shell(() => FileSystem.readTextFile(vpath));
        if (typeof text !== 'string') {
            throw new Error(`Live mode could not read "${relPath}" from the in-memory filesystem.`);
        }
        const rewritten = await rewriteSource(text, folderParts, relPath, state, [...ancestry, key]);
        const url = URL.createObjectURL(new Blob([rewritten], { type: JS_MIME }));
        state.created.push(url);
        return url;
    })();
    state.cache.set(key, promise);
    promise.catch(() => { if (state.cache.get(key) === promise) state.cache.delete(key); });
    return promise;
}

// folderKey -> { created: [blobUrl], iconsByPath: Map }
const live = new Map();

function stateFor(folderParts, create) {
    const key = folderKeyOf(folderParts);
    if (!key) return null;
    let state = live.get(key);
    if (!state && create) {
        state = { cache: new Map(), created: [], iconsByPath: new Map() };
        live.set(key, state);
    }
    return state;
}

function revokeState(state) {
    for (const url of state.created) { try { URL.revokeObjectURL(url); } catch (e) { /* already gone */ } }
    for (const url of state.iconsByPath.values()) { try { URL.revokeObjectURL(url); } catch (e) { /* already gone */ } }
    state.created.length = 0;
    state.iconsByPath.clear();
    state.cache.clear();
}

// Imports the entry module of an app folder. Throws a descriptive error when
// the app cannot be assembled.
export async function importLiveApp(folderParts, manifest) {
    const entry = String((manifest && manifest.entry) || 'main.js').replace(/\\/g, '/');
    if (!stateFor(folderParts, true)) throw new Error('Not an app folder');
    const state = live.get(folderKeyOf(folderParts));
    let url;
    try {
        url = await moduleUrl(folderParts, entry, state);
    } catch (e) {
        revokeState(state);
        throw e;
    }
    try {
        return await import(url);
    } catch (e) {
        revokeState(state);
        throw e;
    }
}

// Revokes the blob URLs of an app (called when it is uninstalled, updated or
// its module is dropped, so a reinstallation starts clean).
export function releaseLiveApp(folderParts) {
    const key = folderKeyOf(folderParts);
    const state = key && live.get(key);
    if (!state) return;
    revokeState(state);
    live.delete(key);
}

// Keep the app's icon reachable as a blob URL: the Live session cannot serve
// it from the (in-memory) filesystem.
export function stashLiveIcon(folderParts, iconPath, blob) {
    if (!blob) return null;
    const state = stateFor(folderParts, true);
    if (!state) return null;
    const key = String(iconPath || 'assets/icon.svg').replace(/\\/g, '/').toLowerCase();
    const url = URL.createObjectURL(blob);
    const old = state.iconsByPath.get(key);
    if (old) { try { URL.revokeObjectURL(old); } catch (e) { /* already gone */ } }
    state.iconsByPath.set(key, url);
    return url;
}

// The blob URL stashed for an app's icon, or null.
export function iconUrl(folderParts, iconPath) {
    const key = folderKeyOf(folderParts);
    const state = key && live.get(key);
    if (!state) return null;
    return state.iconsByPath.get(String(iconPath || 'assets/icon.svg').replace(/\\/g, '/').toLowerCase()) || null;
}
