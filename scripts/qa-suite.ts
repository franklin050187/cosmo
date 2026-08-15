import { setTimeout as sleep } from "node:timers/promises";
import {
  assert,
  check,
  chooseFile,
  cliEval,
  cliEvalAsync,
  dbClose,
  dbInit,
  FIXTURE_INVALID,
  FIXTURE_PNG,
  FIXTURE_REPLACE_PNG,
  httpFetch,
  httpFetchAsync,
  openSession,
  openSessionAsync,
  pageText,
  pageTextAsync,
  pageUrl,
  prepTurnstile,
  q,
  runCli,
  SESSION_ANON,
  SESSION_QA,
  stopAllPlaywright,
  stubConfirm,
  summary,
  waitFor,
  waitForAsync,
  BOGUS_COLLECTION_ID,
  BOGUS_SHIP_ID,
  OTHER_COLLECTION_ID,
  OTHER_SHIP_ID,
  PONEY_ID,
  PONEY_USER,
  QA_ANON_ID,
  parallelChecks,
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

// Non-blocking variant for concurrent tests (polls with an async spawn-based eval).
async function waitTextAsync(session: string, text: string, timeoutMs = 25000) {
  const needle = text.toLowerCase();
  const t0 = Date.now();
  let lastErr: unknown;
  while (Date.now() - t0 < timeoutMs) {
    try {
      const v = await cliEvalAsync(session, `document.body.innerText.toLowerCase().includes(${JSON.stringify(needle)})`);
      if (v) return v;
    } catch (e) {
      lastErr = e;
    }
    await sleep(600);
  }
  throw new Error(`waitTextAsync timeout: ${text}${lastErr ? " (last: " + String(lastErr).slice(0, 120) + ")" : ""}`);
}

async function clickBtn(session: string, text: string) {
  runCli(["-s=" + session, "click", `button:has-text("${text}")`]);
}

// ── Games helpers (self-cleaning: every created game is deleted in `finally`) ──

async function createGameViaApi(opts: {
  title?: string;
  mode?: "pvp" | "tournament" | "campaign";
  visibility?: "public" | "private";
  collectionId?: number | null;
  roulette?: boolean;
} = {}): Promise<{ id: number; inviteCode: string }> {
  const res = await httpFetch(S, "/api/games", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: opts.title ?? `QA game ${Date.now()}`,
      description: "",
      game_mode: opts.mode ?? "pvp",
      visibility: opts.visibility ?? "public",
      collection_id: opts.collectionId ?? null,
      game_date: new Date(Date.now() + 7 * 86400000).toISOString(),
      roulette_enabled: opts.roulette ?? false,
    }),
  });
  const data = (res.body as { data?: { id?: number; invite_code?: string } })?.data;
  assert(
    res.status === 201 && data?.id != null,
    `create game status ${res.status}: ${JSON.stringify(res.body)}`
  );
  return { id: data!.id!, inviteCode: data!.invite_code ?? "" };
}

