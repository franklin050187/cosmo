# Production Readiness Assessment (2026-08-21)

Full-codebase review targeting a production deploy. Two focused audits (security/config, runtime/data)
plus feature-completeness checks. Verdict first, then the work list. Complements `docs/TASKS.md`.

## Verdict

**Close, but not deployable today.** One blocker, eight high-severity items — all bounded, none
structural. The security posture is genuinely good: no secrets in git history, JWT handling correct
(HS256 pinned, 32-char secret enforced, httpOnly/secure/strict cookie), OAuth state validated,
CSP nonce + strict-dynamic, default-deny CORS, every dev bypass confirmed unreachable in prod builds,
admin surface properly gated server-side.

---

## BLOCKER

| # | Issue | Where | Fix |
|---|---|---|---|
| B1 | `ANALYTICS_ANON_SALT` falls back to public `"cosmo-anon-v1"`; anon hashes (IP+UA) become brute-forceable. Known deploy-blocker since the cleanup plan (B2). | `src/app/api/analytics/log/route.ts:19`, `env.ts:54` declares it optional | Make it required in `envSchema` when `NODE_ENV=production`; generate a random value for prod `.env` |

## HIGH

1. **`npm run migrate` crashes** — `package.json:14` points at `scripts/migrate.ts` which doesn't exist; schema deploys are manual. Write the runner: apply `scripts/migrations/*.sql` in order against an applied-migrations tracking table.
2. **Pool has no timeouts** (`core.ts:90`) — `max:10` with no `connectionTimeoutMillis`/`idleTimeoutMillis`/statement timeout queues requests forever under load and can exhaust Supabase pooler slots across instances.
3. **Console-only logging** (~80 sites) — no structured logger or error sink; prod incidents are undiscoverable. Wire pino or Sentry behind one `log()` helper.
4. **UploadThing swallows processing failures** (`uploadthing.ts:108`) — returns `{shipId:null}` after persisting the file: orphaned UFS files, silent client failure. Rethrow and delete the uploaded file in the catch path.
5. **Upload decode may exceed serverless timeout** (`uploadthing.ts:74`, `server-decode.ts` gunzip up to 64MB) — export `maxDuration = 60` for the route and cap output length to real ship sizes.
6. **Per-instance caches/rate-limits** (`cache.ts:8`, `rate-limit.ts:15`) — on multi-lambda deploys, list/facet reads go stale independently (up to 300s for author/tag counts) and abuse limits multiply by instance count. Move both stores to shared Redis/Postgres, or drop the four cheap cached queries entirely.
7. **No `/api/health`** — uptime monitors can't probe DB connectivity. Add `{ok:true}` + `SELECT 1` with a short timeout.
8. **Homepage throws when DB is down** (`page.tsx:32`) — unguarded `searchFromQueryString`; wrap like its neighbor so the shell renders with "search unavailable".

## MEDIUM

9. Transaction `ROLLBACK` failure masks the original error (`core.ts:139`); destroy the client instead of releasing it.
10. `?page=-1` export mode serves 2000 rows × facets to anyone (`search.ts:93`) and bloats the in-memory cache; gate behind admin or cap at ~200 rows.
11. Download-all zips every PNG in unbounded parallel in-browser (`collections/[id]/page.tsx:106`); chunk batches of 5 or cap collection size.
12. `sitemap.ts` / `robots.ts` / logout fall back to `http://localhost:3000` when `CLIENT_URL` unset because they bypass `env.ts`; import the validated env so misconfig fails loudly.
13. Runtime DDL on first analytics request (`analytics-db.ts:17`) needs DDL grants in prod; remove now that migration 001 exists.
14. `.env.example`: replace real Discord guild snowflakes with placeholders; add a loud comment that localhost defaults must change for prod (or guard at startup).
15. Session JWT is 7d with no rotation (cleanup-plan B3 decision still open); cookie flags are otherwise exemplary.
16. Four auth handlers lack try/catch (`auth/session`, `is-admin`, `logout`, `auth/discord`) → raw 500s instead of `{error}` shape.
17. Register `process.on("unhandledRejection")` in `instrumentation.ts` so stray rejections log instead of crash self-hosted runs.

## LOW

18. HSTS `preload` served unconditionally — fine over HTTP, but don't submit preload until HTTPS is confirmed everywhere.
19. Page routes have no rate limiter (API-only today); optional generous page limiter if not on Vercel's shield.
20. `output:"standalone"` only matters for self-hosting; document the two deploy targets.

## Feature gaps worth deciding before launch

- **Privacy policy / terms page** — the site logs analytics events keyed by salted IP+UA hashes; a privacy note is expected once live publicly.
- **Author override at upload** (roadmap 3.5, S) — ships currently display whatever author string the PNG carries.
- **Notifications (4.7)** and **bracket editing (4.4 remainder)** remain post-launch features; neither blocks launch.

## Verified OK

JWT secret required+length-checked, HS256 pinned · OAuth state CSRF-checked, open-redirect guarded · CSP nonce + strict-dynamic, unsafe-eval dev-gated · default-deny CORS when `ALLOWED_ORIGINS` unset · all nine NODE_ENV dev bypasses use strict equality that Next inlines at build time (unreachable in prod) · admin gated server-side via `requireAdmin` · decode-bomb caps (4096px, bounded inflate) · no secrets in git history or tracked files · route handlers follow the `{ok,error}` envelope with ownership checks.
