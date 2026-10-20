// Builds js/apps/registry.js (metadata only — no imports) and refreshes the
// generated blocks in sw.js (app distribution map + builtin precache).
// Run after adding/changing/removing an app, and after build-packages.js:
//     node build-registry.js
// Zero dependencies (plain node).
//
// App modules are NOT imported here: the loader imports them lazily on first
// launch (see js/modules/appLoader.js). This registry is only the catalog.
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const APPS_DIR = path.join(ROOT, 'js', 'apps');
const REGISTRY_PATH = path.join(APPS_DIR, 'registry.js');
const SW_PATH = path.join(ROOT, 'sw.js');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXT_RE = /^[a-z0-9]+$/;
// Declarative capabilities (see js/modules/permissions.js). The
// "background" permission equals the "background" flag — either one grants
// headless execution; "service" additionally hides the app from launchers.
const PERMISSIONS = ['filesystem', 'notifications', 'network', 'clipboard', 'background', 'microphone', 'camera'];

function fail(msg) {
    console.error('build-registry: ERROR: ' + msg);
    process.exit(1);
}

function loadManifests() {
    const ids = fs.readdirSync(APPS_DIR).filter(name => {
        return fs.statSync(path.join(APPS_DIR, name)).isDirectory();
    }).sort();
    const manifests = [];
    const seenUuid = new Set();
    for (const id of ids) {
        const mp = path.join(APPS_DIR, id, 'manifest.json');
        if (!fs.existsSync(mp)) fail(`missing manifest.json in js/apps/${id}/`);
        let m;
        try {
            m = JSON.parse(fs.readFileSync(mp, 'utf8'));
        } catch (e) {
            fail(`js/apps/${id}/manifest.json is not valid JSON: ${e.message}`);
        }
        if (m.id !== id) fail(`js/apps/${id}/manifest.json: id "${m.id}" does not match folder "${id}"`);
        if (!UUID_RE.test(m.uuid || '')) fail(`js/apps/${id}/manifest.json: uuid is not a valid v4 UUID`);
        if (seenUuid.has(m.uuid.toLowerCase())) fail(`duplicate uuid ${m.uuid} (js/apps/${id}/)`);
        seenUuid.add(m.uuid.toLowerCase());
        if (typeof m.name !== 'string' || !m.name) fail(`js/apps/${id}/manifest.json: name must be a non-empty string`);
        if (!['builtin', 'store'].includes(m.distribution)) fail(`js/apps/${id}/manifest.json: distribution must be "builtin" or "store"`);
        const entryPath = path.join(APPS_DIR, id, m.entry || 'main.js');
        if (!fs.existsSync(entryPath)) fail(`js/apps/${id}/manifest.json: entry "${m.entry}" not found`);
        if (!Array.isArray(m.associations)) fail(`js/apps/${id}/manifest.json: associations must be an array`);
        for (const ext of m.associations) {
            if (typeof ext !== 'string' || !EXT_RE.test(ext)) fail(`js/apps/${id}/manifest.json: bad association "${ext}"`);
        }
        // Background execution: "background" lets the app run headless via the
        // BackgroundApps API; "service" additionally hides it from every
        // launcher (Start/Search/taskbar) so it can only be uninstalled.
        // Services imply background capability.
        for (const k of ['background', 'service']) {
            if (m[k] !== undefined && typeof m[k] !== 'boolean') fail(`js/apps/${id}/manifest.json: "${k}" must be a boolean when present`);
        }
        if (m.permissions !== undefined) {
            if (!Array.isArray(m.permissions)) fail(`js/apps/${id}/manifest.json: "permissions" must be an array`);
            for (const p of m.permissions) {
                if (typeof p !== 'string' || !PERMISSIONS.includes(p)) fail(`js/apps/${id}/manifest.json: unknown permission "${p}" (expected one of: ${PERMISSIONS.join(', ')})`);
            }
        }
        if (m.shortcuts !== undefined) {
            if (typeof m.shortcuts !== 'boolean' && (typeof m.shortcuts !== 'object' || Array.isArray(m.shortcuts))) {
                fail(`js/apps/${id}/manifest.json: "shortcuts" must be a boolean or an object`);
            }
            if (typeof m.shortcuts === 'object') {
                for (const [dest, value] of Object.entries(m.shortcuts)) {
                    if (typeof value !== 'boolean' && (typeof value !== 'object' || Array.isArray(value))) {
                        fail(`js/apps/${id}/manifest.json: shortcuts.${dest} must be a boolean or an object`);
                    }
                }
            }
        }
        if (m.distribution === 'store') {
            const s = m.store || {};
            for (const k of ['developer', 'category', 'description', 'size']) {
                if (typeof s[k] !== 'string' || !s[k]) fail(`js/apps/${id}/manifest.json: store.${k} must be a non-empty string`);
            }
            if (!Array.isArray(s.features) || s.features.length === 0) fail(`js/apps/${id}/manifest.json: store.features must be a non-empty array`);
        }
        // Package icon: assets/icon.svg (list surfaces render it without
        // loading the app module).
        if (typeof m.icon !== 'string' || !m.icon) m.icon = 'assets/icon.svg';
        const iconPath = path.join(APPS_DIR, id, m.icon);
        m._hasIcon = fs.existsSync(iconPath);
        manifests.push(m);
    }
    if (manifests.length === 0) fail('no apps found in js/apps/');
    return manifests;
}

