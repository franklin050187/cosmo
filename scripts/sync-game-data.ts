import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";

const GAME_DIR = process.env.COSMOTEER_DATA_DIR || "/home/johnn/.local/share/Steam/steamapps/common/Cosmoteer/Data";
const APP_PART_DATA = resolve(process.cwd(), "src/lib/part-data.ts");

interface PartEntry {
  id: string;
  resources: [string, string][];
  size: [number, number];
  ammoCapacity: number;
  fuelCapacity: number;
  inputResources: [string, string][];
  storageCapacity: number;
}

interface ResourceEntry {
  id: string;
  buyPrice: number;
  maxStackSize: number;
}

function extractPart(relPath: string, resMaxStack: Map<string, number>): PartEntry | null {
  const src = readFileSync(join(GAME_DIR, relPath), "utf8");
  const dir = relPath.split("/")[2];
  const idMatch = src.match(/ID\s*=\s*(cosmoteer\.\S+)/);
  const id = idMatch ? idMatch[1] : `cosmoteer.${dir}`;

  const resources = extractPartInherited(relPath);
  const size = extractSize(src);
  const ammoCapacity = computeAmmoCapacity(src);
  const fuelCapacity = extractFuelCapacity(src);
  const inputResources = extractInputResources(src, resMaxStack);
  const storageCapacity = extractStorageCapacity(src);

  return { id, resources, size, ammoCapacity, fuelCapacity, inputResources, storageCapacity };
}

function extractPartInherited(relPath: string): [string, string][] {
  const src = readFileSync(join(GAME_DIR, relPath), "utf8");
  const resources = extractResources(src);
  if (resources.length > 0) return resources;
  const baseMatch = src.match(/^Part\s*:\s*<([^>]+)\.rules>\/Part/);
  if (!baseMatch) return [];
  const baseRel = join(dirname(relPath), baseMatch[1] + ".rules");
  if (!existsSync(join(GAME_DIR, baseRel))) return [];
  return extractPartInherited(baseRel);
}

function extractResources(src: string): [string, string][] {
  const resources: [string, string][] = [];
  const resStart = src.match(/^\t?Resources\s*$/m);
  if (!resStart) return resources;
  const bracket = src.slice(resStart.index!).match(/\t?\[\s*([\s\S]*?)\n\t?\]/);
  if (!bracket) return resources;
  const pairRegex = /\[\s*(\w+)\s*,\s*(\d+)\s*\]/g;
  let m;
  while ((m = pairRegex.exec(bracket[1])) !== null) {
    resources.push([m[1], m[2]]);
  }
  return resources;
}

function extractSize(src: string): [number, number] {
  const m = src.match(/Size\s*=\s*\[\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\]/);
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : [1, 1];
}

function extractStorageCapacity(src: string): number {
  const m = src.match(/Storage\s*\{[\s\S]*?Type = FlexResourceGrid[\s\S]*?GridRect\s*=\s*\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\]/);
  if (!m) return 0;
  return parseInt(m[3]) * parseInt(m[4]);
}

function extractFuelCapacity(src: string): number {
  const m = src.match(/HyperiumStorage\s*\{[\s\S]*?MaxResources\s*=\s*(\d+)/);
  return m ? parseInt(m[1]) : 0;
}

function extractBalancedBlock(src: string, start: number): string {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") {
      depth++;
    } else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return src.slice(start);
}

function storageBlocks(src: string): Array<{ name: string; block: string }> {
  const out: Array<{ name: string; block: string }> = [];
  const re = /([A-Za-z_]\w*(?:Storage|Storages))\r?\n[ \t]*\{/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    out.push({ name: m[1], block: extractBalancedBlock(src, m.index + m[0].length - 1) });
  }
  return out;
}

function extractNamedBlock(src: string, name: string): string | null {
  const re = new RegExp("(?<![A-Za-z_])" + name + "\\r?\\n[ \\t]*\\{");
  const m = re.exec(src);
  if (!m) return null;
  return extractBalancedBlock(src, m.index + m[0].length - 1);
}

