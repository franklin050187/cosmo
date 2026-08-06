/**
 * cosmoShip.js — vanilla JS port of the Python `Ship` LSB codec.
 *
 * Runtime target: modern browsers.
 *   - Uses <canvas> to read/write pixel data (replaces PIL.Image + numpy).
 *   - Uses the native CompressionStream/DecompressionStream APIs for gzip
 *     (replaces Python's `gzip` module) — no external library required.
 *     Supported in current Chrome/Edge/Firefox and recent Safari.
 *
 * Public API:
 *   const ship = await Ship.fromSource(fileOrUrlOrBase64OrImage);
 *   ship.data                      // decoded blueprint tree (plain JS object/array/string/number/etc.)
 *   const imageData = await ship.write();          // re-embeds ship.data into a copy of the original pixels
 *   const blob = await imageDataToBlob(imageData); // -> PNG Blob you can download/upload
 *
 * Fidelity notes (kept identical to the original Python, including its quirks):
 *   - encode() always writes ints as signed 32-bit ("<i"), even for fields that were
 *     decoded as unsigned (DefaultAttackRadius, Value) — same limitation as the source.
 *   - The "2-int list looks like Location/Cell" heuristic (is_2int_list) is preserved,
 *     so it will also match plain 2-element integer ChildLists, same ambiguity as Python.
 *   - Values decoded as floats are wrapped in `FloatValue` so encode() can tell them
 *     apart from ints (JS has only one `number` type, unlike Python int/float).
 *   - Values decoded as the 4-part color tuple are wrapped in `ColorValue` for the same reason.
 */

// ---------------------------------------------------------------------------
// Node type tags (matches Python's OBNodeType enum)
// ---------------------------------------------------------------------------
const OBNodeType = Object.freeze({
  Unset: 0,
  Data: 1,
  ChildList: 2,
  ChildMap: 3,
  Link: 4,
  Null: 5,
});

const SKIP = Symbol('skip-unhandled-binary-value');

// ---------------------------------------------------------------------------
// Type wrappers to disambiguate what Python's dynamic typing gave for free
// ---------------------------------------------------------------------------
export class FloatValue {
  constructor(value) {
    this.value = value;
  }
}

export class ColorValue {
  /** @param {[string,string,string,string]} parts four upper-case hex byte groups */
  constructor(parts) {
    this.parts = parts;
  }
}

// ---------------------------------------------------------------------------
// Byte-level helpers
// ---------------------------------------------------------------------------
class ByteReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.pos = 0;
  }
  readByte() {
    return this.bytes[this.pos++];
  }
  read(n) {
    const out = this.bytes.slice(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
}

function readVarint(reader) {
  let byte = reader.readByte();
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
    val |= reader.readByte() << (i * 8);
  }
  return val >>> Math.min(count, 3);
}

function writeVarint(val, arr) {
  let count;
  if (val < 128) count = 1;
  else if (val < 16384) count = 2;
  else if (val < 2097152) count = 3;
  else count = 4;

  let v = val << Math.min(count, 3);
  if (count === 2) v |= 1;
  else if (count === 3) v |= 3;
  else if (count === 4) v |= 7;

  for (let i = 0; i < count; i++) {
    arr.push((v >>> (i * 8)) & 0xff);
  }
  return arr;
}

function readString(reader) {
  let length = 0;
  let i = 0;
  while (true) {
    const byte = reader.readByte();
    length |= (byte & 0x7f) << (i * 7);
    if ((byte & 0x80) === 0) break;
    if (i > 2) break;
    i += 1;
  }
  return new TextDecoder('utf-8').decode(reader.read(length));
}

function writeString(text, arr) {
  const encoded = new TextEncoder().encode(text);
  let num = encoded.length;
  while (num >= 0x80) {
    arr.push((num | 0x80) & 0xff);
    num = num >>> 7;
  }
  arr.push(num & 0xff);
  for (const b of encoded) arr.push(b);
  return arr;
}

