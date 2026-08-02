import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { UTApi } from "uploadthing/server";
import { insertShip, findDuplicateBySignature } from "../src/lib/db";
import { decodePngPixels, decodeShipFromPixels } from "../src/lib/server-decode";
import { calculateShipPrice } from "../src/lib/price";
import { computeShipSignature } from "../src/lib/ship-signature";

const BUILTIN_DIR = resolve(__dirname, "ingame/builtin_ships");
const SUBMITTED_BY = "poney5850#0";
const BRAND = "gen";
const BUILTIN_TAG = "builtin";
const WARNING =
  "\n\nOfficial in-game ship from Cosmoteer (copyright Walternate Realms). Licensed under CC BY-NC-SA — not for commercial redistribution.";

const CONCURRENCY = 5;
const RETRIES = 1;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : 0;
const factionArg = args.find((a) => a.startsWith("--faction="));
const factionFilter = factionArg ? factionArg.split("=")[1].toLowerCase() : "";

interface Candidate {
  file: string;
  faction: string;
  type: string | null;
  name: string;
}

interface Outcome {
  file: string;
  ok: boolean;
  inserted?: boolean;
  skipped?: boolean;
  skipReason?: string;
  shipId?: number;
  error?: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".ship.png")) out.push(p);
  }
  return out;
}

function collectCandidates(): Candidate[] {
  const files = walk(BUILTIN_DIR);
  const candidates: Candidate[] = [];
  for (const file of files) {
    const rel = relative(BUILTIN_DIR, file).split(/[\\/]/);
    const name = rel[rel.length - 1];
    const faction = rel[0];
    const type = rel.length >= 3 ? rel[rel.length - 2] : null;
    if (factionFilter && faction.toLowerCase() !== factionFilter) continue;
    candidates.push({ file, faction, type, name });
  }
  return candidates.sort((a, b) => a.file.localeCompare(b.file));
}

function shipNameOf(c: Candidate): string {
  return c.name.replace(/\.ship\.png$/, "");
}

function buildDescription(c: Candidate): string {
  const shipName = shipNameOf(c);
  const head = c.type ? `${c.faction} - ${c.type} - ${shipName}` : `${c.faction} - ${shipName}`;
  return head + WARNING;
}

async function uploadWithRetry(file: File): Promise<string> {
  const utapi = new UTApi();
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const res = await utapi.uploadFiles(file);
      const results = Array.isArray(res) ? res : [res];
      const ufsUrl = results[0]?.data?.ufsUrl;
      if (!ufsUrl) throw new Error("upload returned no ufsUrl");
      return ufsUrl;
    } catch (e) {
      lastErr = e;
      await sleep(500 * (attempt + 1));
    }
  }
  throw lastErr;
}

async function processCandidate(c: Candidate, seenSignatures: Set<string>): Promise<Outcome> {
  try {
    const buf = readFileSync(c.file);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const shipData = decodeShipFromPixels(decodePngPixels(ab)) as Parameters<typeof calculateShipPrice>[0];

    const signature = computeShipSignature(shipData);

    if (seenSignatures.has(signature)) {
      return { file: c.file, ok: true, skipped: true, skipReason: "duplicate within batch" };
    }
    seenSignatures.add(signature);

    const existing = await findDuplicateBySignature(signature);
    if (existing.length > 0) {
      return {
        file: c.file,
        ok: true,
        skipped: true,
        skipReason: `already in db (#${existing.map((e: { id: number }) => e.id).join(", ")})`,
      };
    }

    const info = calculateShipPrice(shipData);
    const tags = [...new Set([...info.tags, BUILTIN_TAG])].sort();
    const description = buildDescription(c);

    let data = "";
    if (!dryRun) {
      data = await uploadWithRetry(new File([buf], c.name, { type: "image/png" }));
    }

    let shipId: number | undefined;
    if (!dryRun) {
      const result = await insertShip({
        name: c.name,
        data,
        submittedBy: SUBMITTED_BY,
        submittedById: null,
        description,
        shipName: shipNameOf(c),
        author: info.author,
        price: info.price,
        brand: BRAND,
        crew: info.crew,
        tags,
        signature,
      });
      shipId = result.success ? parseInt(result.success, 10) : undefined;
    }

    return { file: c.file, ok: true, inserted: true, shipId };
  } catch (e) {
    return { file: c.file, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  const candidates = collectCandidates();
  const target = limit > 0 ? candidates.slice(0, limit) : candidates;

  console.log(
    `Importing builtin ships ${dryRun ? "(DRY RUN, no uploads/writes)" : ""} for ${target.length} of ${candidates.length} files`
  );
  if (factionFilter) console.log(`  faction filter: ${factionFilter}`);
  if (limit > 0) console.log(`  limited to first ${limit} files`);

  const seenSignatures = new Set<string>();
  const outcomes: Outcome[] = [];
  let next = 0;
  async function worker() {
    while (next < target.length) {
      const idx = next++;
      outcomes.push(await processCandidate(target[idx], seenSignatures));
    }
  }
  const workers = Array.from({ length: Math.min(CONCURRENCY, target.length) }, () => worker());
  await Promise.all(workers);

  const inserted = outcomes.filter((o) => o.ok && o.inserted);
  const skipped = outcomes.filter((o) => o.ok && o.skipped);
  const failed = outcomes.filter((o) => !o.ok);

  console.log(
    `\n${dryRun ? "Would insert" : "Inserted"}: ${inserted.length}, Skipped: ${skipped.length}, Failed: ${failed.length}, Total: ${outcomes.length}\n`
  );

  for (const o of skipped) {
    console.log(`  SKIP ${relative(BUILTIN_DIR, o.file)} (${o.skipReason})`);
  }
  for (const o of failed) {
    console.log(`  FAIL ${relative(BUILTIN_DIR, o.file)}: ${o.error}`);
  }
  for (const o of inserted.slice(0, dryRun ? 20 : 20)) {
    console.log(`  ${dryRun ? "WOULD INSERT" : "INSERTED"} #${o.shipId ?? "?"} ${relative(BUILTIN_DIR, o.file)}`);
  }
  if (inserted.length > 20) {
    console.log(`  ... and ${inserted.length - 20} more`);
  }

  if (dryRun && inserted.length > 0) {
    console.log("\nDry run only — nothing was uploaded or inserted.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
