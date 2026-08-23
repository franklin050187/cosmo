/**
 * generate-procedural.ts — Procedural ship generator (Parts + Doors only).
 *
 * Builds ships with a data-driven placement engine, places all legal doors
 * (autoDoors), then reduces them to a minimal connected set (pruneDoors).
 * Outputs .ship.png (LSB-embedded) + JSON, enforcing price < 100k.
 *
 * Run: npx tsx scripts/generate-procedural.ts [count]
 */

import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { calculatePrice } from "../src/lib/price";
import { buildProceduralShip } from "../src/lib/shipgen/procedural";
import { autoDoors, pruneDoors, validateShip } from "../src/lib/shipgen/generator";
import { buildShipTree, encode, encodePng, embedLsb, loadTemplate, jsonReplacer, renderShipVisualSync } from "./generate-ships";

function generateProceduralShips(count: number = 5): void {
  const template = loadTemplate();
  const outDir = path.join(process.cwd(), "output", "procedural");
  fs.mkdirSync(outDir, { recursive: true });

  const imageSize = 256;
  const cellSize = 32;

  for (let i = 0; i < count; i++) {
    const { parts } = buildProceduralShip({ variant: i, thrusterCount: i % 2 === 0 ? 4 : 5 });

    const allDoors = autoDoors(parts);
    const doors = pruneDoors(parts, allDoors);
    const validation = validateShip(parts, doors);

    if (!validation.valid) {
      console.error(`Ship ${i + 1}: INVALID - ${validation.errors.join(", ")}`);
      continue;
    }

    const shipTree = buildShipTree(template, parts, doors);
    const priceResult = calculatePrice(shipTree as any);

    console.log(
      `Ship ${i + 1}: valid, ${parts.length} parts, ${allDoors.length} doors (pruned ${doors.length}), price ${priceResult.price}`,
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

    const rgba = renderShipVisualSync(parts, imageSize, imageSize, cellSize);
    embedLsb(rgba, imageSize, imageSize, payload);

    const png = encodePng(rgba, imageSize, imageSize);
    const outputPath = path.join(outDir, `proc-${i + 1}.ship.png`);
    fs.writeFileSync(outputPath, Buffer.from(png));

    const jsonOutDir = path.join(outDir, "json");
    fs.mkdirSync(jsonOutDir, { recursive: true });
    const jsonPath = path.join(jsonOutDir, `proc-${i + 1}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(shipTree, jsonReplacer, 2));

    console.log(`  -> wrote ${outputPath} (${png.length} bytes)`);
    console.log(`  -> wrote ${jsonPath}`);
  }
}

const count = Number(process.argv[2]) || 5;
generateProceduralShips(count);