async function deleteGameViaApi(id: number) {
  const res = await httpFetch(S, `/api/games/${id}`, { method: "DELETE" });
  const body = res.body as { ok?: boolean };
  assert(res.status === 200 && body?.ok, `delete game ${id} status ${res.status}: ${JSON.stringify(res.body)}`);
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
    await waitText(S, "You have", 25000);
    const text = pageText(S);
    const m = text.match(/You have (\d+) collections?/);
    assert(m, "collections count line missing");
    assert(parseInt(m[1], 10) === parseInt(dbColls[0].n, 10), `displayed ${m[1]}`);
  });

  await check("P1-U3", "Admin dashboard loads for admin (analytics)", async () => {
    openSession(S, HOME + "/admin");
    await waitText(S, "Complete the captcha");
    prepTurnstile(S);
    await sleep(1200);
    await waitFor(S, "document.body.innerText.includes('Analytics Dashboard')", 45000);
    assert(pageText(S).includes("Total Events"), "no summary cards");
    const res = await httpFetch(S, "/api/analytics/dashboard");
    assert(res.status === 200, `dashboard api status ${res.status}`);
  });

  await check("P1-U3b", "Analytics: clicking a date bar zooms the dashboard (no home redirect)", async () => {
    openSession(S, HOME + "/admin");
    await waitText(S, "Complete the captcha");
    prepTurnstile(S);
    await waitFor(S, "document.body.innerText.includes('Analytics Dashboard')", 30000);
    const label = String(
      cliEval(
        S,
        `(() => {
          const b = document.querySelector('button[aria-label^="View analytics for"]');
          return b ? b.getAttribute("aria-label") : "";
        })()`
      )
    );
    const date = label.replace(/^View analytics for (\d{4}-\d{2}-\d{2}).*$/, "$1");
    assert(/^\d{4}-\d{2}-\d{2}$/.test(date), `no date bar found (label="${label}")`);
    runCli(["-s=" + S, "click", `button[aria-label="${label}"]`]);
    await waitFor(
      S,
      `(() => { const h = document.querySelector('h1'); return !!h && h.innerText.includes('${date}'); })()`,
      15000
    );
    assert(pageUrl(S).startsWith(HOME + "/admin"), "redirected away from /admin on date click");
    assert(pageText(S).includes("Back to all days"), "missing Back to all days button after zoom");
  });

  await check("P1-U3c", "Analytics: exclude filter drops the owner's events", async () => {
    openSession(S, HOME + "/admin");
    await waitText(S, "Complete the captcha");
    prepTurnstile(S);
    await waitFor(S, "document.body.innerText.includes('Analytics Dashboard')", 30000);
    const toggleText = pageText(S);
    assert(
      toggleText.includes("Excluding my data") || toggleText.includes("Include my data"),
      "exclude toggle button missing"
    );
    const [allRes, exclRes] = await Promise.all([
      httpFetch(S, "/api/analytics/dashboard"),
      httpFetch(S, `/api/analytics/dashboard?exclude=${encodeURIComponent(PONEY_USER)}`),
    ]);
    assert(allRes.status === 200 && exclRes.status === 200, "dashboard api status");
    const all = Number((allRes.body as { data?: { totals?: { total_events?: number } } }).data?.totals?.total_events ?? -1);
    const excl = Number((exclRes.body as { data?: { totals?: { total_events?: number } } }).data?.totals?.total_events ?? -1);
    assert(all >= 0 && excl >= 0, "missing totals.total_events in response");
    assert(excl <= all, `exclude filter did not drop events (all=${all}, excl=${excl})`);
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

  // Independent anonymous gate tests: ephemeral-browser GETs on routes that
  // aren't rate-limited endpoints and don't mutate state, so they can run
  // concurrently. parallelChecks hands each its own throwaway session name so
  // the per-test browser contexts never race on a shared "anon" context.
  const parallelBatch: { id: string; name: string; fn: (s: string) => Promise<void> }[] = [];
  for (const [route, label] of gatedRoutes) {
    parallelBatch.push({
      id: `P2-G1:${label}`,
      name: `Login required on ${route}`,
      fn: async (s) => {
        await openSessionAsync(s, HOME + route);
        await waitTextAsync(s, "Login Required", 20000);
        assert((await pageTextAsync(s)).includes("Login with Discord"), "no Discord login link");
      },
    });
  }
  parallelBatch.push({
    id: "P2-G3",
    name: `Ship edit (${scratch.shipId}) redirects anonymous to home`,
    fn: async (s) => {
      await openSessionAsync(s, HOME + `/ship/${scratch.shipId}/edit`);
      await waitForAsync(s, `window.location.pathname === "/"`, 15000);
    },
  });
  parallelBatch.push({
    id: "P2-G6",
    name: `Collection edit (${OTHER_COLLECTION_ID}) requires login`,
    fn: async (s) => {
      await openSessionAsync(s, HOME + `/collections/${OTHER_COLLECTION_ID}/edit`);
      await waitTextAsync(s, "Login Required", 20000);
    },
  });
  parallelBatch.push({
    id: "P2-G8",
    name: `Ship detail (${scratch.shipId}) anonymous: no edit/delete, login-to-favorite`,
    fn: async (s) => {
      await openSessionAsync(s, HOME + `/ship/${scratch.shipId}`);
      await waitTextAsync(s, "valid-ship", 30000);
      const text = await pageTextAsync(s);
      assert(text.includes("Login to favorite"), "missing login-to-favorite");
      assert(text.includes("Download"), "missing download");
      assert(!text.includes("Delete"), "delete leaked to anon");
      assert(!text.includes("Edit"), "edit leaked to anon");
    },
  });
  parallelBatch.push({
    id: "P2-G9",
    name: "Incorrect/deleted ids show not-found (ship + collection)",
    fn: async (s) => {
      await openSessionAsync(s, HOME + "/");
      const res = await httpFetchAsync(s, `/api/ship/${BOGUS_SHIP_ID}`);
      assert(res.status === 404, `ship api status ${res.status}`);
      await openSessionAsync(s, HOME + `/ship/${BOGUS_SHIP_ID}`);
      await waitTextAsync(s, "Ship not found", 20000);
      const cRes = await httpFetchAsync(s, `/api/collections/${BOGUS_COLLECTION_ID}`);
      assert(cRes.status === 404, `collection api status ${cRes.status}`);
      await openSessionAsync(s, HOME + `/collections/${BOGUS_COLLECTION_ID}`);
      await waitTextAsync(s, "Collection not found", 20000);
    },
  });
  parallelBatch.push({
    id: "P2-G10",
    name: "auth_error=access_denied shows 'Login was cancelled.'",
    fn: async (s) => {
      await openSessionAsync(s, HOME + "/?auth_error=access_denied");
      await waitTextAsync(s, "Login was cancelled.", 20000);
    },
  });
  await parallelChecks(parallelBatch, 3);

  // Sequential tests below: they POST to API endpoints or burst rate-limited
  // routes, so they must not overlap (avoid cascading 429s). They also use
  // relative fetch URLs on the shared anon session, so pin that browser to the
  // app origin first (otherwise the relative fetch has no base URL to resolve).
  openSession(A, HOME + "/");
  await waitText(A, "Newest", 20000);

  await check("P2-G2", "Analytics dashboard gated for anonymous (401 + no data leak)", async () => {
    const res = await httpFetch(A, "/api/analytics/dashboard");
    assert(res.status === 401, `dashboard api status ${res.status}`);
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

  await check("P2-G11", "Rate limiting: /api/ship/check-duplicate returns 429 under burst", async () => {
      let got429 = false;
      let lastStatus = 0;
      for (let i = 1; i <= 30 && !got429; i++) {
        const res = await httpFetch(A, "/api/ship/check-duplicate", {
          method: "POST",
          body: JSON.stringify({ signature: `qa-ratelimit-${Date.now()}-${i}` }),
          headers: { "Content-Type": "application/json" },
        });
        lastStatus = res.status;
        if (res.status === 429) got429 = true;
      }
      assert(got429, `expected 429 under burst, last status ${lastStatus}`);
    });

    await check("P2-G12", "Rate limiting: /callback returns 429 under burst (login limiter 5/min)", async () => {
      let got429 = false;
      let lastStatus = 0;
      const body = JSON.stringify({ code: "qa-burst", state: "qa-burst" });
      for (let i = 0; i < 30 && !got429; i++) {
        const res = await httpFetch(A, "/callback", { method: "POST", body });
        lastStatus = res.status;
        if (res.status === 429) got429 = true;
      }
      assert(got429, `expected 429 on /callback under burst, last status ${lastStatus}`);
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

  await check("P2-G5", "Upload/reject endpoints reject anonymous", async () => {
    const uploadthing = await httpFetch(A, "/api/uploadthing", {
      method: "POST",
      body: "{}",
      headers: { "Content-Type": "application/json" },
    });
    assert([400, 401, 403].includes(uploadthing.status), `uploadthing status ${uploadthing.status}`);
    const myShips = await httpFetch(A, "/api/ship/my-ships");
    assert(myShips.status === 401, `my-ships status ${myShips.status}`);
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
    runCli(["-s=" + S, "upload", FIXTURE_REPLACE_PNG]);
    await waitText(S, "Confirm Replace", 40000);
    await clickBtn(S, "Confirm Replace");
    await waitFor(S, `window.location.pathname === "/ship/${scratch.shipId}"`, 30000);
    await waitText(S, "replace-ship", 30000);
    const after = (await getShipRow(scratch.shipId))?.data as string;
    assert(after && after !== before, "data URL did not change");
    const row = await getShipRow(scratch.shipId);
    assert(row?.ship_name === "replace-ship", `ship_name after replace=${row?.ship_name}`);
    const oldStatus = await hostedStatus(before);
    const newStatus = await hostedStatus(after);
    assert(oldStatus >= 400, `old hosted file still reachable (${oldStatus})`);
    assert(newStatus === 200, `new hosted file status ${newStatus}`);
    console.log(`       replace: old=${before.slice(0, 60)}… (${oldStatus}) new=${after.slice(0, 60)}… (${newStatus})`);
  });

  await check("P3-S7", "Favorite/unfavorite scratch ship leaves no trace", async () => {
    const before = await poneyFavoriteIds();
    openSession(S, HOME + `/ship/${scratch.shipId}`);
    await waitText(S, "replace-ship");
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
    await setInput(S, 'input[placeholder="Search ship name..."]', "replace-ship");
    await clickBtn(S, "Search");
    await waitText(S, "replace-ship", 20000);
    await clickBtn(S, "+ Add");
    await waitText(S, "✓ Added", 20000);
    row = (await q<{ ships: number[] }>("SELECT ships FROM collections WHERE id = $1", [coll.id])).rows[0];
    assert(row.ships.includes(scratch.shipId), "scratch ship not added to collection");
  });

  await check("P3-S10", "Delete scratch ship → DB rows + hosted file + URL gone", async () => {
    openSession(S, HOME + `/ship/${scratch.shipId}`);
    await waitText(S, "replace-ship");
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
        await sleep(800);
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
        .filter((l) => !/Console: \d+ errors?/.test(l))
        .filter((l) => !/challenges\.cloudflare\.com/.test(l))
        .filter((l) => !/Failed to load resource/.test(l))
        .filter((l) => !/favicon/i.test(l))
        .filter((l) => !/Decode error:.*\breadBytes\b/.test(l));
      assert(bad.length === 0, `console errors (${session}):\n${bad.slice(0, 8).join("\n")}`);
    }
  });

  await check("P3-S13", "Roulette collection dropdown stays on-screen at 375px", async () => {
    openSession(S, HOME + "/roulette?collection=8");
    await waitText(S, "Ship Roulette");
    await waitFor(S, "document.getElementById('roulette-collection') !== null", 10000);

    runCli(["-s=" + S, "resize", "375", "812"]);
    await sleep(700);

    const before = cliEval(
      S,
      `(() => {
        const sel = document.getElementById('roulette-collection');
        const r = sel.getBoundingClientRect();
        return {
          hasSel: !!sel,
          innerW: window.innerWidth,
          innerH: window.innerHeight,
          left: +r.left.toFixed(1),
          right: +r.right.toFixed(1),
          top: +r.top.toFixed(1),
          bottom: +r.bottom.toFixed(1),
          scrollW: document.documentElement.scrollWidth,
          hOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
        };
      })()`
    ) as {
      hasSel: boolean;
      innerW: number;
      innerH: number;
      left: number;
      right: number;
      top: number;
      bottom: number;
      scrollW: number;
      hOverflow: boolean;
    };

    assert(before.hasSel, "roulette-collection select present");
    assert(
      !before.hOverflow,
      `horizontal overflow at 375px: scrollW=${before.scrollW} innerW=${before.innerW}`
    );
    assert(
      before.left >= 0 && before.right <= before.innerW + 2,
      `select trigger inside viewport horizontally: [${before.left}, ${before.right}] vs innerW=${before.innerW}`
    );
    assert(
      before.top >= 0 && before.bottom <= before.innerH + 2,
      `select trigger inside viewport vertically: [${before.top}, ${before.bottom}] vs innerH=${before.innerH}`
    );

    runCli(["-s=" + S, "click", "#roulette-collection"]);
    await sleep(700);

    const opened = cliEval(
      S,
      `(() => {
        const sel = document.getElementById('roulette-collection');
        const r = sel.getBoundingClientRect();
        return {
          open: document.activeElement === sel,
          left: +r.left.toFixed(1),
          right: +r.right.toFixed(1),
          top: +r.top.toFixed(1),
          bottom: +r.bottom.toFixed(1),
        };
      })()`
    ) as { open: boolean; left: number; right: number; top: number; bottom: number };

    assert(opened.open, "dropdown opens from pointer click (activeElement === select)");
    assert(
      opened.left >= 0 && opened.right <= 377 && opened.top >= 0 && opened.bottom <= 814,
      `select fully on-screen while menu open: [${opened.left}, ${opened.right}]x[${opened.top}, ${opened.bottom}]`
    );

    runCli(["-s=" + S, "screenshot", "--filename=.qa/output/qa-roulette-mobile-dropdown.png"]);
  });

  // ── GAME PLANNING + SHIP ROULETTE (new features) — self-cleaning ──

  await check("P3-G1", "Create a game via API → DB row + invite code; delete leaves no trace", async () => {
    const { id, inviteCode } = await createGameViaApi({ title: `QA create game ${Date.now()}` });
    try {
      assert(inviteCode.length > 0, "invite_code missing");
      const rows = await q<{ title: string; owner: string; mode: string }>(
        "SELECT title, owner_discord_id AS owner, game_mode AS mode FROM games WHERE id = $1",
        [id]
      );
      assert(rows.rows.length === 1, `game row missing (${id})`);
      assert(rows.rows[0].owner === PONEY_ID, `owner_discord_id=${rows.rows[0].owner}`);
      assert(rows.rows[0].mode === "pvp", `game_mode=${rows.rows[0].mode}`);
    } finally {
      await deleteGameViaApi(id);
    }
    const gone = await q<{ n: string }>("SELECT count(*)::text n FROM games WHERE id = $1", [id]);
    assert(gone.rows[0].n === "0", `game not cleaned up (${gone.rows[0].n} rows)`);
  });

  await check("P3-G2", "Register for a game (logged-in) → DB row; leave removes it", async () => {
    const { id } = await createGameViaApi();
    try {
      const reg = await httpFetch(S, `/api/games/${id}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      assert(reg.status === 200 && (reg.body as { ok?: boolean })?.ok, `register ${reg.status}: ${JSON.stringify(reg.body)}`);
      const rows = await q<{ n: string }>(
        "SELECT count(*)::text n FROM game_registrations WHERE game_id = $1 AND discord_id = $2",
        [id, PONEY_ID]
      );
      assert(rows.rows[0].n === "1", `registration rows=${rows.rows[0].n}`);
      const leave = await httpFetch(S, `/api/games/${id}/register`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      assert(leave.status === 200, `leave ${leave.status}: ${JSON.stringify(leave.body)}`);
      const after = await q<{ n: string }>(
        "SELECT count(*)::text n FROM game_registrations WHERE game_id = $1 AND discord_id = $2",
        [id, PONEY_ID]
      );
      assert(after.rows[0].n === "0", `registration rows after leave=${after.rows[0].n}`);
    } finally {
      await deleteGameViaApi(id);
    }
  });

  await check("P3-G3", "Games routes are gated for anonymous users", async () => {
    const create = await httpFetch(A, "/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "x", game_date: new Date().toISOString() }),
    });
    assert(create.status === 401, `anon create ${create.status}`);
    const del = await httpFetch(A, `/api/games/${BOGUS_SHIP_ID}`, { method: "DELETE" });
    assert(del.status === 401, `anon delete ${del.status}`);
    const contestants = await httpFetch(A, `/api/games/${BOGUS_SHIP_ID}/contestants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "x" }),
    });
    assert(contestants.status === 401, `anon contestants ${contestants.status}`);
    const bracket = await httpFetch(A, `/api/games/${BOGUS_SHIP_ID}/bracket`, { method: "POST" });
    assert(bracket.status === 401, `anon bracket ${bracket.status}`);
    const roulette = await httpFetch(A, `/api/games/${BOGUS_SHIP_ID}/roulette`, { method: "POST" });
    assert(roulette.status === 401, `anon roulette ${roulette.status}`);
    const reg = await httpFetch(A, `/api/games/${BOGUS_SHIP_ID}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert(reg.status === 400, `anon register (no username) ${reg.status}`);
  });

  await check("P3-G4", "Tournament: add contestants + generate bracket → matches created", async () => {
    const { id } = await createGameViaApi({ mode: "tournament" });
    try {
      for (const u of ["qa-p1", "qa-p2", "qa-p3", "qa-p4"]) {
        const c = await httpFetch(S, `/api/games/${id}/contestants`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: u }),
        });
        assert(c.status === 200, `add contestant ${u} ${c.status}: ${JSON.stringify(c.body)}`);
      }
      const br = await httpFetch(S, `/api/games/${id}/bracket`, { method: "POST" });
      assert(br.status === 200 && (br.body as { ok?: boolean })?.ok, `bracket ${br.status}: ${JSON.stringify(br.body)}`);
      const matches = await q<{ n: string }>("SELECT count(*)::text n FROM game_matches WHERE game_id = $1", [id]);
      assert(parseInt(matches.rows[0].n, 10) > 0, `no matches (${matches.rows[0].n})`);
      const cons = await q<{ n: string }>("SELECT count(*)::text n FROM game_contestants WHERE game_id = $1", [id]);
      assert(cons.rows[0].n === "4", `contestants=${cons.rows[0].n}`);
    } finally {
      await deleteGameViaApi(id);
    }
  });

  await check("P3-G5", "Roulette deal: linked collection + registered player → draws created", async () => {
    const { id } = await createGameViaApi({ roulette: true, collectionId: 3 });
    try {
      await httpFetch(S, `/api/games/${id}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const ships = await q<{ n: string }>("SELECT count(*)::text n FROM game_ships WHERE game_id = $1", [id]);
      assert(parseInt(ships.rows[0].n, 10) > 0, `no snapshot ships (${ships.rows[0].n})`);
      const deal = await httpFetch(S, `/api/games/${id}/roulette`, { method: "POST" });
      assert(deal.status === 200 && (deal.body as { ok?: boolean })?.ok, `deal ${deal.status}: ${JSON.stringify(deal.body)}`);
      const draws = await q<{ n: string }>("SELECT count(*)::text n FROM game_ship_draws WHERE game_id = $1", [id]);
      assert(parseInt(draws.rows[0].n, 10) > 0, `no draws (${draws.rows[0].n})`);
    } finally {
      await deleteGameViaApi(id);
    }
  });

  await check("P3-G6", "Roulette disabled game refuses deal (owner)", async () => {
    const { id } = await createGameViaApi({ roulette: false });
    try {
      const deal = await httpFetch(S, `/api/games/${id}/roulette`, { method: "POST" });
      assert(deal.status === 400, `deal on non-roulette ${deal.status}: ${JSON.stringify(deal.body)}`);
    } finally {
      await deleteGameViaApi(id);
    }
  });

  await check("P3-G7", "Private game requires invite code to register", async () => {
    const { id, inviteCode } = await createGameViaApi({ visibility: "private" });
    try {
      const noCode = await httpFetch(A, `/api/games/${id}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "qa-guest" }),
      });
      assert(noCode.status === 403, `register private w/o invite ${noCode.status}: ${JSON.stringify(noCode.body)}`);
      const withCode = await httpFetch(A, `/api/games/${id}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "qa-guest", invite_code: inviteCode }),
      });
      assert(withCode.status === 200, `register private w/ invite ${withCode.status}: ${JSON.stringify(withCode.body)}`);
      const rows = await q<{ n: string }>(
        "SELECT count(*)::text n FROM game_registrations WHERE game_id = $1 AND discord_username = 'qa-guest'",
        [id]
      );
      assert(rows.rows[0].n === "1", `guest registration rows=${rows.rows[0].n}`);
    } finally {
      await deleteGameViaApi(id);
    }
  });
}

