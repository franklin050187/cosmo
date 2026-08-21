# Cosmoship agent rules (opencode and t3 code preview)

This is a Next.js 16 App Router with React 19, TypeScript, Tailwind v4, PostgreSQL on Supabase (`pg`), Discord OAuth with httpOnly JWT, UploadThing, and Cloudflare Turnstile, deployed on Vercel. Dev server must run on port 8000 (`npx next dev -p 8000`) for the Discord OAuth redirect.

## Stack pointers
- Env validated at startup in `src/lib/env.ts`; copy `.env.example` → `.env` and restart dev after edits. Verify `curl -s -o /dev/null -w "%{http_code}" http://localhost:8000` → 200.
- Checks: `npx tsc --noEmit` (required), `npm run lint`, `npm test` (`vitest run`). Migrations: `npm run migrate`. QA suite: `node --env-file=.env --no-warnings scripts/qa-suite.ts` (+ `scripts/qa-double-elim.ts` for bracket regression, 65 cases).
- Trust boundary: `x-forwarded-for`/`x-real-ip` trusted for `anonIdFor`, `getClientIp`, Turnstile `remoteip` - safe on Vercel only; plain reverse proxy must overwrite those headers.
- Current branch `phase4-tournament-brackets` - see `NEXT_STEPS.md`, `docs/ROADMAP_UX.md`, `docs/CODE_AUDIT_2026-08-21.md` for open work (4.4 remainder, 4.7 notifications, 4.8 polling, 4.9/4.10 roulette polish, 5.2 My Ships).

## Harness: opencode + t3 code preview
- Harness is **opencode** (local). Skills live in `.opencode/skills/<name>/SKILL.md` and are loaded via the `skill` tool. Do not use `.cursor/` layout.
- Browser verification uses **t3 code preview** tools: `t3-code_preview_open`, `t3-code_preview_navigate`, `t3-code_preview_snapshot`, `t3-code_preview_click`, `t3-code_preview_type`, `t3-code_preview_evaluate`, `t3-code_preview_scroll`, `t3-code_preview_resize`, `t3-code_preview_set_appearance`, `t3-code_preview_recording_start/stop`, `t3-code_preview_wait_for`. Prefer these over raw `curl` when the bug is visual, hydration, or layout-related.
- Always drive `http://localhost:8000` after ensuring dev is running. Use `snapshot` before any click/type. Capture evidence with `t3-code_preview_evaluate` or screenshots for audit trails.

## Skills (17 installed in `.opencode/skills/*/SKILL.md`)
Load via `skill({ name: "<name>" })` when the trigger matches. Descriptions are in each `SKILL.md` frontmatter.

**Top workflow skills**
- `diagnosing-bugs` - hard bug diagnosis loop (build tight red feedback loop first, then minimise → hypothesise → instrument → fix → regression-test). Redact secrets as `<REDACTED>`.
- `tdd` - red→green at pre-agreed seams only; one slice/one seam/one minimal impl per cycle; vertical tracer bullets. Consult `codebase-design` if seam placement is unclear.
- `code-review` - two-axis parallel review of `git diff <fixed-point>...HEAD` against **Standards** (repo standards + Fowler smells) and **Spec** (originating issue/spec). Pin fixed point, cite file:line.
- `blast-radius` - what a change breaks beyond grep; prove the single safety fact by running real code to confidence step 4/5 before shipping.
- `architect` - sketch types/signatures/module boundaries (`not implemented`) via `arena` bakeoff before coding; scrap and re-ground if friction repeats.
- `arena` - fan out N parallel attempts (partition/race/mix), cross-judge on different family, pick base, graft best ideas, verify.
- `improve-codebase-architecture` - scan hot spots (`git log --oneline`, `CONTEXT.md`/ADRs), present `architecture-review-*.html` with Tailwind+Mermaid, then grill chosen opportunity.
- `create-verification-skill` / `maintain-verification-skill` - generate/maintain `verify-*` skills that drive the real app via t3 preview and keep evidence isolated per run.
- `codebase-design` - vocabulary for deep modules (interface, seam, adapter, leverage, locality).
- `technical-writing` - Diátaxis + Google style + STE (≤20/25 words) + Global English; pick mode tutorial/how-to/reference/explanation.

**Type and code quality**
- `typescript-best-practices` - discriminated unions, branded types, exhaustive `never`, `unknown>any`, no `as`, `satisfies>as`, boundary parse, schema-derived types. Applies on every `*.ts`/`*.tsx` edit.

**Principles (leaf skills, triggered by code pattern)**
- `principle-fix-root-causes`, `principle-encode-lessons-in-structure`, `principle-prove-it-works`, `principle-make-operations-idempotent` - always consider when editing bracket, cache, registration, or authz code.

**Always-run**
- `unslop` - cut 31 AI tells and add human voice. **Must always run after every writing task** (docs, ADRs, `docs/CODE_AUDIT_*.md`, `README.md`, PR descriptions, comments, user-facing copy). Scan → rewrite → add soul → self-audit “what makes this obviously AI?”. Never skip, even for short messages.

## Project conventions
- API shape: `{ok,data}` / `{error}`; `requireAuth` + `isGameOwner` checks on mutations; dynamic `SET` allowlist in `updateGame` (`src/lib/db/games.ts:183`).
- Bracket logic: `src/lib/db/games.ts:buildSingleElim/buildDoubleElim`, `src/lib/bracket-util.ts:computeChampionFromSlots`, `src/components/games/Bracket.tsx` (grid + SVG connectors, winner-drop dashed lines, BYE labels, `aria-live`). Single-source champion math - delegate via `computeChampionFromSlots`.
- Caching: avoid `cachedQuery` for primary-key `getImageData`/`getCollectionsForShip` - use direct `fetchOne` (`docs/AUDIT_ACTIONS_2026-08-21.md:F1`). `bumpDbVersion` does not cross bundles.
- Upload replace flow: poll `GET /api/ship/[id]` `cache: "no-store"` until `data` changes before navigating; never `setTimeout(1000)`.
- Rate limiting: generic `src/proxy.ts` `apiLimiter` (600/min) + optional per-route limiters; guest registration needs `MAX_USERNAME=40` server clamp and `ON CONFLICT DO NOTHING` with CI indexes `ux_game_registrations_game_username_ci`.

## Verification before done
- Follow `principle-prove-it-works`: script the check, run it, paste evidence. For bracket/cache/hydration changes, run `scripts/qa-double-elim.ts` and at least one focused `qa-suite` phase.
- For private-game visibility or authz changes, verify `GET /api/games/{id}` gates `invite_code` for anon vs owner/participant via t3 preview + direct fetch.
- Redact secrets; never commit `.env` or log real Turnstile tokens (dev test keys are in local `.env`; restore real keys before prod).

## External references
- Cursor pstack skills: https://github.com/cursor/plugins/tree/main/pstack/skills
- mattpocock skills: https://github.com/mattpocock/skills/tree/main/skills/engineering
- Next.js 16 docs in `node_modules/next/dist/docs/` - check before writing new routes.
