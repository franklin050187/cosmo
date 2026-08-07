import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

export const ROOT = resolve(import.meta.dirname, "..");
export const QA_PROFILE = resolve(ROOT, ".qa/brave-profile");
export const OUTPUT_DIR = resolve(ROOT, ".qa/output/qa-suite");
export const FIXTURES_DIR = resolve(ROOT, "scripts/qa-fixtures");

export const FIXTURE_PNG = resolve(FIXTURES_DIR, "valid-ship.ship.png");
export const FIXTURE_JSON = resolve(FIXTURES_DIR, "valid-ship.json");
export const FIXTURE_REPLACE_PNG = resolve(FIXTURES_DIR, "replace-ship.ship.png");
export const FIXTURE_INVALID = resolve(FIXTURES_DIR, "invalid.png");

export const SESSION_QA = "qa";
export const SESSION_ANON = "anon";

/**
 * Anonymous QA events get a deterministic `anon_id` because the suite always
 * runs from the same loopback IP with the same browser User-Agent and the
 * default ANALYTICS_ANON_SALT: the server derives
 * sha256(`::1|<UA>|cosmo-anon-v1`).slice(0,16), which equals QA_ANON_ID below.
 * The analytics dashboard excludes it via ANALYTICS_EXCLUDE_ANON_IDS.
 *
 * If the browser's User-Agent changes (browser update), `qa-anon-id-check`
 * rows stop matching QA_ANON_ID and P4-N2 fails loudly — update this constant
 * and the .env ANALYTICS_EXCLUDE_ANON_IDS value together.
 *
 * NOTE: do not pin the anon session to a `--device` emulation to force a
 * fixed UA — Cloudflare Turnstile stops auto-solving on the emulated context
 * and P2-G2 (anon admin gate) times out.
 */
export const QA_ANON_ID = "701be3030a345fca";

export const PONEY_USER = "poney5850#0";
export const PONEY_ID = "439514586778042369";
export const FIXTURE_SOURCE_SHIP = 1624;
export const REPLACE_SOURCE_SHIP = 2401;
export const OTHER_SHIP_ID = 61;
export const OTHER_COLLECTION_ID = 8;
export const BOGUS_SHIP_ID = 999999999;
export const BOGUS_COLLECTION_ID = 999999999;

export interface CaseResult {
  id: string;
  name: string;
  pass: boolean;
  detail: string;
  ms: number;
}
export const results: CaseResult[] = [];

export function runCli(args: string[]): string {
  const res = spawnSync("playwright-cli", args, {
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(
      `playwright-cli ${args.join(" ")} failed (${res.status}): ${(res.stderr || res.stdout || "").slice(0, 800)}`
    );
  }
  return res.stdout.replace(/\0/g, "");
}

export function openSession(session: string, url: string) {
  const args = ["-s=" + session, "open", url];
  if (session === SESSION_QA) {
    args.push("--persistent", "--profile=" + QA_PROFILE);
  }
  return runCli(args);
}

function extractResult(out: string): string {
  const marker = "### Result\n";
  const start = out.indexOf(marker);
  if (start < 0) throw new Error("eval output missing Result marker: " + out.slice(0, 600));
  let body = out.slice(start + marker.length);
  const end = body.indexOf("\n### Ran Playwright code");
  if (end >= 0) body = body.slice(0, end);
  return body.trim();
}

export function cliEval(session: string, expr: string): unknown {
  const out = runCli(["-s=" + session, "eval", expr]);
  const raw = extractResult(out);
  if (raw === "undefined") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`eval result not JSON (${raw.slice(0, 300)})`);
  }
}

export async function httpFetch(
  session: string,
  url: string,
  opts?: { method?: string; body?: string; headers?: Record<string, string> }
): Promise<{ status: number; body: unknown }> {
  const { method = "GET", body, headers = {} } = opts ?? {};
  const expr = `fetch(${JSON.stringify(url)}, ${JSON.stringify({
    method,
    body,
    headers,
    credentials: "include",
  })}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))`;
  return (await cliEval(session, expr)) as { status: number; body: unknown };
}

export function pageUrl(session: string): string {
  return String(cliEval(session, "window.location.href"));
}

export function pageText(session: string): string {
  return String(cliEval(session, "document.body.innerText"));
}

