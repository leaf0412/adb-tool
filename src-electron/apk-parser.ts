import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

/**
 * Extract the package name from an APK by parsing the binary AndroidManifest.xml.
 * Uses only Node.js built-in modules (no external ZIP library).
 */
export function extractPackageName(apkPath: string): string | null {
  try {
    const manifest = readZipEntry(apkPath, "AndroidManifest.xml");
    if (!manifest) return null;
    return parsePackageName(manifest);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Minimal ZIP reader — extracts a single entry by name
// ---------------------------------------------------------------------------

function readZipEntry(filePath: string, entryName: string): Buffer | null {
  const buf = readFileSync(filePath);

  // Find End of Central Directory record (signature 0x06054b50)
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) return null;

  const cdOffset = buf.readUInt32LE(eocd + 16);
  const cdCount = buf.readUInt16LE(eocd + 10);

  // Walk Central Directory entries
  let pos = cdOffset;
  for (let i = 0; i < cdCount; i++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) break;

    const compSize = buf.readUInt32LE(pos + 20);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localOffset = buf.readUInt32LE(pos + 42);
    const name = buf.subarray(pos + 46, pos + 46 + nameLen).toString("utf8");

    if (name === entryName) {
      // Read Local File Header
      const lh = localOffset;
      if (buf.readUInt32LE(lh) !== 0x04034b50) return null;
      const method = buf.readUInt16LE(lh + 8);
      const lhNameLen = buf.readUInt16LE(lh + 26);
      const lhExtraLen = buf.readUInt16LE(lh + 28);
      const dataStart = lh + 30 + lhNameLen + lhExtraLen;
      const raw = buf.subarray(dataStart, dataStart + compSize);

      if (method === 0) return raw as Buffer;
      if (method === 8) return inflateRawSync(raw);
      return null;
    }

    pos += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Minimal Android binary XML parser — only extracts `<manifest package="...">`
// ---------------------------------------------------------------------------

function readU16(b: Buffer, o: number): number {
  return b.readUInt16LE(o);
}

function readU32(b: Buffer, o: number): number {
  return b.readUInt32LE(o);
}

function parseStringPool(buf: Buffer, cs: number): string[] {
  const count = readU32(buf, cs + 8);
  const flags = readU32(buf, cs + 16);
  const stringsStart = readU32(buf, cs + 20);
  const isUtf8 = (flags & 0x100) !== 0;
  const offsetsBase = cs + 28;
  const dataBase = cs + stringsStart;

  const strings: string[] = [];
  for (let i = 0; i < count; i++) {
    const off = dataBase + readU32(buf, offsetsBase + i * 4);
    if (off >= buf.length) {
      strings.push("");
      continue;
    }

    if (isUtf8) {
      let p = off;
      // char count (1-2 bytes)
      if (buf[p] & 0x80) p += 2;
      else p += 1;
      // byte count (1-2 bytes)
      let bc: number;
      if (buf[p] & 0x80) {
        bc = ((buf[p] & 0x7f) << 8) | buf[p + 1];
        p += 2;
      } else {
        bc = buf[p];
        p += 1;
      }
      strings.push(buf.subarray(p, Math.min(p + bc, buf.length)).toString("utf8"));
    } else {
      const cc = readU16(buf, off);
      const start = off + 2;
      const codes: number[] = [];
      for (let j = 0; j < cc; j++) {
        const idx = start + j * 2;
        if (idx + 1 < buf.length) codes.push(readU16(buf, idx));
      }
      strings.push(String.fromCharCode(...codes));
    }
  }
  return strings;
}

function parsePackageName(buf: Buffer): string | null {
  if (buf.length < 8 || readU32(buf, 0) !== 0x00080003) return null;
  if (readU16(buf, 8) !== 0x0001) return null;

  const spSize = readU32(buf, 12);
  const strings = parseStringPool(buf, 8);

  let pos = 8 + spSize;
  while (pos + 8 <= buf.length) {
    const type = readU16(buf, pos);
    const size = readU32(buf, pos + 4);
    if (size === 0) break;

    // START_ELEMENT = 0x0102
    if (type === 0x0102 && pos + 36 <= buf.length) {
      const nameIdx = readU32(buf, pos + 20);
      if (nameIdx < strings.length && strings[nameIdx] === "manifest") {
        const attrCount = readU16(buf, pos + 28);
        for (let a = 0; a < attrCount; a++) {
          const ao = pos + 36 + a * 20;
          if (ao + 20 > buf.length) break;
          const anIdx = readU32(buf, ao + 4);
          if (anIdx < strings.length && strings[anIdx] === "package") {
            const rawVal = readU32(buf, ao + 8);
            if (rawVal < strings.length) return strings[rawVal];
            if (buf[ao + 15] === 3) {
              const td = readU32(buf, ao + 16);
              if (td < strings.length) return strings[td];
            }
          }
        }
        return null;
      }
    }
    pos += size;
  }
  return null;
}
