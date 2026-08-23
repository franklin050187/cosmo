/**
 * generate-ships.ts — Generates 5 valid ship PNGs by decoding an example ship
 * as a template, replacing its Parts and Doors with generated content (including
 * lasers), rendering a visual preview, embedding via LSB steganography, and
 * saving as .ship.png files.
 *
 * Run: npx tsx scripts/generate-ships.ts
 *
 * Also exports helper functions for JSON<->cosmoShip.js compatibility:
 * - `prepareForCosmoShip(jsonPath)`: Converts color hex arrays to Uint8Array
 *   for use with cosmoShip.js's Ship.write() method.
 */



import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { readFileSync } from "node:fs";
import { generateShip } from "../src/lib/shipgen/generator";
import { calculatePrice } from "../src/lib/price";
import { decodePngPixels, decodeShipFromPixels } from "../src/lib/server-decode";
import type { PlacedPart, DoorSpec } from "../src/lib/shipgen/model";
import { footprintCells } from "../src/lib/shipgen/model";
import { partPhysics } from "../src/lib/physics-data";

// ── OBNode serialization (ported from cosmoShip.js) ──────────────────────

const OBNodeType = {
  Unset: 0,
  Data: 1,
  ChildList: 2,
  ChildMap: 3,
  Link: 4,
  Null: 5,
} as const;

function writeVarint(val: number, arr: number[]): void {
  let count: number;
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
}

function writeString(text: string, arr: number[]): void {
  const encoded = new TextEncoder().encode(text);
  let num = encoded.length;
  while (num >= 0x80) {
    arr.push((num | 0x80) & 0xff);
    num = num >>> 7;
  }
  arr.push(num & 0xff);
  for (const b of encoded) arr.push(b);
}

function int32ToBytes(v: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setInt32(0, v, true);
  return b;
}

function int32PairToBytes(pair: number[]): Uint8Array {
  const b = new Uint8Array(8);
  const dv = new DataView(b.buffer);
  dv.setInt32(0, pair[0], true);
  dv.setInt32(4, pair[1], true);
  return b;
}

function isTwoIntList(node: unknown): boolean {
  return (
    Array.isArray(node) &&
    node.length === 2 &&
    node.every((x) => Number.isInteger(x))
  );
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function floatToBytes(v: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setFloat32(0, v, true);
  return b;
}

const COLOR_KEYS = new Set([
  "Color",
  "RoofBaseColor",
  "RoofDecalColor1",
  "RoofDecalColor2",
  "RoofDecalColor3",
  "CrewUniformColor",
]);

const FLOAT_KEYS = new Set([
  "DefaultAttackRotation",
  "DefaultAttackFollowAngle",
]);

const FALLOFF_KEYS = new Set([
  "DefaultAttackRadius",
]);

function isHexColorArray(node: unknown): boolean {
  return (
    Array.isArray(node) &&
    node.length === 4 &&
    node.every(
      (x) => typeof x === "string" && /^[0-9A-Fa-f]{8}$/.test(x)
    )
  );
}

export function encode(node: unknown, arr: number[], parentKey?: string): number[] {
  if (node === "Unset") {
    arr.push(OBNodeType.Unset);
    return arr;
  }

  // Handle Color arrays (4 hex strings) as binary data
  if (parentKey && COLOR_KEYS.has(parentKey) && isHexColorArray(node)) {
    arr.push(OBNodeType.Data);
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 4; i++) {
      const hex = (node as string[])[i];
      const byteVals = hexToBytes(hex);
      bytes.set(byteVals, i * 4);
    }
    writeVarint(bytes.length, arr);
    arr.push(...bytes);
    return arr;
  }

  // Handle float keys
  if (parentKey && FLOAT_KEYS.has(parentKey) && typeof node === "number") {
    arr.push(OBNodeType.Data);
    const data = Array.from(floatToBytes(node));
    writeVarint(data.length, arr);
    arr.push(...data);
    return arr;
  }

  const isPrimitive =
    typeof node === "string" ||
    typeof node === "boolean" ||
    typeof node === "number" ||
    node instanceof Uint8Array ||
    isTwoIntList(node);

  if (isPrimitive) {
    arr.push(OBNodeType.Data);

    if (typeof node === "string") {
      const strData: number[] = [];
      writeString(node, strData);
      writeVarint(strData.length, arr);
      arr.push(...strData);
      return arr;
    }

    let data: number[];

    if (typeof node === "boolean") {
      data = [node ? 1 : 0];
    } else if (typeof node === "number") {
      data = Array.from(int32ToBytes(node));
    } else if (isTwoIntList(node)) {
      data = Array.from(int32PairToBytes(node as number[]));
    } else {
      data = Array.from(node as Uint8Array);
    }

    writeVarint(data.length, arr);
    arr.push(...data);
    return arr;
  } else if (Array.isArray(node)) {
    arr.push(OBNodeType.ChildList);
    writeVarint(node.length, arr);
    for (const x of node) encode(x, arr, parentKey);
    return arr;
  } else if (node !== null && typeof node === "object") {
    arr.push(OBNodeType.ChildMap);
    const keys = Object.keys(node as object);
    writeVarint(keys.length, arr);
    for (const key of keys) {
      writeString(key, arr);
      encode((node as Record<string, unknown>)[key], arr, key);
    }
    return arr;
  } else if (node === null) {
    arr.push(OBNodeType.Null);
    return arr;
  } else {
    throw new TypeError(`Unknown datatype: ${typeof node}`);
  }
}

