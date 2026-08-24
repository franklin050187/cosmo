import { readFileSync, writeFileSync } from "node:fs";
import zlib from "node:zlib";
import { genPartsById } from "../src/lib/shipgen/parts-db";
import type { PlacedPart } from "../src/lib/shipgen/model";
import { footprintCells } from "../src/lib/shipgen/model";

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error("usage: tsx scripts/shipgen-render.ts <ship.json> <out.png>");
  process.exit(1);
}

interface Tree {
  Parts: { ID: string; Location: [number, number]; Rotation: number }[];
  Doors?: unknown[];
}

function colorFor(id: string): [number, number, number] {
  const def = genPartsById[id];
  const cat = def?.typeCategories ?? [];
  if (cat.includes("weapon")) return [255, 110, 30];
  if (cat.includes("thruster")) return [60, 200, 80];
  if (cat.includes("armor")) return [120, 125, 135];
  if (cat.includes("reactor") || id === "cosmoteer.power_storage") return [90, 130, 255];
  if (cat.includes("command")) return [230, 220, 70];
  if (cat.includes("defense")) return [70, 220, 220];
  if (cat.includes("storage")) return [170, 100, 230];
  if (id.includes("crew_quarters")) return [240, 130, 180];
  if (id === "cosmoteer.corridor") return [70, 75, 85];
  if (id === "cosmoteer.fire_extinguisher" || id === "cosmoteer.airlock") return [220, 80, 60];
  return [210, 210, 210];
}

const tree = JSON.parse(readFileSync(inPath, "utf8")) as Tree;
const placed: PlacedPart[] = tree.Parts.map((p) => ({
  part: genPartsById[p.ID],
  loc: p.Location,
  rot: (((p.Rotation % 4) + 4) % 4) as 0 | 1 | 2 | 3,
}));

let minX = Infinity;
let minY = Infinity;
let maxX = -Infinity;
let maxY = -Infinity;
const allCells: { x: number; y: number; color: [number, number, number] }[] = [];
for (const p of placed) {
  const color = colorFor(p.part.id);
  for (const c of footprintCells(p)) {
    const [x, y] = c.split(",").map(Number);
    allCells.push({ x, y, color });
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
}

const CELL = 10;
const MARGIN = 2;
const width = (maxX - minY === undefined ? 0 : maxX - minX + 1) * CELL + MARGIN * 2 * CELL;
const height = (maxY - minY + 1) * CELL + MARGIN * 2 * CELL;
const rgba = new Uint8Array(width * height * 4);
for (let i = 0; i < rgba.length; i += 4) {
  rgba[i + 3] = 255;
}
const setPx = (x: number, y: number, c: [number, number, number]) => {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const idx = (y * width + x) * 4;
  rgba[idx] = c[0];
  rgba[idx + 1] = c[1];
  rgba[idx + 2] = c[2];
};
for (let i = 0; i < width * height; i++) {
  const gx = Math.floor((i % width) / CELL);
  const gy = Math.floor(Math.floor(i / width) / CELL);
  if ((gx + gy) % 2 === 0) {
    const idx = i * 4;
    rgba[idx] = 18;
    rgba[idx + 1] = 18;
    rgba[idx + 2] = 22;
  }
}
for (const { x, y, color } of allCells) {
  const px = (x - minX + MARGIN) * CELL;
  const py = (y - minY + MARGIN) * CELL;
  for (let dy = 0; dy < CELL; dy++) {
    for (let dx = 0; dx < CELL; dx++) {
      const border = dx === 0 || dy === 0 || dx === CELL - 1 || dy === CELL - 1;
      setPx(px + dx, py + dy, border ? [color[0] * 0.55, color[1] * 0.55, color[2] * 0.55] : color);
    }
  }
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
function encodePng(rgbaBytes: Uint8Array): Uint8Array {
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = new Uint8Array(13);
  const ihdrView = new DataView(ihdrData.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  const stride = width * 4;
  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw.set(rgbaBytes.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }
  const compressed = zlib.deflateSync(raw);
  const ihdr = pngChunk("IHDR", ihdrData);
  const idat = pngChunk("IDAT", compressed);
  const iend = pngChunk("IEND", new Uint8Array(0));
  const out = new Uint8Array(signature.length + ihdr.length + idat.length + iend.length);
  let off = 0;
  for (const chunk of [signature, ihdr, idat, iend]) {
    out.set(chunk, off);
    off += chunk.length;
  }
  return out;
}

writeFileSync(outPath, encodePng(rgba));
console.log(`wrote ${outPath} (${width}x${height}, ${placed.length} parts, north = up)`);
