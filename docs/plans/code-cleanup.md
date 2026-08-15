# Code Cleanup — Planning Document (branch: `code-cleanup`)

Prepared 2026-08-15. Scoped from `NEXT_STEPS.md`, `docs/ROADMAP.md`,
`docs/CODE_REVIEW_FINDINGS.md`, `docs/QA_FINDINGS.md`, `docs/QA_TEST_PLAN.md`,
`docs/PROJECT.md`, plus a fresh codebase verification pass on this branch.

**Scope exclusions (per request):**
- ❌ **Bad-IP blocklist** — deliberately NOT in this plan (see `docs/plans/bad-ip-blocklist-503.md`).
- The Ship Roulette and Game Planning *features themselves* are shipped/committed
  (`e491aac`, `06792f8`); cleanup items *around* them (structure, a11y, tests) ARE in scope.

Legend: ✅ verified done · ⬜ confirmed pending · 🔸 decision needed.

---

## 0. Verified state of the codebase (this branch)

Things the docs currently state that are **WRONG or stale** — fix the docs, not the code:

| Doc claim | Reality (verified) | Action |
|-----------|--------------------|--------|
| QA suite = **43 cases** (`CODE_REVIEW_FINDINGS`, `PROJECT.md`) | **51 checks** (34 `check()` + 10 parallel + 7 game/roulette `P3-G1..G7`) | Corrected the count in docs to 51 |
| `R5-2` rate-limit coverage **missing** (ROADMAP 1.1, QA_FINDINGS 1) | `P2-G11` + `P2-G12` **now present** in `qa-suite.ts` | Mark resolved |
| `AnalyticsTracker` outside `<Suspense>` (ROADMAP 5.6 ⬜) | **Wrapped** at `layout.tsx:72-74` | Mark done |
| Cross-tab login sync missing (ROADMAP 5.10 ⬜) | **Implemented** via `storage` listener (`useAuth.ts:80`) | Mark done |
| bfcache refresh "only collections has it" (ROADMAP 5.7) | **No page** has `pageshow`; claim is now stale | Re-word / mark pending (see S3) |
| Response envelope `R4-L18` "OPEN" (ROADMAP 4.1 ✅ but findings still 🔴 OPEN) | All API routes use `src/lib/api.ts` helpers; only bare `NextResponse.json({ok:true})` is logout | Resolve the finding entry |
| `db.old.ts` delete = done (ROADMAP 4.4 ✅) | **`src/lib/db.old.ts` still on disk** (693 lines, orphaned) | Actually delete (see S1) |
| `sharp` needed (ROADMAP 5.5) | Not installed (but a Node-side `sharp` exists in node_modules as a transitive dep) | See S2 |
| `P3-S12` responsive | Present; **`P3-S13`** (roulette dropdown, added this session) is in the suite but **not listed in `QA_TEST_PLAN.md`** | Add P3-S13 doc row |

---

## PART A — Code structure

### A1 ✅ Deleted `src/lib/db.old.ts`
693-line monolithic pre-modularization file, **zero references** in `src/` or `scripts/`
(grep-verified), not referenced via tsconfig/barrel. `git rm`'d. `src/lib/db/` is fully split
into domain modules + `index.ts` barrel. Verified: `tsc --noEmit`, `lint`, `build` all clean.

### A2 ⬜ (deferred, but should be decided) Merge the two ship decoders
`src/lib/cosmoShip.js` (945 lines, client, untyped) and `src/lib/server-decode.ts`
(472 lines, server, typed) are **near-identical re-implementations** of the OBNode
binary decoder (`decodeKeyElem`, `processBinaryValue`, `decodeLengthPrefixedString`,
`ByteReader`). They differ only in output wrapping (`{value}`/`{parts}` vs raw).
- Options: (a) extract a shared typed core `src/lib/binary.ts` + thin wrappers — big win,
  but higher risk to a critical path (duplicate detection depends on identical output);
  (b) at minimum add a **cross-check regression test** that asserts both decoders produce
  `normalize-ship`-equivalent output on the same fixture (cheap, high safety value).
- **Recommendation:** Option (b) now (test-only, low risk), schedule (a) for a dedicated
  refactor with fixture-golden tests.