// ── PNG helpers ────────────────────────────────────────────────────────────

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

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
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

export function encodePng(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = new Uint8Array(13);
  const ihdrView = new DataView(ihdrData.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = pngChunk("IHDR", ihdrData);

  const stride = width * 4;
  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(rgba.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }

  const compressed = zlib.deflateSync(raw);
  const idat = pngChunk("IDAT", compressed);
  const iend = pngChunk("IEND", new Uint8Array(0));

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

// ── LSB embedding ────────────────────────────────────────────────────────

function setByte(data: Uint8Array, width: number, height: number, offset: number, byte: number): void {
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

export function embedLsb(data: Uint8Array, width: number, height: number, bytes: Uint8Array): void {
  const maxBytes = Math.floor((width * height * 3) / 8);
  if (4 + bytes.length > maxBytes) {
    throw new Error(`embedLsb: ${4 + bytes.length} bytes exceeds capacity ${maxBytes}`);
  }
  const full = new Uint8Array(4 + bytes.length);
  full[0] = (bytes.length >>> 24) & 0xff;
  full[1] = (bytes.length >>> 16) & 0xff;
  full[2] = (bytes.length >>> 8) & 0xff;
  full[3] = bytes.length & 0xff;
  full.set(bytes, 4);
  full.forEach((byte, offset) => setByte(data, width, height, offset, byte));
}

// ── Ship tree construction ─────────────────────────────────────────────────

function hexColorArrayToBytes(hexArr: string[]): Uint8Array {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 4; i++) {
    const hex = hexArr[i];
    const byteVals = hexToBytes(hex);
    bytes.set(byteVals, i * 4);
  }
  return bytes;
}

export function buildShipTree(template: Record<string, unknown>, parts: PlacedPart[], doors: DoorSpec[]): unknown {
  // Deep clone template and convert color hex arrays to Uint8Array
  const tree: Record<string, unknown> = JSON.parse(JSON.stringify(template));

  // Override Parts and Doors
  tree.Parts = parts.map((p) => ({
    FlipX: false,
    ID: p.part.id,
    Location: p.loc,
    Rotation: p.rot,
  }));
  tree.Doors = doors.map((d) => ({
    Cell: d.cell,
    ID: "cosmoteer.door",
    Orientation: d.orientation,
  }));
  tree.Author = "autogenerate";
  tree.Name = "Laser S-Ship Variant";

  // Convert color hex string arrays to Uint8Array for proper binary encoding
  const colorKeys = ["RoofBaseColor", "RoofDecalColor1", "RoofDecalColor2", "RoofDecalColor3", "CrewUniformColor"];
  for (const key of colorKeys) {
    const val = tree[key];
    if (Array.isArray(val) && val.length === 4 && val.every((x) => typeof x === "string" && /^[0-9A-Fa-f]{8}$/.test(x))) {
      tree[key] = hexColorArrayToBytes(val);
    }
  }

  // Fix color arrays inside Roles
  if (Array.isArray(tree.Roles)) {
    for (const role of tree.Roles as any[]) {
      if (Array.isArray(role.Color) && role.Color.length === 4) {
        const val = role.Color;
        if (val.every((x: unknown) => typeof x === "string" && /^[0-9A-Fa-f]{8}$/.test(x))) {
          role.Color = hexColorArrayToBytes(val);
        }
      }
    }
  }

  return tree;
}

// ── Visual rendering ────────────────────────────────────────────────────────

export function renderShipVisualSync(
  parts: PlacedPart[],
  width: number,
  height: number,
  cellSize: number
): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);

  // Black background
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 0;
    rgba[i + 1] = 0;
    rgba[i + 2] = 0;
    rgba[i + 3] = 255;
  }

  // Draw each part as a colored rectangle
  for (const part of parts) {
    const p = partPhysics[part.part.id];
    if (!p) continue;

    const cells = footprintCells(part);

    // Average cell position for centering
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (const cell of cells) {
      const [cx, cy] = cell.split(",").map(Number);
      sumX += cx;
      sumY += cy;
      count++;
    }

    const avgX = sumX / count;
    const avgY = sumY / count;

    const sizeW = p.size[0];
    const sizeH = p.size[1];
    const drawW = Math.max(sizeW * cellSize, cellSize);
    const drawH = Math.max(sizeH * cellSize, cellSize);

    // Color parts differently
    let r = 100, g = 100, b = 100;
    if (part.part.id.includes("thruster")) { r = 50; g = 200; b = 50; }
    else if (part.part.id.includes("laser")) { r = 255; g = 100; b = 0; }
    else if (part.part.id.includes("reactor")) { r = 100; g = 100; b = 255; }
    else if (part.part.id.includes("control_room")) { r = 200; g = 200; b = 50; }
    else if (p.mass > 20) { r = 200; g = 50; b = 50; }

    const rectX = Math.round(width / 2 - avgX * cellSize - drawW / 2);
    const rectY = Math.round(height / 2 - avgY * cellSize - drawH / 2);

    for (let y = rectY; y < rectY + drawH; y++) {
      for (let x = rectX; x < rectX + drawW; x++) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
          const idx = (y * width + x) * 4;
          rgba[idx] = r;
          rgba[idx + 1] = g;
          rgba[idx + 2] = b;
          rgba[idx + 3] = 255;
        }
      }
    }
  }

  return rgba;
}

