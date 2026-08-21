// Debug: after replace, compare server HTML vs browser-rendered text
// Run: cd /home/johnn/cosmo && node --env-file=.env --no-warnings scripts/qa-debug-replace.ts

import {
  spawnSync,
} from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import {
  openSession,
  cliEval,
  SESSION_QA,
  FIXTURE_PNG,
  FIXTURE_REPLACE_PNG,
  waitFor,
  prepTurnstile,
  chooseFile,
  dbInit,
  dbClose,
  q,
} from "./qa-lib.ts";

const HOME = "http://localhost:8000";
const S = SESSION_QA;

async function getShipRow(id) {
  const { rows } = await q(
    "SELECT id, ship_name, data FROM shipdb WHERE id = $1",
    [id]
  );
  return rows[0] || null;
}

async function waitText(session, text, timeout = 30000) {
  await waitFor(
    session,
    `document.body.innerText.toLowerCase().includes("${text.toLowerCase()}")`,
    timeout
  );
}

async function clickBtn(session, text) {
  await cliEval(
    session,
    `(() => {
      const btn = [...document.querySelectorAll('button')].find(x => x.textContent.includes('${text}'));
      if (btn) btn.click();
    })()`
  );
}

async function clickUpload(session) {
  cliEval(
    session,
    `(() => {
      const l = [...document.querySelectorAll('label')].find(x => /still want to upload/i.test(x.textContent));
      if (l) { const c = l.querySelector('input[type=checkbox]'); if (c) c.click(); return 'acked'; }
      return 'none';
    })()`
  );
  await sleep(400);
  try {
    await clickBtn(session, "Upload Anyway");
  } catch {
    await clickBtn(session, "Upload to Library");
  }
}

async function main() {
  await dbInit();
  let shipId = 0;
  try {
    // Upload
    openSession(S, HOME + "/upload");
    await waitText(S, "Upload a Ship", 30000);
    prepTurnstile(S);
    chooseFile(S, FIXTURE_PNG);
    await waitText(S, "Price:", 60000);
    await clickUpload(S);
    await waitText(S, "Ship uploaded successfully!", 90000);
    const href = String(
      cliEval(
        S,
        `(() => { const a = [...document.querySelectorAll('a')].find(x => x.textContent.trim() === 'View Ship'); return a ? a.getAttribute('href') : null; })()`
      )
    );
    shipId = parseInt(href.split("/").pop(), 10);
    console.log(`ship id=${shipId}`);

    // Replace (like P3-S6)
    openSession(S, HOME + `/ship/${shipId}/edit`);
    await waitText(S, "Edit Ship", 30000);
    await clickBtn(S, "Replace Ship");
    chooseFile(S, FIXTURE_REPLACE_PNG);
    await waitText(S, "Confirm Replace", 40000);
    await clickBtn(S, "Confirm Replace");

    // Watch pathname and browser text over time
    console.log("\nWatching navigation...");
    let sawReplace = false;
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      const url = await cliEval(S, `window.location.href`);
      const title = await cliEval(S, `document.title`);
      const hasReplace = await cliEval(S, `document.body.innerText.toLowerCase().includes('replace-ship')`);
      const hasValid = await cliEval(S, `document.body.innerText.toLowerCase().includes('valid-ship')`);
      const textStart = await cliEval(S, `document.body.innerText.slice(0, 100).replace(/\\n/g, ' | ')`);
      console.log(`t+${i}s url=${url}`);
      console.log(`        title="${title}" replace=${hasReplace} valid=${hasValid}`);
      console.log(`        text: ${textStart}`);
      const row = await getShipRow(shipId);
      console.log(`        DB: ${row?.ship_name}`);
      if (hasReplace) { sawReplace = true; break; }
    }
    console.log(`sawReplace=${sawReplace}`);

    // Server-side raw HTML check (no browser cache)
    console.log("\nServer HTML check (Node fetch):");
    const res = await fetch(`${HOME}/ship/${shipId}?_r=${Date.now()}`, {
      headers: { "Cookie": "" },
    });
    const html = await res.text();
    console.log(`status=${res.status}`);
    console.log(`has "replace-ship"=${html.includes("replace-ship")}`);
    console.log(`has "valid-ship"=${html.includes("valid-ship")}`);

  } catch (e) {
    console.error("ERROR:", e);
  } finally {
    if (shipId) {
      try {
        await q("DELETE FROM ship_signatures WHERE ship_id = $1", [shipId]);
        await q("DELETE FROM shipdb WHERE id = $1", [shipId]);
        console.log(`\nCleaned up ship ${shipId}`);
      } catch {}
    }
    spawnSync("playwright-cli", ["kill", S], { encoding: "utf8", stdio: "ignore" });
    spawnSync("playwright-cli", ["kill-all"], { encoding: "utf8", stdio: "ignore" });
    await dbClose();
  }
}

main();