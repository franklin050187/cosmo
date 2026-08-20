# Next Steps (updated 2026-08-17) — Phase 4: Games, Roulette & Tournament Brackets

Status legend: ✅ DONE · 🚧 IN PROGRESS · ⬜ TODO · N/A NOT RELEVANT (superseded by current changes)

This file was the original plan (saved 2026-08-14) for the games/roulette phase. Rechecked
against the current implementation; status per point below. Deeper UX polish items live in
[`docs/ROADMAP_UX.md`](docs/ROADMAP_UX.md) Phase 4.

## 1. Check code structure — ✅ DONE (one-time prep, executed during implementation)

- ✅ DB layer (`src/lib/db/`, pool/client, migrations under `scripts/migrations/` 001–005; games tables: `games`, `game_ships`, `game_registrations`, `game_contestants`, `game_matches`, `game_ship_draws`).
- ✅ API conventions (`{ok,data}/{error}`, `requireAuth`, serializers) — games routes mirror `/api/collections/*`.
- ✅ Page conventions (`useAuth`/`RequireAuth`/`useAuthFetch`, server/client split).
- ✅ Middleware: confirmed `src/proxy.ts:18` applies the generic `apiLimiter` to every `/api/*` path, so `/api/games/*` needs no registration. **N/A** — the "confirm or register" task is resolved.
- ✅ Identity: Discord id/username keying (`src/lib/auth.ts`, `src/lib/api.ts`).
- ✅ Nav: "Games" link added to `Header.tsx` `NAV_LINKS` (desktop + mobile).

## 2. Feature: Ship Roulette — ✅ DONE

- ✅ Trigger: "Ship Roulette" button on `/collections/[id]` (links to `/roulette?collection=…`) and per-game roulette.
- ✅ Options: the **API route** was chosen — `POST /api/games/[id]/roulette` with rarity-based weighted draw (`game_ship_draws`), plus a dedicated `/roulette` page (`RouletteGame.tsx`). **N/A** — the "client-side draw from loaded collection ships" option was superseded.
- ✅ UX core: reveal of the drawn ship, anti-spam while rolling, share. ⬜ Remaining polish: skip/cancel, draw history, accurate odds, `aria-live` (ROADMAP_UX 4.9); roulette picker pagination / deep-link / copy-share / error states (4.10).

## 3. Feature: Game Planning — ✅ DONE

- ✅ Data model: `games`, `game_ships` (snapshot table), `game_registrations`; added during build: `game_contestants` (seeded slots + `losses`), `game_matches` (`bracket`, `round`, `position`, contestants, `winner`), `game_ship_draws`; `games.bracket_type` + scheduling fields (migrations 002–005).
- ✅ Pages: `/games`, `/games/new`, `/games/[id]`, `/games/join/[inviteCode]`.
- ✅ API: create/list/detail, register (`POST /api/games/[id]/register`) + leave (`DELETE` on the same route), contestants, bracket generate, match winner + reset, roulette, by-invite join; writes are login-gated and ownership-checked (403 for non-owner).
- ✅ Registration by Discord username: logged-in users auto-register by id/username; guest entry resolves via `resolveUsernameToDiscordId` (username-keyed/unverified, documented as accepted).

## 4. Tournament brackets — ✅ DONE (core) / ⬜ TODO (polish)

Implemented and verified (branch `phase4-tournament-brackets`):

- ✅ Single elimination (`buildSingleElim`) and double elimination (`buildDoubleElim`): losers bracket (Challonge-style rounds) + grand final with optional bracket-reset round; R1 winners byes auto-advance.
- ✅ Losers-bracket round-1 **singleton auto-advance** (a lone contestant whose other slot is fed by a WB R1 bye auto-advances; reverted on undo) and the `undoWinner` round-1/round-2 mismatch fix.
- ✅ `Bracket.tsx` rewritten: aligned CSS grid + SVG connector lines with winner-path highlighting; double elim lays out winners on top, losers beneath, GF rightmost; the ✓ (set winner) is gated until both feeding matches are decided.
- ✅ Loss tracking (`game_contestants.losses`) and champion derivation (GF winner, reset handled).
- ✅ `Bracket.tsx` **winner-drop connector lines** (WB loser → LB target, dashed, lit when decided) + **"BYE" labels** on decided bye slots.
- ✅ Verification: `tsc`/lint clean; QA coverage = `scripts/qa-suite.ts` (incl. `P3-G1..G7`) + focused `scripts/qa-double-elim.ts` (incl. new section [14] — LB singleton auto-advance, undo revert, BYE labels + winner-drop-line UI checks).

Remaining in this phase:

- ✅ "Explain byes & advancement" copy + `aria-live` on winner/champion (ROADMAP_UX 4.4 remainder) — `Bracket.tsx` has an `aria-live="polite"` status region announcing "advances" / "is the champion" and a legend explaining decided matches, winner-drop lines, and BYE slots; the game page explains ✓/✗/BYE/dashed-line semantics.
- ✅ Results/outcome view + auto-mark-finished with champion summary (ROADMAP_UX 4.5) — champion + runner-up card shown once decided; owner-only "Mark game finished" (`POST /api/games/[id]/finish`, refuses when no champion).
- ⬜ Real-time / polling refresh for registrations, bracket, deals (ROADMAP_UX 4.8).
- ✅ Game-card badges (status / private / roulette / "you're registered", relative dates) — `GameCard.tsx` now renders status/private/roulette/registered badges plus relative date labels with timezone (ROADMAP_UX 4.1).
- ✅ Error vs success message styling (`role="alert"` on failures) and a proper delete-confirmation dialog (currently native `confirm()`) (ROADMAP_UX 4.2, 4.3) — `msg` state carries a kind (error/success/info) rendered with distinct colors + `role`, and a reusable `ConfirmDialog` replaces the native `confirm()` for delete.
- ✅ Deal-ships results view (4.6); timezone labels/countdowns (4.12); `/game` vs `/games` IA collision (4.11) — draws show ship image + rarity + "you" highlight with a re-deal confirmation; dates show tz + countdown; the About-the-Game page moved from `/game` to `/about-game` (redirect added) with a header link.

## Verification (from the original plan) — ✅ DONE

- ✅ `npx tsc --noEmit`, lint, and build clean.
- ✅ QA coverage added (games/roulette/bracket cases in `qa-suite.ts` + focused bracket test).
- ✅ `src/proxy.ts` needs no changes — generic `/api/*` prefix limiter already covers games routes.