// Zip — minimal ZIP container read/write (no dependencies, no CDN).
//
// Container format is hand-rolled (local headers + central directory +
// EOCD, UTF-8 names, CRC32); compression itself uses the platform's
// CompressionStream/DecompressionStream ('deflate' / 'deflate-raw') when
// present, otherwise stored (method 0). Entries we can't decode (e.g.
// deflated on a browser without DecompressionStream) are reported, not
// fatal — extraction skips them and counts the skip.
//
// API:
//   createZip([{ name, data: Uint8Array, isDir }]) → Promise<Uint8Array>
//   readZip(uint8) → [{ name, isDir, size, method, dataOffset, ... }]
//   extractFile(uint8, entry) → Promise<Uint8Array|null> (null = undecodable)
const Zip = (() => {
    const SIG_LOCAL = 0x04034b50;
    const SIG_CENTRAL = 0x02014b50;
    const SIG_EOCD = 0x06054b50;
    const METHOD_STORED = 0;
    const METHOD_DEFLATED = 8;
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

    function crc32(data) {
        let c = 0xFFFFFFFF;
        for (let i = 0; i < data.length; i++) c = crcTable[(c ^ data[i]) & 0xFF] ^ (c >>> 8);
        return (c ^ 0xFFFFFFFF) >>> 0;
    }

    const te = new TextEncoder();
    const td = new TextDecoder('utf-8');

    function concat(parts) {
        let len = 0;
        for (const p of parts) len += p.length;
        const out = new Uint8Array(len);
        let o = 0;
        for (const p of parts) {
            out.set(p, o);
            o += p.length;
        }
        return out;
    }

    async function deflateRaw(data) {
        if (typeof CompressionStream === 'undefined') return null;
        try {
            const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'));
            const buf = await new Response(stream).arrayBuffer();
            return new Uint8Array(buf);
        } catch { return null; }
    }

    async function inflateRaw(data) {
        if (typeof DecompressionStream === 'undefined') return null;
        try {
            const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
            const buf = await new Response(stream).arrayBuffer();
            return new Uint8Array(buf);
        } catch { return null; }
    }

    function dosTime(date) {
        const d = date || new Date();
        const time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((Math.floor(d.getSeconds() / 2)) & 31);
        const day = ((d.getFullYear() - 1980) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
        return { time, day };
    }

    async function createZip(entries) {
        const locals = [];
        const centrals = [];
        let offset = 0;

        for (const e of entries) {
            const nameBytes = te.encode(e.name);
            const raw = e.isDir ? new Uint8Array(0) : (e.data || new Uint8Array(0));
            let method = METHOD_STORED;
            let payload = raw;
            if (!e.isDir && raw.length > 0) {
                const deflated = await deflateRaw(raw);
                if (deflated && deflated.length < raw.length) {
                    method = METHOD_DEFLATED;
                    payload = deflated;
                }
            }
            const crc = crc32(raw);
            const { time, day } = dosTime();

            const lh = new DataView(new ArrayBuffer(30));
            lh.setUint32(0, SIG_LOCAL, true);
            lh.setUint16(4, 20, true);
            lh.setUint16(6, FLAG_UTF8, true);
            lh.setUint16(8, e.isDir ? METHOD_STORED : method, true);
            lh.setUint16(10, time, true);
            lh.setUint16(12, day, true);
            lh.setUint32(14, crc, true);
            lh.setUint32(18, payload.length, true);
            lh.setUint32(22, raw.length, true);
            lh.setUint16(26, nameBytes.length, true);
            lh.setUint16(28, 0, true);
            locals.push(new Uint8Array(lh.buffer), nameBytes, payload);

            const ch = new DataView(new ArrayBuffer(46));
            ch.setUint32(0, SIG_CENTRAL, true);
            ch.setUint16(4, 20, true);
            ch.setUint16(6, 20, true);
            ch.setUint16(8, FLAG_UTF8, true);
            ch.setUint16(10, e.isDir ? METHOD_STORED : method, true);
            ch.setUint16(12, time, true);
            ch.setUint16(14, day, true);
            ch.setUint32(16, crc, true);
            ch.setUint32(20, payload.length, true);
            ch.setUint32(24, raw.length, true);
            ch.setUint16(28, nameBytes.length, true);
            ch.setUint16(30, 0, true);
            ch.setUint16(32, 0, true);
            ch.setUint16(34, 0, true);
            ch.setUint16(36, 0, true);
            ch.setUint32(38, e.isDir ? 0x10 : 0x20, true);
            ch.setUint32(42, offset, true);
            centrals.push(new Uint8Array(ch.buffer), nameBytes);

            offset += 30 + nameBytes.length + payload.length;
        }

        const centralStart = offset;
        const central = concat(centrals);
        offset += central.length;

        const eo = new DataView(new ArrayBuffer(22));
        eo.setUint32(0, SIG_EOCD, true);
        eo.setUint16(8, centrals.length / 2, true);
        eo.setUint16(10, centrals.length / 2, true);
        eo.setUint32(12, central.length, true);
        eo.setUint32(16, centralStart, true);
        eo.setUint16(20, 0, true);

        return concat([...locals, central, new Uint8Array(eo.buffer)]);
    }

    function findEocd(data) {
        // EOCD is at the very end (we never write a comment).
        for (let i = data.length - 22; i >= 0 && i >= data.length - 22 - 64; i--) {
            if (data[i] === 0x50 && data[i + 1] === 0x4b && data[i + 2] === 0x05 && data[i + 3] === 0x06) {
                return i;
            }
        }
        return -1;
    }

    function readZip(data) {
        if (!(data instanceof Uint8Array) || data.length < 22) {
            throw new Error('Not a ZIP file (too small)');
        }
        const eocdAt = findEocd(data);
        if (eocdAt < 0) throw new Error('Not a ZIP file (no end-of-central-directory)');
        const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const count = dv.getUint16(eocdAt + 10, true);
        const centralOffset = dv.getUint32(eocdAt + 16, true);

        const entries = [];
        let p = centralOffset;
        for (let i = 0; i < count; i++) {
            if (dv.getUint32(p, true) !== SIG_CENTRAL) throw new Error('Corrupt ZIP (bad central entry)');
            const method = dv.getUint16(p + 10, true);
            const crc = dv.getUint32(p + 16, true);
            const compSize = dv.getUint32(p + 20, true);
            const size = dv.getUint32(p + 24, true);
            const nameLen = dv.getUint16(p + 28, true);
            const extraLen = dv.getUint16(p + 30, true);
            const commentLen = dv.getUint16(p + 32, true);
            const localOffset = dv.getUint32(p + 42, true);
            const nameBytes = data.slice(p + 46, p + 46 + nameLen);
            let name;
            try {
                name = new TextDecoder('utf-8', { fatal: true }).decode(nameBytes);
            } catch {
                name = td.decode(nameBytes);
            }
            entries.push({
                name,
                isDir: name.endsWith('/'),
                method,
                crc,
                compressedSize: compSize,
                size,
                localOffset
            });
            p += 46 + nameLen + extraLen + commentLen;
        }
        return entries;
    }

    async function extractFile(data, entry) {
        const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const lh = entry.localOffset;
        if (dv.getUint32(lh, true) !== SIG_LOCAL) throw new Error(`Corrupt ZIP (bad local header for ${entry.name})`);
        const nameLen = dv.getUint16(lh + 26, true);
        const extraLen = dv.getUint16(lh + 28, true);
        const start = lh + 30 + nameLen + extraLen;
        const raw = data.slice(start, start + entry.compressedSize);
        if (entry.method === METHOD_STORED) return raw;
        if (entry.method === METHOD_DEFLATED) {
            const out = await inflateRaw(raw);
            if (!out) return null; // undecodable on this browser
            if (out.length !== entry.size || crc32(out) !== entry.crc) {
                throw new Error(`Corrupt ZIP (CRC/size mismatch in ${entry.name})`);
            }
            return out;
        }
        return null; // unknown method — skip, don't fail the batch
    }

    return { createZip, readZip, extractFile };
})();

export default Zip;
