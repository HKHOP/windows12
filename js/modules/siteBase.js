// The base URL of the site, and the URL scheme for app code.
//
// Module URLs must be absolute regardless of where the OS is installed: at
// the root of a domain (/) or in a project page's subdirectory (/repo/).
// Every module that builds a URL for the service worker resolves it
// against this.
//
// AN APP IS A FOLDER, and the folder is the app's handle. An app's code is
// served from:
//
//     /js/apps/Program%20Files%2Fnotepad/main.js
//
// The folder is one URL segment (its path separator is escaped), so an app
// always sits at the same depth as every other app. That matters: an app
// reaches the shell with relative imports ('../../modules/x.js'), and they
// have to resolve to the very same URLs the shell uses - otherwise the app
// would get a SECOND copy of the shell modules, and the two copies would
// not share any state.
const SITE_BASE = new URL('../../', import.meta.url);

// A Live session (see index.html): the browser cannot host the OS in the
// Origin Private File System, so the bootstrap serves it straight from the
// site instead and the whole machine runs in memory. The bootstrap sets
// window.__W12_LIVE__ before it loads js/main.js.
export function liveMode() {
    return typeof window !== 'undefined' && window.__W12_LIVE__ === true;
}

// The URL segment that stands for an app folder.
export function folderSegment(folderPath) {
    const parts = (Array.isArray(folderPath) ? folderPath : [])
        .filter(p => p !== '/' && p !== '');
    return encodeURIComponent(parts.join('/'));
}

// The URL of a file inside an app folder.
export function fileUrl(folderPath, relative) {
    const parts = (Array.isArray(folderPath) ? folderPath : [])
        .filter(p => p !== '/' && p !== '');
    const rel = String(relative || '').split('/').filter(Boolean).map(encodeURIComponent);

    // Live session: nothing is served out of the virtual filesystem, so a
    // builtin app runs from the folder it shipped in (js/apps/<id>/…). The
    // URL keeps the app depth, so the app's own relative imports still reach
    // the shell modules at their canonical URLs.
    if (liveMode() && parts.length === 2 && parts[0] === 'Program Files') {
        return new URL('js/apps/' + [encodeURIComponent(parts[1])].concat(rel).join('/'), SITE_BASE).href;
    }

    const segs = [folderSegment(parts)].concat(rel);
    return new URL('js/apps/' + segs.join('/'), SITE_BASE).href;
}

// The site URL of a file that lives in the OS core, e.g.
// 'core/<version>/js/main.js' -> <site>/js/main.js. Only the Live boot needs
// it: it runs the core the site ships rather than a copy in OPFS.
export function coreFileUrl(ref) {
    const rel = String(ref || '').replace(/^core\/[^/]+\//, '');
    const segs = rel.split('/').filter(Boolean).map(encodeURIComponent);
    return new URL(segs.join('/'), SITE_BASE).href;
}

export default SITE_BASE;

// The app folder a URL belongs to.
//
// An app's code is served from '/js/apps/<encoded folder>/…', so the folder
// can be recovered from any URL (or stack frame) that points at app code.
export function folderFromUrl(url) {
    const m = String(url || '').match(/\/js\/apps\/([^/]+)\//);
    if (!m) return null;
    let decoded;
    try { decoded = decodeURIComponent(m[1]); } catch { return null; }
    const parts = decoded.split('/').filter(Boolean);
    return parts.length ? parts : null;
}
