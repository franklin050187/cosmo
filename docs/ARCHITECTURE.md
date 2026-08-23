# Architecture — CosmoShip

This document explains how CosmoShip works and why it is built this way. It is written for
maintainers. For a file-by-file map see `docs/MODULES.md`. For open work see `docs/TASKS.md`.

## What CosmoShip is

A community site for the game Cosmoteer. Players upload ship blueprints as PNG files, browse and
search a shared library, organize ships into collections, and run community games with ship
roulette draws and single or double elimination tournament brackets.

Accounts are Discord-only. There is no password auth and no email.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript strict |
| Styling | Tailwind CSS v4 |
| Database | PostgreSQL on Supabase, reached through node-postgres |
| File storage | UploadThing (ship PNGs land on UFS; the DB stores URLs) |
| Bot defense | Cloudflare Turnstile on critical mutations |
| Hosting target | Vercel |

The database is external and always has been. The app holds no state outside Postgres except two
deliberate in-memory caches (`src/lib/cache.ts`, `src/lib/rate-limit.ts`), which are per-instance.

## How a request flows

1. `src/proxy.ts` runs first for every path. It applies rate limits by class (login 5/min,
   uploads 10/min, check-duplicate 20/min, other `/api/*` 600/min) and injects a per-request CSP
   nonce. Preflight requests and prefetches skip it.
2. Route handlers under `src/app/api/**` validate input, then call functions in `src/lib/db/`.
3. Handlers never talk SQL directly. All queries live in `src/lib/db/*.ts` behind `core.ts`,
   which owns the single pg pool.
4. Every handler answers with one envelope: `{ok:true, data}` or `{error}` via helpers in
   `src/lib/api.ts`.
5. Mutations require `requireAuth` plus an ownership check in the DB layer (`isShipOwner`,
   `isCollectionOwner`, `isGameOwner`).

Client pages are React components that fetch these APIs. Server components render only public,
read-only views (home, ship detail, collection pages) through direct DB reads.

## Auth in one paragraph

`/auth/discord` starts OAuth with a random state cookie. `/callback` validates state, exchanges
the code, and sets a JWT cookie (HS256, 7 days, httpOnly, secure, sameSite strict). `getUserFromRequest`
verifies that JWT on every protected route. Admin status comes from the `ADMIN_USERNAMES` env var,
checked by `requireAdmin`. Legacy usernames (`name#1234`) migrate to new handles at login through
`migrateUsernameOnLogin`, which now probes once before touching twelve tables.

## Ship uploads, the hardest path

A blueprint is data encoded into a PNG's pixels. The flow:

1. Browser decodes the PNG locally (`src/lib/cosmoShip.js`) to preview price and tags.
2. The file uploads through UploadThing (`shipUploader` slug). Its `onUploadComplete` decodes
   server-side (`src/lib/server-decode.ts`), computes price and a duplicate signature, and writes
   the row.
3. UploadThing acknowledges the HTTP request before its callback finishes. Any client that treats
   the ack as "saved" races the commit. This caused real bugs (see decisions D2 and D3).
4. Replacing a ship uses the same pipeline with a different slug (`shipReplacer`) and swaps the
   stored URL atomically inside one transaction.

Decoding is bounded: dimensions cap at 4096x4096 and inflate output caps at 64MB, so a crafted
PNG cannot exhaust memory.

## Games, brackets, roulette

Games live in six tables (`games`, `game_ships`, `game_registrations`, `game_contestants`,
`game_matches`, `game_ship_draws`). Registration snapshots the chosen collection's ship ids into
`game_ships` so later edits cannot change what players draw from.

Bracket generation builds rows for winners bracket, losers bracket, and grand final (with an
optional reset round). Winner apply and undo advance contestants across rounds inside one
transaction. Target rows lock with `SELECT ... FOR UPDATE` so two concurrent winner sets cannot
both pass the empty-slot guard. Champion derivation exists once, in `computeChampionFromSlots`
(`src/lib/bracket-util.ts`); server and client share it.

Roulette draws a snapshot ship weighted by popularity rarity. Weights live in `src/lib/roulette.ts`
next to the sort helper shared with the game page.

## Search

One query builder in `src/lib/db/search.ts` serves the home grid. Filters compose into a WHERE
list, facet counts run as parallel aggregates over the same filter set, and ordering comes from a
fixed allowlist of columns. Pagination clamps to known bounds; the `page=-1` escape hatch caps at
2000 rows.

---

## Decisions

These record choices a future maintainer would otherwise have to reverse-engineer.

### D1. Direct pg against Supabase pooler, not an ORM

The DB layer is plain parameterized SQL in domain modules. An ORM bought nothing here: the schema
is small, every hot query is hand-tuned with its own indexes, and Supabase's PgBouncer transaction
pooling (port 6543) punishes ORMs that rely on session state. Prepared statements stay unnamed,
which transaction mode requires.

Consequence: migrations are hand-written SQL files applied deliberately. A runner is planned;
until then `scripts/migrations/*.sql` documents the schema history.

### D2. No caching on single-entity reads

`getImageData` once cached each ship row for 30 seconds. That broke correctness in a way unit
tests could not catch: `bumpDbVersion()` invalidates only the process copy of the cache, and Next.js
compiles pages and route handlers into separate bundles with separate copies. A mutation handled by
a route handler never invalidated the pages' copy. QA caught ships rendering pre-edit data for up
to 30 seconds after a save.

Rule now: primary-key reads that back detail pages are never cached. Only listing and facet
queries keep TTL caches, where seconds of staleness do not mislead anyone. If you add caching back,
invalidate through something shared across bundles (the database itself), not module state.

### D3. Never trust an upload ack

UploadThing resolves the client promise before `onUploadComplete` finishes its remote decode and
DB write. The replace flow therefore polls `GET /api/ship/{id}` until the stored URL actually
changes before navigating. Any future integration with async server work must follow the same
pattern: poll until visible, never sleep-and-hope. The blind one-second sleep this replaced was
itself a patch over the same race.

### D4. Guest registration: captcha plus rate limit, skipped in development

Guests register by typed Discord username with no account. Production requires a Turnstile token
and caps volume at 10 per network per 10 minutes. Development skips both so scripted suites stay
deterministic. The skip is safe because `process.env.NODE_ENV !== "development"` compiles away in
production builds.

The username stays unverified by design. Guests are contact-through-the-host participants, which
is also why both forms tell users to enter their Discord name.

### D5. Polling, not websockets

Game detail refetches every 15 seconds while the tab is visible. Websockets would need standing
server state that Vercel functions do not hold cheaply, and 15-second staleness costs nothing for
amateur tournaments. The refresh updates live state only; it never touches the owner's edit form.

### D6. Trust boundary: header-based IPs

`getClientIp` and the anon-analytics id read `x-forwarded-for`. Vercel sets those headers and
strips inbound spoofs, so this is correct on the intended host. Behind a plain reverse proxy you
must overwrite both headers there, or clients can forge rate-limit keys. This constraint lives in
the README.

### D7. Turnstile on critical mutations only

Create/edit/delete, uploads, and guest registration pay the captcha cost. Favorites and collection
membership stay ungated because they are cheap, reversible, and ownership-checked. Widening the
net degrades the experience for marginal protection.

### D8. One envelope, everywhere

Every API answer is `{ok:true, data}` or `{error}`. One response shape means one client-side error
path and no per-route parsing surprises. Runtime body validation happens at the handler boundary
(`env.ts` does the same for configuration); everything inside trusts the parsed types.
