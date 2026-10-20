// Builds the OS core bundle (w12-core.pkg).
//
//     node build-core.js
//
// The core bundle is a DEFLATE-compressed ZIP that contains every file the
// operating system needs at runtime:
//
//   shell.html          the desktop shell markup
//   core-manifest.json  version + stylesheet list (generated)
//   css/**              the shell stylesheets
//   js/main.js          the OS entry point
//   js/modules/**       shell modules
//   js/sdk/**           the app SDK
//   js/workers/**       the OPFS worker
//   js/apps/registry.js the generated app catalog
//   js/apps/<builtin>/** every builtin app (store apps are NOT included —
//                        they are downloaded as .w12pkg by the Store)
//   assets/**           sounds and other static media
//
// The service worker downloads this bundle once, unpacks it into the Origin
// Private File System (OPFS) and then serves it over the canonical site URLs
// (/js/..., /css/..., /assets/...), so the whole OS runs from local disk and
// boots with no network at all.
//
// The archive is byte-reproducible: entries are sorted and the timestamps are
// fixed, so the file only changes when its contents change.
//
// Zero dependencies (plain Node).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const OUT_FILE = path.join(ROOT, 'w12-core.pkg');
const SW_FILE = path.join(ROOT, 'sw.js');

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const FLAG_UTF8 = 0x800;
const METHOD_DEFLATED = 8;

// Fixed DOS timestamp (2020-01-01 00:00:00) so the archive is reproducible.
const DOS_TIME = 0;
const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1;

const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = (crcTable[(c ^ buf[i]) & 0xFF]) ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

// --- file collection --------------------------------------------------------

function walk(dir, prefix, out) {
    let names;
    try {
        names = fs.readdirSync(dir).sort();
    } catch (e) {
        return out;
    }
    for (const name of names) {
        if (name.startsWith('.')) continue;
        const full = path.join(dir, name);
        const rel = prefix ? prefix + '/' + name : name;
        const st = fs.statSync(full);
        if (st.isDirectory()) walk(full, rel, out);
        else if (st.isFile()) out.push({ name: rel, data: fs.readFileSync(full) });
    }
    return out;
}

function readManifests() {
    const dir = path.join(ROOT, 'js', 'apps');
    const out = [];
    for (const id of fs.readdirSync(dir).sort()) {
        const full = path.join(dir, id, 'manifest.json');
        if (!fs.existsSync(full)) continue;
        try {
            out.push(JSON.parse(fs.readFileSync(full, 'utf8')));
        } catch (e) {
            console.error(`build-core: ${id}: bad manifest: ${e.message}`);
            process.exit(1);
        }
    }
    return out;
}

// Stylesheets are loaded by the bootstrap in this order.
function collectStylesheets() {
    const dir = path.join(ROOT, 'css');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(n => n.endsWith('.css')).sort()
        .map(n => 'css/' + n);
}

