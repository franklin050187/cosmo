import { setTimeout as sleep } from "node:timers/promises";
import {
  assert,
  check,
  chooseFile,
  cliEval,
  dbClose,
  dbInit,
  FIXTURE_INVALID,
  FIXTURE_PNG,
  httpFetch,
  openSession,
  pageText,
  pageUrl,
  prepTurnstile,
  q,
  runCli,
  SESSION_ANON,
  SESSION_QA,
  stubConfirm,
  summary,
  waitFor,
  BOGUS_COLLECTION_ID,
  BOGUS_SHIP_ID,
  OTHER_COLLECTION_ID,
  OTHER_SHIP_ID,
  PONEY_ID,
  PONEY_USER,
} from "./qa-lib.ts";
import { deepEqual, ensureFixtures, fixtureDecoded } from "./generate-fixtures.ts";

const S = SESSION_QA;
const A = SESSION_ANON;

const HOME = "http://localhost:8000";

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

// Click the upload panel's primary action, handling the duplicate-acknowledge
// checkbox (the fixture may match an existing/builtin ship, in which case the
// button reads "Upload Anyway" and only enables after the checkbox is ticked).
async function clickUpload(session: string) {
  cliEval(
    session,
    `(() => {
      const l = [...document.querySelectorAll('label')].find(x => /still want to upload/i.test(x.textContent));
      if (l) { const c = l.querySelector('input[type=checkbox]'); if (c) c.click(); return 'acked'; }
      return 'none';
    })()`
  );
  await sleep(400);
  let label = "Upload to Library";
  try {
    label = String(
      cliEval(
        session,
        `(() => { const b = [...document.querySelectorAll('button')].find(x => /Upload/i.test(x.textContent)); return b ? b.textContent.trim() : 'Upload to Library'; })()`
      )
    );
  } catch {
    label = "Upload to Library";
  }
  const ok = label.includes("Upload Anyway") ? "Upload Anyway" : "Upload to Library";
  try {
    await clickBtn(session, ok);
  } catch {
    await clickBtn(session, "Upload to Library");
  }
}

