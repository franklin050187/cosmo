# Module map — CosmoShip

Reference. One entry per module, one line on what it owns. Paths are relative to repo root and
true at the commit that added this file. Architecture and rationale live in `docs/ARCHITECTURE.md`.

## src/lib — domain logic

| Module | Owns |
|---|---|
| `env.ts` | Env validation at startup. Required vars fail fast; no insecure defaults. |
| `auth.ts` | JWT sign/verify (HS256, 7d), `getUserFromRequest`, `requireAuth`, `requireAdmin`, `isAdminUsername`. |
| `api.ts` | Response envelope helpers: `ok`, `badRequest`, `notFound`, `forbidden`, `error`. |
| `rate-limit.ts` | In-memory token buckets (`createRateLimiter`) and `getClientIp`. Per-instance by design; see ARCHITECTURE D6/D4. |
| `cache.ts` | TTL cache for listing/facet queries with `bumpDbVersion()` invalidation. Single-entity reads must not use it (D2). |
| `sanitize.ts` | HTML allowlist sanitizer for rich-text descriptions. |
| `html-text.ts` | `htmlToText` for card previews. Regex-based so SSR and hydration agree byte-for-byte. |
| `games-types.ts` | Shared game domain types. `types.ts` re-exports them. |
| `bracket-util.ts` | Pure bracket math: `buildSingleElim`, `buildDoubleElim`, `computeChampionFromSlots`. Has vitest coverage in `bracket-util.test.ts`. |
| `roulette.ts` | Rarity weights, `drawShip`, `sortShipsByPopularity`, rarity metadata. |
| `price.ts`, `price-data.ts`, `price-analysis.ts` | Blueprint price calculation from decoded parts; radar-chart data. |
| `cosmoShip.js` (+ `.d.ts`) | Client-side PNG blueprint decoder used by upload preview and ship pages. |
| `server-decode.ts` | Server-side decoder with dimension and inflate caps. Must stay output-compatible with the client decoder. |
| `normalize-ship.ts` | Normalization shared by duplicate detection and signature hashing. |
| `ship-signature.ts` | `computeShipSignature` feeds the duplicate check (`findDuplicateBySignature` in db/search). |
| `download-ship.ts` | Client-side download naming and blob handling. |
| `display-ship.ts` | Presentation constants: `DISPLAY_TAGS`, `formatPrice`. |
| `format-date.ts` | Timezone-aware date and countdown labels. |
| `analytics-client.ts` / `analytics-db.ts` | Event logging client + server persistence. |
| `image-host.ts` | Legacy image host handling. |
| `physics.ts`, `physics-data.ts`, `part-data.ts` | Static game data for stats panels. |

## src/lib/db — database layer

All SQL lives here. Handlers never query directly.

| Module | Owns |
|---|---|
| `core.ts` | The pg pool (Supabase pooler :6543, TLS to Supabase CA), `query`, `transaction`, owner-check helpers. |
| `ships.ts` | Ship CRUD, `getImageData` (uncached by decision D2), delete cleanup across collections/favorites/signatures/game tables. |
| `collections.ts` | Collection CRUD, idempotent membership add/remove, paged listing. |
| `favorites.ts` | Favorites keyed by discord id first, legacy username fallback. Counter floored at zero. |
| `search.ts` | Home grid search: filter builder, parallel facets, fixed order allowlist, clamped pagination, duplicate-signature lookup. |
| `games.ts` | Games, registrations, contestants, brackets (build/apply/undo/winner with FOR UPDATE locks), roulette deals, invite codes, champion derivation. |
| `users.ts` | Login-time username migration guarded by a single EXISTS probe. |
| `index.ts` | Barrel re-export. |

## src/app — routes

### Pages

| Route | Kind |
|---|---|
| `/` | Server-rendered home grid + upcoming-games banner |
| `/ship/[id]`, `/ship/[id]/edit` | Detail (SSR + client island) and edit (owner only) |
| `/upload` | Multi-file upload flow |
| `/games`, `/games/new`, `/games/[id]`, `/games/join/[inviteCode]` | Games list, create, detail with polling refresh, invite join |
| `/roulette` | Standalone roulette with collection picker |
| `/collections`, `/collections/[id]`, `/my-collections` | Browse, detail with zip download, manage |
| `/favorites`, `/my-ships` | Personal views (My Ships has filter/sort/pagination) |
| `/admin` | Analytics dashboard (client gate; API enforces) |
| `/about-game` | Cosmoteer info page |

### API route groups

| Group | Routes | Notes |
|---|---|---|
| `api/games/**` | CRUD, register/leave, contestants, bracket generate, match winner, roulette deal, finish, by-invite lookup | Ownership checked in db layer; guest register adds Turnstile + rate limit in prod |
| `api/collections/**` | CRUD, membership add/remove, mine | Turnstile on create |
| `api/ship/**` | Detail, edit/delete via `[id]`, favorite/unfavorite, my-ships, authors/tags facet sources, check-duplicate, download counter | |
| `api/uploadthing` | UploadThing handler with `shipUploader` and `shipReplacer` slugs | Callback decodes, prices, dedupes, writes |
| `api/auth/*` | session, is-admin, logout | Thin session probes |
| `api/analytics/*` | log (public), dashboard (admin + Turnstile) | Salted anon ids |

## src/components — UI islands

| Directory | Contains |
|---|---|
| `layout/` | Header (nav, user menu), footer |
| `ship/` | Detail view, cards, grid, lightbox, stats, price analysis, JSON view, reconstruction, related ships, replace modal |
| `games/` | GameCard, Bracket (grid + SVG connectors), collection select |
| `roulette/` | Wheel track, roll animation, result card, history |
| `collection/` | Cards, picker with portal, editor |
| `search/` | Filter drawer sections, sort chips, active-filter chips |
| `upload/` | Multi-file panel with decode preview and duplicate ack |
| `ui/` | Button, Card, ConfirmDialog, TurnstileWidget, Preloader |

## scripts

| Script | Purpose |
|---|---|
| `qa-suite.ts` + `qa-lib.ts` | 60-case end-to-end suite driving real browsers through playwright-cli. `--resume` skips previously passed cases. |
| `qa-double-elim.ts` | 65-case bracket regression against the live DB. |
| `migrations/*.sql` | Hand-applied schema history 001-008. |
| `db-health.ts` | Offline connectivity probe. |
| `qa-cleanup-leavings.ts` | Removes QA-named leftover rows from the library. |