// ── Main ──────────────────────────────────────────────────────────────────

export function loadTemplate(): Record<string, unknown> {
  const buf = readFileSync("./output/example.ship.png");
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const imgData = decodePngPixels(ab);
  return decodeShipFromPixels(imgData) as Record<string, unknown>;
}

/**
 * Loads the game-native JSON ship format (as written/read by the game's text
 * parser / cosmoShip.js). Unlike loadTemplate() (PNG decode), colors are kept
 * as {"parts": [...]} objects and floats as numbers — the exact structure the
 * game expects when loading a .ship text file.
 */
export function loadJsonTemplate(): Record<string, unknown> {
  const raw = readFileSync("./scripts/qa-fixtures/valid-ship.json", "utf-8");
  return JSON.parse(raw) as Record<string, unknown>;
}

// Convert Uint8Array (color bytes) back to hex string arrays for JSON
export function jsonReplacer(key: string, value: unknown): unknown {
  if (value instanceof Uint8Array) {
    // Convert 16-byte color data to 4 hex string array
    if (value.length === 16) {
      const parts: string[] = [];
      for (let i = 0; i < 4; i++) {
        parts.push(Array.from(value.slice(i * 4, i * 4 + 4))
          .map(b => b.toString(16).padStart(2, "0"))
          .join("")
          .toUpperCase());
      }
      return parts;
    }
    // Fallback: base64
    return Array.from(value);
  }
  return value;
}