### A3 ✅ Extracted `src/lib/games-types.ts`
Games types (GameMode, GameVisibility, GameStatus, GameSummary, GameParticipant,
GameContestant, GameMatch, GameShipDraw, GameDetail) moved to a dedicated
`src/lib/games-types.ts`. `src/lib/types.ts` re-exports them (existing `@/lib/types` imports
keep working); `src/lib/db/games.ts` now imports the canonical `GameMode`/`GameVisibility`/
`GameStatus` instead of redefining them (removed the duplication), re-exporting via
`export type { ... } from "@/lib/games-types"`. `db/index.ts` re-export unchanged.
Verified: `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean.

### A4 ✅ Added `loading.tsx` / `error.tsx` for `/games`
`src/app/games/loading.tsx` (spinner, `role="status"`) and `src/app/games/error.tsx`
(client, Card + "Try again" retry) now cover the whole `/games` tree (list, new, [id], join).
Matches the app-wide M15 pattern. Verified: routes return 200, build clean.

### A5 ✅ Verified RTE `labelId` — no call-site regressions
`RichTextEditor` `labelId` prop (optional) is set only by the two game forms
(`game-description`, `edit-game-description`); the other 4 call sites (upload, collection
new/edit, ship edit) fall back to `aria-label={placeholder || "Rich text editor"}` as before.
No behavioral change outside the game forms. Verified via grep + build.

---

## PART B — Security

### B1 ✅ ROADMAP 6.4 — JWT-probing observability
`getUserFromRequest` (`src/lib/auth.ts`) now logs invalid-token verification failures
(only when `DEBUG_JWT=1`) as a JWT brute-force probe signal, while keeping the 401
response indistinguishable. No analytics write needed; rate-limits bound the volume.

### B2 ⬜ ROADMAP 6.1 — `ANALYTICS_ANON_SALT` default is public
`.env` does **not** set it → resolves to the documented default `cosmo-anon-v1`, so anonymous
hashes are predictable. **Deploy-blocking for launch.**
- Action: generate a random salt for production `.env`; document that changing it invalidates
  the pinned QA anon id (`P4-N2` will fail loudly — intentional guard).

### B3 🔸 ROADMAP 6.5 — Session TTL / token rotation
`TOKEN_EXPIRY = "7d"` (`src/lib/auth.ts:11`), cookie `maxAge` 7d (`callback/route.ts:121`),
**no rotation**. This is already tightened from the old 30d. Decide whether 7d + no rotation is
acceptable for an OAuth-only app (likely yes); if stricter, add rotation at login.

### B4 ⬜ Turnstile on `/api/games/*` writes under dev-only skip — AUDIT
The games routes gate writes behind `requireAuth` (verified for POST `/api/games`), and
POST/PUT use `cf-turnstile-response`. Confirm **all** games mutation routes enforce Turnstile
via `verifyTurnstileFromRequest` consistently (create, edit, register, add-contestant,
bracket, roulette-deal, delete, leave) and that the `NODE_ENV=development` skip is the only
bypass. (Duplicate-detection style gaps here would be a silent hole.)

### B5 ⬜ ROADMAP 6.6 — CORS allowlist (verify at deploy)
`src/proxy.ts` already parses `ALLOWED_ORIGINS` and returns **no CORS headers when unset**
(audited: `corsHeaders` → `{}`). `.env:22` sets `http://localhost:8000`. Confirm the production
`ALLOWED_ORIGINS` value on deploy; default-deny is correct.

### B6 ✅ ROADMAP 6.3 / QA_FINDINGS — `x-forwarded-for` trust boundary
`anonIdFor`, rate-limiter IP (`getClientIp`), and Turnstile `remoteip` trust
`x-forwarded-for`/`x-real-ip`. Safe on Vercel (platform-set). Now documented as a
deployment constraint in `README.md` (Trust boundary section).

### B7 ✅ Turnstile console noise on localhost (root cause already understood)
On `localhost` the production site-key isn't authorized, so `challenges.cloudflare.com`
throws 600010/`No available adapters` and the widget **never completes** → `getToken()`
stays empty → create/edit forms block, EVEN in dev, because the *client* gate checks the token
before the server's `NODE_ENV=development` skip applies. Already documented as a foot-gun.
- **Fixed (2026-08-15):** `TurnstileWidget.getToken()` now short-circuits when
  `NODE_ENV=development` (returns a `dev-skip` sentinel), mirroring the server's skip and
  unblocking all forms locally. Production gating is intact.

---

## PART C — Not-finished items (re-verified for relevance)

### C1 🔸 ROADMAP 1.1 / QA_FINDINGS 1 — Rate-limit coverage in suite
**Now DONE** (`P2-G11` + `P2-G12` present). Update `CODE_REVIEW_FINDINGS.md` R5-2 and
`QA_FINDINGS.md` to resolved. No code needed.

### C2 ✅ ROADMAP 1.3 / QA_FINDINGS 4 — Remove `P3-S6` DEBUG leftover
Removed the diagnostic `cliEval` + try/catch debug block from `P3-S6` in
`scripts/qa-suite.ts` (kept the plain `waitText` + throw). `cliEval` is still used
elsewhere so the import remains.

### C3 ✅ ROADMAP 1.2 / R5-3 — Refresh stale `QA_TEST_PLAN.md` counts
P1-U2a/b/c are **read dynamically** by the suite, so the hardcoded `350`/`4`/`3`
were stale placeholders — updated the plan to say "matches live DB count". Added the
missing **`P3-S13`** (roulette dropdown) row. Corrected the "43 cases" figure to **51**
(34 `check()` calls + 10 parallel items + 7 game/roulette tests `P3-G1..G7`) across
`QA_TEST_PLAN.md`, `README.md`, `CODE_REVIEW_FINDINGS.md`, `PROJECT.md`, `ROADMAP.md`.

### C4 ⬜ ROADMAP 2.1 — Bad-IP blocklist
**EXCLUDED per request** — reference `docs/plans/bad-ip-blocklist-503.md`; do not action here.

### C5 🔸 ROADMAP 5.7 — bfcache refresh
The `pageshow` refresh that "only collections had" is now **absent everywhere** (grep found
nothing). If back-navigation staleness was ever a problem, this is a fresh (small) work item;
otherwise close as no-longer-needed. Confirm desired behavior first.

### C6 🔸 ROADMAP 5.5 — `@next/bundle-analyzer` + `sharp`
- `sharp` is a **transitive** dependency in node_modules (used by Playwright QA PNG handling),
  not a declared dep — confirm whether the app needs it directly (it doesn't today).
- `@next/bundle-analyzer` not present; only add if a bundle-size review is wanted.

### C7 🔸 ROADMAP 6.2 — Prod-specific pinned QA anon id
Comes with B2 (salt). Deriving a fresh pin for a deployed QA env is a launch-prep item.

### C8 ✅ ROADMAP 6.7 — Confirm live DB indexes
`idx_shipdb_discord_id`, `idx_collections_discord_id`, `idx_favoritedb_discord_id`,
`idx_shipdb_submitted_by`, `idx_collections_owner`, `idx_favoritedb_name` — **all 6 verified
present** in the live Supabase DB (2026-08-15) via `pg_index` query.

---

## Suggested execution order

**Quick wins (safe, this branch):**
1. `A1` delete `db.old.ts`
2. `C2` remove `P3-S6` DEBUG block
3. Docs hygiene: `C3` QA_TEST_PLAN counts+rows, fix the "43 cases" figure, resolve `R5-2`,
   `R4-L18`, and the false-done `4.4`/stale `5.6`/`5.10` roadmap marks.

**Dev-UX / correctness:**
4. `B7` dev-mode Turnstile client bypass (unblocks local form testing)
5. `B4` audit Turnstile coverage across all games mutation routes

**Small enhancements:**
6. `A4` games loading/error boundaries
7. `A2b` decoder cross-check regression test
8. `B1` JWT-probe observability

**Launch-prep (needs prod env/DB):**
9. `B2` set `ANALYTICS_ANON_SALT` · `C7` re-pin QA anon · `B3` session-TTL decision ·
   `C8` verify indexes · `B5`/`C6` confirm prod values.

**Deferred / decision-gated:**
10. `A2a` merge decoders · `A3` games-types split · `C5` bfcache decision · `C6` analyzer.
