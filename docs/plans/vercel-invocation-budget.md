# Vercel invocation budget: diagnosis and reduction plan

Date: 2026-11-11 · Status: plan, no code yet · Trigger: Vercel Hobby usage warning on Function Invocations

## What the PDF says (Oct 12 – Nov 11, 30 days)

| Metric | Used | Hobby limit | Share |
|---|---:|---:|---:|
| Function Invocations | 358,577 | 1,000,000 | **36%**, the warning |
| ISR Writes | 83,379 | 200,000 | **42%**, tightest quota |
| CDN Requests | 558,976 | 1,000,000 | 56% |
| Fast Origin Transfer | 1.67 GB | 10 GB | 17% |
| CDN Request CPU Duration | 5m53s | 1h | 10% |
| Function Duration | 8.2 GB-Hrs | 100 GB-Hrs | 8% |
| ISR Reads | 67,457 | 1,000,000 | 7% |
| Fast Data Transfer | 2.48 GB | 100 GB | 2% |
| Edge Middleware Invocations | 0 | — | 0 |
| Image Optimization | 13 transformations | — | negligible |

Reading: of 559K CDN requests, ~359K hit a function (64%). Only ~200K were served straight from cache. The problem is not traffic volume. It is how much of each request path touches a Node function.

## Observability cross-check (12h window, Nov 11)

The function/middleware split for the same 30 days: **function 243,535 (67.9%), middleware 115,042 (32.1%)**. The proxy alone is a third of the entire invocation bill, which settles the P1 estimate: narrowing the matcher cannot save less than 32%.

Top function routes in the last 12 hours (40 routes total; everything past row 10 is under 25 invocations):

| Route | Invocations | GB-Hours | Error rate |
|---|---:|---:|---:|
| `/ship/[id]` | 1.2K | 0.028 | 0% |
| `/auth/discord` | 227 | 0.0079 | 0% |
| `/ship/[id]` (second row) | 166 | 0.0034 | 0% |
| `/api/ship/search` | 104 | 0.013 | 0% |
| `/` | 92 | 0.0081 | 0% |
| `/collections.segments/_tree.segment` | 43 | 0.0014 | 0% |
| `/api/analytics/log` | 36 | 0.0020 | 0% |
| `/api/auth/session` | 32 | 0.0040 | 0% |
| `/api/collections` | 29 | 0.0038 | 0% |
| `/collections/[id]` | 25 | 0.00037 | 0% |

Three things worth acting on, one thing to ignore:

- `/ship/[id]` dominates at roughly 10× everything else. At 1.2K/12h it annualises to ~72K/30d, about 30% of function invocations, and the volume lines up with the 83K ISR-write bill. P2 targets exactly this row.
- `/auth/discord` at 227/12h is real login traffic. Each attempt also passes the proxy, so P1 must keep that path in the matcher.
- `/api/ship/search` is only 104 calls/12h yet burns more GB-hours than 227 login calls (0.013 vs 0.0079). It is the heaviest function per call, which is expected: each search runs the count, facets, and page queries. It is small in count, so leave it alone.
- No error rate anywhere above 0%. Nothing is failing; this is purely a cost shape.

The duplicate `/ship/[id]` row (166) is most likely the `perf/reduce-function-invocations` preview deployment showing up alongside production. Check Observability grouped by deployment before counting it twice in projections.

## Root causes

### 1. The proxy runs as a Node function on every page and API request

