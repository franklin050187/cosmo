import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { partsResources, resourceCost } from "../../src/lib/part-data";
import { calculateShipPrice } from "../../src/lib/price";
import decodeShipPng from "./decode-ship.mjs";

const SHIP_DIR = resolve(process.cwd(), "scripts", "price-test");
const SHIP_FILES = ["1499792.png", "331600.png", "349080.png", "402000.png", "88695.png"];

function getBuildCost(partId: string): number {
  const res = partsResources.find((r) => r.ID === partId);
  if (!res) return 0;
  let cost = 0;
  for (const [resId, qty] of res.Resources) {
    const rc = resourceCost.find((r) => r.ID === resId);
    if (rc) cost += rc.BuyPrice * Number(qty);
  }
  return cost;
}

async function main() {
  console.log("Price verification for test ships:\n");

  const results: Array<{ file: string; author: string; parts: string[]; currentPrice: number; currentCrew: number; currentTags: string[]; currentBuildCost: number }> = [];

  for (const file of SHIP_FILES) {
    const filePath = resolve(SHIP_DIR, file);
    if (!existsSync(filePath)) { console.log(`  SKIP ${file} (not found)`); continue; }

    const data = await decodeShipPng(filePath);
    const parts = (data?.Parts as Array<{ ID: string }> || []).map((p) => p.ID);
    const priceResult = calculateShipPrice(data);
    const buildCost = parts.reduce((sum, id) => sum + getBuildCost(id), 0);

    results.push({
      file,
      author: data?.Author ?? "unknown",
      parts,
      currentPrice: priceResult.price,
      currentCrew: priceResult.crew,
      currentTags: priceResult.tags,
      currentBuildCost: buildCost,
    });

    console.log(`  ${file}: ${parts.length} parts, price=${priceResult.price} crew=${priceResult.crew} buildCost=${buildCost}`);
  }

  console.log("\n--- Apply sync diffs and recompute ---\n");

  const partDataPath = resolve(process.cwd(), "src", "lib", "part-data.ts");
  const physicsDataPath = resolve(process.cwd(), "src", "lib", "physics-data.ts");

  const originalPartData = readFileSync(partDataPath, "utf8");
  const originalPhysicsData = readFileSync(physicsDataPath, "utf8");

  try {
    const { execSync } = await import("node:child_process");
    execSync("npx tsx scripts/sync-game-data.ts --apply", { cwd: process.cwd(), stdio: "inherit" });
  } catch {
    console.log("  Could not apply sync diffs automatically.");
  }

  for (const r of results) {
    const filePath = resolve(SHIP_DIR, r.file);
    const data = await decodeShipPng(filePath);
    const priceResult = calculateShipPrice(data);
    const buildCost = r.parts.reduce((sum, id) => sum + getBuildCost(id), 0);
    const priceDiff = priceResult.price - r.currentPrice;
    const buildCostDiff = buildCost - r.currentBuildCost;
    const changed = priceDiff !== 0 || buildCostDiff !== 0;

    console.log(`  ${r.file}:`);
    console.log(`    current price=${r.currentPrice} updated price=${priceResult.price} diff=${priceDiff > 0 ? "+" : ""}${priceDiff}`);
    console.log(`    current buildCost=${r.currentBuildCost} updated buildCost=${buildCost} diff=${buildCostDiff > 0 ? "+" : ""}${buildCostDiff}`);
    console.log(`    changed: ${changed ? "YES" : "no"}`);
  }

  const references: Array<{ file: string; expected: number }> = [
    { file: "402000.png", expected: 402000 },
    { file: "349080.png", expected: 349080 },
  ];
  for (const ref of references) {
    const reference = results.find((r) => r.file === ref.file);
    if (!reference) continue;
    const referenceData = await decodeShipPng(resolve(SHIP_DIR, reference.file));
    const actual = calculateShipPrice(referenceData).price;
    const ok = actual === ref.expected;
    console.log(`\nREFERENCE ${ref.file}: expected=${ref.expected} actual=${actual} ${ok ? "OK" : "MISMATCH"}`);
    if (!ok) {
      writeFileSync(partDataPath, originalPartData);
      writeFileSync(physicsDataPath, originalPhysicsData);
      throw new Error(`Reference ship ${ref.file} price mismatch: expected ${ref.expected}, got ${actual}`);
    }
  }

  writeFileSync(partDataPath, originalPartData);
  writeFileSync(physicsDataPath, originalPhysicsData);
  console.log("\nRestored original part-data.ts and physics-data.ts");
}

main().catch(console.error);
