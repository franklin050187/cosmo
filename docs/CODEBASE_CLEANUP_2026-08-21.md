# Codebase cleanup audit, 2026-08-21

This document lists cleanup and best-practice findings for the CosmoShip codebase. It records what was found and where. No code was changed to produce it.

Findings were gathered by four read-only passes over the tree (repo hygiene, duplication and caching, type discipline, API authz), then re-checked against source before being written down here. Line numbers refer to the working tree at commit `6a95eb1` plus uncommitted changes. The worktree is dirty: `git status --short` reports 34 modified, deleted, or untracked paths. Re-run `git status` before acting on any path below.

Severity meanings:

- **High.** Breaks a fresh clone, loses data, or lets a user affect another user.
- **Medium.** Wrong behavior reachable by users, or a contract two parts of the code disagree on.
- **Low.** Extra weight or drift risk with no user-facing failure today.

## Summary

The codebase is in better shape than most of this size. SQL is parameterized everywhere, `tsc --noEmit` and `eslint` both pass clean, champion math has one home, and there is no TODO debt. The serious problems are not in application logic. They are in the repo itself: files that were never committed, scripts whose targets were gitignored out of existence, a test script that runs zero tests, and one authorization hole in guest registration.

Five findings deserve attention before any feature work:

1. A fresh clone cannot compile. `src/lib/html-text.ts` is imported by `GameCard.tsx:6` but is untracked.
2. Four npm scripts crash because their target files are gitignored and absent from disk.
3. `npm test` exits 1. Vitest is installed but no test file exists anywhere.
4. Any visitor can remove a registered contestant from a game by knowing that contestant's username.
5. Public game payloads include `invite_code`, against the stated anon-gating convention.

## Build and repo hygiene

### A fresh clone does not compile

`src/lib/html-text.ts` is untracked (`git status --short` shows `??`) while `src/components/games/GameCard.tsx:6` imports it. Anyone cloning the repo gets a module-not-found error on first build. Committing this one file is the single highest-value action in this document.

Two more load-bearing files are also untracked:

- `scripts/migrations/006-registration-integrity.sql`. `docs/TASKS.md:33` cites it as the fix for finding A6, so the migration that backs a documented fix exists only on one machine.
- `docs/TASKS.md` itself. It calls itself the single source of truth for open work (`docs/TASKS.md:3`).

### Four npm scripts point at files that are not on disk

`package.json` defines `migrate`, `backfill-signatures`, `backfill-prices`, and `import-builtins`. None of the four target files exist on disk, and `.gitignore` blocks them (the block starting near `.gitignore:116`, including `scripts/migrate.ts`). AGENTS.md tells every agent to run `npm run migrate`, which fails immediately.

The comment above that ignore block says these scripts should be kept "in repo, not in deploy package". Keeping files out of the deploy package is `.vercelignore`'s job, and a `.vercelignore` already exists. Fix the ignore rules (or delete the script entries), not the symptom.

### The docs move to docs/ is half done

Root-level `NEXT_STEPS.md`, `QA_FINDINGS.md`, `QA_TEST_PLAN.md`, and `SEARCH_REDESIGN.md` are deleted in the worktree but still tracked at HEAD. Byte-identical copies sit in `docs/`. Three of those `docs/` copies are gitignored, so they do not appear in `git status` at all, while identical root copies show as deletions. `docs/NEXT_STEPS.md` and `docs/TASKS.md` are tracked nowhere.

Net effect: `git status` misrepresents reality, and none of the planning documents survive a clone except `ROADMAP_UX.md`. Complete the move: commit the root deletions, track the `docs/` copies, and drop the three ignore lines.

Related drift: `docs/NEXT_STEPS.md:11` says migrations run 001 through 005. Only 002 through 005 exist; `001-analytics-anon-id.sql` is gitignored and gone. Either restore it or correct the range.

### Tracked analysis artifacts

