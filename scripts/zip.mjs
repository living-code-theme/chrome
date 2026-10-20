// Deterministic ZIP/JAR writer. Only Node built-ins; no core checkout or install step.
import { deflateRawSync } from "node:zlib";
const table = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const byte of bytes) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
export function zip(files) {
  const sorted = [...files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  if (new Set(sorted.map((file) => file.path)).size !== sorted.length) throw new Error("Duplicate archive path");
  const local = [], central = [];
  let offset = 0;
  for (const file of sorted) {
    if (!file.path || file.path.startsWith("/") || file.path.includes("\\") || file.path.split("/").some((part) => part === ".." || part === ".")) throw new Error("Unsafe archive path");
    const name = Buffer.from(file.path), bytes = Buffer.from(file.content), packed = deflateRawSync(bytes, { level: 9 }), crc = crc32(bytes);
    const header = Buffer.concat([u32(0x04034b50), u16(20), u16(0x0800), u16(8), u16(0), u16(33), u32(crc), u32(packed.length), u32(bytes.length), u16(name.length), u16(0), name]);
    local.push(header, packed);
    central.push(Buffer.concat([u32(0x02014b50), u16((3 << 8) | 20), u16(20), u16(0x0800), u16(8), u16(0), u16(33), u32(crc), u32(packed.length), u32(bytes.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0o100644 << 16), u32(offset), name]));
    offset += header.length + packed.length;
  }
  const directory = Buffer.concat(central);
  return Buffer.concat([...local, directory, Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(sorted.length), u16(sorted.length), u32(directory.length), u32(offset), u16(0)])]);
}
