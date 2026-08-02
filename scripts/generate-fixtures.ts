import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  cliEval,
  dbInit,
  fileExists,
  FIXTURES_DIR,
  FIXTURE_JSON,
  FIXTURE_PNG,
  FIXTURE_INVALID,
  FIXTURE_SOURCE_SHIP,
  openSession,
  q,
  readText,
  runCli,
  saveBuffer,
  saveText,
  SESSION_ANON,
} from "./qa-lib.ts";

const INVALID_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export async function ensureInvalidPng() {
  if (fileExists(FIXTURE_INVALID)) return;
  await saveBuffer(FIXTURE_INVALID, Buffer.from(INVALID_PNG_BASE64, "base64"));
}

export async function ensureShipPng(force = false) {
  if (!force && fileExists(FIXTURE_PNG)) return;
  const { rows } = await q<{ data: string }>(
    "SELECT data FROM shipdb WHERE id = $1",
    [FIXTURE_SOURCE_SHIP]
  );
  if (rows.length === 0) throw new Error(`fixture source ship ${FIXTURE_SOURCE_SHIP} missing from DB`);
  const url = rows[0].data;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to fetch fixture PNG: ${res.status}`);
  await saveBuffer(FIXTURE_PNG, Buffer.from(new Uint8Array(await res.arrayBuffer())));
}

export async function ensureDecodeJson(force = false) {
  if (!force && fileExists(FIXTURE_JSON) && readText(FIXTURE_JSON).trim().length > 10) {
    return;
  }
  openSession(SESSION_ANON, "http://localhost:8000/decode");
  runCli(["-s=" + SESSION_ANON, "click", 'input[type="file"]']);
  runCli(["-s=" + SESSION_ANON, "upload", FIXTURE_PNG]);
  await sleep(2500);
  const pre = String(
    cliEval(SESSION_ANON, "document.querySelector('pre') ? document.querySelector('pre').textContent : null")
  );
  if (!pre) throw new Error("browser decode produced no output (no <pre>)");
  const parsed = JSON.parse(pre);
  saveText(FIXTURE_JSON, JSON.stringify(parsed, null, 2));
}

export async function ensureFixtures(opts: { force?: boolean } = {}) {
  await dbInit();
  await ensureShipPng(opts.force);
  await ensureInvalidPng();
  await ensureDecodeJson(opts.force);
}

export function fixtureDecoded(): unknown {
  return JSON.parse(readText(FIXTURE_JSON));
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== (b as unknown[]).length) return false;
    return (a as unknown[]).every((v, i) => deepEqual(v, (b as unknown[])[i]));
  }
  if (typeof a === "object") {
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

if (import.meta.main) {
  const force = process.argv.includes("--force");
  ensureFixtures({ force })
    .then(() => {
      console.log("fixtures ready:", FIXTURES_DIR);
      process.exit(0);
    })
    .catch((e) => {
      console.error("fixture generation failed:", e);
      process.exit(1);
    });
}