`scripts/price-test/` holds five PNGs, six extracted JSON files, and two one-off decode scripts. One file references them (`scripts/extract-json.js:159`). This is a regenerable Steam-price analysis workspace living in git. Remove it from tracking; keep a copy locally if you plan to rerun the analysis.

Also untracked and stray: `scripts/qa-diag-s6.ts` looks like a one-off diagnostic. Delete it or commit it deliberately.

`public/` carries six unused create-next-app leftovers (`file.svg`, `globe.svg`, `next.svg`, `placeholder.png`, `info.png`, `sprite.webp`) with zero references in src or CSS.

### AGENTS.md cites documents that do not exist

AGENTS.md points readers to `docs/CODE_AUDIT_2026-08-21.md` and `docs/AUDIT_ACTIONS_2026-08-21.md`. Neither exists anywhere in the repo or on disk. An agent following AGENTS.md cannot find the open-work trail. Point those references at `docs/TASKS.md` once it is committed, or commit the audit docs it means.

## Checks that verify nothing

`npm test` maps to `vitest run` and vitest is installed as a devDependency, but the tree contains no `*.test.*` or `*.spec.*` files. Running it today exits 1 with "No test files found". Two consequences:

- The check AGENTS.md lists as required verifies nothing. It fails loudly today only because vitest refuses to pass on an empty suite; if someone adds `--passWithNoTests`, it would silently green-light everything.
- Commit `3873a28` says "add focused test for replace and delete ship flow" but added `scripts/qa-replace-delete.ts`, a QA script driven manually, not a test vitest can find.

The prime candidate for real unit tests is `src/lib/bracket-util.ts`: pure functions, no database, and known sharp edges around grand-final reset semantics. `computeChampionFromSlots`, `computeRunnerUp`, and slot-order helpers would lock down the bracket regression surface that currently only `scripts/qa-double-elim.ts` covers against a live server.

## Authorization

### Any visitor can remove a registered contestant

This is the one high-severity application finding.

`DELETE /api/games/[id]/register` resolves identity from the request body when no session exists (`register/route.ts`, DELETE handler). For a logged-out caller, `resolveIdentity` returns `discordId: null` plus whatever `username` string the body carries. `leaveGame` then deletes where `discord_id = $2 OR LOWER(discord_username) = LOWER($3)` (`games.ts:417-419`). Because the predicate is an OR, a null discord_id does not stop the match: the username alone identifies the row.

Guest self-deregistration by typed username is the documented design. Deleting *other* people is not. A visitor who knows a participant's public Discord username can deregister a Discord-registered participant mid-tournament.

Fix direction: when the caller has no session, restrict deletion to rows whose `discord_id IS NULL` and match the supplied username. Better still, make the owner the only identity allowed to remove someone else, and require a session for removing yourself.

### invite_code ships in every public game payload

`GAME_COLUMNS` and `GAME_LIST_SELECT` both select `invite_code` unconditionally (`games.ts:35,38-40`). So `GET /api/games` hands every visitor the invite codes of all public games, and `GET /api/games/[id]` includes it for any viewer. Private-game gating itself is solid: anon gets a 404, registration matches the exact code, and `/api/games/by-invite/[code]` requires the code. What is missing is field-level redaction on public reads.

Fix direction: add one `stripGameForViewer(game, viewer)` helper used by every games endpoint, so a future column addition cannot quietly leak again.

### Turnstile coverage on mutations skips the highest-abuse route

Enforced on: game create/update/delete, collection CRUD, ship update/delete, uploads, and (oddly) the admin dashboard GET. Not enforced on: guest register POST, contestants add/remove, favorite/unfavorite, download counter, price, check-duplicate.

Guest register POST is the cheapest way for an abuser to inflate rosters, and it sits behind only the shared 600/min limiter. Adding Turnstile plus a tight per-route limiter there closes the biggest gap for little work. The mismatch inside uploadthing is worth noting too: `pngUploader` verifies tokens while `shipReplacer` does not (`uploadthing.ts:56` vs `:120-145`).

