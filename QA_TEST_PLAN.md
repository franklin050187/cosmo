# QA Test Plan — cosmo-next scripted suite

Runner: `node --env-file=.env --no-warnings scripts/qa-suite.ts`
Fixtures: `scripts/qa-fixtures/` (regenerated automatically if missing)
Report artifacts: `.qa/output/qa-suite/`

Poney data: the `qa` profile belongs to the real user, so the suite never hardcodes
poney's favorites count. `P4-N1` snapshots poney's favorites at suite start and asserts
the suite left them unchanged. To skip poney-specific personal-data assertions entirely
(e.g. while using the site concurrently with a run), set `QA_EXCLUDE_PONEY_DATA=true`.

Sessions:
- `qa`  — persistent profile `.qa/brave-profile`, logged in as `poney5850#0` (`439514586778042369`, admin, guild `exl`).
- `anon` — isolated in-memory context, no cookies.

Turnstile: dev-only stub — `window.turnstile` is patched so `getResponse()` returns `qa-dev-token`
and the widget callback fires immediately. The server skips verification when `NODE_ENV=development`.

Lifecycle ordering (mutations leave no trace): **add ship (logged in) → test not-logged-in → edit/update/delete (logged in)**.
Every case that inserts/updates/deletes data verifies the change at the DB row level (insert/update/delete) plus
image-hosting reachability (`ufsUrl` 200 after insert, non-200 after delete).

---

## Phase 1 — LOGGED IN: add the ship first

| ID | Case | Steps | Expected |
|----|------|-------|----------|
| P1-U1 | Header identity + user menu | open `/`, assert `poney5850#0`, open user menu | menu shows My Ships, My Favorites, My Collections, Analytics (admin), Logout |
| P1-U2a | My Ships count | open `/my-ships`, parse count line | matches DB count (`350`) for `discord_id`/username |
| P1-U2b | Favorites count | open `/favorites` | matches DB favorites (`4`) |
| P1-U2c | My Collections count | open `/my-collections` | matches DB count (`3`) |
| P1-U3 | Admin analytics | open `/admin`, solve captcha (stub), fetch dashboard | dashboard renders summary cards; `/api/analytics/dashboard` → 200 |
| P1-U3b | Analytics date zoom | click a date bar on `/admin` | dashboard filters to that date (`h1` shows it), stays on `/admin`, "Back to all days" shown (no home redirect) |
| P1-U3c | Analytics exclude filter | `/admin` shows toggle; fetch dashboard with `?exclude=<owner>` | toggle visible; `?exclude=` returns 200 and `total_events` ≤ unfiltered; owner + QA anon id (`ANALYTICS_EXCLUDE_ANON_IDS`) dropped |
| P1-U4 | Upload valid ship — decode panel | open `/upload`, select `valid-ship.ship.png` | Author/Price/Crew/Tags rendered |
| P1-U5 | Duplicate warning | assert warning for existing blueprint (ship 1624) | "Upload Anyway" disabled → ack checkbox → enabled |
| P1-U6 | Submit upload `[MUT]` | ack, turnstile stub, Upload Anyway | success screen; **DB**: `shipdb` row (`submitted_by=poney5850#0`, `discord_id=4395…`, `ship_name=valid-ship`, `data=https://…`), `ship_signatures` row; **hosting**: `ufsUrl` → 200 image/png. Captures **scratch ship id** |
| P1-U7 | Invalid file rejected | Reset, select `invalid.png` | "Failed to decode ship data from image" |

## Phase 2 — ANONYMOUS: gates + public decode

