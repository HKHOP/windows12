// Builds .w12pkg package archives for every store app.
//
//     node build-packages.js
//
// A package is a ZIP (uncompressed/stored, method 0 — universally decodable
// by the browser's js/modules/zip.js) containing the app folder: manifest,
// entry module, scripts/ and assets/. The Microsoft Store downloads the
// archive and unpacks it into the virtual filesystem ("Program Files").
//
// Zero dependencies (plain Node).
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const APPS_DIR = path.join(ROOT, 'js', 'apps');
const OUT_DIR = path.join(ROOT, 'packages');

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
        lh.writeUInt16LE(0, 8); // stored
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

function main() {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const ids = fs.readdirSync(APPS_DIR)
        .filter(n => fs.statSync(path.join(APPS_DIR, n)).isDirectory())
        .sort();

    let built = 0;
    for (const id of ids) {
        let man;
        try {
            man = JSON.parse(fs.readFileSync(path.join(APPS_DIR, id, 'manifest.json'), 'utf8'));
        } catch (e) {
            console.error(`build-packages: ${id}: bad manifest: ${e.message}`);
            process.exit(1);
        }
        if (man.distribution !== 'store') continue;

        const files = collectFiles(path.join(APPS_DIR, id), '', []);
        const zip = buildZip(files);
        fs.writeFileSync(path.join(OUT_DIR, id + '.w12pkg'), zip);
        console.log(`packaged ${id}.w12pkg (${files.length} files, ${(zip.length / 1024).toFixed(1)} KB)`);
        built++;
    }
    console.log(`done — ${built} package(s) in packages/`);
}

main();