### Rate limiting and shape deviations

Every `/api/*` path passes through the proxy's apiLimiter, so nothing is entirely unprotected. Roster-mutating routes share that generous budget with all other traffic. Limiter keys come from `x-forwarded-for`/`x-real-ip`, which AGENTS.md already flags as trusted only on Vercel.

Three response-shape deviations from the `{ok,data}` / `{error}` convention:

- The proxy's 429 body lacks `ok:false` (`proxy.ts:90`).
- `POST /api/auth/logout` returns `{ok:true}` with no `data`.
- Uploadthing routes return UT-native errors. Acceptable, but clients must special-case them.

## Input validation at API boundaries

Two house styles coexist. The games routes and `analytics/log` parse everything: enum Sets, typeof checks, length clamps, date parsing. Three collections routes trust the wire:

- `await req.json()` sits outside try/catch in `collections/route.ts:39`, `collections/[id]/route.ts:48`, and `collections/[id]/ships/route.ts:24`. Malformed JSON produces a framework HTML 500 instead of `{error:"Invalid JSON body"}` with a 400 status.
- `PUT /api/collections/[id]` passes title and description through raw (`:55-58`), while the same resource's POST trims and validates. Same entity, two contracts.
- `POST /api/collections/[id]/ships` rejects `"5"` but accepts `1.5` and `1e9` as ship ids (`:25-28`); a `Number.isInteger` range check would match the style elsewhere.

The largest gap is `PUT /api/ship/[id]` (`ship/[id]/route.ts:46-93`). Its body parameter carries a TypeScript annotation, but nothing checks runtime types, array shapes, or string lengths before the values reach `updateShip`. The annotation is decoration over `req.json()`'s `any`.

Search has its own variant: `SearchFilters` types numeric filters as strings (`db/search.ts:8-11`), nothing coerces them, and `?minprice=abc` reaches Postgres as `$1` against a numeric column. Postgres raises, the route 500s. Coercing numerics in `searchFromQueryString` turns bad input into an ignored filter.

Small ones: `bracket/route.ts:26` treats the string `"false"` as true for shuffle; `matches/[matchId]/route.ts:35` accepts `"12abc"` as 12 via parseInt. Neither crashes anything today, but the patterns spread when copied.

## Types

Overall verdict first: `strict` is on, there are zero `as any`, zero ts-ignore directives, and real discriminated unions in `AuthGuard` and db results. The census: roughly 74 bare `as` assertions (mostly DOM events and `(err as Error)`), about 16 non-null `!`, two eslint-disabled `any`s in `normalize-ship.ts:11,16`, and zero uses of `satisfies`.

The weak spots concentrate at boundaries:

- **pg rows cross into typed land unchecked.** `fetchOne`/`fetchAll` return pg's `any[]` rows cast by return-type annotation alone (`core.ts:147-155`). `getImageData(): Promise<ShipRow | null>` is a compile-time claim with no runtime evidence. A renamed column keeps `tsc` green while fields silently vanish. Making the fetchers generic per call site, plus shape checks on the hot paths that feed client props (`getImageData`, `getGameDetail`), makes the claims honest or loudly wrong.
- **Dates lie about their type.** Migrations declare `timestamptz`; node-pg delivers JS `Date`. Yet `GameSummary.created_at: string` (`games-types.ts:17-21`) and `ShipRow.date: string` (`ships.ts:19`). True after JSON serialization, false for server components consuming rows directly. The home page feeds raw rows into `UpcomingGameItem.game_date: string` (`page.tsx:33-39`) and survives only because `new Date(Date)` happens to work.
- **Duplicate row interfaces wait to drift.** `ShipRow` is defined identically in `db/ships.ts:4` and `db/users.ts:4`; `CollectionRow` likewise (`users.ts:22` vs `collections.ts:4`). Ownership predicates are also defined twice (`core.ts:157` vs `users.ts:32`).
- **The vendored decoder pushes casts downstream.** `cosmoShip.d.ts` omits exports the JS really has (`FloatValue`, `ColorValue`, `checkInputType`, others), forcing implicit-any duck typing in normalize-ship and four copies of the same decode cast (`uploadthing.ts:79,151`, `UploadPanel.tsx:98`, `decode/page.tsx:49`). One exported `isShipShape(x): x is ShipData` guard deletes all four and closes the leak.
- **Representable invalid states cost assertions.** In `RouletteGame.tsx`, `phase` and `result` are separate state variables (:62,:64), so reveal-with-no-result is representable and paid for with non-null assertions at :213. A union `{phase:"reveal", result: DrawResult}` removes both casts. The same shape argument applies to `GameMatch`, whose nullable slots allow a decided match with no contestants; `bracket-util.ts` already works around this with its narrower `ChampionSlots` seam.

