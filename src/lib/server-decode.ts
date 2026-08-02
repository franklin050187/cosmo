import zlib from "node:zlib";

// ── Port of cosmoShip.js for Node.js (no browser APIs) ──────────────

const OBNodeType = Object.freeze({
  Unset: 0,
  Data: 1,
  ChildList: 2,
  ChildMap: 3,
  Link: 4,
  Null: 5,
});

function readPngChunks(buf: ArrayBuffer) {
  const view = new DataView(buf);
  if (view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a) {
    throw new Error("Not a PNG file");
  }
  let offset = 8;
  const chunks: { type: string; data: Uint8Array }[] = [];
  while (offset < buf.byteLength) {
    const length = view.getUint32(offset);
    offset += 4;
    const type = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    );
    offset += 4;
    const data = new Uint8Array(buf, offset, length);
    offset += length;
    offset += 4; // CRC
    chunks.push({ type, data });
    if (type === "IEND") break;
  }
  return chunks;
}

function paeth(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function decodePngPixels(buf: ArrayBuffer) {
  const chunks = readPngChunks(buf);
  const ihdrChunk = chunks.find((c) => c.type === "IHDR");
  if (!ihdrChunk) throw new Error("No IHDR chunk");
  const ihdr = new DataView(
    ihdrChunk.data.buffer,
    ihdrChunk.data.byteOffset,
    ihdrChunk.data.byteLength
  );
  const width = ihdr.getUint32(0);
  const height = ihdr.getUint32(4);

  if (width > 4096 || height > 4096)
    throw new Error(`PNG dimensions too large: ${width}x${height}`);

  const bitDepth = ihdr.getUint8(8);
  const colorType = ihdr.getUint8(9);
  const interlace = ihdr.getUint8(12);

  if (bitDepth !== 8)
    throw new Error(`Unsupported bit depth: ${bitDepth}`);
  if (interlace !== 0) throw new Error("Interlaced PNG not supported");
  const channelsByColorType: Record<number, number> = {
    0: 1, 2: 3, 4: 2, 6: 4,
  };
  const channels = channelsByColorType[colorType];
  if (!channels) throw new Error(`Unsupported color type: ${colorType}`);

  const idatChunks = chunks.filter((c) => c.type === "IDAT");
  const idatLen = idatChunks.reduce((sum, c) => sum + c.data.length, 0);
  const idat = new Uint8Array(idatLen);
  let p = 0;
  for (const c of idatChunks) {
    idat.set(c.data, p);
    p += c.data.length;
  }

  const inflated = zlib.inflateSync(Buffer.from(idat));

  const stride = width * channels;
  const rgba = new Uint8ClampedArray(width * height * 4);
  let inOffset = 0;
  const prevRow = new Uint8Array(stride);

  for (let y = 0; y < height; y++) {
    const filterType = inflated[inOffset];
    inOffset += 1;
    const srcRow = inflated.subarray(inOffset, inOffset + stride);
    inOffset += stride;
    const outRow = new Uint8Array(stride);

    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? outRow[x - channels] : 0;
      const b = prevRow[x];
      const c = x >= channels ? prevRow[x - channels] : 0;

      let raw = srcRow[x];
      if (filterType === 0) {
        // none
      } else if (filterType === 1) {
        raw = (raw + a) & 0xff;
      } else if (filterType === 2) {
        raw = (raw + b) & 0xff;
      } else if (filterType === 3) {
        raw = (raw + Math.floor((a + b) / 2)) & 0xff;
      } else if (filterType === 4) {
        raw = (raw + paeth(a, b, c)) & 0xff;
      }
      outRow[x] = raw;
    }

    prevRow.set(outRow);
    const rgbaOffset = y * width * 4;
    if (channels === 4) {
      rgba.set(outRow, rgbaOffset);
    } else if (channels === 3) {
      for (let x = 0; x < width; x++) {
        rgba[rgbaOffset + x * 4] = outRow[x * 3];
        rgba[rgbaOffset + x * 4 + 1] = outRow[x * 3 + 1];
        rgba[rgbaOffset + x * 4 + 2] = outRow[x * 3 + 2];
        rgba[rgbaOffset + x * 4 + 3] = 255;
      }
    } else {
      for (let x = 0; x < width; x++) {
        rgba[rgbaOffset + x * 4] = outRow[x];
        rgba[rgbaOffset + x * 4 + 1] = outRow[x];
        rgba[rgbaOffset + x * 4 + 2] = outRow[x];
        rgba[rgbaOffset + x * 4 + 3] = 255;
      }
    }
  }

  return { data: rgba, width, height };
}