// Purchasable resources charged in input storages when a part is bought.
// The game fills every storage on purchase except outputs (InitToMaxResources = 0).
// Weapon ammo / fuel storages are covered separately by AmmoCapacity / FuelCapacity.
function extractInputResources(src: string, resMaxStack: Map<string, number>): [string, string][] {
  const totals = new Map<string, number>();
  for (const { name, block } of storageBlocks(src)) {
    if (name.includes("AmmoStorage") || name.includes("HyperiumStorage")) continue;
    if (block.includes("InitToMaxResources = 0")) continue;
    const resMatch = block.match(/ResourceType = (\w+)/);
    if (!resMatch) continue;
    const res = resMatch[1];
    const maxStack = resMaxStack.get(res);
    if (!maxStack) continue;
    const type = (block.match(/Type = (\w+)/) || [])[1];
    let qty: number;
    if (type === "TypedResourceGrid") {
      const g = block.match(/GridRect = \[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\]/);
      if (!g) continue;
      qty = parseInt(g[3]) * parseInt(g[4]) * maxStack;
    } else {
      const mr = block.match(/MaxResources = (\d+)/);
      if (!mr) continue;
      qty = parseInt(mr[1]);
    }
    totals.set(res, (totals.get(res) || 0) + qty);
  }
  return Array.from(totals).map(([r, q]) => [r, String(q)]);
}

function computeAmmoCapacity(src: string): number {
  const ammoCapMatch = src.match(/AmmoCapacity\s*=\s*(.+)/);
  if (!ammoCapMatch) return 0;
  const expr = ammoCapMatch[1].trim();

  const ammoStorageBlock = extractNamedBlock(src, "AmmoStorage");
  if (ammoStorageBlock && ammoStorageBlock.includes("InitToMaxResources = 0")) return 0;

  const gridRectMatch = src.match(/AmmoStorage\s*[\s\S]*?GridRect\s*=\s*\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\]/);
  const gridW = gridRectMatch ? parseInt(gridRectMatch[3]) : 0;
  const gridH = gridRectMatch ? parseInt(gridRectMatch[4]) : 0;

  const loadedAmmoMatch = src.match(/LoadedAmmo[12]?\s*[\s\S]*?MaxResources\s*=\s*(.+)/g);
  let loadedAmmoTotal = 0;
  if (loadedAmmoMatch) {
    for (const lm of loadedAmmoMatch) {
      const vm = lm.match(/MaxResources\s*=\s*(.+)/);
      if (!vm) continue;
      const raw = vm[1].trim();
      if (/^\d+$/.test(raw)) {
        loadedAmmoTotal += parseInt(raw);
      } else if (raw.includes("ResourcesUsed")) {
        const ru = src.match(/ResourcesUsed\s*=\s*(\d+)/);
        if (ru) loadedAmmoTotal += parseInt(ru[1]);
      }
    }
  }

  const inheritedLoadedAmmo = src.match(/LoadedAmmo2\s*:\s*LoadedAmmo1/g);
  if (inheritedLoadedAmmo && loadedAmmoTotal > 0) {
    const perLoaded = loadedAmmoTotal / loadedAmmoMatch!.length;
    loadedAmmoTotal += inheritedLoadedAmmo.length * perLoaded;
  }

  const ammoStorageMRMatch = src.match(/AmmoStorage\s*[\s\S]*?MaxResources\s*=\s*(\d+)/);
  const ammoStorageMR = ammoStorageMRMatch ? parseInt(ammoStorageMRMatch[1]) : 0;

  const ammoStorageRightMRMatch = src.match(/AmmoStorageRight\s*[\s\S]*?MaxResources\s*=\s*(\d+)/);
  const ammoStorageRightMR = ammoStorageRightMRMatch ? parseInt(ammoStorageRightMRMatch[1]) : 0;

  const ammoStorageLeftMRMatch = src.match(/AmmoStorageLeft\s*[\s\S]*?MaxResources\s*=\s*(\d+)/);
  const ammoStorageLeftMR = ammoStorageLeftMRMatch ? parseInt(ammoStorageLeftMRMatch[1]) : 0;

  if (expr.includes("GridRect/2") && expr.includes("GridRect/3")) {
    if (expr.includes("- 2")) {
      return (gridW * gridH - 2) * 20 + loadedAmmoTotal;
    }
    return gridW * gridH * 20 + loadedAmmoTotal;
  }

  if (expr.includes("AmmoStorageRight") && expr.includes("AmmoStorageLeft")) {
    return ammoStorageRightMR + ammoStorageLeftMR;
  }

  if (expr.includes("AmmoStorage/MaxResources") && expr.includes("LoadedAmmo")) {
    return ammoStorageMR + loadedAmmoTotal;
  }

  if (expr.includes("AmmoStorage/MaxResources")) {
    return ammoStorageMR;
  }

  return 0;
}