## Duplication and dead code

Roughly 350 to 450 duplicated lines are removable, plus one fully dead module:

- **Dead module.** `src/lib/db/analytics.ts` (103 lines) defines `logEvent` and `getDashboardData` superseded by `src/lib/analytics-db.ts`, which every real consumer imports. The stale copy is reachable only through the `db/index.ts:96-97` barrel re-export. Importing analytics through the barrel gets the wrong implementation. Delete the module and the re-export.
- **Bracket structure math copied.** The winners-bracket loop in `buildDoubleElim` (`games.ts:590-607`) duplicates `buildSingleElim`'s loop (`games.ts:550-567`), bye handling included, about 18 lines. `nextPowerOfTwo` exists twice (`games.ts:499`, `Bracket.tsx:130`). Hoist both into `bracket-util.ts` so client geometry and server generation share one implementation; `scripts/qa-double-elim.ts` guards the change.
- **Client fetch boilerplate, ~32 sites.** Every component hand-rolls the same try/parse/check wrapper around `{ok,data}`. Worst offender: `games/[id]/page.tsx` eleven times. One `apiGet`/`apiPost` helper collapses 150 to 190 lines and gives error handling a single seam. `useAuthFetch` duplicates even itself internally (`useAuthFetch.ts:13-35` vs `:37-70`).
- **Verbatim display constants.** `DISPLAY_TAGS` and `formatPrice` are copy-pasted between `ship/ShipCard.tsx:12-25` and `roulette/RouletteGame.tsx:34-47`.
- **Client-side reimplementations of server rules.** The registration-window check appears twice (`games/[id]/page.tsx:73-80`, `join/[inviteCode]/page.tsx:28-33`) mirroring `games.ts:395-400`; the ownership check mirrors `isGameOwner` (`games/[id]/page.tsx:26-32`).
- **Double barrel.** `src/lib/db.ts` is a one-line re-export of `db/index.ts`, which is itself a 98-line barrel. Forty-two callers hit `@/lib/db`. One barrel is enough.
- **Structural mirror pair.** `applyWinner`/`undoWinner` (`games.ts:721-927`) repeat paired SQL with the same slot ternary ten times. A slot-for-match helper would shrink both.

Low-priority dead exports, verified zero callers: `calculateShipStats` sync variant (`physics.ts:489`), `imageDataToPngBlob` in the vendored lib, several barrel re-exports nobody consumes (`db/index.ts:8-12,53,79,86`), and about 11 internal-only functions carrying `export`.

Component size outliers, by line count:

| File | Lines |
| --- | --- |
| `src/app/games/[id]/page.tsx` | 977 |
| `src/components/games/Bracket.tsx` | 645 |
| `src/components/ship/ShipDetailView.tsx` | 465 |
| `src/components/upload/UploadPanel.tsx` | 463 |
| `src/components/ship/ShipReconstruction.tsx` | 454 |
| `src/components/roulette/RouletteGame.tsx` | 445 |