function emitRegistry(manifests) {
    const lines = [];
    lines.push('// AUTO-GENERATED by build-registry.js — do not edit.');
    lines.push('// Regenerate with: node build-registry.js');
    lines.push('//');
    lines.push('// Metadata only: app modules are imported lazily on first launch');
    lines.push('// (see js/modules/appLoader.js).');
    lines.push('');
    lines.push('const APP_MANIFESTS = [');
    for (const m of manifests) {
        const pub = {
            id: m.id,
            uuid: m.uuid,
            name: m.name,
            version: m.version || '1.0.0',
            distribution: m.distribution,
            entry: m.entry || 'main.js',
            associations: m.associations || [],
            hasIcon: !!m._hasIcon,
            icon: m.icon
        };
        if (m.background) pub.background = true;
        if (Array.isArray(m.permissions) && m.permissions.length > 0) {
            pub.permissions = [...new Set(m.permissions)];
            if (pub.permissions.includes('background')) pub.background = true;
        }
        if (m.service) {
            // Services are always background-capable, never launchable.
            pub.service = true;
            pub.background = true;
        }
        if (m.store) pub.store = m.store;
        if (m.shortcuts !== undefined) pub.shortcuts = m.shortcuts;
        lines.push(`    ${JSON.stringify(pub)},`);
    }
    lines.push('];');
    lines.push('');
    lines.push('export { APP_MANIFESTS };');
    lines.push('');
    fs.writeFileSync(REGISTRY_PATH, lines.join('\n'));
    console.log(`wrote js/apps/registry.js (${manifests.length} apps, metadata only)`);
}

function replaceBlock(text, start, end, body) {
    const re = new RegExp(`(${start}\\n)[\\s\\S]*?(\\n${end})`);
    if (!re.test(text)) fail(`sw.js: could not find generated block ${start}`);
    return text.replace(re, `$1${body}$2`);
}

// All non-dot files under a directory, as paths relative to it.
function walkFiles(dir, prefix, out) {
    for (const name of fs.readdirSync(dir)) {
        if (name === '.gitkeep' || name.startsWith('.')) continue;
        const full = path.join(dir, name);
        const rel = prefix ? prefix + '/' + name : name;
        if (fs.statSync(full).isDirectory()) walkFiles(full, rel, out);
        else if (fs.statSync(full).isFile()) out.push(rel);
    }
    return out;
}

// Shell assets: everything the OS needs offline. App modules load lazily, so
// only registry.js is part of the core; builtin app files are added below.
function collectCore() {
    const urls = ['./', './index.html', './favicon.svg', './manifest.json'];
    const walk = (relDir, include) => {
        const dir = path.join(ROOT, relDir);
        if (!fs.existsSync(dir)) return;
        for (const name of fs.readdirSync(dir)) {
            const rel = relDir + '/' + name;
            const full = path.join(ROOT, rel);
            if (fs.statSync(full).isDirectory()) { walk(rel, include); continue; }
            if (include(rel)) urls.push('./' + rel);
        }
    };
    walk('css', rel => rel.endsWith('.css'));
    walk('js', rel => rel.endsWith('.js') && (!rel.startsWith('js/apps/') || rel === 'js/apps/registry.js'));
    return urls;
}

function refreshServiceWorker(manifests) {
    let sw = fs.readFileSync(SW_PATH, 'utf8');

    const distLines = manifests.map(m => `    ${JSON.stringify(m.id)}: ${JSON.stringify(m.distribution)},`).join('\n');
    sw = replaceBlock(sw, '// >>> w12:apps-dist', '// <<< w12:apps-dist', `const APP_DIST = {\n${distLines}\n};`);

    const coreUrls = collectCore();
    const coreLines = coreUrls.map(u => `    ${JSON.stringify(u)},`).join('\n');
    sw = replaceBlock(sw, '// >>> w12:core-precache', '// <<< w12:core-precache', `const CORE_PRECACHE = [\n${coreLines}\n];`);

    // Builtin apps ship with the OS, so cache every one of their files.
    // Store packages are downloaded on demand and are NOT precached.
    const appUrls = [];
    for (const m of manifests) {
        if (m.distribution !== 'builtin') continue;
        for (const rel of walkFiles(path.join(APPS_DIR, m.id), '', [])) {
            appUrls.push('./js/apps/' + m.id + '/' + rel);
        }
    }
    const precache = appUrls.map(u => `    ${JSON.stringify(u)},`).join('\n');
    sw = replaceBlock(sw, '// >>> w12:app-precache', '// <<< w12:app-precache', `const APP_PRECACHE = [\n${precache}\n];`);

    fs.writeFileSync(SW_PATH, sw);
    console.log(`refreshed sw.js (dist map + ${coreUrls.length} core + ${appUrls.length} builtin files)`);
}

const manifests = loadManifests();
console.log(`validated ${manifests.length} manifests: ` + manifests.map(m => m.id).join(', '));
emitRegistry(manifests);
refreshServiceWorker(manifests);
console.log('done');
