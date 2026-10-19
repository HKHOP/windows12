// Builds a sideloadable Windows 12 app package (.msi) from an app folder.
//
//     node build-msi.js <app-id | path/to/package-folder> [--out file.msi]
//
// The source folder must contain manifest.json and the app entry file. An
// optional installer.json + installer/ folder is included as-is; Package
// Installer reads them from the archive and does NOT copy them into the
// installed app. The archive is a plain ZIP (stored, method 0) with a flat
// root, exactly what the Store packages use. Zero dependencies.
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const APPS_DIR = path.join(ROOT, 'js', 'apps');
const OUT_DIR = path.join(ROOT, 'dist');

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const FLAG_UTF8 = 0x800;

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
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

function dosTime(date) {
    const d = date || new Date();
    const time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((Math.floor(d.getSeconds() / 2)) & 31);
    const day = ((d.getFullYear() - 1980) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
    return { time, day };
}

function collectFiles(dir, prefix, out) {
    for (const name of fs.readdirSync(dir)) {
        if (name === '.gitkeep' || name.startsWith('.')) continue;
        const full = path.join(dir, name);
        const rel = prefix ? prefix + '/' + name : name;
        const st = fs.statSync(full);
        if (st.isDirectory()) collectFiles(full, rel, out);
        else if (st.isFile()) out.push({ name: rel, data: fs.readFileSync(full) });
    }
    return out;
}

function buildZip(files) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    const { time, day } = dosTime();

    for (const f of files) {
        const nameBytes = Buffer.from(f.name, 'utf8');
        const data = f.data;
        const crc = crc32(data);

        const lh = Buffer.alloc(30);
        lh.writeUInt32LE(SIG_LOCAL, 0);
        lh.writeUInt16LE(20, 4);
        lh.writeUInt16LE(FLAG_UTF8, 6);
        lh.writeUInt16LE(0, 8);
        lh.writeUInt16LE(time, 10);
        lh.writeUInt16LE(day, 12);
        lh.writeUInt32LE(crc, 14);
        lh.writeUInt32LE(data.length, 18);
        lh.writeUInt32LE(data.length, 22);
        lh.writeUInt16LE(nameBytes.length, 26);
        lh.writeUInt16LE(0, 28);
        locals.push(lh, nameBytes, data);

        const ch = Buffer.alloc(46);
        ch.writeUInt32LE(SIG_CENTRAL, 0);
        ch.writeUInt16LE(20, 4);
        ch.writeUInt16LE(20, 6);
        ch.writeUInt16LE(FLAG_UTF8, 8);
        ch.writeUInt16LE(0, 10);
        ch.writeUInt16LE(time, 12);
        ch.writeUInt16LE(day, 14);
        ch.writeUInt32LE(crc, 16);
        ch.writeUInt32LE(data.length, 20);
        ch.writeUInt32LE(data.length, 24);
        ch.writeUInt16LE(nameBytes.length, 28);
        ch.writeUInt16LE(0, 30);
        ch.writeUInt16LE(0, 32);
        ch.writeUInt16LE(0, 34);
        ch.writeUInt16LE(0, 36);
        ch.writeUInt32LE(0x20, 38);
        ch.writeUInt32LE(offset, 42);
        centrals.push(ch, nameBytes);

        offset += 30 + nameBytes.length + data.length;
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

function fail(message) {
    console.error('build-msi: ' + message);
    process.exit(1);
}

function resolveSource(arg) {
    if (!arg) fail('usage: node build-msi.js <app-id | package-folder> [--out file.msi]');
    const direct = path.resolve(arg);
    if (fs.existsSync(direct) && fs.statSync(direct).isDirectory()) return direct;
    const byId = path.join(APPS_DIR, arg);
    if (fs.existsSync(byId) && fs.statSync(byId).isDirectory()) return byId;
    fail(`source folder not found: ${arg}`);
}

function main() {
    const args = process.argv.slice(2);
    let source = '';
    let out = '';
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--out' || args[i] === '-o') {
            out = args[++i] || '';
        } else if (!source) {
            source = args[i];
        } else {
            fail(`unexpected argument: ${args[i]}`);
        }
    }

    const dir = resolveSource(source);
    const manifestPath = path.join(dir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) fail(`${dir} has no manifest.json`);
    let manifest;
    try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (e) {
        fail(`manifest.json is not valid JSON: ${e.message}`);
    }
    if (!manifest || typeof manifest !== 'object') fail('manifest.json must contain an object');
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(String(manifest.id || ''))) {
        fail('manifest.id must use letters and digits, starting with a letter');
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(manifest.uuid || ''))) {
        fail('manifest.uuid must be a valid UUID (v4 recommended)');
    }
    if (!String(manifest.name || '').trim()) fail('manifest.name is required');
    if (manifest.distribution === 'builtin') {
        fail('built-in apps cannot be packaged as .msi installers');
    }

    const files = collectFiles(dir, '', []);
    const entry = String(manifest.entry || 'main.js').replace(/\\/g, '/');
    if (!files.some(f => f.name === entry)) fail(`entry file "${entry}" is missing`);

    const installerEntry = files.find(f => f.name === 'installer.json');
    if (installerEntry) {
        let installer;
        try {
            installer = JSON.parse(installerEntry.data.toString('utf8'));
        } catch (e) {
            fail(`installer.json is not valid JSON: ${e.message}`);
        }
        if (installer && installer.schema !== undefined && installer.schema !== 1) {
            fail('installer.json schema must be 1');
        }
        if (installer && installer.mode && !['gui', 'headless', 'silent'].includes(installer.mode)) {
            fail('installer.mode must be "gui", "headless" or "silent"');
        }
        if (installer && installer.scope && !['either', 'user', 'system'].includes(installer.scope)) {
            fail('installer.scope must be "either", "user" or "system"');
        }
        if (installer && installer.ui && !files.some(f => f.name === String(installer.ui).replace(/\\/g, '/'))) {
            fail(`custom UI "${installer.ui}" is missing`);
        }
        const has = p => files.some(f => f.name === String(p).replace(/\\/g, '/'));
        if (installer) {
            const eula = installer.eula;
            const eulaPath = typeof eula === 'string' ? eula : (eula && typeof eula === 'object' ? eula.path : '');
            if (eulaPath && !has(eulaPath)) fail(`license file "${eulaPath}" is missing`);
            const assets = [installer.welcome && installer.welcome.image, installer.theme && installer.theme.banner, installer.theme && installer.theme.logo];
            for (const asset of assets) {
                if (asset && !has(asset)) fail(`installer asset "${asset}" is missing`);
            }
        }
    }

    const outFile = out
        ? path.resolve(out)
        : path.join(OUT_DIR, manifest.id + '.msi');
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    const zip = buildZip(files);
    fs.writeFileSync(outFile, zip);
    console.log(`built ${path.relative(ROOT, outFile)} (${files.length} files, ${(zip.length / 1024).toFixed(1)} KB)`);
    console.log('Open it in File Explorer (or double-click it) to run the setup wizard.');
}

main();