function collectCoreFiles() {
    const files = [];
    const add = (rel) => {
        const full = path.join(ROOT, rel.replace(/\//g, path.sep));
        if (fs.existsSync(full) && fs.statSync(full).isFile()) {
            files.push({ name: rel, data: fs.readFileSync(full) });
        }
    };

    add('shell.html');

    for (const rel of collectStylesheets()) add(rel);
    add('js/main.js');
    walk(path.join(ROOT, 'js', 'modules'), 'js/modules', files);
    walk(path.join(ROOT, 'js', 'sdk'), 'js/sdk', files);
    walk(path.join(ROOT, 'js', 'workers'), 'js/workers', files);
    walk(path.join(ROOT, 'assets'), 'assets', files);

    // The app catalog (js/apps/registry.js) is deliberately NOT in the core:
    // it changes whenever a store app is updated, and an app update must
    // never ship a new operating system. The service worker serves it from
    // the network and keeps a copy for offline use.

    // Builtin apps ship with the OS; store apps are downloaded on demand.
    const manifests = readManifests();
    for (const man of manifests) {
        if (man.distribution !== 'builtin') continue;
        walk(path.join(ROOT, 'js', 'apps', man.id), 'js/apps/' + man.id, files);
    }

    // Stable order + de-duplication.
    const seen = new Set();
    const out = [];
    for (const f of files.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
        if (seen.has(f.name)) continue;
        seen.add(f.name);
        out.push(f);
    }
    return out;
}

// --- zip writer (deflate) ---------------------------------------------------

function buildZip(files) {
    const locals = [];
    const centrals = [];
    let offset = 0;

    for (const f of files) {
        const nameBytes = Buffer.from(f.name, 'utf8');
        const raw = f.data;
        const compressed = zlib.deflateRawSync(raw, { level: 9 });
        const crc = crc32(raw);

        const lh = Buffer.alloc(30);
        lh.writeUInt32LE(SIG_LOCAL, 0);
        lh.writeUInt16LE(20, 4);
        lh.writeUInt16LE(FLAG_UTF8, 6);
        lh.writeUInt16LE(METHOD_DEFLATED, 8);
        lh.writeUInt16LE(DOS_TIME, 10);
        lh.writeUInt16LE(DOS_DATE, 12);
        lh.writeUInt32LE(crc, 14);
        lh.writeUInt32LE(compressed.length, 18);
        lh.writeUInt32LE(raw.length, 22);
        lh.writeUInt16LE(nameBytes.length, 26);
        lh.writeUInt16LE(0, 28);
        locals.push(lh, nameBytes, compressed);

        const ch = Buffer.alloc(46);
        ch.writeUInt32LE(SIG_CENTRAL, 0);
        ch.writeUInt16LE(20, 4);
        ch.writeUInt16LE(20, 6);
        ch.writeUInt16LE(FLAG_UTF8, 8);
        ch.writeUInt16LE(METHOD_DEFLATED, 10);
        ch.writeUInt16LE(DOS_TIME, 12);
        ch.writeUInt16LE(DOS_DATE, 14);
        ch.writeUInt32LE(crc, 16);
        ch.writeUInt32LE(compressed.length, 20);
        ch.writeUInt32LE(raw.length, 24);
        ch.writeUInt16LE(nameBytes.length, 28);
        ch.writeUInt16LE(0, 30);
        ch.writeUInt16LE(0, 32);
        ch.writeUInt16LE(0, 34);
        ch.writeUInt16LE(0, 36);
        ch.writeUInt32LE(0x20, 38);
        ch.writeUInt32LE(offset, 42);
        centrals.push(ch, nameBytes);

        offset += 30 + nameBytes.length + compressed.length;
    }

    const centralStart = offset;
    const central = Buffer.concat(centrals);
    offset += central.length;

    const eo = Buffer.alloc(22);
    eo.writeUInt32LE(SIG_EOCD, 0);
    eo.writeUInt16LE(0, 4);
    eo.writeUInt16LE(0, 6);
    eo.writeUInt16LE(files.length, 8);
    eo.writeUInt16LE(files.length, 10);
    eo.writeUInt32LE(central.length, 12);
    eo.writeUInt32LE(centralStart, 16);
    eo.writeUInt16LE(0, 20);

    return Buffer.concat([...locals, central, eo]);
}

// --- service worker block ---------------------------------------------------

function replaceBlock(text, start, end, body) {
    const re = new RegExp(`(${escapeRe(start)}\\n)[\\s\\S]*?(\\n${escapeRe(end)})`);
    if (!re.test(text)) {
        console.error(`build-core: sw.js is missing the ${start} ... ${end} block`);
        process.exit(1);
    }
    return text.replace(re, (_m, head, tail) => head + body + tail);
}

function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function writeSwBlock(version, hash, count, bytes) {
    const body = [
        `const CORE_VERSION = '${version}';`,
        `const CORE_HASH = '${hash}';`,
        `const CORE_PACKAGE = './w12-core.pkg';`,
        `const CORE_FILE_COUNT = ${count};`,
        `const CORE_BYTES = ${bytes};`
    ].join('\n');
    const text = fs.readFileSync(SW_FILE, 'utf8');
    const next = replaceBlock(text, '// >>> w12:core', '// <<< w12:core', body);
    if (next !== text) fs.writeFileSync(SW_FILE, next);
}

// --- main -------------------------------------------------------------------

function main() {
    const version = (() => {
        try {
            const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8'));
            return String(v.version || '0.0.0');
        } catch (e) {
            return '0.0.0';
        }
    })();

    const files = collectCoreFiles();
    const css = collectStylesheets();

    // The manifest travels inside the bundle: the bootstrap reads it to learn
    // which stylesheets to load and which core version it is running, and the
    // OS core mirror uses the path list to expose the core in File Explorer.
    const sizes = {};
    for (const f of files) sizes[f.name] = f.data.length;
    const manifest = {
        version,
        css,
        files: files.length + 1, // + the manifest itself
        paths: files.map(f => f.name),
        sizes
    };
    const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
    files.push({ name: 'core-manifest.json', data: manifestBytes });

    const zip = buildZip(files);
    const hash = crypto.createHash('sha256').update(zip).digest('hex').slice(0, 16);
    fs.writeFileSync(OUT_FILE, zip);

    const rawBytes = files.reduce((n, f) => n + f.data.length, 0);
    writeSwBlock(version, hash, files.length, zip.length);

    console.log(`w12-core.pkg — ${files.length} files, ${(rawBytes / 1024).toFixed(1)} KB raw -> ${(zip.length / 1024).toFixed(1)} KB packed (${hash})`);
}

main();