`games/[id]/page.tsx` mixes data fetching, a 30-hook edit form, registration, roulette, bracket rendering, and share links. Splitting it matters, but not as standalone churn; split along the seams when feature work next touches it. The ~150-line SVG connector draw effect inside Bracket.tsx (`:336-484`) is the cleanest extraction candidate there.

## Caching

Verified healthy. No `cachedQuery` call site is a primary-key lookup; the four sites are list or facet queries (`collections.ts:49`, `search.ts:21,160,168`). Primary-key reads bypass cache correctly: `getImageData` (`ships.ts:22`), `getShipForReplacement` (`ships.ts:29`), `getCollectionsForShip` (`collections.ts:127`). Every write path across ships, collections, favorites, games, and users bumps the version. No stale-write gaps turned up.

Two residuals worth knowing rather than fixing now. Author and tag facet counts cache for 300 seconds (`search.ts:160,168`), the longest staleness window in the app, long enough for a creator to wonder why their new tag is missing. And `cachedQuery` has no in-flight deduplication (`cache.ts:28-42`), so concurrent identical misses each run the query. On Vercel's multi-instance lambdas this whole cache is per-instance memory anyway, which bounds how much either tweak can matter.

## What already holds

Credit where the conventions are real, since future changes should preserve them:

- `npx tsc --noEmit` and `npm run lint` both pass with zero output today.
- All SQL values are parameterized. Dynamic column construction goes through allowlists in `updateGame` (`games.ts:277-330`), `updateCollection`, and search's `ORDER_COLUMNS`. No unsafe interpolation found anywhere.
- Champion math has exactly one home in `computeChampionFromSlots`, delegated by both server builders and the client component. The single-source rule holds.
- Zero TODO/FIXME/HACK markers in src. Zero commented-out code blocks.
- Session cookies are httpOnly, secure, sameSite strict, 7-day expiry matching the token TTL; the JWT secret comes from env with a hard throw and no fallback.
- Migration 006 is idempotent and defines the CI indexes the registration flow relies on, including `ux_game_registrations_game_username_ci`.
- Date formatting is centralized in `format-date`; image hosts and rarity metadata use exhaustive tables.

## Suggested order of attack

Each step lands independently and stays verifiable on its own.

1. Commit `src/lib/html-text.ts`. Unblocks every fresh clone.
2. Commit `006-registration-integrity.sql` and `docs/TASKS.md`. Finish the docs move (root deletions, track `docs/` copies, drop the three ignore lines). Repair the gitignore block so `npm run migrate` works again.
3. Gate register DELETE as described under Authorization. Highest-severity application fix.
4. Add `stripGameForViewer` and stop shipping `invite_code` to non-participants.
5. Wrap the three bare `req.json()` calls; align the proxy 429 body and logout POST shape.
6. Runtime-validate the ship PUT body and clamp title/description lengths.
7. Coerce numeric search filters in `searchFromQueryString`.
8. Delete `src/lib/db/analytics.ts` and trim the barrel.
9. Introduce the shared `apiGet`/`apiPost` helper and hoist `DISPLAY_TAGS`/`formatPrice`.
10. Add the first real vitest tests over `bracket-util.ts`.
11. Add Turnstile and a tight limiter to guest register POST.
12. When feature work next touches `games/[id]/page.tsx`, split it along its five concerns.

## Regenerating the evidence

```
npx tsc --noEmit          # passes, no output
npm run lint              # passes, no output
npm test                  # exits 1: "No test files found"
git status --short        # 34 dirty paths incl. ?? src/lib/html-text.ts
rg -n "invite_code" src/lib/db/games.ts   # GAME_COLUMNS :35, GAME_LIST_SELECT :38
rg -c "json.ok" src/components src/app    # count the hand-rolled fetch wrappers
wc -l src/app/games/\[id\]/page.tsx src/components/games/Bracket.tsx
```
