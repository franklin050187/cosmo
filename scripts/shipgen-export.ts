/**
 * shipgen-export.ts — convert a generated ship layout into game-ready files:
 *
 *   <outBase>.json      full game-schema ship JSON (loadable by the game)
 *   <outBase>.ship.png  sprite-rendered preview with the ship JSON embedded
 *                       as [u32 BE length]["COSMOSHIP"][gzip] LSB payload
 *
 * Usage: npx tsx scripts/shipgen-export.ts <layout.json> <outBase>
 *
 * The layout file is the generator's minimal JSON ({Parts, Doors, Name?, ...});
 * the full schema (Version, ShipRulesID, Roles, RoofBase*, ...) comes from
 * scripts/qa-fixtures/valid-ship-template.json via buildGameShipJson.
 * The preview needs the dev server on http://localhost:8001 (rawdata tool).
 */

import { readFileSync, writeFileSync } from "node:fs";
import zlib from "node:zlib";
import { chromium } from "playwright";
import { ColorValue, FloatValue, Ship } from "../src/lib/cosmoShip";
import { embedLsb, encodePng } from "../rawdata/generate-ships";
import {
  buildGameShipJson,
  type GameShipLayout,
} from "../src/lib/shipgen/game-ship-json";
import { decodePngPixels } from "../src/lib/server-decode";

const [, , inPath, outBase] = process.argv;
if (!inPath || !outBase) {
  console.error("usage: tsx scripts/shipgen-export.ts <layout.json> <outBase>");
  process.exit(1);
}

const RAWDATA_URL = "http://localhost:8001/rawdata";
const MAGIC = new TextEncoder().encode("COSMOSHIP");

/**
 * JSON.parse() loses the codec's FloatValue/ColorValue wrappers
 * ({"value": n} / {"parts": [...]}); restore them or encode() writes
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

const layout = JSON.parse(readFileSync(inPath, "utf8")) as GameShipLayout;

async function main(): Promise<void> {
  const tree = buildGameShipJson(layout);

  writeFileSync(outBase + ".json", JSON.stringify(tree, null, 2));

  // ── Encode payload: [COSMOSHIP][gzip(OBNode)]; embedLsb adds the u32 length ─

  const sizer = new Ship({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
  const encoded = new Uint8Array(sizer.encode(revive(tree)));
  const encodedLength = encoded.length;
  const compressed = zlib.gzipSync(Buffer.from(encoded));
  const payload = new Uint8Array(MAGIC.length + compressed.length);
  payload.set(MAGIC, 0);
  payload.set(compressed, MAGIC.length);

  const neededBytes = 4 + payload.length;

  // ── Sprite render via the rawdata debug tool, then LSB-embed the payload ────

  let reachable = false;
  try {
    const res = await fetch(RAWDATA_URL, { signal: AbortSignal.timeout(3000) });
    reachable = res.ok;
  } catch {
    reachable = false;
  }
  if (!reachable) {
    console.error(`dev server not reachable at ${RAWDATA_URL} — start it first (npx next dev -p 8001)`);
    process.exit(1);
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });
    await page.goto(RAWDATA_URL, { waitUntil: "networkidle" });

    await page.getByRole("button", { name: "Paste JSON" }).click();
    await page.locator("textarea").first().fill(JSON.stringify(tree));
    await page.getByRole("button", { name: "Load JSON" }).click();

    await page.waitForSelector('canvas[aria-label="Ship reconstruction"]', { timeout: 30000 });
    await page.waitForFunction(
      () => !document.querySelector('[role="status"][aria-label="Generating ship image"]'),
      { timeout: 60000 },
    );
    await page.waitForTimeout(1500);

    const shot = await page
      .locator('canvas[aria-label="Ship reconstruction"]')
      .screenshot();

    const img = decodePngPixels(
      shot.buffer.slice(shot.byteOffset, shot.byteOffset + shot.byteLength),
    );
    const capacity = Math.floor((img.width * img.height * 3) / 8);
    if (capacity < neededBytes) {
      console.error(`sprite render too small: ${img.width}x${img.height} holds ${capacity} bytes, need ${neededBytes}`);
      process.exit(1);
    }

    embedLsb(img.data, img.width, img.height, payload);
    writeFileSync(
      outBase + ".ship.png",
      Buffer.from(encodePng(new Uint8Array(img.data), img.width, img.height)),
    );

    console.log(
      `wrote ${outBase}.json (${Object.keys(tree).length} top-level keys)\n` +
      `wrote ${outBase}.ship.png (${img.width}x${img.height}, ${layout.Parts.length} parts, ` +
      `${layout.Doors.length} doors, ${encodedLength} bytes OBNode, ${payload.length} bytes payload)`,
    );
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
