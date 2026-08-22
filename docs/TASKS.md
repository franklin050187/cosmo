# Remaining Tasks — Compiled (2026-08-21)

Single source of truth for all remaining work. Compiled from `CODE_AUDIT_2026-08-21.md` (A1–A8), `FULL_CODE_AUDIT_2026-08-21.md` (whole-codebase), `AUDIT_ACTIONS_2026-08-21.md` (F1–F3), `ROADMAP_UX.md` phases 3–5, `NEXT_STEPS.md`, and `docs/plans/code-cleanup.md`. No code was changed to produce this list.

Legend: **FIX** must fix · **UPDATE** improve · **REMOVE** delete · **CHANGE** refactor. **P1** correctness/security · **P2** robustness/perf · **P3** nit. Size S/M/L.

---

## 0. Ship detail consistency — QA blockers (do first)

| ID | Category | Task | File(s) | Size |
|---|---|---|---|---|
| F1 | FIX/REMOVE | Ship detail cache serves stale rows for 30s (`cachedQuery("ship",30_000)` `src/lib/db/ships.ts:22` via `src/lib/cache.ts:28`; `collectionsByShip` `src/lib/db/collections.ts:127`). SSR `src/app/ship/[id]/page.tsx:5` stale; `bumpDbVersion()` not shared across Next.js bundles. | `ships.ts:22`, `collections.ts:127`, `cache.ts:28`, `ship/[id]/page.tsx:5` | S |
| F2 | FIX/CHANGE | Replace navigates before UploadThing commit (`src/app/ship/[id]/edit/page.tsx:197` 1s sleep races `uploadthing.ts:146` `onUploadComplete`). Poll `GET /api/ship/{id}` until `data.data` swaps then navigate. | `edit/page.tsx:197`, `uploadthing.ts:146` | S |
| F3 | FIX/UPDATE | Post-delete blank page — hydration failure to blank (`ShipDetailView.tsx:69`, `ship/[id]/page.tsx` not-found branch; 7 hits in `dev-server.log`; blank `.playwright-cli/page-2026-08-21T12-08-11-451Z.yml`). Fix header/auth mismatch + add suite retry loop `scripts/qa-suite.ts:930` (5× 8s). | `ShipDetailView.tsx:69`, `qa-suite.ts:930` | M/S |

---

## 1. Data loss / correctness — P1 (next)

| ID | Category | Task | File(s) | Size |
|---|---|---|---|---|
| P1-01 | FIX | `favorites.splice(idx)` deletes tail — `splice(idx,1)` + `GREATEST(fav-1,0)` | `src/lib/db/favorites.ts:43` | S |
| P1-02 | FIX | `favoritedb` `OR name` corrupts other users — branch `WHERE discord_id` vs `WHERE name` | `favorites.ts:6,15,28,45` | M |
| P1-03 | FIX | Ship delete leaves orphan `game_ships`/`game_ship_draws` (no FK `002-games.sql:23`) — delete in same tx or `ON DELETE SET NULL` | `ships.ts:54`, `002-games.sql:23` | S |
| P1-04 | FIX | Bracket `applyWinner` race on `IS NULL` — `FOR UPDATE` lock | `src/lib/db/games.ts:737,800` | M |
| P1-05 | FIX | `snapshotCollectionShips` N+1 + not atomic with `createGame` — bulk `UNNEST` + single tx | `games.ts:78,108` | M |
| P1-06 | FIX | `fav` counter drift/negative — `GREATEST` + `WHERE EXISTS` | `favorites.ts:30,49` | S |
| P1-Load | FIX | `games/[id]/page.tsx:95` `load()` missing `signal` — pass `AbortController` signal | `games/[id]/page.tsx:95` | S |
| P1-Fav | FIX | Favorite optimistic rollback missing on 4xx | `ShipDetailView.tsx:161`, `games/[id]/page.tsx:270` | S |
| A1 | FIX | Private game GET leak — gate `visibility===private` to owner/participant | `api/games/[id]/route.ts:19` | S |
| A2 | FIX | Delete ignores API result — check `res.ok` before navigate | `games/[id]/page.tsx:270` | S |
| A6 | FIX | Guest dedupe race — `ON CONFLICT DO NOTHING` + CI indexes `006-registration-integrity.sql` | `games.ts:390`, `006-registration-integrity.sql` | S |

---

## 2. Robustness / performance — P2