function readLSBBytes(data: Uint8ClampedArray, width: number, height: number) {
  const numPixels = width * height;
  const usableBits = numPixels * 3;
  const numBytes = Math.floor(usableBits / 8);
  const out = new Uint8Array(numBytes);

  let bitIndex = 0;
  for (let p = 0; p < numPixels && bitIndex < numBytes * 8; p++) {
    for (let c = 0; c < 3 && bitIndex < numBytes * 8; c++) {
      const bit = data[p * 4 + c] & 1;
      const byteIdx = bitIndex >> 3;
      const bitPos = bitIndex & 7;
      out[byteIdx] |= bit << bitPos;
      bitIndex++;
    }
  }

  const length =
    ((out[0] << 24) | (out[1] << 16) | (out[2] << 8) | out[3]) >>> 0;
  return out.slice(4, 4 + length);
}

// ── Binary helpers ──────────────────────────────────────────────────

class ByteReader {
  buf: Uint8Array;
  pos: number;
  constructor(buf: Uint8Array) {
    this.buf = buf;
    this.pos = 0;
  }
  readByte() {
    return this.buf[this.pos++];
  }
  read(n: number) {
    const slice = this.buf.slice(this.pos, this.pos + n);
    this.pos += n;
    return slice;
  }
  remaining() {
    return this.buf.length - this.pos;
  }
}

function readVarint(r: ByteReader): number {
  const byte = r.readByte();
  let count = 1;
  if (byte & 1) {
    count += 1;
    if (byte & 2) {
      count += 1;
      if (byte & 4) count += 1;
    }
  }
  let val = byte;
  for (let i = 1; i < count; i++) {
    val |= r.readByte() << (i * 8);
  }
  return val >>> Math.min(count, 3);
}

function readStringVarint(r: ByteReader): number {
  let length = 0;
  let i = 0;
  while (true) {
    const byte = r.readByte();
    length |= (byte & 0x7f) << (i * 7);
    if ((byte & 0x80) === 0) break;
    if (i > 2) break;
    i += 1;
  }
  return length;
}

function readString(r: ByteReader): string {
  const len = readStringVarint(r);
  const bytes = r.read(len);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return Array.from(bytes)
      .map((b) => String.fromCharCode(b))
      .join("");
  }
}

function bytesToInt32(bytes: Uint8Array) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, 4);
  return dv.getInt32(0, true);
}
function bytesToUint32(bytes: Uint8Array) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, 4);
  return dv.getUint32(0, true);
}
function bytesToFloat32(bytes: Uint8Array) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, 4);
  return dv.getFloat32(0, true);
}
function bytesToInt32Pair(bytes: Uint8Array) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, 8);
  return [dv.getInt32(0, true), dv.getInt32(4, true)];
}
function bytesToHexUpper(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function decodeLengthPrefixedString(value: Uint8Array) {
  if (value.length > 1 && value[0] <= value.length - 1) {
    const strLen = value[0];
    const slice = value.slice(1, 1 + strLen);
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(slice);
    } catch {
      return Array.from(slice)
        .map((b) => String.fromCharCode(b))
        .join("");
    }
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(value);
  } catch {
    return Array.from(value)
      .map((b) => String.fromCharCode(b))
      .join("");
  }
}

const SKIP = Symbol("skip");