function extractResourcesData(): ResourceEntry[] {
  const dir = join(GAME_DIR, "resources");
  const out: ResourceEntry[] = [];
  for (const name of readdirSync(dir)) {
    const f = join(dir, name, `${name}.rules`);
    if (!existsSync(f)) continue;
    const rel = `resources/${name}/${name}.rules`;
    const src = readFileSync(join(GAME_DIR, rel), "utf8");
    const idMatch = src.match(/ID\s*=\s*(\S+)/);
    const id = idMatch ? idMatch[1] : name;
    const bp = src.match(/BuyPrice\s*=\s*(\d+)/);
    const mss = src.match(/MaxStackSize\s*=\s*(\d+)/);
    if (!bp || !mss) continue;
    out.push({ id, buyPrice: parseInt(bp[1]), maxStackSize: parseInt(mss[1]) });
  }
  return out;
}

function parsePartDataTs() {
  const src = readFileSync(APP_PART_DATA, "utf8");
  const partsResources = new Map<string, [string, string][]>();
  const partsAmmo = new Map<string, number>();
  const partsFuel = new Map<string, number>();
  const partsInput = new Map<string, [string, string][]>();
  const resourceCost = new Map<string, { buyPrice: number; maxStackSize: number }>();

  const entryRegex = /\{[^{}]*\}/g;
  let m;
  while ((m = entryRegex.exec(src)) !== null) {
    const entry = m[0];
    const idMatch = entry.match(/ID:\s*"([^"]+)"/);
    if (!idMatch) continue;
    const id = idMatch[1];
    const resMatch = entry.match(/(?<!\w)Resources:\s*\[([\s\S]*?)\]\s*\}/);
    if (!resMatch) continue;
    const pairs: [string, string][] = [];
    const pairRegex = /\[\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\]/g;
    let pm;
    while ((pm = pairRegex.exec(resMatch[1])) !== null) {
      pairs.push([pm[1], pm[2]]);
    }
    partsResources.set(id, pairs);
    const ammoMatch = entry.match(/AmmoCapacity:\s*(\d+)/);
    if (ammoMatch) partsAmmo.set(id, parseInt(ammoMatch[1]));
    const fuelMatch = entry.match(/FuelCapacity:\s*(\d+)/);
    if (fuelMatch) partsFuel.set(id, parseInt(fuelMatch[1]));
    const inputMatch = entry.match(/InputResources:\s*(\[\s*\[\s*[\s\S]*?\]\s*\])(?:\s*,|\s*})/);
    if (inputMatch) {
      const pairs: [string, string][] = [];
      const pairRegex = /\[\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\]/g;
      let im;
      while ((im = pairRegex.exec(inputMatch[1])) !== null) {
        pairs.push([im[1], im[2]]);
      }
      partsInput.set(id, pairs);
    }
  }

  const rcRegex = /\{\s*ID:\s*"([^"]+)"\s*,\s*BuyPrice:\s*(\d+)\s*,\s*MaxStackSize:\s*(\d+)\s*\}/g;
  while ((m = rcRegex.exec(src)) !== null) {
    resourceCost.set(m[1], { buyPrice: parseInt(m[2]), maxStackSize: parseInt(m[3]) });
  }

  return { partsResources, partsAmmo, partsFuel, partsInput, resourceCost };
}

function isMissilePseudoPart(id: string): boolean {
  return ["emp_missiles", "he_missiles", "mines", "nukes", "thermal_missiles"].includes(id);
}

function isWallOrStructure(id: string): boolean {
  return id === "cosmoteer.walls" || id === "cosmoteer.construction" || id === "cosmoteer.darkness";
}

