/**
 * shipgen-export.ts — convert generated ship JSON into a game-ready .ship.png
 * (LSB-steganographic blueprint the same format Cosmoteer and the site upload
 * flow read).
 *
 * Usage: npx tsx scripts/shipgen-export.ts <ship.json> <out.ship.png>
 */

import { readFileSync, writeFileSync } from "node:fs";
import zlib from "node:zlib";
import { FloatValue, ColorValue, Ship } from "../src/lib/cosmoShip";
import { embedLsb, encodePng } from "../rawdata/generate-ships";

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error("usage: tsx scripts/shipgen-export.ts <ship.json> <out.ship.png>");
  process.exit(1);
}

const MAX_IMAGE_DIMENSION = 4096;

/**
 * JSON has no classes, so the codec's FloatValue/ColorValue wrappers arrive as
 * {"value": n} / {"parts": [hex,hex,hex,hex]}. Restore them or encode() writes
 * corrupt maps where floats and colors belong.
 */
function revive(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(revive);
  if (node !== null && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (
      keys.length === 1 &&
      "value" in obj &&
      typeof obj.value === "number" &&
      !Number.isInteger(obj.value)
    ) {
      return new FloatValue(obj.value);
    }
    if (
      keys.length === 1 &&
      "parts" in obj &&
      Array.isArray(obj.parts) &&
      obj.parts.length === 4 &&
      obj.parts.every((p) => typeof p === "string")
    ) {
      return new ColorValue(obj.parts as [string, string, string, string]);
    }
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, revive(v)]),
    );
  }
  return node;
}

const data = revive(JSON.parse(readFileSync(inPath, "utf8")));

const sizer = new Ship({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
const encodedLength = new Uint8Array(sizer.encode(data)).length;

// 4-byte length prefix + payload with headroom for gzip framing variance
const neededBytes = 4 + Math.ceil(encodedLength * 1.25) + 1024;
let side = 64;
while (side < MAX_IMAGE_DIMENSION && (side * side * 3) / 8 < neededBytes) side *= 2;
if ((side * side * 3) / 8 < neededBytes) {
  console.error(`ship too large: needs ${neededBytes} bytes, max image capacity reached`);
  process.exit(1);
}

const rgba = new Uint8Array(side * side * 4);
for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;

const compressed = zlib.gzipSync(Buffer.from(new Uint8Array(sizer.encode(data))));
embedLsb(rgba, side, side, new Uint8Array(compressed));

writeFileSync(outPath, Buffer.from(encodePng(rgba, side, side)));
console.log(
  `wrote ${outPath} (${side}x${side}, ${encodedLength} bytes payload, ` +
  `${compressed.length} bytes gzipped)`,
);