function processBinaryValue(key: string, value: Uint8Array) {
  const len = value.length;
  if (
    [
      "Rotation", "Orientation", "Version", "FlightDirection",
      "FormationOrder", "Key", "Max", "Min", "ID",
    ].includes(key) && len === 4
  ) {
    return bytesToInt32(value);
  } else if (key === "DefaultAttackRotation") {
    return bytesToFloat32(value);
  } else if (key === "DefaultAttackRadius") {
    return bytesToUint32(value);
  } else if (key === "Value" && len === 4) {
    return bytesToUint32(value);
  } else if (["Location", "Cell", "Key"].includes(key) && len === 8) {
    return bytesToInt32Pair(value);
  } else if (key === "Rot0Size" && len === 8) {
    return bytesToInt32Pair(value);
  } else if (
    ["FlipX", "FlipY", "Value", "Invert"].includes(key) && len === 1
  ) {
    return value[0] !== 0;
  } else if (
    [
      "ID", "Name", "Author", "RoofBaseTexture", "ShipRulesID",
      "Description", "ComponentID", "PartID", "IDString", "Value", "Key",
    ].includes(key)
  ) {
    return decodeLengthPrefixedString(value);
  } else if (
    [
      "Color", "RoofBaseColor", "RoofDecalColor1", "RoofDecalColor2",
      "RoofDecalColor3", "CrewUniformColor",
    ].includes(key) && len === 16
  ) {
    return [
      bytesToHexUpper(value.slice(0, 4)),
      bytesToHexUpper(value.slice(4, 8)),
      bytesToHexUpper(value.slice(8, 12)),
      bytesToHexUpper(value.slice(12, 16)),
    ];
  } else if (
    ["BuildMirrorAxis", "PaintMirrorAxis"].includes(key) && len === 4
  ) {
    return bytesToInt32(value);
  } else if (
    [
      "BuildMirrorEnabled", "PaintMirrorEnabled",
      "AutoFillFromLower", "Allow8WayFlight",
    ].includes(key) && len === 1
  ) {
    return value[0] !== 0;
  } else if (key === "AssignmentPriority" && len === 4) {
    return bytesToInt32(value);
  } else if (
    ["DefaultAttackFollowAngle", "DefaultAttackRotation"].includes(key) &&
    len === 4
  ) {
    return bytesToFloat32(value);
  } else {
    return SKIP;
  }
}

function decodeKeyElem(elem: unknown) {
  if (!(elem instanceof Uint8Array)) return elem;
  if (elem.length > 1 && elem[0] <= elem.length - 1) {
    const strLen = elem[0];
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(
        elem.slice(1, 1 + strLen)
      );
    } catch {
      return Array.from(elem.slice(1))
        .map((b) => String.fromCharCode(b))
        .join("");
    }
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(elem);
  } catch {
    return `<bytes len=${elem.length}>`;
  }
}

// ── OBNode tree decoder ─────────────────────────────────────────────

function decodeTree(reader: ByteReader): unknown {
  const type = reader.readByte();

  if (type === OBNodeType.Unset) return "Unset";
  if (type === OBNodeType.Data) {
    const size = readVarint(reader);
    return reader.read(size);
  }
  if (type === OBNodeType.ChildList) {
    const count = readVarint(reader);
    const lst = [];
    for (let i = 0; i < count; i++) lst.push(decodeTree(reader));
    return lst;
  }
  if (type === OBNodeType.ChildMap) {
    const count = readVarint(reader);
    const d: Record<string, unknown> = {};
    for (let i = 0; i < count; i++) {
      const key = readString(reader);
      let value = decodeTree(reader);
      if (value instanceof Uint8Array) {
        const processed = processBinaryValue(key, value);
        if (processed === SKIP) continue;
        value = processed;
      }
      d[key] = value;
      if (key === "Key" && Array.isArray(value)) {
        d[key] = value.map(decodeKeyElem);
      }
    }
    return d;
  }
  if (type === OBNodeType.Link) {
    const subtype = reader.readByte();
    if (subtype === 255) {
      const id = readVarint(reader);
      return { _type: "link", _id: id };
    }
    if (subtype === 254) return null;
  }
  if (type === OBNodeType.Null) return null;
  throw new TypeError(`Unexpected type ${type}`);
}

// ── Public API ──────────────────────────────────────────────────────

export interface ServerShipData {
  price: number;
  crew: number;
  author: string;
  tags: string[];
  shipName: string;
  raw: unknown;
}

export interface ImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export async function decodeShipFromUrl(
  url: string
): Promise<ImageData> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch PNG: ${res.status}`);
  const arrayBuf = await res.arrayBuffer();
  return decodePngPixels(arrayBuf);
}

export function decodeShipFromPixels(
  imageData: ImageData
): unknown {
  let payload = readLSBBytes(imageData.data, imageData.width, imageData.height);

  const magic = new TextEncoder().encode("COSMOSHIP");
  if (
    payload.length >= magic.length &&
    magic.every((b, i) => payload[i] === b)
  ) {
    payload = payload.slice(magic.length);
  }

  const decompressed = zlib.gunzipSync(Buffer.from(payload));
  const reader = new ByteReader(new Uint8Array(decompressed));
  return decodeTree(reader);
}
