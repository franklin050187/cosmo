// Focused test for P3-S6 (replace) + P3-S10 (delete) flow
// Run: cd /home/johnn/cosmo && node --env-file=.env --no-warnings scripts/qa-replace-delete.ts

import {
  spawnSync,
} from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import {
  openSession,
  cliEval,
  runCli,
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
    "SELECT id, ship_name, author, data, description FROM shipdb WHERE id = $1",
    [id]
  );
  return rows[0] || null;
}

async function hostedStatus(url) {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "manual" });
    return res.status;
  } catch {
    return 0;
  }
}

async function waitText(session, text, timeout = 30000) {
  await waitFor(
    session,
    `document.body.innerText.toLowerCase().includes("${text.toLowerCase()}")`,
    timeout
  );
}

async function setInput(session, selector, value) {
  runCli(["-s=" + session, "fill", selector, value]);
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
  // Ack duplicate checkbox if present
  cliEval(
    session,
    `(() => {
      const l = [...document.querySelectorAll('label')].find(x => /still want to upload/i.test(x.textContent));
      if (l) { const c = l.querySelector('input[type=checkbox]'); if (c) c.click(); return 'acked'; }
      return 'none';
    })()`
  );
  await sleep(400);
  // Try "Upload Anyway" first (duplicate case), then fall back to "Upload to Library"
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
    console.log("═══ FOCUSED REPLACE + DELETE TEST ═══\n");

    // Step 1: Upload a ship
    console.log("[1/4] Uploading ship...");
    openSession(S, HOME + "/upload");
    await waitText(S, "Upload a Ship", 30000);
    prepTurnstile(S);
    chooseFile(S, FIXTURE_PNG);
    await waitText(S, "Price:", 60000);
    await clickUpload(S);
    
    // Debug: what's on the page after clicking upload?
    await sleep(5000);
    const afterUpload = await cliEval(S, `document.body.innerText.slice(0, 800)`);
    console.log(`       after upload click: ${afterUpload}`);
    
    await waitText(S, "Ship uploaded successfully!", 90000);

    // Extract ship ID from "View Ship" link
    const href = String(
      cliEval(
        S,
        `(() => { const a = [...document.querySelectorAll('a')].find(x => x.textContent.trim() === 'View Ship'); return a ? a.getAttribute('href') : null; })()`
      )
    );
    console.log(`       View Ship href=${href}`);
    shipId = parseInt(href.split("/").pop(), 10);
    console.log(`       ship id=${shipId}`);

    const row1 = await getShipRow(shipId);
    console.log(`       ship_name=${row1?.ship_name}, author=${row1?.author}`);

    // Step 2: Replace ship image
    console.log("\n[2/4] Replacing ship image...");
    openSession(S, HOME + `/ship/${shipId}/edit`);
    await waitText(S, "Edit Ship", 30000);
    await clickBtn(S, "Replace Ship");
    chooseFile(S, FIXTURE_REPLACE_PNG);
    await waitText(S, "Confirm Replace", 40000);
    await clickBtn(S, "Confirm Replace");

    // Wait for navigation back to ship detail
    await waitFor(S, `window.location.pathname === "/ship/${shipId}"`, 30000);
    console.log("       navigated to ship detail");

    // Debug: what does the page show?
    const bodyText = await cliEval(S, `document.body.innerText.slice(0, 500)`);
    console.log(`       page text (first 500): ${bodyText}`);
    console.log(`       URL: ${await cliEval(S, `window.location.href`)}`);

    // Check DB directly
    const row2 = await getShipRow(shipId);
    console.log(`       DB ship_name=${row2?.ship_name}, data changed=${row2?.data !== row1?.data}`);

    // Try to see "replace-ship" on page
    try {
      await waitText(S, "replace-ship", 15000);
      console.log("       OK: 'replace-ship' found on page!");
    } catch (e) {
      console.log(`       FAIL: 'replace-ship' NOT found on page`);
      console.log(`       DB says ship_name=${row2?.ship_name}`);

      // Try a hard reload
      console.log("       attempting hard reload...");
      await cliEval(S, `window.location.reload()`);
      await sleep(5000);

      const bodyText2 = await cliEval(S, `document.body.innerText.slice(0, 500)`);
      console.log(`       after reload text (first 500): ${bodyText2}`);

      try {
        await waitText(S, "replace-ship", 15000);
        console.log("       OK: 'replace-ship' found after reload!");
      } catch (e2) {
        console.log(`       FAIL: still not found after reload`);
      }
    }

    // Step 3: Delete ship
    console.log("\n[3/4] Deleting ship...");
    openSession(S, HOME + `/ship/${shipId}`);
    await sleep(3000);

    // Stub confirm dialog
    await cliEval(S, `window.confirm = () => true`);
    await clickBtn(S, "Delete");
    await waitFor(S, `window.location.pathname === "/"`, 20000);

    // Verify DB
    const row3 = await getShipRow(shipId);
    console.log(`       DB row after delete: ${row3 === null ? "null (good)" : "still exists (bad)"}`);

    console.log("\n═══ TEST COMPLETE ═══");
  } catch (e) {
    console.error("Test failed:", e);
  } finally {
    // Cleanup
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
