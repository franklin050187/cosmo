# CosmoShip : Cosmoteer Ship Library

Community library for sharing, searching, browsing and downloading ship designs for
**Cosmoteer: Starship Architect & Commander**. Ship blueprints are PNG images with the ship
data hidden in the image pixels — upload a PNG and the site decodes it, prices it, tags it,
and detects duplicates automatically.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · PostgreSQL (Supabase) ·
Discord OAuth (httpOnly-cookie JWT) · UploadThing · Cloudflare Turnstile · Vercel

## Docs

| Doc | Contents |
|-----|----------|
| [`docs/PROJECT.md`](docs/PROJECT.md) | **Start here.** What the site is, the ship-file format, features & workflows, auth/security model, data model, structure, conventions, UI/UX decisions, dev workflow |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Consolidated remaining work (findings/code-review/docs) as phased TODO roadmap |
| [`docs/QA_TEST_PLAN.md`](docs/QA_TEST_PLAN.md) | Scripted QA suite (43 cases, 4 phases) |
| [`docs/QA_FINDINGS.md`](docs/QA_FINDINGS.md) | Latest suite-run report |
| [`docs/CODE_REVIEW_FINDINGS.md`](docs/CODE_REVIEW_FINDINGS.md) | Audit history (5 rounds), resolved/open items, deferred work |
| [`docs/plans/`](docs/plans/) | Implementation plans (e.g. bad-IP blocklist) |

## Quick start

The dev server **must** run on port **8000** (Discord OAuth redirect URI):

```bash
cd /home/johnn/cosmo-next
(setsid npx next dev -p 8000 >> /tmp/next-server.log 2>&1 < /dev/null &) ; echo "launched"
```

- Copy `.env.example` → `.env` and fill in all required vars (`src/lib/env.ts` validates at
  startup). Restart the dev server after any `.env` edit.
- Verify: `curl -s -o /dev/null -w "%{http_code}" http://localhost:8000` (expect 200).
- Checks: `npx tsc --noEmit`, `npm run lint`.
- Migrations: `npm run migrate`.
- QA suite: `node --env-file=.env --no-warnings scripts/qa-suite.ts`.

> **Next 16 note:** this is not the Next.js you may know — APIs and conventions differ.
> Read the relevant guide in `node_modules/next/dist/docs/` before writing code.

## Trust boundary (reverse proxies)

Anonymous analytics identity (`anonIdFor`), the API rate-limiter IP (`getClientIp`) and
Turnstile `remoteip` all trust the `x-forwarded-for` / `x-real-ip` headers. This is safe on
**Vercel** (platform sets these headers) but is a constraint if the app is ever moved behind a
plain reverse proxy — the proxy must set/overwrite those headers, or client IPs become spoofable
and rate-limits/Turnstile remote IP checks can be bypassed.

## License

User-submitted ships are **CC BY 4.0** unless stated otherwise in their description.
