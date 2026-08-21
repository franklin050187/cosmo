import {
  openSession,
  runCli,
  waitFor,
  pageTextAsync,
  closeSession,
  cliEval,
} from "./qa-lib";
import { getPool } from "../src/lib/db/core";

const S = "qa";
const HOME = "http://localhost:8000";
const SHIP = process.argv[2] ? parseInt(process.argv[2], 10) : 2519;

async function waitText(session: string, text: string, timeoutMs = 25000) {
  return waitFor(
    session,
    `document.body.innerText.toLowerCase().includes(${JSON.stringify(text.toLowerCase())})`,
    timeoutMs
  );
}

async function clickBtn(session: string, text: string) {
  runCli(["-s=" + session, "click", `button:has-text("${text}")`]);
}

async function setInput(session: string, selector: string, value: string) {
  cliEval(session, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return "missing"; const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; setter.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); return "set"; })()`);
}

async function main() {
  const pool = getPool();
  console.log("=== S5 simulation: rename dance on ship", SHIP);
  openSession(S, `${HOME}/ship/${SHIP}/edit`);
  await waitText(S, "Edit Ship");
  await setInput(S, "input[type=text]", "QA-EDITED-valid-ship");
  await clickBtn(S, "Save Changes");
  await waitText(S, "updated", 20000).catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));
  let row = await pool.query("SELECT ship_name FROM shipdb WHERE id=$1", [SHIP]);
  console.log("after rename:", row.rows[0]);

  await setInput(S, "input[type=text]", "valid-ship");
  await clickBtn(S, "Save Changes");
  await new Promise((r) => setTimeout(r, 1500));
  row = await pool.query("SELECT ship_name FROM shipdb WHERE id=$1", [SHIP]);
  console.log("after revert:", row.rows[0]);

  console.log("=== S6 simulation: replace WITHOUT reloading edit page");
  // NOTE: suite does openSession(same URL) here — we are already ON the edit page
  openSession(S, `${HOME}/ship/${SHIP}/edit`);
  await waitText(S, "Edit Ship");
  await clickBtn(S, "Replace Ship");
  runCli(["-s=" + S, "upload", "scripts/qa-fixtures/replace-ship.ship.png"]).catch?.(() => {});
  await waitText(S, "Confirm Replace", 40000);
  console.log("confirm dialog visible");
  await clickBtn(S, "Confirm Replace");
  await waitFor(S, `window.location.pathname === "/ship/${SHIP}"`, 30000);
  for (const w of [500, 2000, 5000]) {
    await new Promise((r) => setTimeout(r, w));
    const txt = await pageTextAsync(S);
    console.log(`+${w}ms name-on-page:`, JSON.stringify((txt.match(/REPLACE-SHIP|valid-ship|QA-EDITED/i) || ["?"])[0]));
  }
  const fin = await pool.query("SELECT ship_name FROM shipdb WHERE id=$1", [SHIP]);
  console.log("db final:", fin.rows[0]);
  await closeSession(S);
  await pool.end();
}
main().catch((e) => {
  console.error("REPRO ERROR:", e.message);
  process.exitCode = 1;
});