async function setInput(session: string, selector: string, value: string) {
  const r = await cliEval(
    session,
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return "missing";
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return "set";
    })()`
  );
  assert(r === "set", `input not found: ${selector}`);
}

async function hostedStatus(url: string): Promise<number> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.status;
  } catch {
    return 0;
  }
}

async function getShipRow(id: number) {
  const { rows } = await q<Record<string, unknown>>("SELECT * FROM shipdb WHERE id = $1", [id]);
  return rows[0] ?? null;
}

async function poneyFavoriteIds(): Promise<number[]> {
  const { rows } = await q<{ favorite: number[] }>(
    "SELECT favorite FROM favoritedb WHERE discord_id = $1 OR name = $2",
    [PONEY_ID, PONEY_USER]
  );
  return rows[0]?.favorite ?? [];
}

// ══════════════════════════════════════════════════════════════════════
// PHASE 1 — LOGGED IN: add the ship first
// ══════════════════════════════════════════════════════════════════════
async function phase1(scratch: { shipId: number; ufsUrl: string }) {
  console.log("\n── PHASE 1: LOGGED IN (add ship first) ──");

  await check("P1-U1", "Header shows poney5850#0 with user menu (My Ships/Favorites/Collections/Analytics/Logout)", async () => {
    openSession(S, HOME + "/");
    await waitText(S, "poney5850#0");
    await clickBtn(S, "poney5850#0");
    await waitFor(S, "document.body.innerText.includes('My Ships')");
    const text = pageText(S);
    for (const item of ["My Ships", "My Favorites", "My Collections", "Analytics", "Logout"]) {
      assert(text.includes(item), `menu missing: ${item}`);
    }
  });

  const { rows: dbShips } = await q<{ n: string }>(
    "SELECT count(*)::text n FROM shipdb WHERE discord_id = $1 OR submitted_by = $2",
    [PONEY_ID, PONEY_USER]
  );

  await check("P1-U2a", `My Ships lists all ${dbShips[0].n} ships`, async () => {
    openSession(S, HOME + "/my-ships");
    await waitText(S, "You have uploaded");
    const text = pageText(S);
    const m = text.match(/You have uploaded (\d+) ships?/);
    assert(m, "my-ships count line missing");
    assert(parseInt(m[1], 10) === parseInt(dbShips[0].n, 10), `displayed ${m[1]}, db ${dbShips[0].n}`);
  });

  const { rows: favRows } = await q<{ n: string }>(
    "SELECT array_length(favorite, 1)::text n FROM favoritedb WHERE discord_id = $1 OR name = $2",
    [PONEY_ID, PONEY_USER]
  );

  await check("P1-U2b", "Favorites page lists current favorites", async () => {
    openSession(S, HOME + "/favorites");
    await waitText(S, "favorite ship");
    const text = pageText(S);
    const m = text.match(/You have (\d+) favorite ships?/);
    assert(m, "favorites count line missing");
    assert(parseInt(m[1], 10) === parseInt(favRows[0]?.n ?? "0", 10), `displayed ${m[1]}`);
  });

  const { rows: dbColls } = await q<{ n: string }>(
    "SELECT count(*)::text n FROM collections WHERE owner = $1 OR discord_id = $2",
    [PONEY_USER, PONEY_ID]
  );

  await check("P1-U2c", `My Collections lists ${dbColls[0].n} collections`, async () => {
    openSession(S, HOME + "/my-collections");
    await waitText(S, "collection");
    const text = pageText(S);
    const m = text.match(/You have (\d+) collections?/);
    assert(m, "collections count line missing");
    assert(parseInt(m[1], 10) === parseInt(dbColls[0].n, 10), `displayed ${m[1]}`);
  });

  await check("P1-U3", "Admin dashboard loads for admin (analytics)", async () => {
    openSession(S, HOME + "/admin");
    await waitText(S, "Complete the captcha");
    prepTurnstile(S);
    await waitFor(S, "document.body.innerText.includes('Analytics Dashboard')", 30000);
    assert(pageText(S).includes("Total Events"), "no summary cards");
    const res = await httpFetch(S, "/api/analytics/dashboard");
    assert(res.status === 200, `dashboard api status ${res.status}`);
  });

  await check("P1-U4", "Upload valid ship: decode panel (Author/Price/Crew/Tags)", async () => {
    openSession(S, HOME + "/upload");
    prepTurnstile(S);
    await waitText(S, "Upload a Ship");
    chooseFile(S, FIXTURE_PNG);
    await waitText(S, "Price:", 60000);
    const text = pageText(S);
    for (const label of ["Author:", "Price:", "Crew:", "Tags:"]) {
      assert(text.includes(label), `decode panel missing: ${label}`);
    }
  });

  await check("P1-U5", "Submit valid ship (self-create) → success, DB row, image hosted", async () => {
    prepTurnstile(S);
    await clickUpload(S);
    await waitText(S, "Ship uploaded successfully!", 90000);
    const href = String(
      cliEval(
        S,
        `(() => { const a = [...document.querySelectorAll('a')].find(x => x.textContent.trim() === 'View Ship'); return a ? a.getAttribute('href') : null; })()`
      )
    );
    assert(href && /^\/ship\/\d+$/.test(href), `View Ship link missing, got ${href}`);
    scratch.shipId = parseInt(href.split("/").pop() as string, 10);

    const row = await getShipRow(scratch.shipId);
    assert(row, `shipdb row ${scratch.shipId} missing`);
    assert(row.submitted_by === PONEY_USER, `submitted_by=${row.submitted_by}`);
    assert(row.discord_id === PONEY_ID, `discord_id=${row.discord_id}`);
    assert(row.ship_name === "valid-ship", `ship_name=${row.ship_name}`);
    assert(String(row.data).startsWith("https://"), `data=${String(row.data).slice(0, 60)}`);
    scratch.ufsUrl = String(row.data);

    const { rows: sigs } = await q<{ signature: string }>(
      "SELECT signature FROM ship_signatures WHERE ship_id = $1",
      [scratch.shipId]
    );
    assert(sigs.length === 1, "ship_signatures row missing");
    assert(sigs[0].signature.length > 0, "empty signature");

    const st = await hostedStatus(scratch.ufsUrl);
    assert(st === 200, `hosted image status ${st}`);
    console.log(`       scratch ship id=${scratch.shipId} ufsUrl=${scratch.ufsUrl.slice(0, 70)}…`);
  });

  await check("P1-U6", "Duplicate warning for self-created blueprint + ack enables upload", async () => {
    openSession(S, HOME + "/upload");
    await waitText(S, "Click to select a ship PNG");
    chooseFile(S, FIXTURE_PNG);
    await waitText(S, "This ship already exists in the library:", 60000);
    const disabledBefore = cliEval(
      S,
      `(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('Upload Anyway')); return b ? b.disabled : null; })()`
    );
    assert(disabledBefore === true, "Upload Anyway should be disabled before ack");
    cliEval(S, `(() => { const c = document.querySelector('input[type=checkbox]'); if (c) { c.click(); return 'clicked'; } return 'none'; })()`);
    await sleep(400);
    const disabledAfter = cliEval(
      S,
      `(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('Upload Anyway')); return b ? b.disabled : null; })()`
    );
    assert(disabledAfter === false, "Upload Anyway should be enabled after ack");
  });

  await check("P1-U7", "Invalid file rejected with decode error", async () => {
    openSession(S, HOME + "/upload");
    await waitText(S, "Click to select a ship PNG");
    chooseFile(S, FIXTURE_INVALID);
    await waitText(S, "Failed to decode ship data from image", 20000);
  });
}

// ══════════════════════════════════════════════════════════════════════
// PHASE 2 — ANONYMOUS: gates + public decode
// ══════════════════════════════════════════════════════════════════════
async function phase2(scratch: { shipId: number }) {
  console.log("\n── PHASE 2: ANONYMOUS (gates + public decode) ──");

  const gatedRoutes: [string, string][] = [
    ["/upload", "Upload"],
    ["/my-ships", "My Ships"],
    ["/favorites", "Favorites"],
    ["/my-collections", "My Collections"],
    ["/collections/new", "New Collection"],
  ];
  for (const [route, label] of gatedRoutes) {
    await check(`P2-G1:${label}`, `Login required on ${route}`, async () => {
      openSession(A, HOME + route);
      await waitText(A, "Login Required", 20000);
      assert(pageText(A).includes("Login with Discord"), "no Discord login link");
    });
  }

  await check("P2-G2", "Analytics dashboard gated for anonymous (403 + no data leak)", async () => {
    const res = await httpFetch(A, "/api/analytics/dashboard");
    assert(res.status === 403, `dashboard api status ${res.status}`);
    openSession(A, HOME + "/admin");
    await waitText(A, "Complete the captcha");
    prepTurnstile(A);
    await waitFor(
      A,
      `document.body.innerText.toLowerCase().includes("not logged in") || window.location.pathname === "/"`,
      15000
    );
    assert(!pageText(A).includes("Total Events"), "dashboard data leaked to anon");
  });

  await check("P2-G3", `Ship edit (${scratch.shipId}) redirects anonymous to home`, async () => {
    openSession(A, HOME + `/ship/${scratch.shipId}/edit`);
    await waitFor(A, `window.location.pathname === "/"`, 15000);
  });

  await check("P2-G4", `PUT/DELETE ship/${scratch.shipId} return 401 anonymous`, async () => {
    const put = await httpFetch(A, `/api/ship/${scratch.shipId}`, {
      method: "PUT",
      body: "{}",
      headers: { "Content-Type": "application/json" },
    });
    assert(put.status === 401, `PUT status ${put.status}`);
    const del = await httpFetch(A, `/api/ship/${scratch.shipId}`, { method: "DELETE" });
    assert(del.status === 401, `DELETE status ${del.status}`);
  });

  await check("P2-G5", "Upload/replace endpoints reject anonymous", async () => {
    const uploadthing = await httpFetch(A, "/api/uploadthing", {
      method: "POST",
      body: "{}",
      headers: { "Content-Type": "application/json" },
    });
    assert([400, 401, 403].includes(uploadthing.status), `uploadthing status ${uploadthing.status}`);
    const myShips = await httpFetch(A, "/api/ship/my-ships");
    assert(myShips.status === 401, `my-ships status ${myShips.status}`);
  });

  await check("P2-G6", `Collection edit (${OTHER_COLLECTION_ID}) requires login`, async () => {
    openSession(A, HOME + `/collections/${OTHER_COLLECTION_ID}/edit`);
    await waitText(A, "Login Required", 20000);
  });

  await check("P2-G7", `PUT/DELETE collections/${OTHER_COLLECTION_ID} return 401 anonymous`, async () => {
    const put = await httpFetch(A, `/api/collections/${OTHER_COLLECTION_ID}`, {
      method: "PUT",
      body: "{}",
      headers: { "Content-Type": "application/json" },
    });
    assert(put.status === 401, `PUT status ${put.status}`);
    const del = await httpFetch(A, `/api/collections/${OTHER_COLLECTION_ID}`, { method: "DELETE" });
    assert(del.status === 401, `DELETE status ${del.status}`);
  });

  await check("P2-G8", `Ship detail (${scratch.shipId}) anonymous: no edit/delete, login-to-favorite`, async () => {
    openSession(A, HOME + `/ship/${scratch.shipId}`);
    await waitText(A, "valid-ship");
    const text = pageText(A);
    assert(text.includes("Login to favorite"), "missing login-to-favorite");
    assert(text.includes("Download"), "missing download");
    assert(!text.includes("Delete"), "delete leaked to anon");
    assert(!text.includes("Edit"), "edit leaked to anon");
  });

  await check("P2-G9", "Incorrect/deleted ids show not-found (ship + collection)", async () => {
    const res = await httpFetch(A, `/api/ship/${BOGUS_SHIP_ID}`);
    assert(res.status === 404, `ship api status ${res.status}`);
    openSession(A, HOME + `/ship/${BOGUS_SHIP_ID}`);
    await waitText(A, "Ship not found");

    const cRes = await httpFetch(A, `/api/collections/${BOGUS_COLLECTION_ID}`);
    assert(cRes.status === 404, `collection api status ${cRes.status}`);
    openSession(A, HOME + `/collections/${BOGUS_COLLECTION_ID}`);
    await waitText(A, "Collection not found");
  });

  await check("P2-G10", "auth_error=access_denied shows 'Login was cancelled.'", async () => {
    openSession(A, HOME + "/?auth_error=access_denied");
    await waitText(A, "Login was cancelled.");
  });

  await check("F1", "Decode valid fixture matches expected JSON (valid-ship.json)", async () => {
    openSession(A, HOME + "/decode");
    await waitText(A, "Decode Ship Blueprint");
    runCli(["-s=" + A, "click", 'input[type="file"]']);
    runCli(["-s=" + A, "upload", FIXTURE_PNG]);
    await waitFor(A, "document.querySelector('pre') !== null", 40000);
    const decoded = JSON.parse(
      String(cliEval(A, "document.querySelector('pre').textContent"))
    );
    assert(deepEqual(decoded, fixtureDecoded()), "decoded JSON differs from fixture");
    console.log(`       decode OK — ${JSON.stringify(decoded).length} bytes`);
  });

  await check("F2", "Decode invalid file shows decode error", async () => {
    openSession(A, HOME + "/decode");
    await waitText(A, "Decode Ship Blueprint");
    runCli(["-s=" + A, "click", 'input[type="file"]']);
    runCli(["-s=" + A, "upload", FIXTURE_INVALID]);
    await waitText(A, "Failed to decode ship data from image", 20000);
  });
}

// ══════════════════════════════════════════════════════════════════════
// PHASE 3 — LOGGED IN: edit/update/delete + non-owner gates + collections
// ══════════════════════════════════════════════════════════════════════
async function phase3(scratch: { shipId: number; ufsUrl: string }, coll: { id: number; title: string }) {
  console.log("\n── PHASE 3: LOGGED IN (edit/update/delete + collections) ──");

  await check("P3-S1", "Search/filters find the scratch ship", async () => {
    openSession(S, HOME + "/?q=valid-ship");
    prepTurnstile(S);
    await waitText(S, "valid-ship", 30000);
    const text = pageText(S);
    assert(/Showing[^\n]*\d+/.test(text) || text.includes("valid-ship"), "search results not rendered");
    assert(cliEval(S, `location.search.includes('q=valid-ship')`) === true, "URL missing q param");
  });

  await check("P3-S2", "Ship detail (owner): stats/JSON/price-analysis expand", async () => {
    openSession(S, HOME + `/ship/${scratch.shipId}`);
    prepTurnstile(S);
    await waitText(S, "valid-ship");
    const text = pageText(S);
    for (const item of ["Submitted by", "Cost:", "Crew:", "Edit", "Delete", "☆ Favorite", "Download", "Stats", "JSON", "Price Analysis"]) {
      assert(text.includes(item), `detail missing: ${item}`);
    }
    await clickBtn(S, "Stats");
    await waitText(S, "Mass:");
    await clickBtn(S, "JSON");
    await waitFor(S, "document.querySelectorAll('pre').length > 0", 40000);
    await clickBtn(S, "Price Analysis");
    await waitText(S, "Category", 40000);
  });

  await check("P3-S3", `Non-owner ship (${OTHER_SHIP_ID}) edit redirects + API 403`, async () => {
    openSession(S, HOME + `/ship/${OTHER_SHIP_ID}/edit`);
    await waitFor(S, `window.location.pathname === "/ship/${OTHER_SHIP_ID}"`, 15000);
    const put = await httpFetch(S, `/api/ship/${OTHER_SHIP_ID}`, {
      method: "PUT",
      body: "{}",
      headers: { "Content-Type": "application/json" },
    });
    assert(put.status === 403, `PUT status ${put.status}`);
    const del = await httpFetch(S, `/api/ship/${OTHER_SHIP_ID}`, { method: "DELETE" });
    assert(del.status === 403, `DELETE status ${del.status}`);
  });

  await check("P3-S4", `Non-owner collection (${OTHER_COLLECTION_ID}) edit redirects + API 403`, async () => {
    openSession(S, HOME + `/collections/${OTHER_COLLECTION_ID}/edit`);
    await waitFor(S, `window.location.pathname === "/collections/${OTHER_COLLECTION_ID}"`, 15000);
    const put = await httpFetch(S, `/api/collections/${OTHER_COLLECTION_ID}`, {
      method: "PUT",
      body: JSON.stringify({ title: "hack", "cf-turnstile-response": "t" }),
      headers: { "Content-Type": "application/json" },
    });
    assert(put.status === 403, `PUT status ${put.status}`);
    const del = await httpFetch(S, `/api/collections/${OTHER_COLLECTION_ID}`, { method: "DELETE" });
    assert(del.status === 403, `DELETE status ${del.status}`);
  });

  await check("P3-S5", "Edit scratch ship name → DB updated → reverted via UI", async () => {
    openSession(S, HOME + `/ship/${scratch.shipId}/edit`);
    await waitText(S, "Edit Ship");
    await setInput(S, 'input[type="text"]', "QA-EDITED-valid-ship");
    await clickBtn(S, "Save Changes");
    await waitText(S, "QA-EDITED-valid-ship", 20000);
    let row = await getShipRow(scratch.shipId);
    assert(row?.ship_name === "QA-EDITED-valid-ship", `db ship_name=${row?.ship_name}`);

    openSession(S, HOME + `/ship/${scratch.shipId}/edit`);
    await waitText(S, "Edit Ship");
    await setInput(S, 'input[type="text"]', "valid-ship");
    await clickBtn(S, "Save Changes");
    await waitText(S, "valid-ship", 20000);
    row = await getShipRow(scratch.shipId);
    assert(row?.ship_name === "valid-ship", `db ship_name after revert=${row?.ship_name}`);
  });

  await check("P3-S6", "Replace scratch ship image → data URL swapped, old hosted file gone", async () => {
    const before = (await getShipRow(scratch.shipId))?.data as string;
    openSession(S, HOME + `/ship/${scratch.shipId}/edit`);
    await waitText(S, "Edit Ship");
    await clickBtn(S, "Replace Ship");
    runCli(["-s=" + S, "upload", FIXTURE_PNG]);
    await waitText(S, "Confirm Replace", 40000);
    await clickBtn(S, "Confirm Replace");
    await waitFor(S, `window.location.pathname === "/ship/${scratch.shipId}"`, 30000);
    await waitFor(S, `document.body.innerText.includes("valid-ship")`, 30000);
    const after = (await getShipRow(scratch.shipId))?.data as string;
    assert(after && after !== before, "data URL did not change");
    const oldStatus = await hostedStatus(before);
    const newStatus = await hostedStatus(after);
    assert(oldStatus >= 400, `old hosted file still reachable (${oldStatus})`);
    assert(newStatus === 200, `new hosted file status ${newStatus}`);
    console.log(`       replace: old=${before.slice(0, 60)}… (${oldStatus}) new=${after.slice(0, 60)}… (${newStatus})`);
  });

  await check("P3-S7", "Favorite/unfavorite scratch ship leaves no trace", async () => {
    const before = await poneyFavoriteIds();
    openSession(S, HOME + `/ship/${scratch.shipId}`);
    await waitText(S, "valid-ship");
    await clickBtn(S, "☆ Favorite");
    await waitText(S, "★ Unfavorite");
    let favs = await poneyFavoriteIds();
    assert(favs.includes(scratch.shipId), "favorite not added to DB");
    await clickBtn(S, "★ Unfavorite");
    await waitText(S, "☆ Favorite");
    favs = await poneyFavoriteIds();
    assert(!favs.includes(scratch.shipId), "favorite not removed from DB");
    const { rows } = await q<{ n: string }>(
      "SELECT count(*)::text n FROM favoritedb WHERE discord_id = $1 AND array_length(favorite,1) IS NULL",
      [PONEY_ID]
    );
    assert(rows[0].n === "0", "orphaned empty favoritedb row");
    assert(before.length === (await poneyFavoriteIds()).length, "favorite array length changed");
  });

  await check("P3-S8", "Create scratch collection → DB row (owner + discord_id)", async () => {
    const title = `QA Test ${Date.now()}`;
    openSession(S, HOME + "/collections/new");
    await waitText(S, "New Collection");
    prepTurnstile(S);
    await setInput(S, 'input[type="text"]', title);
    await clickBtn(S, "Create Collection");
    await waitFor(S, `/^\\/collections\\/\\d+$/.test(location.pathname)`, 20000);
    coll.id = parseInt(String(cliEval(S, "location.pathname.split('/').pop()")), 10);
    coll.title = title;
    const { rows } = await q<Record<string, unknown>>("SELECT * FROM collections WHERE id = $1", [coll.id]);
    assert(rows.length === 1, "collection row missing");
    assert(rows[0].owner === PONEY_USER, `owner=${rows[0].owner}`);
    assert(rows[0].discord_id === PONEY_ID, `discord_id=${rows[0].discord_id}`);
    assert(rows[0].title === title, `title=${rows[0].title}`);
    console.log(`       collection id=${coll.id}`);
  });

  await check("P3-S9", "Edit scratch collection title + add scratch ship", async () => {
    const newTitle = `${coll.title} Edited`;
    openSession(S, HOME + `/collections/${coll.id}/edit`);
    await waitText(S, "Edit Collection");
    prepTurnstile(S);
    await setInput(S, 'input[type="text"]', newTitle);
    await clickBtn(S, "Save Changes");
    await waitFor(S, `/^\\/collections\\/${coll.id}$/.test(location.pathname)`, 20000);
    let row = (await q<{ title: string }>("SELECT title FROM collections WHERE id = $1", [coll.id])).rows[0];
    assert(row.title === newTitle, `db title=${row.title}`);

    openSession(S, HOME + `/collections/${coll.id}/edit`);
    await waitText(S, "Edit Collection");
    await setInput(S, 'input[placeholder="Search ship name..."]', "valid-ship");
    await clickBtn(S, "Search");
    await waitText(S, "valid-ship", 20000);
    await clickBtn(S, "+ Add");
    await waitText(S, "✓ Added", 20000);
    row = (await q<{ ships: number[] }>("SELECT ships FROM collections WHERE id = $1", [coll.id])).rows[0];
    assert(row.ships.includes(scratch.shipId), "scratch ship not added to collection");
  });

  await check("P3-S10", "Delete scratch ship → DB rows + hosted file + URL gone", async () => {
    openSession(S, HOME + `/ship/${scratch.shipId}`);
    await waitText(S, "valid-ship");
    await stubConfirm(S);
    await clickBtn(S, "Delete");
    await waitFor(S, `window.location.pathname === "/"`, 20000);

    assert((await getShipRow(scratch.shipId)) === null, "shipdb row still present");
    const sigs = (await q<{ n: string }>("SELECT count(*)::text n FROM ship_signatures WHERE ship_id = $1", [scratch.shipId])).rows[0].n;
    assert(sigs === "0", `ship_signatures rows remain: ${sigs}`);

    const { rows: collRows } = await q<{ ships: number[] }>("SELECT ships FROM collections WHERE $1 = ANY(ships)", [scratch.shipId]);
    assert(collRows.length === 0, "scratch id still in a collection");

    const favs = await poneyFavoriteIds();
    assert(!favs.includes(scratch.shipId), "scratch id still in favorites");

    const st = await hostedStatus(scratch.ufsUrl);
    assert(st >= 400, `hosted image still reachable (${st})`);

    const res = await httpFetch(S, `/api/ship/${scratch.shipId}`);
    assert(res.status === 404, `api ship status ${res.status}`);

    openSession(S, HOME + `/ship/${scratch.shipId}`);
    await waitText(S, "Ship not found");
  });

  await check("P3-S11", "Delete scratch collection → DB row + URL gone", async () => {
    openSession(S, HOME + `/collections/${coll.id}`);
    await waitText(S, coll.title);
    await stubConfirm(S);
    await clickBtn(S, "Delete");
    await waitFor(S, `window.location.pathname === "/my-collections"`, 20000);
    const row = (await q<{ n: string }>("SELECT count(*)::text n FROM collections WHERE id = $1", [coll.id])).rows[0];
    assert(row.n === "0", "collection row still present");
    const res = await httpFetch(S, `/api/collections/${coll.id}`);
    assert(res.status === 404, `api collection status ${res.status}`);
    openSession(S, HOME + `/collections/${coll.id}`);
    await waitText(S, "Collection not found");
  });

  await check("P3-S12", "Responsive 1280/768/375 + console sweep", async () => {
    for (const [w, h] of [
      ["1280", "800"],
      ["768", "1024"],
      ["375", "812"],
    ] as [string, string][]) {
      for (const route of ["/", "/my-ships"]) {
        runCli(["-s=" + S, "resize", w, h]);
        openSession(S, HOME + route);
        await waitText(S, route === "/" ? "Ships" : "You have uploaded");
        const overflow = cliEval(
          S,
          "document.documentElement.scrollWidth > window.innerWidth + 2"
        );
        assert(overflow !== true, `horizontal overflow at ${w}x${h} on ${route}`);
      }
    }

    for (const session of [S, A]) {
      const out = runCli(["-s=" + session, "console"]);
      const bad = out
        .split("\n")
        .filter((l) => /error/i.test(l))
        .filter((l) => !/Total messages:/.test(l))
        .filter((l) => !/challenges\.cloudflare\.com/.test(l))
        .filter((l) => !/Failed to load resource/.test(l))
        .filter((l) => !/favicon/i.test(l))
        .filter((l) => !/Decode error:.*\breadBytes\b/.test(l));
      assert(bad.length === 0, `console errors (${session}):\n${bad.slice(0, 8).join("\n")}`);
    }
  });
}

// ══════════════════════════════════════════════════════════════════════
// PHASE 4 — NO-TRACE SWEEP
// ══════════════════════════════════════════════════════════════════════
async function phase4(scratch: { shipId: number; ufsUrl: string }, coll: { id: number }) {
  console.log("\n── PHASE 4: NO-TRACE SWEEP ──");

  await check("P4-N1", "No trace of scratch ship/collection anywhere", async () => {
    const ship = await q<{ n: string }>("SELECT count(*)::text n FROM shipdb WHERE id = $1", [scratch.shipId]);
    assert(ship.rows[0].n === "0", `shipdb rows: ${ship.rows[0].n}`);

    const name = await q<{ n: string }>("SELECT count(*)::text n FROM shipdb WHERE ship_name = 'valid-ship'");
    assert(name.rows[0].n === "0", `rows named valid-ship: ${name.rows[0].n}`);

    const collRow = await q<{ n: string }>("SELECT count(*)::text n FROM collections WHERE id = $1", [coll.id]);
    assert(collRow.rows[0].n === "0", `collection rows: ${collRow.rows[0].n}`);

    const sig = await q<{ n: string }>("SELECT count(*)::text n FROM ship_signatures WHERE ship_id = $1", [scratch.shipId]);
    assert(sig.rows[0].n === "0", `ship_signatures rows: ${sig.rows[0].n}`);

    const inColl = await q<{ n: string }>("SELECT count(*)::text n FROM collections WHERE $1 = ANY(ships)", [scratch.shipId]);
    assert(inColl.rows[0].n === "0", `scratch id in collection arrays: ${inColl.rows[0].n}`);

    const inFav = await q<{ n: string }>("SELECT count(*)::text n FROM favoritedb WHERE $1 = ANY(favorite)", [scratch.shipId]);
    assert(inFav.rows[0].n === "0", `scratch id in favorite arrays: ${inFav.rows[0].n}`);

    const st = await hostedStatus(scratch.ufsUrl);
    assert(st >= 400, `hosted image still reachable (${st})`);

    const src = await getShipRow(1624);
    assert(src !== null, "fixture source ship 1624 unexpectedly deleted");
    const favs = await poneyFavoriteIds();
    assert(favs.length === 4, `poney favorites altered: ${favs.join(",")}`);
    console.log(`       scratch ship ${scratch.shipId} + collection ${coll.id}: zero traces`);
  });
}

async function main() {
  await ensureFixtures();
  await dbInit();

  const scratch = { shipId: 0, ufsUrl: "" };
  const coll = { id: 0, title: "" };

  try {
    await phase1(scratch);
    await phase2(scratch);
    await phase3(scratch, coll);
    await phase4(scratch, coll);
  } catch (e) {
    console.error("Suite aborted:", e);
  } finally {
    const { failed } = summary();
    await dbClose();
    process.exit(failed > 0 ? 1 : 0);
  }
}

main();
