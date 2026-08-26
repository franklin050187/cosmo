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
import { genPartsById } from "../src/lib/shipgen/parts-db";
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

    // ── Overlay doors on the rendered canvas ────────────────────────────────
    // Mirror ShipReconstruction's fit transform (SIZE 512, PADDING 8, bounds
    // over sprite sizes, zoom 1, pan 0) so each door lands on the shared
    // edge of its two cells: orientation 0 = horizontal edge at Cell's top,
    // orientation 1 = vertical edge at Cell's left.
    {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const p of layout.Parts) {
        const def = genPartsById[p.ID];
        const pw = def ? def.size[0] : 1;
        const ph = def ? def.size[1] : 1;
        if (p.Location[0] < minX) minX = p.Location[0];
        if (p.Location[0] + pw > maxX) maxX = p.Location[0] + pw;
        if (p.Location[1] < minY) minY = p.Location[1];
        if (p.Location[1] + ph > maxY) maxY = p.Location[1] + ph;
      }
      const PADDING = 8;
      const SIZE = 512;
      minX -= PADDING;
      minY -= PADDING;
      maxX += PADDING;
      maxY += PADDING;
      const scale = SIZE / Math.max(maxX - minX, maxY - minY);
      const offX = SIZE / 2 - ((minX + maxX) / 2) * scale;
      const offY = SIZE / 2 - ((minY + maxY) / 2) * scale;

      await page.evaluate(
        ({ doors, s, ox, oy }) => {
          const canvas = document.querySelector<HTMLCanvasElement>(
            'canvas[aria-label="Ship reconstruction"]',
          );
          if (!canvas) return;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          const lw = Math.max(2, s * 0.16);
          const g = lw * 0.9;
          ctx.strokeStyle = "#00e5ff";
          ctx.lineCap = "round";
          ctx.lineWidth = lw;
          for (const d of doors) {
            ctx.beginPath();
            if (d.Orientation === 0) {
              const y = d.Cell[1] * s + oy;
              ctx.moveTo(d.Cell[0] * s + ox + g, y);
              ctx.lineTo((d.Cell[0] + 1) * s + ox - g, y);
            } else {
              const x = d.Cell[0] * s + ox;
              ctx.moveTo(x, d.Cell[1] * s + oy + g);
              ctx.lineTo(x, (d.Cell[1] + 1) * s + oy - g);
            }
            ctx.stroke();
          }
        },
        { doors: layout.Doors.map((d) => ({ Cell: [...d.Cell], Orientation: d.Orientation })), s: scale, ox: offX, oy: offY },
      );
    }

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