| ID | Category | Task | File(s) | Size |
|---|---|---|---|---|
| P2-07 | UPDATE | Collection `ships` array duplicate race — `FOR UPDATE` / `WHERE NOT ANY` | `collections.ts:98` | S |
| P2-08 | UPDATE | `addContestant` seed race — `FOR UPDATE` on max seed | `games.ts:462` | S |
| P2-09 | UPDATE | Search 6 sequential queries — `Promise.all` | `search.ts:53` | M |
| P2-10 | UPDATE | `getGameDetail` 6 sequential — `Promise.all` | `games.ts:185` | M |
| P2-11 | UPDATE | `generateBracket` N+1 seed/insert loops — bulk `UNNEST` | `games.ts:667` | M |
| P2-12 | UPDATE | `makeInviteCode` collision — `INSERT ON CONFLICT` retry | `games.ts:68` | S |
| P2-13 | UPDATE | In-memory `cachedQuery` incoherent across serverless — centralize or drop PK caches | `cache.ts:10`, `search.ts:21`, `collections.ts:49` | M |
| P2-14 | UPDATE | Missing indexes (GIN tags, BTREE author/price/crew, `ANY(ships)`) | migrations | M |
| P2-15 | UPDATE | Supabase pooler `prepare:false`, error handling, `max:10` | `core.ts:90` | S |
| P2-16 | UPDATE | Pagination DoS `LIMIT 999999` `page===-1` — clamp | `search.ts:91`, `collections.ts:54` | S |
| P2-17 | UPDATE | Signature dedupe — `UNIQUE(signature)` + `ON CONFLICT` | `ships.ts:112` | S |
| P2-18 | UPDATE | Tx error masking — `ROLLBACK` failure + `release(err)` | `core.ts:132` | S |
| P2-19 | UPDATE | `removeContestant` leaves bracket stale — recompute/clear draws | `games.ts:479` | S |
| P2-20 | UPDATE | Download counter spammable — per-user/day dedup | `ships.ts:45` | S |
| FE-01 | UPDATE | `Bracket` remount hack `key={matches.length}` → `bracketRevision` | `games/[id]/page.tsx:933` | S |
| FE-02 | UPDATE | `games/page.tsx:37` error vs empty, abort handling + `role=alert` | `games/page.tsx:37` | S |
| FE-03 | UPDATE | `roulette/page.tsx:44` loadDetail race + picker truncated at `page=1` | `roulette/page.tsx:44,30` | M |
| FE-04 | UPDATE | Render-body `setState` anti-pattern — move to `useEffect` | `HomeContent.tsx:24`, `PriceFilter.tsx:29` etc | S |
| FE-05 | UPDATE | `ShipDetailView:105` shared AbortController — split | `ShipDetailView.tsx:105` | S |
| FE-06 | UPDATE | Silent collection-load failures — `role=alert` + retry | `ShipDetailView.tsx:136`, `CollectionPicker.tsx:36` | S |
| FE-07 | UPDATE | Hydration flash `backUrl` `sessionStorage` — derive in `useEffect` | `ShipDetailView.tsx:84`, `RequireAuth.tsx:18` | S |
| FE-08 | UPDATE | Portal without mount gate — hydration warning | `CollectionPicker.tsx:195` | S |
| FE-09 | UPDATE | `vw` layout shift `RouletteGame.tsx:84` — skeleton until measured | `RouletteGame.tsx:84` | S |
| FE-10 | UPDATE | Banner flash `UnexpectedGamesBanner:19` — sync `useState` init | `UpcomingGamesBanner.tsx:19` | S |
| FE-11 | UPDATE | Root `force-dynamic` defeats ISR `revalidate=60` | `layout.tsx:11`, `collections/page.tsx:15` | S |
| A3 | FIX | Regenerate bracket needs ConfirmDialog when `matches.length>0` | `games/[id]/page.tsx:904` | S |
| A4 | FIX | Contestant add/remove swallow errors — surface `json.error` | `games/[id]/page.tsx:280` | S |
| A5 | UPDATE | Guest registration hardening (40-char clamp done, rate/captcha optional) | `register/route.ts:8` | S |
| A7 | FIX | GameCard raw HTML — `htmlToText` strip | `GameCard.tsx:66` | S |

---

## 3. A11y — P2

| ID | Category | Task | File(s) | Size |
|---|---|---|---|---|
| A11y-01 | UPDATE | Mobile nav & user menu no focus trap / `inert` | `Header.tsx:242` | M |
| A11y-02 | UPDATE | `ShipLightbox` focus restore, scroll-lock, `aria-hidden` | `ShipLightbox.tsx:22` | M |
| A11y-03 | UPDATE | `Bracket` hit target <44px, color-only winner | `Bracket.tsx:30` | S |
| A11y-04 | UPDATE | Dropdown `aria-controls`, excluded `line-through` not announced | `TagFilter.tsx:155` | S |
| A11y-05 | UPDATE | `ShipStats` spinner `aria-live` | `ShipStats.tsx:68` | S |
| A11y-06 | UPDATE | `FilterSection` hidden via CSS only — add `hidden`/`inert` | `FilterSection.tsx:32` | S |
| A11y-07 | UPDATE | Roulette empty `role=button` still operable — `aria-disabled` | `RouletteGame.tsx:217` | S |

---

## 4. Images / polish — P2/P3