export async function waitFor(
  session: string,
  expr: string,
  timeoutMs = 20000,
  interval = 600
): Promise<unknown> {
  const t0 = Date.now();
  let lastErr: unknown;
  while (Date.now() - t0 < timeoutMs) {
    try {
      const v = cliEval(session, expr);
      if (v) return v;
    } catch (e) {
      lastErr = e;
    }
    await sleep(interval);
  }
  throw new Error(`waitFor timeout: ${expr}${lastErr ? " (last: " + String(lastErr).slice(0, 200) + ")" : ""}`);
}

export function prepTurnstile(session: string) {
  return cliEval(
    session,
    `(() => {
      const TOKEN = "qa-dev-token";
      const patchRender = (render) => {
        if (render && render._qaPatched) return render;
        const wrapped = (container, opts) => {
          setTimeout(() => { try { if (opts && typeof opts.callback === "function") opts.callback(TOKEN); } catch (e) {} }, 0);
          return "qa-widget-id";
        };
        wrapped._qaPatched = true;
        return wrapped;
      };
      try {
        if (!window.turnstile) {
          let cur = { render: patchRender(null), getResponse: () => TOKEN, reset: () => {}, remove: () => {} };
          Object.defineProperty(window, "turnstile", {
            configurable: true,
            get: () => cur,
            set: (v) => { cur = Object.assign({}, v, { render: patchRender(v && v.render), getResponse: () => TOKEN, reset: () => {}, remove: () => {} }); },
          });
        } else {
          const t = window.turnstile;
          t.render = patchRender(t.render);
          t.getResponse = () => TOKEN;
          t.reset = t.reset || (() => {});
          t.remove = t.remove || (() => {});
        }
      } catch (e) {
        if (window.turnstile) {
          window.turnstile.getResponse = () => TOKEN;
        }
      }
      return "prepped";
    })()`
  );
}

export async function stubConfirm(session: string) {
  await cliEval(
    session,
    `(() => { window.confirm = () => true; window.__qaConfirmStubbed = true; return "stubbed"; })()`
  );
}

export function chooseFile(session: string, filePath: string) {
  runCli(["-s=" + session, "click", "label:has(input[type=file])"]);
  runCli(["-s=" + session, "upload", filePath]);
}

export async function check(
  id: string,
  name: string,
  fn: () => Promise<void> | void
): Promise<boolean> {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ id, name, pass: true, detail: "ok", ms: Date.now() - t0 });
    console.log(`\x1b[32m[PASS]\x1b[0m ${id} — ${name} (${Date.now() - t0}ms)`);
    return true;
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    results.push({ id, name, pass: false, detail, ms: Date.now() - t0 });
    console.log(`\x1b[31m[FAIL]\x1b[0m ${id} — ${name}\n       ${detail.slice(0, 400)}`);
    return false;
  }
}

export function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

// ── DB helpers ────────────────────────────────────────────────────────
import pg from "pg";

let dbClient: pg.Client | null = null;

export async function dbInit() {
  dbClient = new pg.Client({
    host: process.env.POSTGRES_HOST,
    port: parseInt(process.env.POSTGRES_PORT ?? "6543", 10),
    database: process.env.POSTGRES_DATABASE,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });
  await dbClient.connect();
}

export function db(): pg.Client {
  if (!dbClient) throw new Error("db not initialized");
  return dbClient;
}

export async function dbClose() {
  await dbClient?.end();
  dbClient = null;
}

export async function q<T = pg.QueryResultRow>(text: string, params?: unknown[]): Promise<pg.QueryResult<T>> {
  return db().query<T>(text, params);
}

export async function saveText(filePath: string, content: string) {
  mkdirSync(resolve(filePath, ".."), { recursive: true });
  writeFileSync(filePath, content);
}

export async function saveBuffer(filePath: string, content: Uint8Array | Buffer) {
  mkdirSync(resolve(filePath, ".."), { recursive: true });
  writeFileSync(filePath, content);
}

export function readText(filePath: string): string {
  return readFileSync(filePath, "utf8");
}

export function fileExists(filePath: string): boolean {
  return existsSync(filePath);
}

export function summary(): { passed: number; failed: number } {
  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  console.log("\n═══════════════════════════════════════════════");
  console.log(`Results: ${results.length} cases — ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\nFailed cases:");
    for (const r of results.filter((r) => !r.pass)) {
      console.log(`  [FAIL] ${r.id} — ${r.name}: ${r.detail.slice(0, 300)}`);
    }
  }
  console.log("═══════════════════════════════════════════════");
  return { passed, failed };
}