// ---------------------------------------------------------------------------
// struct.pack/unpack equivalents (little-endian)
// ---------------------------------------------------------------------------
function bytesToInt32(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, 4).getInt32(0, true);
}
function bytesToUint32(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true);
}
function bytesToFloat32(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, 4).getFloat32(0, true);
}
function bytesToInt32Pair(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, 8);
  return [dv.getInt32(0, true), dv.getInt32(4, true)];
}
function int32ToBytes(v) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setInt32(0, v, true);
  return b;
}
function floatToBytes(v) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setFloat32(0, v, true);
  return b;
}
function int32PairToBytes(pair) {
  const b = new Uint8Array(8);
  const dv = new DataView(b.buffer);
  dv.setInt32(0, pair[0], true);
  dv.setInt32(4, pair[1], true);
  return b;
}
function bytesToHexUpper(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}
function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
function latin1Decode(bytes) {
  return Array.from(bytes)
    .map((b) => String.fromCharCode(b))
    .join('');
}

function isTwoIntList(node) {
  return Array.isArray(node) && node.length === 2 && node.every((x) => Number.isInteger(x));
}

// ---------------------------------------------------------------------------
// gzip via native Compression/DecompressionStream
// ---------------------------------------------------------------------------
async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function gzipCompress(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ---------------------------------------------------------------------------
// Image loading (replaces PIL.Image.open + numpy array)
// ---------------------------------------------------------------------------
function isBase64(str) {
  if (typeof str !== 'string' || str.length === 0 || str.length % 4 !== 0) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(str)) return false;
  try {
    return btoa(atob(str)) === str;
  } catch {
    return false;
  }
}

