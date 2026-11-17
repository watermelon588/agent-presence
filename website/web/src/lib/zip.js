// Smallest zip writer that works: files are stored, not compressed (webp/png/gif are already compressed).
// files: [{ name: 'pack/file.webp', data: Uint8Array }] -> Blob
const CRC = Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
const crc32 = (b) => { let c = ~0; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return ~c >>> 0; };

export function zip(files) {
  const enc = new TextEncoder(), parts = [], dir = [];
  let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), n = f.data.length;
    const head = (sig, extra) => {
      const h = new DataView(new ArrayBuffer(extra ? 46 : 30));
      let i = 0; const u32 = (v) => { h.setUint32(i, v, true); i += 4; }, u16 = (v) => { h.setUint16(i, v, true); i += 2; };
      u32(sig); if (extra) u16(20); u16(20); u16(0x800); u16(0); u16(0); u16(0x21); // utf-8 names, stored, 1980-01-01
      u32(crc); u32(n); u32(n); u16(name.length); u16(0);
      if (extra) { u16(0); u16(0); u16(0); u32(0); u32(off); }
      return new Uint8Array(h.buffer);
    };
    parts.push(head(0x04034b50), name, f.data);
    dir.push(head(0x02014b50, true), name);
    off += 30 + name.length + n;
  }
  const size = dir.reduce((s, p) => s + p.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, size, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...dir, end], { type: 'application/zip' });
}