Next 16 renamed middleware to proxy and **made Node.js the default and only runtime** (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md:223`, where setting `runtime` throws). That is why Edge Middleware Invocations reads 0 while invocations pile up.

`src/proxy.ts` matcher currently matches **every HTML page and every API route** (it only excludes static assets and prefetch requests). But the proxy only needs to:

- rate-limit `/callback`, `/auth/discord`, `/api/uploadthing`, `/api/ship/check-duplicate`, and `/api/*` generally,
- set CORS headers on API responses.

The CSP it sets on pages (`applyCsp`) is only needed on non-API paths, and commit 4e1abec already made the CSP static-compatible for exactly this reason. A static header does not need per-request code.

### 2. Ship detail pages regenerate on nearly every visit

`/ship/[id]` has `revalidate = 300` and no `generateStaticParams`. Each ship page is generated on first request, then re-generated whenever a visit arrives more than 5 minutes after the last one: one invocation plus at least one ISR write per visit. With 2,131 ships and steady traffic this is the biggest invocation and ISR-write source. Ship content changes only on upload / replace / edit / delete, and those flows already call `revalidatePath` (`src/app/api/uploadthing/uploadthing.ts:104,173`, `src/app/api/ship/[id]/route.ts:153,185`).

### 3. Aggressive ISR windows on other pages

- `/collections`: `revalidate = 60`, up to 1,440 regenerations/day for one static path.
- `/`: `revalidate = 300`, up to 288/day.
- `/sitemap.xml`: 3600, fine.

### 4. Real API work (expected, cannot go to zero)

`/api/ship/search` on every filter click, `/api/auth/session` per page load (60s client TTL), `/api/ship/[id]`, `/api/collections`. These are the app's actual dynamic work; they are legitimately invocations.

## Plan

### P0: Measure before cutting (partially done)

The 12h Observability export already answers the big question: the route ranking matches the model, and middleware is 32.1% of the 30-day bill. Two checks remain before code changes:

1. Group Functions by **deployment** to confirm the duplicate `/ship/[id]` row (166) is the `perf/reduce-function-invocations` preview and not a second production path.
2. Keep the top-10 table screenshot as the before/after baseline for P1 and P2.

(The usage PDF has no per-route breakdown; Observability does.)

### P1: Static CSP + narrow proxy matcher (est. −85K invocations/30d, floor 32%)

The 30-day middleware count is 115,042, so this is no longer an estimate about shape, only about the exact matcher. Steps:

1. Move `buildCspHeader` output into `next.config.ts` `headers()`. Delete `applyCsp` and the CSP branch from the proxy. Headers are served at the CDN edge and apply to cached HTML too.
2. Narrow the matcher to the paths that genuinely need per-request logic:
   - `/api/:path*` (rate limiting + CORS)
   - `/callback`, `/auth/discord` (login limiter)
   Pages stop invoking the proxy entirely; API paths keep full protection.

Post-P1 middleware volume: the 12h table puts API + login traffic at roughly 500 invocations/12h, so middleware should fall from ~3.8K/day to ~1K/day, about 85K/30d saved. Pages served from the ISR cache stop paying both a middleware and a function invocation.

Risk check: rate-limit tests (`src/proxy.test.ts`), CSP still present on prod HTML (`curl -sI https://cosmo-lilac.vercel.app | grep -i content-security`), qa-suite auth phase.

### P2: Ship detail pages, on-demand revalidation only (est. −70K invocations and most ISR writes per 30d)

The 12h table makes `/ship/[id]` the confirmed top function route (1.2K/12h, ~10× the next route, ~72K/30d projected). ISR writes (83K/30d) track the same traffic.

`revalidate = 300` → `revalidate = false` on `/ship/[id]`. Next builds each page once, and `revalidatePath` from mutations is what rebuilds it; those calls all exist already. ISR writes drop to mutation-driven volume (tens per day, not thousands).

Tradeoff to accept: the **Popularity** number displayed on the ship page freezes between mutations (it already lagged behind the 5-min window; the downloads column that drives the "pop" sort lives in the DB and is unaffected). If we ever want live counters on a static page, fetch them client-side, but note that is one invocation per view, which partially undoes P2. Decision: keep it frozen for now.

### P3: Raise remaining ISR windows

- `/collections`: 60 → 600 (collection changes are rare; add `revalidatePath('/collections')` to collection mutations if freshness matters).
- `/`: 300 → 900.

### P4: API-side trims (demoted: the 12h data says the API is not the problem)

The route table settles this phase before we even get there: every API route is under 110 invocations/12h. `/api/ship/search` is the only one with meaningful per-call cost (0.013 GB-hours for 104 calls), and 104 calls/12h is a rounding error. The authors/tags cache-header idea from the first draft is shelved unless P0 grouping by route shows otherwise after P1–P2. Keep `/api/auth/session` and `/api/ship/search` untouched.

### P5: Watch the budget

Combined projection after P1–P3: middleware ~30K/30d (from 115K), function invocations ~140–160K/30d (from 243K), ISR writes in the low thousands (from 83K). Every quota sits under 20% at current traffic, and the 12h error rate is 0% across the board, so there is no reliability motive pushing on any of this. Re-check Observability 7 days after each deploy. If invocations still trend up after that, the growth is organic traffic and Pro is the honest answer; further micro-optimising would be polishing a rounding error.

## Note: the view counter interacts with this plan

The ship-page view counter that was lost in the Next port (increments the popularity counter on view) would add roughly one invocation per ship view if implemented as a plain POST. If we rebuild it, do it after P1–P3, fire-and-forget, and rate-limit it. The count per view is small enough that the overall budget still holds.

## Verification checklist per phase

- `npx tsc --noEmit`, `npm run lint`, `npm test` green.
- `npm run build` locally: confirm `/` and `/ship/[id]` static status and that no route flipped to dynamic unintentionally.
- Prod: `curl -sI` on `/`, `/ship/<id>`, `/api/ship/search?q=x`: CSP header present where expected, none missing.
- Observability: per-route invocation delta at 24h and 7d vs P0 baseline; ISR writes daily delta.