/** Mirrors the Python `check_input_type` classification. */
export function checkInputType(input) {
  if (input instanceof Blob || input instanceof File) return 'blob';
  if (typeof HTMLImageElement !== 'undefined' && input instanceof HTMLImageElement) return 'image';
  if (input && typeof input === 'object' && 'data' in input && 'width' in input && 'height' in input) return 'imagedata';
  if (typeof input === 'string') {
    if (/^data:image\//.test(input)) return 'dataurl';
    if (/^https?:\/\/\S+$/.test(input)) return 'url';
    if (isBase64(input)) return 'base64';
  }
  return 'unknown';
}

async function toBlob(source) {
  if (typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement) {
    const canvas = document.createElement('canvas');
    canvas.width = source.naturalWidth || source.width;
    canvas.height = source.naturalHeight || source.height;
    canvas.getContext('2d').drawImage(source, 0, 0);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }

  const kind = checkInputType(source);
  if (kind === 'blob') return source;
  if (kind === 'dataurl' || kind === 'url') {
    const res = await fetch(source);
    return res.blob();
  }
  if (kind === 'base64') {
    const res = await fetch(`data:image/png;base64,${source}`);
    return res.blob();
  }
  throw new Error(`Unsupported image source: ${source}`);
}

// ---------------------------------------------------------------------------
// Minimal PNG codec (chunks + zlib inflate/deflate + filters), bypassing the
// canvas entirely for the actual pixel bytes.
//
// Why: canvas 2D (via <img>/createImageBitmap+drawImage) stores pixels
// premultiplied by alpha internally. For any pixel with alpha=0, R/G/B get
// crushed to 0 during that internal representation — which silently destroys
// LSB-hidden data sitting in fully-transparent regions of the source PNG,
// even with colorSpaceConversion:'none'/premultiplyAlpha:'none' hints (those
// only address ICC color-profile correction, not the compositing pipeline).
// PIL never has this problem because it reads raw file bytes. Parsing the
// PNG ourselves gives the same byte-exact guarantee in the browser.
// ---------------------------------------------------------------------------
function readPngChunks(buf) {
  const view = new DataView(buf);
  if (view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a) {
    throw new Error('Not a PNG file (bad signature)');
  }
  let offset = 8;
  const chunks = [];
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
    offset += 4; // CRC, not verified
    chunks.push({ type, data });
    if (type === 'IEND') break;
  }
  return chunks;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** Decodes a PNG Blob into { data: Uint8ClampedArray (RGBA), width, height }, no canvas involved. */
async function decodePngRaw(blob) {
  const buf = await blob.arrayBuffer();
  const chunks = readPngChunks(buf);

  const ihdrChunk = chunks.find((c) => c.type === 'IHDR');
  if (!ihdrChunk) throw new Error('No IHDR chunk');
  const ihdr = new DataView(ihdrChunk.data.buffer, ihdrChunk.data.byteOffset, ihdrChunk.data.byteLength);
  const width = ihdr.getUint32(0);
  const height = ihdr.getUint32(4);
  const bitDepth = ihdr.getUint8(8);
  const colorType = ihdr.getUint8(9);
  const interlace = ihdr.getUint8(12);

  if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth: ${bitDepth} (only 8-bit supported)`);
  if (interlace !== 0) throw new Error('Interlaced PNG not supported');
  const channelsByColorType = { 0: 1, 2: 3, 4: 2, 6: 4 };
  const channels = channelsByColorType[colorType];
  if (!channels) throw new Error(`Unsupported PNG color type: ${colorType}`);

  const idatChunks = chunks.filter((c) => c.type === 'IDAT');
  const idatLen = idatChunks.reduce((sum, c) => sum + c.data.length, 0);
  const idat = new Uint8Array(idatLen);
  let p = 0;
  for (const c of idatChunks) {
    idat.set(c.data, p);
    p += c.data.length;
  }

  const inflatedStream = new Blob([idat]).stream().pipeThrough(new DecompressionStream('deflate'));
  const inflated = new Uint8Array(await new Response(inflatedStream).arrayBuffer());

  const stride = width * channels;
  const rgba = new Uint8ClampedArray(width * height * 4);
  let inOffset = 0;
  let prevRow = new Uint8Array(stride);

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
      let value = srcRow[x];
      switch (filterType) {
        case 0:
          break;
        case 1:
          value = (value + a) & 0xff;
          break;
        case 2:
          value = (value + b) & 0xff;
          break;
        case 3:
          value = (value + ((a + b) >> 1)) & 0xff;
          break;
        case 4:
          value = (value + paeth(a, b, c)) & 0xff;
          break;
        default:
          throw new Error(`Unknown PNG filter type: ${filterType}`);
      }
      outRow[x] = value;
    }

    // Expand this scanline straight into RGBA output
    const rowBase = y * width * 4;
    for (let x = 0; x < width; x++) {
      const si = x * channels;
      const di = rowBase + x * 4;
      if (colorType === 6) {
        rgba[di] = outRow[si];
        rgba[di + 1] = outRow[si + 1];
        rgba[di + 2] = outRow[si + 2];
        rgba[di + 3] = outRow[si + 3];
      } else if (colorType === 2) {
        rgba[di] = outRow[si];
        rgba[di + 1] = outRow[si + 1];
        rgba[di + 2] = outRow[si + 2];
        rgba[di + 3] = 255;
      } else if (colorType === 4) {
        rgba[di] = outRow[si];
        rgba[di + 1] = outRow[si];
        rgba[di + 2] = outRow[si];
        rgba[di + 3] = outRow[si + 1];
      } else if (colorType === 0) {
        rgba[di] = outRow[si];
        rgba[di + 1] = outRow[si];
        rgba[di + 2] = outRow[si];
        rgba[di + 3] = 255;
      }
    }

    prevRow = outRow;
  }

  return { data: rgba, width, height };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const out = new Uint8Array(4 + 4 + data.length + 4);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  out.set(typeBytes, 4);
  out.set(data, 8);
  const crcInput = new Uint8Array(4 + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, 4);
  dv.setUint32(8 + data.length, crc32(crcInput));
  return out;
}

/**
 * Encodes { data: Uint8ClampedArray|Uint8Array (RGBA), width, height } into a
 * PNG file byte-for-byte, with no canvas/compositing step — the counterpart
 * to decodePngRaw, used so writing back never re-introduces the
 * alpha-premultiplication problem either.
 */
async function encodePngRaw({ data, width, height }) {
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = new Uint8Array(13);
  const ihdrView = new DataView(ihdrData.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0; // compression method
  ihdrData[11] = 0; // filter method
  ihdrData[12] = 0; // interlace method
  const ihdr = pngChunk('IHDR', ihdrData);

  const stride = width * 4;
  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type 0 = None
    raw.set(data.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }

  const compressedStream = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'));
  const compressed = new Uint8Array(await new Response(compressedStream).arrayBuffer());
  const idat = pngChunk('IDAT', compressed);

  const iend = pngChunk('IEND', new Uint8Array(0));

  const out = new Uint8Array(signature.length + ihdr.length + idat.length + iend.length);
  let off = 0;
  out.set(signature, off);
  off += signature.length;
  out.set(ihdr, off);
  off += ihdr.length;
  out.set(idat, off);
  off += idat.length;
  out.set(iend, off);
  return out;
}

/**
 * Returns an ImageData-shaped object: { data: Uint8ClampedArray (RGBA), width, height }.
 * Tries the byte-exact manual PNG decoder first; falls back to canvas (with a
 * warning, since that path can corrupt LSB data under full transparency) only
 * for inputs the manual decoder doesn't support (non-PNG, 16-bit, interlaced, palette).
 */
async function loadImageData(source) {
  if (checkInputType(source) === 'imagedata') return source;

  const blob = await toBlob(source);

  try {
    const decoded = await decodePngRaw(blob);
    return decoded;
  } catch (err) {
    console.warn(
      '[cosmoShip] manual PNG decode failed, falling back to canvas',
      '(may corrupt hidden data under fully-transparent pixels):',
      err
    );
    const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }
}

export function imageDataToCanvas(imageData) {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(
    imageData instanceof ImageData ? imageData : new ImageData(imageData.data, imageData.width, imageData.height),
    0,
    0
  );
  return canvas;
}

/** Convenience preview helper — fine for display, but goes through canvas. */
export async function imageDataToBlob(imageData, type = 'image/png') {
  const canvas = imageDataToCanvas(imageData);
  return new Promise((resolve) => canvas.toBlob(resolve, type));
}

/**
 * The authoritative, lossless way to turn a Ship.write() result into a
 * downloadable PNG — use this instead of imageDataToBlob() for stego output,
 * since it never touches a canvas.
 */
export async function imageDataToPngBlob(imageData) {
  const bytes = await encodePngRaw(imageData);
  return new Blob([bytes], { type: 'image/png' });
}

// ---------------------------------------------------------------------------
// Binary-value post-processing for ChildMap entries (the big elif chain)
// ---------------------------------------------------------------------------
function decodeLengthPrefixedString(value) {
  if (value.length > 1 && value[0] <= value.length - 1) {
    const strLen = value[0];
    const slice = value.slice(1, 1 + strLen);
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(slice);
    } catch {
      return latin1Decode(slice);
    }
  }
  try {
    return readString(new ByteReader(value));
  } catch {
    return new TextDecoder('utf-8').decode(value);
  }
}

function processBinaryValue(key, value) {
  const len = value.length;

  if (
    ['Rotation', 'Orientation', 'Version', 'FlightDirection', 'FormationOrder', 'Key', 'Max', 'Min', 'ID'].includes(key) &&
    len === 4
  ) {
    return bytesToInt32(value);
  } else if (key === 'DefaultAttackRotation') {
    return new FloatValue(bytesToFloat32(value));
  } else if (key === 'DefaultAttackRadius') {
    return bytesToUint32(value);
  } else if (key === 'Value' && len === 4) {
    return bytesToUint32(value);
  } else if (['Location', 'Cell', 'Key'].includes(key) && len === 8) {
    return bytesToInt32Pair(value);
  } else if (key === 'Rot0Size' && len === 8) {
    return bytesToInt32Pair(value);
  } else if (['FlipX', 'FlipY', 'Value', 'Invert'].includes(key) && len === 1) {
    return value[0] !== 0;
  } else if (
    ['ID', 'Name', 'Author', 'RoofBaseTexture', 'ShipRulesID', 'Description', 'ComponentID', 'PartID', 'IDString', 'Value', 'Key'].includes(
      key
    )
  ) {
    return decodeLengthPrefixedString(value);
  } else if (
    ['Color', 'RoofBaseColor', 'RoofDecalColor1', 'RoofDecalColor2', 'RoofDecalColor3', 'CrewUniformColor'].includes(key) &&
    len === 16
  ) {
    return new ColorValue([
      bytesToHexUpper(value.slice(0, 4)),
      bytesToHexUpper(value.slice(4, 8)),
      bytesToHexUpper(value.slice(8, 12)),
      bytesToHexUpper(value.slice(12, 16)),
    ]);
  } else if (['BuildMirrorAxis', 'PaintMirrorAxis'].includes(key) && len === 4) {
    return bytesToInt32(value);
  } else if (['BuildMirrorEnabled', 'PaintMirrorEnabled', 'AutoFillFromLower', 'Allow8WayFlight'].includes(key) && len === 1) {
    return value[0] !== 0;
  } else if (key === 'AssignmentPriority' && len === 4) {
    return bytesToInt32(value);
  } else if (['DefaultAttackFollowAngle', 'DefaultAttackRotation'].includes(key) && len === 4) {
    return new FloatValue(bytesToFloat32(value));
  } else {
    console.warn('Unhandled key with binary value:', key, value);
    return SKIP;
  }
}

function decodeKeyElem(elem) {
  if (!(elem instanceof Uint8Array)) return elem;
  if (elem.length > 1 && elem[0] <= elem.length - 1) {
    const strLen = elem[0];
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(elem.slice(1, 1 + strLen));
    } catch {
      return latin1Decode(elem.slice(1));
    }
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(elem);
  } catch {
    return `<bytes len=${elem.length}>`;
  }
}

// ---------------------------------------------------------------------------
// Ship
// ---------------------------------------------------------------------------
export class Ship {
  /** @param {{data: Uint8ClampedArray, width: number, height: number}} imageData */
  constructor(imageData) {
    this.imageData = imageData;
    this.version = 1;
    this.data = null;
  }

  /**
   * @param source File/Blob, HTMLImageElement, ImageData-like object, URL string,
   *               data: URL, or a raw base64 PNG string.
   */
  static async fromSource(source) {
    let imageData;
    try {
      imageData = await loadImageData(source);
    } catch (err) {
      console.error('[cosmoShip] failed to load/decode image source:', source, err);
      throw err;
    }

    const ship = new Ship(imageData);

    let payload = ship.readBytes();

    const magic = new TextEncoder().encode('COSMOSHIP');
    if (payload.length >= magic.length && magic.every((b, i) => payload[i] === b)) {
      payload = payload.slice(magic.length);
      ship.version = 2;
    } else {
      ship.version = 1;
    }

    let raw;
    try {
      raw = await gunzip(payload);
    } catch (err) {
      console.error('[cosmoShip] gunzip failed. Payload length was', payload.length,
        'first bytes:', bytesToHexUpper(payload.slice(0, 16)));
      throw err;
    }

    ship.reader = new ByteReader(raw);
    ship.data = ship.decode();
    return ship;
  }

  // -- LSB extraction (replaces numpy-based read_bytes) --------------------
  readBytes() {
    const { data, width, height } = this.imageData;
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

    const length = ((out[0] << 24) | (out[1] << 16) | (out[2] << 8) | out[3]) >>> 0;
    if (length > out.length - 4) {
      throw new Error(`readBytes: declared length ${length} exceeds buffer size ${out.length - 4}`);
    }
    return out.slice(4, 4 + length);
  }

  setByte(offset, byte) {
    const { data, width, height } = this.imageData;
    const maxBytes = Math.floor((width * height * 3) / 8);
    if (offset < 0 || offset >= maxBytes) {
      throw new Error(`setByte: offset ${offset} out of bounds (max ${maxBytes})`);
    }
    for (let bitsRight = 0; bitsRight < 8; bitsRight++) {
      const imageOffset = offset * 8 + bitsRight;
      const rgb = imageOffset % 3;
      const pixelOffset = Math.floor(imageOffset / 3);
      const bit = (byte >> bitsRight) & 1;
      const idx = pixelOffset * 4 + rgb;
      data[idx] = (data[idx] & 0xfe) | bit;
    }
  }

  writeBytes(bytes) {
    const length = bytes.length;
    const { width, height } = this.imageData;
    const maxBytes = Math.floor((width * height * 3) / 8);
    if (4 + length > maxBytes) {
      throw new Error(`writeBytes: ${4 + length} bytes exceeds capacity ${maxBytes}`);
    }
    const full = new Uint8Array(4 + bytes.length);
    full[0] = (length >>> 24) & 0xff;
    full[1] = (length >>> 16) & 0xff;
    full[2] = (length >>> 8) & 0xff;
    full[3] = length & 0xff;
    full.set(bytes, 4);
    full.forEach((byte, offset) => this.setByte(offset, byte));
  }

  /**
   * Re-embeds `this.data` into a copy of the pixel buffer (or into `newSource`
   * if provided) and returns the resulting ImageData. The Ship's own
   * `imageData` is left untouched, mirroring the Python version keeping
   * `self.image_data` separate from `self.in_image`.
   */
  async write(newSource = null) {
    let target;
    if (newSource) {
      const loaded = await loadImageData(newSource);
      target = { data: new Uint8ClampedArray(loaded.data), width: loaded.width, height: loaded.height };
    } else {
      target = {
        data: new Uint8ClampedArray(this.imageData.data),
        width: this.imageData.width,
        height: this.imageData.height,
      };
    }

    const previousImageData = this.imageData;
    this.imageData = target;

    const encoded = new Uint8Array(this.encode(this.data, []));
    let compressed = await gzipCompress(encoded);

    if (this.version === 2) {
      const magic = new TextEncoder().encode('COSMOSHIP');
      const combined = new Uint8Array(magic.length + compressed.length);
      combined.set(magic, 0);
      combined.set(compressed, magic.length);
      compressed = combined;
    }

    this.writeBytes(compressed);

    const result = this.imageData;
    this.imageData = previousImageData;
    return result;
  }

  // -- OBNode tree decode/encode --------------------------------------------
  decode() {
    const type = this.reader.readByte();

    if (type === OBNodeType.Unset) {
      return 'Unset';
    } else if (type === OBNodeType.Data) {
      const size = readVarint(this.reader);
      return this.reader.read(size);
    } else if (type === OBNodeType.ChildList) {
      const count = readVarint(this.reader);
      const lst = [];
      for (let i = 0; i < count; i++) lst.push(this.decode());
      return lst;
    } else if (type === OBNodeType.ChildMap) {
      const count = readVarint(this.reader);
      const d = {};
      for (let i = 0; i < count; i++) {
        const key = readString(this.reader);
        let value = this.decode();

        if (value instanceof Uint8Array) {
          const processed = processBinaryValue(key, value);
          if (processed === SKIP) continue;
          value = processed;
        }

        d[key] = value;
        if (key === 'Key' && Array.isArray(value)) {
          d[key] = value.map(decodeKeyElem);
        }
      }
      return d;
    } else if (type === OBNodeType.Link) {
      const subtype = this.reader.readByte();
      if (subtype === 255) {
        const id = readVarint(this.reader);
        return { _type: 'link', _id: id };
      } else if (subtype === 254) {
        return null;
      }
    }

    if (type === OBNodeType.Null) return null;
    throw new TypeError(`Unexpected type ${type}`);
  }

  encode(node, arr) {
    arr = arr || [];

    if (node === 'Unset') {
      arr.push(OBNodeType.Unset);
      return arr;
    }

    const isPrimitive =
      typeof node === 'string' ||
      typeof node === 'boolean' ||
      typeof node === 'number' ||
      node instanceof FloatValue ||
      node instanceof ColorValue ||
      node instanceof Uint8Array ||
      isTwoIntList(node);

    if (isPrimitive) {
      arr.push(OBNodeType.Data);

      if (typeof node === 'string') {
        const strData = writeString(node, []);
        writeVarint(strData.length, arr);
        arr.push(...strData);
        return arr;
      }

      let data;
      if (typeof node === 'boolean') {
        data = [node ? 1 : 0];
      } else if (node instanceof FloatValue) {
        data = Array.from(floatToBytes(node.value));
      } else if (typeof node === 'number') {
        data = Array.from(int32ToBytes(node));
      } else if (node instanceof ColorValue) {
        data = Array.from(hexToBytes(node.parts.join('')));
      } else if (isTwoIntList(node)) {
        data = Array.from(int32PairToBytes(node));
      } else {
        // Uint8Array fallback (raw/unhandled bytes)
        data = Array.from(node);
      }

      writeVarint(data.length, arr);
      arr.push(...data);
      return arr;
    } else if (Array.isArray(node)) {
      arr.push(OBNodeType.ChildList);
      writeVarint(node.length, arr);
      for (const x of node) this.encode(x, arr);
      return arr;
    } else if (node !== null && typeof node === 'object') {
      arr.push(OBNodeType.ChildMap);
      const keys = Object.keys(node);
      writeVarint(keys.length, arr);
      for (const key of keys) {
        writeString(key, arr);
        this.encode(node[key], arr);
      }
      return arr;
    } else if (node === null) {
      arr.push(OBNodeType.Null);
      return arr;
    } else {
      throw new TypeError(`Unknown datatype: ${typeof node}`);
    }
  }
}

/*
Example usage:

import { Ship, imageDataToBlob } from './cosmoShip.js';

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  const ship = await Ship.fromSource(file);

  ship.data.Name = 'Renamed ship'; // edit the tree as needed

  const imageData = await ship.write();
  const blob = await imageDataToBlob(imageData);
  const url = URL.createObjectURL(blob);
  // download or upload `blob`/`url`
});
*/