| ID | Category | Task | File(s) | Size |
|---|---|---|---|---|
| IMG-01 | UPDATE | `ShipCard:93` data-URL `unoptimized` without `sizes` | `ShipCard.tsx:93` | S |
| IMG-02 | UPDATE | Canvas not HiDPI | `ShipPriceAnalysis.tsx:15` | S |

---

## 5. Code quality — REMOVE / CHANGE

| ID | Category | Task | File(s) | Size |
|---|---|---|---|---|
| R1 | REMOVE | Dead spread `...(opts?{}:{})` | `games/[id]/page.tsx:157` | S |
| R2 | REMOVE | Stale `cachedQuery` wrappers (see F1) | `ships.ts:22`, `collections.ts:127` | S |
| R3 | REMOVE | Fixed `setTimeout(1000)` (see F2) | `edit/page.tsx:197` | S |
| R4 | REMOVE | `migrateUsernameOnLogin` 12 UPDATEs per login — early return | `users.ts:59` | S |
| C1 | CHANGE | Shared helpers `sortShipsByPopularity` `computeChampionFromSlots` (A8) | `roulette.ts:107`, `bracket-util.ts:4` | S |
| C2 | CHANGE | Replace flow poll contract (F2) | `edit/page.tsx:178` | S |
| C3 | CHANGE | Tag parsing `?foo=1` as tag — strict allowlist | `search.ts:141` | S |
| C4 | CHANGE | Owner `===` vs `LOWER()` — normalize case | `core.ts:157`, `games.ts:44` | S |
| C5 | CHANGE | `force-dynamic` → per-route `revalidate` | `layout.tsx:11` | S |
| C6 | CHANGE | Pagination clamp / contract | `search.ts:91` | S |

---

## 6. Roadmap remaining (from `ROADMAP_UX.md` / `NEXT_STEPS.md`)

| # | Item | File(s) | Size | Status |
|---|---|---|---|---|
| 3.5 | Author override at upload (reads from PNG) | `UploadPanel.tsx` | S | TODO |
| 4.7 | Notifications/reminders (starting, reg open/close, ships dealt) — needs a design pass: delivery channel, schema, user prefs | new lib + games routes | L | TODO |
| 4.8 | Real-time / polling refresh (registrations, bracket, deals) | `games/[id]/page.tsx` | M | DONE 2026-08-21 |
| 4.9 | Roulette polish: skip, share, history chips, aria-live announcement | `RouletteGame.tsx` | M | DONE 2026-08-21 |
| 4.10 | Roulette picker: full list, deep-link selectable, copy-share, error states, fetch race fix | `roulette/page.tsx` | M | DONE 2026-08-21 |
| 5.2 | My Ships: filter by name/author, sort, show-more pagination, Upload CTA empty state, error retry | `my-ships/page.tsx` | M | DONE 2026-08-21 |
| 5.4 | A11y/perf polish: lightbox scroll-lock + focus return, HiDPI radar canvas, live-region spinner, roulette aria-disabled | several components | S | DONE 2026-08-21 |
| 4.4- | Bracket editable matchups / re-seed / score tracking (remainder) — touches the verified bracket core; needs its own QA cases | `Bracket.tsx`, games API | L | TODO |

Out-of-scope by design: guest registration username-keyed/unverified; Turnstile only on critical mutations; `Math.random` for roulette; login migration guarded by an EXISTS probe so it runs only when needed.
Shipped alongside (2026-08-21 sweep, commit `ed03b37`): idempotent collection ship append (`NOT ANY` guard), advisory-locked contestant seed assignment, insert-retry invite codes on the unique index, case-insensitive ownership checks, migration 008 signature lookup index, error/retry states for games list and collection loaders. Verified with QA suite 60/60 plus `scripts/qa-double-elim.ts` all-pass (commit `68ac29b`).

---

## Verified clean — no action

Auth/authz on mutations, SQL parameterization (whitelist in `updateGame`), bracket transactional guards, `ON DELETE CASCADE`, `sanitizeHtml`, Turnstile dev bypass symmetry, proxy limiters, a11y baseline (`role="status/alert"`, `Bracket aria-live`, roulette keyboard), 0 `TODO/FIXME` in `src/`.

---

## Execution order (suggested)

1. F1+F2 — ship detail consistency (unblocks S6)
2. P1-01–P1-04 — data-loss fixes
3. P2-14 + P2-09/10/11 — indexes + batching
4. F3 app + hydrations FE-07/08
5. A11y batch
6. Suite retry U2 (land even before F3)
7. Commit the 9 already-fixed files (`api/games/*`, `GameCard`, roulette/bracket helpers, `006-registration-integrity.sql`) when green

*Sources: `CODE_AUDIT_2026-08-21.md`, `FULL_CODE_AUDIT_2026-08-21.md`, `AUDIT_ACTIONS_2026-08-21.md`, `ROADMAP_UX.md`, `NEXT_STEPS.md`, `docs/plans/code-cleanup.md`, QA logs `qa-postfix5/7`.*