function main() {
  const apply = process.argv.includes("--apply");

  console.log(`Game dir: ${GAME_DIR}`);

  console.log("\nLoading game data...");
  const gameRes = extractResourcesData();
  const resMaxStack = new Map(gameRes.map((r) => [r.id, r.maxStackSize]));
  const gameParts = extractPartsFromDir(resMaxStack);
  console.log(`Found ${gameParts.length} parts, ${gameRes.length} resources`);

  console.log("\nLoading app data...");
  const { partsResources, partsAmmo, partsFuel, partsInput, resourceCost } = parsePartDataTs();
  console.log(`App has ${partsResources.size} parts, ${resourceCost.size} resources`);

  console.log("\n" + "=".repeat(60));
  console.log("DIFF: Game data vs app part-data.ts");
  console.log("=".repeat(60));

  let totalDiffs = 0;
  const appPartIds = new Set(partsResources.keys());
  const gamePartIds = new Set(gameParts.map((p) => p.id));

  // Missing parts (in game but not in app)
  const missingParts: string[] = [];
  for (const gp of gameParts) {
    if (!appPartIds.has(gp.id) && !isWallOrStructure(gp.id) && !isMissilePseudoPart(gp.id.replace("cosmoteer.", ""))) {
      missingParts.push(gp.id);
    }
  }
  if (missingParts.length > 0) {
    console.log(`\nMISSING PARTS (in game, not in app):`);
    for (const id of missingParts) console.log(`  ${id}`);
    totalDiffs += missingParts.length;
  }

  // Extra parts (in app but not in game)
  const extraParts: string[] = [];
  for (const id of Array.from(appPartIds)) {
    if (!gamePartIds.has(id) && !isMissilePseudoPart(id) && !isWallOrStructure(id)) {
      extraParts.push(id);
    }
  }
  if (extraParts.length > 0) {
    console.log(`\nEXTRA PARTS (in app, not in game):`);
    for (const id of extraParts) console.log(`  ${id}`);
    totalDiffs += extraParts.length;
  }

  // Part resource diffs
  let partDiffs = 0;
  for (const gp of gameParts) {
    if (isWallOrStructure(gp.id)) continue;
    const ap = partsResources.get(gp.id);
    if (!ap) continue; // already reported as missing

    const resDiffs = diffResources(gp.resources, ap);
    if (resDiffs.length > 0) {
      console.log(`\nDIFF ${gp.id}:`);
      for (const d of resDiffs) console.log(`  ${d}`);
      partDiffs++;
      totalDiffs++;
    }

    if ((partsAmmo.get(gp.id) ?? 0) !== gp.ammoCapacity) {
      console.log(`\nDIFF ${gp.id}: ammoCapacity app=${partsAmmo.get(gp.id) ?? "(missing)"} game=${gp.ammoCapacity}`);
      partDiffs++;
      totalDiffs++;
    }

    if ((partsFuel.get(gp.id) ?? 0) !== gp.fuelCapacity) {
      console.log(`\nDIFF ${gp.id}: fuelCapacity app=${partsFuel.get(gp.id) ?? "(missing)"} game=${gp.fuelCapacity}`);
      partDiffs++;
      totalDiffs++;
    }

    const inputDiffs = diffResources(gp.inputResources, partsInput.get(gp.id) ?? []);
    if (inputDiffs.length > 0) {
      console.log(`\nDIFF ${gp.id}: inputResources`);
      for (const d of inputDiffs) console.log(`  ${d}`);
      partDiffs++;
      totalDiffs++;
    }
  }
  console.log(`\nPart resource diffs: ${partDiffs}`);

  // Resource cost diffs
  let rcDiffs = 0;
  const appResMap = new Map(Array.from(resourceCost.entries()));
  for (const gr of gameRes) {
    const ar = appResMap.get(gr.id);
    if (!ar) {
      console.log(`ADD RESOURCE ${gr.id}: buyPrice=${gr.buyPrice} maxStackSize=${gr.maxStackSize}`);
      rcDiffs++;
      totalDiffs++;
      continue;
    }
    if (ar.buyPrice !== gr.buyPrice) {
      console.log(`DIFF ${gr.id}: buyPrice app=${ar.buyPrice} game=${gr.buyPrice}`);
      rcDiffs++;
      totalDiffs++;
    }
    if (ar.maxStackSize !== gr.maxStackSize) {
      console.log(`DIFF ${gr.id}: maxStackSize app=${ar.maxStackSize} game=${gr.maxStackSize}`);
      rcDiffs++;
      totalDiffs++;
    }
  }
  console.log(`Resource cost diffs: ${rcDiffs}`);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`TOTAL DIFFS: ${totalDiffs}`);

  if (apply && totalDiffs > 0) {
    console.log("\nApplying changes...");
    applyChanges(gameParts, gameRes, partsResources, partsAmmo, partsFuel, partsInput, resourceCost);
  } else if (apply) {
    console.log("No changes to apply.");
  } else {
    console.log("\nRun with --apply to update files after reviewing diff.");
  }
}

