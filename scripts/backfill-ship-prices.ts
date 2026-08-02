import { fetchAll } from "../src/lib/db";
import { decodeShipFromUrl, decodeShipFromPixels } from "../src/lib/server-decode";
import { calculateShipPrice } from "../src/lib/price";
import { extractUserTags } from "../src/lib/user-tag-data";
import { partsResources } from "../src/lib/part-data";

const VALID_PART_IDS = new Set(partsResources.map((p) => p.ID));

const CONCURRENCY = 5;
const RETRIES = 1;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : 0;

interface Row {
  id: number;
  data: string;
  price: number;
  crew: number;
  tags: string[];
}

interface Outcome {
  id: number;
  ok: boolean;
  changed?: boolean;
  skipped?: boolean;
  skipReason?: string;
  oldPrice?: number;
  newPrice?: number;
  oldCrew?: number;
  newCrew?: number;
  oldTags?: string[];
  newTags?: string[];
  error?: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string): Promise<ReturnType<typeof decodeShipFromUrl>> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      return await decodeShipFromUrl(url);
    } catch (e) {
      lastErr = e;
      await sleep(500 * (attempt + 1));
    }
  }
  throw lastErr;
}

async function processRow(row: Row): Promise<Outcome> {
  try {
    const imageData = await fetchWithRetry(row.data);
    const shipData = decodeShipFromPixels(imageData) as { Parts?: Array<{ ID: string }> };
    const info = calculateShipPrice(shipData as Parameters<typeof calculateShipPrice>[0]);

    const unknownParts = [...new Set((shipData.Parts ?? []).map((p) => p.ID).filter((id) => !VALID_PART_IDS.has(id)))];
    if (unknownParts.length > 0) {
      return {
        id: row.id,
        ok: true,
        changed: false,
        skipped: true,
        skipReason: `mod/unknown parts: ${unknownParts.join(", ")}`,
      };
    }

    const { userTags } = extractUserTags(row.tags ?? []);
    const newTags = [...new Set([...info.tags, ...userTags])].sort();
    const oldTags = [...(row.tags ?? [])].sort();

    const changed =
      info.price !== row.price ||
      info.crew !== row.crew ||
      newTags.join("\u0000") !== oldTags.join("\u0000");

    if (changed && !dryRun) {
      await fetchAll("UPDATE shipdb SET price=$1, crew=$2, tags=$3::text[] WHERE id=$4", [
        info.price,
        info.crew,
        newTags,
        row.id,
      ]);
    }

    return {
      id: row.id,
      ok: true,
      changed,
      oldPrice: row.price,
      newPrice: info.price,
      oldCrew: row.crew,
      newCrew: info.crew,
      oldTags,
      newTags,
    };
  } catch (e) {
    return { id: row.id, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  const rows = (await fetchAll("SELECT id, data, price, crew, tags FROM shipdb")) as Row[];
  const target = limit > 0 ? rows.slice(0, limit) : rows;

  console.log(`Backfill ${dryRun ? "(DRY RUN, no writes)" : ""} for ${target.length} of ${rows.length} ships`);
  if (limit > 0) console.log(`  limited to first ${limit} rows`);

  const outcomes: Outcome[] = [];
  let next = 0;
  async function worker() {
    while (next < target.length) {
      const idx = next++;
      outcomes.push(await processRow(target[idx]));
    }
  }
  const workers = Array.from({ length: Math.min(CONCURRENCY, target.length) }, () => worker());
  await Promise.all(workers);

  const updated = outcomes.filter((o) => o.ok && o.changed);
  const skipped = outcomes.filter((o) => o.ok && o.skipped);
  const failed = outcomes.filter((o) => !o.ok);

  console.log(
    `\nChanged: ${updated.length}, Skipped (mod/unknown parts): ${skipped.length}, Failed: ${failed.length}, Unchanged: ${outcomes.length - updated.length - skipped.length - failed.length}\n`
  );

  for (const o of updated) {
    const tagDelta =
      (o.oldTags ?? []).join(",") !== (o.newTags ?? []).join(",")
        ? ` tags: [${(o.oldTags ?? []).join(", ")}] -> [${(o.newTags ?? []).join(", ")}]`
        : "";
    console.log(
      `  #${o.id}: price ${o.oldPrice} -> ${o.newPrice} | crew ${o.oldCrew} -> ${o.newCrew}${tagDelta}`
    );
  }

  for (const o of skipped) {
    console.log(`  #${o.id}: SKIPPED (${o.skipReason})`);
  }

  for (const o of failed) {
    console.log(`  #${o.id}: FAILED ${o.error}`);
  }

  if (dryRun && updated.length > 0) {
    console.log("\nDry run only — no rows were updated.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