export function generateShips(count: number = 5): void {
  const template = loadTemplate();
  const outDir = path.join(process.cwd(), "output", "ships");
  fs.mkdirSync(outDir, { recursive: true });

  const imageSize = 256;
  const cellSize = 32;

  for (let i = 0; i < count; i++) {
    const result = generateShip(i);

    if (!result.valid) {
      console.error(`Ship ${i + 1}: INVALID - ${result.errors.join(", ")}`);
      continue;
    }

    const shipTree = buildShipTree(template, result.parts, result.doors);
    const priceResult = calculatePrice(shipTree as any);

    console.log(
      `Ship ${i + 1}: valid, ${result.parts.length} parts, ${result.doors.length} doors, price ${priceResult.price}`
    );

    if (priceResult.price >= 100000) {
      console.error(`Ship ${i + 1}: price ${priceResult.price} >= 100k, skipping`);
      continue;
    }

    const encoded = new Uint8Array(encode(shipTree, []));
    const compressed = zlib.gzipSync(Buffer.from(encoded));
    const magic = new TextEncoder().encode("COSMOSHIP");
    const payload = new Uint8Array(magic.length + compressed.length);
    payload.set(magic, 0);
    payload.set(compressed, magic.length);

    const rgba = renderShipVisualSync(result.parts, imageSize, imageSize, cellSize);
    embedLsb(rgba, imageSize, imageSize, payload);

    const png = encodePng(rgba, imageSize, imageSize);
    const outputPath = path.join(outDir, `ship-${i + 1}.ship.png`);
    fs.writeFileSync(outputPath, Buffer.from(png));

    // Also write JSON
    const jsonOutDir = path.join(outDir, "json");
    fs.mkdirSync(jsonOutDir, { recursive: true });
    const jsonPath = path.join(jsonOutDir, `ship-${i + 1}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(shipTree, jsonReplacer, 2));

    console.log(`  -> wrote ${outputPath} (${png.length} bytes)`);
    console.log(`  -> wrote ${jsonPath}`);
  }
}

// Guarded main: run only when executed directly, so importing the module
// (for its helpers) has no side effects.
if (process.argv[1] && process.argv[1].endsWith("generate-ships.ts")) {
  generateShips(5);
}

// ── cosmoShip.js compatibility helper ──────────────────────────────────────

/**
 * Reads a ship JSON file and converts it for use with cosmoShip.js's Ship.write().
 * Specifically:
 * - Color hex string arrays are converted to Uint8Array (binary) so they're
 *   encoded as Data nodes, not ChildList nodes.
 * - Float fields are left as numbers (int32), but if the game expects float32
 *   bytes, they may need FloatValue wrapping. Check the specific field.
 *
 * Usage:
 *   import { prepareForCosmoShip } from './generate-ships';
 *   const shipData = prepareForCosmoShip('./output/ships/json/ship-1.json');
 *   // Now pass shipData to new Ship({data: shipData, ...}).write()
 */
export function prepareForCosmoShip(jsonPath: string): Record<string, unknown> {
  const raw = fs.readFileSync(jsonPath, "utf-8");
  const tree = JSON.parse(raw) as Record<string, unknown>;
  return convertForCosmoShip(tree);
}

function convertForCosmoShip(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map(convertForCosmoShip);
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (
      COLOR_KEYS.has(key) &&
      Array.isArray(value) &&
      value.length === 4 &&
      value.every((x) => typeof x === "string" && /^[0-9A-Fa-f]{8}$/.test(x))
    ) {
      result[key] = hexColorArrayToBytes(value);
    } else if (FLOAT_KEYS.has(key) && typeof value === "number") {
      // Leave as number for now - cosmoShip.js encodes numbers as int32
      // If float32 is needed, wrap in FloatValue
      result[key] = value;
    } else {
      result[key] = convertForCosmoShip(value);
    }
  }
  return result;
}