function diffResources(
  gameRes: [string, string][],
  appRes: [string, string][],
) {
  const diffs: string[] = [];
  const gameMap = new Map(gameRes.map((r) => [r[0], r[1]]));
  const appMap = new Map(appRes.map((r) => [r[0], r[1]]));

  for (const [resId, qty] of Array.from(gameMap)) {
    const appQty = appMap.get(resId);
    if (appQty !== qty) {
      diffs.push(`${resId}: app=${appQty ?? "(missing)"} game=${qty}`);
    }
  }

  for (const [resId, qty] of Array.from(appMap)) {
    if (!gameMap.has(resId)) {
      diffs.push(`${resId}: app=${qty} game=(not in Resources block)`);
    }
  }

  return diffs;
}

function extractPartsFromDir(resMaxStack: Map<string, number>): PartEntry[] {
  const dir = join(GAME_DIR, "ships", "terran");
  const parts: PartEntry[] = [];
  for (const name of readdirSync(dir)) {
    const f = join(dir, name, `${name}.rules`);
    if (!existsSync(f)) continue;
    const rel = `ships/terran/${name}/${name}.rules`;
    try {
      const part = extractPart(rel, resMaxStack);
      if (part) parts.push(part);
    } catch {
      // skip
    }
  }
  return parts;
}

function applyChanges(
  gameParts: PartEntry[],
  gameRes: ResourceEntry[],
  partsResources: Map<string, [string, string][]>,
  partsAmmo: Map<string, number>,
  partsFuel: Map<string, number>,
  partsInput: Map<string, [string, string][]>,
  resourceCost: Map<string, { buyPrice: number; maxStackSize: number }>,
) {
  for (const gp of gameParts) {
    if (isWallOrStructure(gp.id)) continue;
    partsResources.set(gp.id, [...gp.resources]);
    if (gp.ammoCapacity > 0) {
      partsAmmo.set(gp.id, gp.ammoCapacity);
    } else {
      partsAmmo.delete(gp.id);
    }
    if (gp.fuelCapacity > 0) {
      partsFuel.set(gp.id, gp.fuelCapacity);
    } else {
      partsFuel.delete(gp.id);
    }
    if (gp.inputResources.length > 0) {
      partsInput.set(gp.id, [...gp.inputResources]);
    } else {
      partsInput.delete(gp.id);
    }
  }

  for (const gr of gameRes) {
    resourceCost.set(gr.id, { buyPrice: gr.buyPrice, maxStackSize: gr.maxStackSize });
  }

  writePartDataTs(partsResources, partsAmmo, partsFuel, partsInput, resourceCost);
  console.log("Files updated.");
}

function writePartDataTs(
  partsResources: Map<string, [string, string][]>,
  partsAmmo: Map<string, number>,
  partsFuel: Map<string, number>,
  partsInput: Map<string, [string, string][]>,
  resourceCost: Map<string, { buyPrice: number; maxStackSize: number }>,
) {
  const lines: string[] = [];
  lines.push("export interface PartResource {");
  lines.push("  ID: string;");
  lines.push("  Resources: [string, string][];");
  lines.push("  AmmoCapacity?: number;");
  lines.push("  FuelCapacity?: number;");
  lines.push("  InputResources?: [string, string][];");
  lines.push("}");
  lines.push("");
  lines.push("export interface ResourceCost {");
  lines.push("  ID: string;");
  lines.push("  BuyPrice: number;");
  lines.push("  MaxStackSize: number;");
  lines.push("}");
  lines.push("");
  lines.push("export const partsResources: PartResource[] = [");
  for (const [id, res] of Array.from(partsResources)) {
    const parts: string[] = [`ID: "${id}"`];
    const ammo = partsAmmo.get(id);
    if (ammo) parts.push(`AmmoCapacity: ${ammo}`);
    const fuel = partsFuel.get(id);
    if (fuel) parts.push(`FuelCapacity: ${fuel}`);
    const input = partsInput.get(id);
    if (input) parts.push(`InputResources: ${JSON.stringify(input)}`);
    parts.push(`Resources: ${JSON.stringify(res)}`);
    lines.push(`  { ${parts.join(", ")} },`);
  }
  lines.push("];");
  lines.push("");
  lines.push("export const resourceCost: ResourceCost[] = [");
  for (const [id, rc] of Array.from(resourceCost)) {
    lines.push(`  { ID: "${id}", BuyPrice: ${rc.buyPrice}, MaxStackSize: ${rc.maxStackSize} },`);
  }
  lines.push("];");
  writeFileSync(APP_PART_DATA, lines.join("\n") + "\n");
}

main();