| ID | Case | Steps | Expected |
|----|------|-------|----------|
| P2-G1 | Login required | `/upload`, `/my-ships`, `/favorites`, `/my-collections`, `/collections/new` | "Login Required" + Discord link on each |
| P2-G2 | Analytics gated | `/api/analytics/dashboard`; `/admin` after captcha | **401**; page redirects to `/`, no data leak |
| P2-G3 | Ship edit gated | `/ship/[scratch]/edit` anon | redirects to `/` |
| P2-G4 | Ship edit/delete gated | `PUT`/`DELETE /api/ship/[scratch]` | **401** |
| P2-G5 | Upload/replace endpoints | POST `/api/uploadthing`; `/api/ship/my-ships` | rejected (400/401/403); **401** |
| P2-G6 | Collection edit gated | `/collections/[8]/edit` anon | "Login Required" |
| P2-G7 | Collection edit/delete gated | `PUT`/`DELETE /api/collections/[8]` | **401** |
| P2-G8 | Detail anon | `/ship/[scratch]` | "Login to favorite" + Download; **no** Edit/Delete |
| P2-G9 | Incorrect/deleted ids | `/ship/999999999`, `/collections/999999999` (+ APIs) | "Ship/Collection not found"; APIs **404** |
| P2-G10 | Cancelled login banner | `/?auth_error=access_denied` | "Login was cancelled." |
| P2-G11 | Rate limiting (check-dup) | `/api/ship/check-duplicate` 21+ requests rapid | **429** under burst (limiter 20/min) |
| P2-G12 | Rate limiting (login) | `/callback` 6+ requests rapid | **429** under burst (limiter 5/min) |
| F1 | Decode valid fixture | `/decode` + `valid-ship.ship.png` | decoded JSON deep-equals `valid-ship.json` |
| F2 | Decode invalid file | `/decode` + `invalid.png` | "Failed to decode ship data from image" |

## Phase 3 — LOGGED IN: edit/update/delete + collections

| ID | Case | Steps | Expected |
|----|------|-------|----------|
| P3-S1 | Search/filters | `/ ?q=valid-ship` | scratch ship found; URL param retained |
| P3-S2 | Detail owner actions | Stats / JSON / Price Analysis toggles | each panel renders |
| P3-S3 | Non-owner ship gated | `/ship/61/edit`; `PUT`/`DELETE /api/ship/61` | redirect to `/ship/61`; **403** |
| P3-S4 | Non-owner collection gated | `/collections/8/edit`; `PUT`/`DELETE /api/collections/8` | redirect; **403** |
| P3-S5 | Edit scratch ship `[MUT]` | rename → save → verify → revert → save | **DB** `ship_name` updated then reverted |
| P3-S6 | Replace scratch ship `[MUT]` | Replace Ship → upload fixture → Confirm Replace | **DB** `data` = new `ufsUrl`; **hosting** old → non-200, new → 200 |
| P3-S7 | Favorite toggle `[MUT]` | ☆ Favorite → ★ Unfavorite | **DB** favorite array gains then loses scratch id; no orphaned row |
| P3-S8 | Create collection `[MUT]` | `/collections/new` (title + turnstile stub) | **DB** row (`owner`, `discord_id`) |
| P3-S9 | Edit collection + add ship `[MUT]` | rename + save; add "valid-ship" by name | **DB** title updated; `ships[]` contains scratch id |
| P3-S10 | Delete scratch ship `[MUT]` | confirm stub → Delete | **DB** `shipdb` row + `ship_signatures` gone; removed from all `ships`/`favorite` arrays; **hosting** `ufsUrl` non-200; `/api/ship/[id]` 404; page "Ship not found" |
| P3-S11 | Delete scratch collection `[MUT]` | confirm stub → Delete | **DB** row gone; `/api/collections/[id]` 404; page "Collection not found" |
| P3-S12 | Responsive + console | 1280/768/375 on `/` + `/my-ships`; console sweep | no horizontal overflow; no unexpected console errors (Turnstile CDN noise allowed) |

## Phase 4 — NO-TRACE SWEEP

| ID | Case | Expected |
|----|------|----------|
| P4-N1 | Zero traces | no `shipdb`/`ship_signatures` row for scratch id; no `ship_name='valid-ship'`; scratch id absent from all `collections.ships`/`favoritedb.favorite`; scratch `ufsUrl` non-200; fixture source ship 1624 intact; poney favorites back to the count snapshotted at suite start (or skipped with `QA_EXCLUDE_PONEY_DATA=true`) |
| P4-N2 | QA anon identity pinned | anon session logs `/qa-anon-id-check` → its `anon_id` equals `QA_ANON_ID` (scripts/qa-lib.ts, `701be3030a345fca`); on drift, update that constant + `ANALYTICS_EXCLUDE_ANON_IDS` in `.env` |

## Exit criteria
- Each case prints `[PASS]`/`[FAIL]` with case id; suite summary with pass/fail counts; non-zero exit on any failure.
- All mutating cases are self-cleaning — a full passing run leaves zero trace of the scratch ship/collection.