// ══════════════════════════════════════════════════════════════════════
// PHASE 4 — NO-TRACE SWEEP
// ══════════════════════════════════════════════════════════════════════
async function phase4(
  scratch: { shipId: number; ufsUrl: string },
  coll: { id: number },
  favoritesBaseline: number[]
) {
  console.log("\n── PHASE 4: NO-TRACE SWEEP ──");

  const excludePoney = process.env.QA_EXCLUDE_PONEY_DATA === "true";

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
    if (!excludePoney) {
      const favs = await poneyFavoriteIds();
      assert(
        favs.length === favoritesBaseline.length,
        `poney favorites altered (baseline ${favoritesBaseline.length}): ${favs.join(",")}`
      );
    }
    console.log(`       scratch ship ${scratch.shipId} + collection ${coll.id}: zero traces`);
  });

  await check("P4-N2", "QA anonymous events carry the pinned anon_id (identifiable/excludable)", async () => {
    openSession(A, HOME + "/");
    // Anonymous traffic in this suite shares one loopback identity (IP key ""),
    // so the shared /api rate-limit budget can transiently trip on /api/analytics/log.
    // Retry only on 429 so the anon_id invariant is verified once a slot frees up.
    let res: { status: number; body: unknown };
    let attempts = 0;
    for (;;) {
      res = await httpFetch(A, "/api/analytics/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_type: "page_view", url: "/qa-anon-id-check" }),
      });
      if (res.status === 200 || res.status !== 429 || attempts >= 8) break;
      attempts++;
      await sleep(6000);
    }
    assert(res.status === 200, `marker log status ${res.status} (after ${attempts} retries)`);
    const row = await q<{ anon_id: string | null }>(
      "SELECT anon_id FROM analytics WHERE url = '/qa-anon-id-check' ORDER BY created_at DESC LIMIT 1"
    );
    const got = row.rows[0]?.anon_id ?? null;
    assert(
      got === QA_ANON_ID,
      `QA anon_id drifted (got ${got}, expected ${QA_ANON_ID}). Update QA_ANON_ID in scripts/qa-lib.ts and ANALYTICS_EXCLUDE_ANON_IDS in .env.`
    );
    await q("DELETE FROM analytics WHERE url = '/qa-anon-id-check'");
  });
}

async function main() {
  await ensureFixtures();
  await dbInit();

  // Poney is the real user on this instance; snapshot their personal data at
  // suite start so the no-trace sweep asserts "unchanged by the suite" rather
  // than a hardcoded count that drifts as the user favorites/ships on the site.
  const favoritesBaseline = await poneyFavoriteIds();
  if (process.env.QA_EXCLUDE_PONEY_DATA === "true") {
    console.log(
      `       [QA_EXCLUDE_PONEY_DATA] excluding poney's personal data from assertions (baseline favorites: ${favoritesBaseline.length})`
    );
  }

  const scratch = { shipId: 0, ufsUrl: "" };
  const coll = { id: 0, title: "" };

  try {
    await phase1(scratch);
    await phase2(scratch);
    await phase3(scratch, coll);
    await phase4(scratch, coll, favoritesBaseline);
  } catch (e) {
    console.error("Suite aborted:", e);
  } finally {
    const { failed } = summary();
    stopAllPlaywright();
    await dbClose();
    process.exit(failed > 0 ? 1 : 0);
  }
}

main();
