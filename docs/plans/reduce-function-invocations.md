# Plan: Reduce Vercel Function Invocations (Hobby 1M/mo)

Status: 🚧 IN PROGRESS (branch `perf/reduce-function-invocations`)
Logged evidence: `docs/cosmo-log-export-2026-09-13T13-56-56.csv`

## Why
Vercel warned the project used ~75% of the Hobby free tier for Function Invocations
(1M/month). An export of 29 minutes of production logs shows ~685 invocations,
almost all of them avoidable.

## How Vercel counts invocations
From https://vercel.com/docs/functions/usage-and-pricing (Fluid compute pricing):
- One invocation per request to a function, **including routing middleware**.
- Counted regardless of status code; **cache hits do not count**.
- CDN-cached responses avoid the function entirely. ISR/SSG pages are not
  invoked per visitor; only periodic revalidation is.
- Docs' own levers: cache responses (Cache-Control / ISR), and identify the
  routes that consume the most invocations.

Two corollaries that drive most of this app's spend:
1. Every request in the logs is `vercelCache: MISS` — nothing is ever served by
   the CDN.
2. `src/app/layout.tsx` sets `export const dynamic = "force-dynamic"`, which
   forces **every** route (pages, `_rsc` navigations, sitemap, robots) to do a
   fresh server render on each request. It even overrides the ISR declared in
   `collections/page.tsx` (`revalidate = 60`).

## Evidence from the log export (711 rows, 29 min on `production`)

| Bucket | Rows | type | What it is |
|--------|------|------|------------|
| `/` doc + `_rsc` navigations | 316 | 305 function + 11 middleware | Homepage re-rendered on every visit/back-nav/prefetch |
| Ship detail pages `/ship/{id}` | ~47 | function | Each is a full DB fetch + render (`revalidate = 0`) |
| Other content pages (roulette, about-game, collections, games, upload, auth/discord) | ~75 | function | Dynamic renders, none cached |
| Static assets (logo-v2.svg, *.webp, robots.txt) | 42 | middleware | CDN serves them HIT, but middleware still runs on each |
| Client APIs (ship/search, analytics/log, auth/session, is-admin, authors, tags, collections) | ~35 | function | Genuine API work |
| `/ship/null?nxtPid=null` | 3 | function+middleware | Client bug emitting a bogus ship id |

All function rows are `vercelCache: MISS`; all static rows are `HIT` but still
paid a middleware invocation.

## Root causes and fixes

### 1. `force-dynamic` in the layout — highest impact
Unlisted pages are public read-only content (auth is 100% client-side via
`/api/auth/session`; no page calls `cookies()` or `getUserFromRequest`).
Removing `force-dynamic` lets the framework cache by default.
- Fix: drop it from `src/app/layout.tsx`; mark the few genuinely dynamic routes
  explicitly (`sitemap.ts` ISR, games pages stay dynamic).

### 2. Homepage renders a DB search on every request
`src/app/page.tsx` reads `searchParams` and runs `searchFromQueryString` +
`listUpcomingGames` server-side on each `/` hit — including the 294 `_rsc`
(navigation/prefetch) requests. Filtering already happens client-side through
`/api/ship/search`, so the server render is duplicated work.
- Fix: drop the `searchParams` read; make `/` static with ISR
  (`revalidate = 300`). Seed `useFilters` from the URL on first client mount and
  fetch once when non-default filters are present, so deep links
  (`/?author=x&tag=y`) and first paint still match the URL.

### 3. Middleware runs on static assets
`src/proxy.ts` only excludes `_next/static|_next/image|favicon.ico`, so
`logo-v2.svg`, `background-alpha.webp`, `excelsior-logo.webp`, `robots.txt`, etc.
each burn a middleware invocation that only appends CSP/CORS headers nobody
reads on an image.
- Fix: exclude asset extensions in the matcher.

### 4. Ship detail pages opt out of caching
`src/app/ship/[id]/page.tsx` sets `export const revalidate = 0`. Every visitor
view of a ship is a fresh function invocation.
- Fix: `revalidate = 300`. Uploads/edits already call `revalidatePath('/ship/${id}')`
  (`api/ship/[id]/route.ts:153,185`, `api/uploadthing/uploadthing.ts:104,173`),
  so stale-forever is not a real risk.

### 5. Sitemap goes stale if cached at build
Without a revalidate setting, `sitemap.ts` would be generated once at build with
a stale ship list.
- Fix: `export const revalidate = 3600` regenerates hourly.

## Follow-ups (separate PRs, lower urgency)
| # | Item | Expected saving | File(s) |
|---|------|-----------------|---------|
| F1 | `nxtPid=null` / `/ship/null` client bug (3+ hits) | small, correctness | `src/components/ship/ShipCard.tsx` `router.push(\`/ship/${ship.id}\`)` — guard `ship.id` before navigating |
| F2 | Analytics: 1 `POST /api/analytics/log` per page view | ~1/more campaign | `src/components/AnalyticsTracker.tsx`, `src/lib/analytics-client.ts` — batch events in-memory, flush on `visibilitychange`/unload |
| F3 | Games pages poll `GET /api/games/{id}` every 15s while open | 240/h/session | `src/app/games/[id]/page.tsx:147` (matches open AGENTS 4.8 polling work) — raise interval, poll on visibility change |
| F4 | CDN `Cache-Control` on read-only APIs (`ship/search`, `collections`, `ship/authors`, `ship/tags`) | repeat-visitor shelf | API routes |

## Impact (back-of-envelope on the 29-min sample)
| Change | Invocations removed | Serviceable by |
|--------|--------------------|----------------|
| Remove `force-dynamic` + ISR on `/` | ~316 | CDN / ISR revalidation |
| Middleware matcher on assets | ~42 | none (not invoked) |
| `ship/[id]` ISR | ~47 | CDN / ISR revalidation |
| sitemap ISR | recurring | hourly revalidation |
| **Total sampled** | **~405 of ~685 (~59%)** | |

Remaining ~280 are real API calls, games/roulette dynamics, and auth. That is
the floor for an app of this shape on Hobby.

## Verification (done on this branch)
- `npx tsc --noEmit` and `npm run lint` pass.
- `npx next build` route table shows `/` and `/ship/{id}` as static/ISR
  (`○`/`ISR`) instead of dynamic, and no `force-dynamic` override in the tree.
- Dev-server smoke: `/`, a ship page, and a static asset render/respect matcher.

## Guardrails
- No server-side route may read the auth cookie after this change (checked:
  only API routes use `getUserFromRequest`/`cookies`). Re-check in review.
- Upload/edit flows call `revalidatePath`, keeping ISR pages fresh (< 5 min).
- Private data (my-ships, favorites, my-collections, admin) renders from
  client-side auth; the server never leaks per-user data because pages only
  fetch after login. Verified for `logout`/`useAuth` flows.