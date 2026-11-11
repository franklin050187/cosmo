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

### P0: Measure before cutting (30 min)

Vercel dashboard → project → Observability → Functions, group by route, 30-day window. Screenshot the top-10 table as the baseline. Confirm the ranking matches the model above before changing anything. (The usage PDF has no per-route breakdown; Observability does.)

### P1: Static CSP + narrow proxy matcher (est. −30–50% of invocations)

1. Move `buildCspHeader` output into `next.config.ts` `headers()`. Delete `applyCsp` and the CSP branch from the proxy. Headers are served at the CDN edge and apply to cached HTML too.
2. Narrow the matcher to the paths that genuinely need per-request logic:
   - `/api/:path*` (rate limiting + CORS)
   - `/callback`, `/auth/discord` (login limiter)
   Pages stop invoking the proxy entirely; API paths keep full protection.

Risk check: rate-limit tests (`src/proxy.test.ts`), CSP still present on prod HTML (`curl -sI https://cosmo-lilac.vercel.app | grep -i content-security`), qa-suite auth phase.

### P2: Ship detail pages, on-demand revalidation only (est. −most ISR writes)

`revalidate = 300` → `revalidate = false` on `/ship/[id]`. Next builds each page once, and `revalidatePath` from mutations is what rebuilds it; those calls all exist already. ISR writes drop to mutation-driven volume (tens per day, not thousands).

Tradeoff to accept: the **Popularity** number displayed on the ship page freezes between mutations (it already lagged behind the 5-min window; the downloads column that drives the "pop" sort lives in the DB and is unaffected). If we ever want live counters on a static page, fetch them client-side, but note that is one invocation per view, which partially undoes P2. Decision: keep it frozen for now.

### P3: Raise remaining ISR windows

- `/collections`: 60 → 600 (collection changes are rare; add `revalidatePath('/collections')` to collection mutations if freshness matters).
- `/`: 300 → 900.

### P4: API-side trims (only if P0 data still shows hot routes)

Candidates, in expected-value order:

- `/api/ship/authors`, `/api/ship/tags`: the data changes only on upload/delete and is already 5-min cached in the DB layer. Serve with `Cache-Control: s-maxage=600, stale-while-revalidate` so the CDN answers instead of the function.
- `/api/auth/session`: already client-cached 60s; leave alone.
- `/api/ship/search`: real work per filter interaction; leave alone.

### P5: Watch the budget

After P1–P3, projected steady state at current traffic: invocations well under 150K/30d, ISR writes under 10K/30d. Hobby holds unless traffic grows several-fold. Re-check Observability 7 days after each deploy. If invocations still trend up after P4, the growth is organic traffic and Pro is the honest answer; further micro-optimising would be polishing a rounding error.

## Note: the view counter interacts with this plan

The ship-page view counter that was lost in the Next port (increments the popularity counter on view) would add roughly one invocation per ship view if implemented as a plain POST. If we rebuild it, do it after P1–P3, fire-and-forget, and rate-limit it. The count per view is small enough that the overall budget still holds.

## Verification checklist per phase

- `npx tsc --noEmit`, `npm run lint`, `npm test` green.
- `npm run build` locally: confirm `/` and `/ship/[id]` static status and that no route flipped to dynamic unintentionally.
- Prod: `curl -sI` on `/`, `/ship/<id>`, `/api/ship/search?q=x`: CSP header present where expected, none missing.
- Observability: per-route invocation delta at 24h and 7d vs P0 baseline; ISR writes daily delta.
