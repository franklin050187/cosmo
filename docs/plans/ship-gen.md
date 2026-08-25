# Ship generator plan

Status: proposal. No code yet.

The generator builds ships from two inputs: a budget and a weapon choice. It works in two phases. Phase 1 picks parts that fit the budget under a build strategy. Phase 2 arranges those parts into a ship JSON that passes validation and renders through the existing debug tool and PNG pipeline.

## What we already have

The repo carries two relevant bodies of code:

- `rawdata/` holds a working reference implementation ported from a Cosmoteer-style project. It contains a 98-part database (`rawdata/parts-db.ts`), grid math and door rules (`rawdata/model.ts`), an arrangement engine (`rawdata/shuffle.ts`, `rawdata/procedural.ts`), power and crew aggregation (`rawdata/power.ts`), and ship validation (`rawdata/generator.ts`). Two modules are referenced but missing: `partlist.ts` (budget splitting) and `connectivity.ts` (crew reachability).
- `src/lib/` already has the production side of the pipeline: `price.ts` prices a part list, `cosmoShip.js` encodes and decodes ship PNGs, `normalize-ship.ts` and `server-decode.ts` parse uploads, and `part-data.ts` maps part IDs to resources.

The reference covers most of phase 2 without new work. Phase 1 (candidate part lists by strategy) is the new work, since `partlist.ts` never landed upstream either.

## Data shapes

Reuse the reference types rather than inventing new ones:

- `GenPartDef` (`rawdata/parts-db.ts:4`) describes one part: grid `size`, solid sub-box `rect`, categories in `typeCategories`, door attachment points in `allowedDoors`, power fields, crew fields, `thrusterForce`.
- `PlacedPart` (`rawdata/model.ts:35`) is `{ part, loc: [x, y], rot: 0|1|2|3 }`. A ship layout is a list of these plus computed doors.
- Footprint convention: `Location` is the bottom-left cell of the size box; occupied cells come from `footprintCells()` (`rawdata/model.ts:48`). Front of the ship faces negative y.

The generator output is a plain JSON file: parts with id, location, rotation, plus doors. That file feeds three consumers unchanged: the debug tool preview, PNG generation through `cosmoShip.js`, and `price.ts`.

## Phase 1: candidate part lists

Input: `budget` (number) and `weapon` (part ID, e.g. `cosmoteer.laser_blaster_small`).

Output: 5 to 10 `PartListCandidate` objects. Each candidate is a multiset of part IDs plus a strategy label and a cost breakdown.

### Strategies

Each strategy owns a budget split and a shopping policy around a mandatory core. The reference tests pin the split shape: roughly 80 percent functional, 15 percent armor, 5 percent hull, with at most 5 percent slack per bucket.

| Strategy | Functional bias |
|---|---|
| balanced | even weapons and defense |
| gunline | maximum weapons, minimum armor |
| brawler | heavy armor, short-range weapons |
| aegis | shields and point defense over armor plating |
| sprint | thrusters above minimum, light armor |

All strategies start from the same mandatory core, taken from the reference test contract (`rawdata/shuffle.test.ts:65`): one small reactor, one control room, medium crew quarters, at least two thrusters, airlocks, a fire extinguisher, and power storage. The chosen weapon enters the functional bucket first, then each strategy fills its remaining budget by priority order: extra copies of the chosen weapon, its ammo chain (factory plus storage), defense, thrust, then corridors.

The canonical fill order, from the Cosmoteer wiki and confirmed by the owner, is: reactor, control room, weapons and storage, thrust if needed, crew, armor and shield last. Two wiki rules shape the sizing loop: prefer one bigger reactor over several small ones, and treat corridors as a one-tile-wide rail network rather than open floor. Crew quarters belong close to reactors and storage so supply paths stay short.

### Compare with real ships

The site database (`shipdb`, see `src/lib/db/ships.ts`) stores uploaded ships with price, crew, and full part data. A comparison step grounds candidates in reality: query ships within about 10 percent of the target budget, decode each `data` field, tally part multisets, and report medians per category (weapon count, armor cost share, thruster force). The generator uses these numbers as sanity bands, not hard constraints; a candidate far outside the band gets flagged in its metadata. Generated ships stay in the debug tool for now and never touch the upload flow.

### Sizing loop

Filling a bucket is greedy, not optimal. For each candidate part in priority order, take the largest variant that fits the remaining bucket budget, then move on. This matches how the reference scales up (bigger reactors, bigger crew quarters) and keeps phase 1 deterministic and cheap. Every candidate records where it stopped, so the UI can show "spent 87k of 90k".

A candidate must pass arithmetic checks before it reaches phase 2: positive power surplus, nonnegative crew surplus, total price within budget. These reuse `computePowerStats` and `computeCrewStats` from `rawdata/power.ts`; they need no geometry.

## Phase 2: placement

Input: one `PartListCandidate`.

Output: ship JSON (parts, doors), valid or rejected with reasons.

### Arrangement

Port the seed-and-target greedy from `rawdata/shuffle.ts`:

1. Seed the reactor at origin.
2. Place the functional core near it: crew quarters above, control room left, power storage right.
3. Thrusters go rear (+y). Weapons go front (-y).
4. Factories and storage sit midships, near both the reactor and their consumers.
5. Corridors fill the interior.
6. Armor grows outward last, as a shell on a ring around the bounding box.

Each placement brute-forces positions and rotations in the current bounding box padded by 5 cells, rejects overlaps, requires door adjacency or physical adjacency, and keeps the legal spot closest to the target. Parts that cannot legally land are recorded as skipped instead of failing the run.

### Constraints checked after placement

Validation reuses `validateShip()` logic (`rawdata/generator.ts:207`): overlap detection, door legality against `allowedDoors`, single connected component, crew reachability from quarters, power surplus, per-part battery thresholds.

Two rules are new and specific to this feature:

- Clear firing arcs. No armor or structure cell may occupy the cells directly in front of a weapon along its firing direction. Firing direction is per weapon family: forward (-y) for lasers, cannons, railguns, and ion weapons; rearward (+y) for missile launchers. Check the weapon footprint column outward to the hull boundary. A weapon whose arc is blocked fails validation with the offending part named.
- Crew logistics reach. Every consumer (a weapon that uses ammo, a factory with inputs) needs a walkable crew path from its supplier (storage, factory output). Walkability follows `crewSpeedFactor > 0` cells and doors; armor blocks paths. Implement this as BFS over the crew graph, the piece `connectivity.ts` was supposed to be. A consumer with no producer path fails validation. This replaces the reference's static tag checks with an actual path check, which is what "crew must move items between factory, reactor, storage, and consumers" means mechanically.

Thrust is covered by the mandatory core (at least two thrusters) plus an aggregate check: total `thrusterForce` above zero and, if we want a quality bar, force per 10k of ship price above a floor.

Layouts stay axis-aligned. Rotation is quarter turns only; diagonal wedges exist in the parts database but phase 2 places rectangular footprints on the integer grid, so nothing diagonal is generated. Symmetry is not enforced. The point of the generator is finding designs a human would not draw by hand.

### Preview and PNG

The debug tool reads the ship JSON and renders rects per part kind, as `rawdata/DebugShipTool.tsx` does today. PNG export goes through `src/lib/cosmoShip.js` encode, which already produces files the site accepts as uploads. The debug tool gains two buttons: validate (runs all phase 2 checks, lists failures inline) and download PNG.

## Module map

New code lives in `src/lib/shipgen/`:

| Module | Owns |
|---|---|
| `parts-db.ts` | Part definitions (promote from rawdata) |
| `model.ts` | Grid, footprints, rotations, door legality (port from rawdata) |
| `partlist.ts` | Strategies, budget splitting, candidate generation (new) |
| `arrange.ts` | Seed-and-target placement, doors (port from shuffle.ts) |
| `validate.ts` | Overlap, power, crew, plus new firing-arc and logistics checks |
| `price.ts` bridge | Reuse existing `src/lib/price.ts`, do not fork it |

`src/app/debugtool/` (or the existing debug page) hosts the preview UI. A QA script `scripts/qa-shipgen.ts` generates across budgets and strategies and asserts every output passes validation.

## Build order

Each step ends verifiable:

1. Promote `parts-db.ts`, `model.ts`, `power.ts` into `src/lib/shipgen/` with their tests passing under vitest. Verifier: `npm test`.
2. Port `shuffle.ts` as `arrange.ts` and `generator.ts`'s `validateShip` as `validate.ts`. Verifier: arrange the reference mandatory core and get a valid ship JSON in a unit test.
3. Write `partlist.ts` with one strategy (balanced), wired to real pricing. Verifier: unit test asserts price within budget and power/crew surpluses for a sweep of budgets.
4. Add remaining strategies. Verifier: QA script produces 5+ valid candidates per input pair.
5. Add firing-arc and logistics validators. Verifier: unit tests with hand-built violating layouts fail, generated layouts pass.
6. Wire the debug tool preview and PNG download. Verifier: drive the page, generate, download a PNG, decode it with `src/lib/cosmoShip.js` and get the same parts back.

## Decisions

- Weapon count is at least one. The chosen weapon is a required input.
- Symmetry is not required. Novel designs beat tidy ones.
- Generated ships stay in the debug tool. A user-facing builder comes later as its own feature.
- Firing direction is forward for most weapons, rearward for missile launchers.
- No diagonal layouts.
- Ships must balance in flight. The center of thrust sits within 0.5 tiles of the center of mass laterally, or the ship yaws under throttle. Mass uses maxHealth as a proxy since the parts db has no mass field; armor (4000 hp) out-massing corridors (1000 hp) matches the game. Three mechanisms cooperate: the thruster bank and laser row center on the core's mass center, armor growth steers per piece toward the anchor that lands the final COM on the thrust line, and a post-armor pass slides thrusters sideways, swapping cells with 1x1 armor where needed.
- Footprints follow the game exactly: Location anchors the collision box (rect w/h; rotation swaps dims), and the sprite may overhang it - weapon barrels never collide. Verified against a game-round-tripped ship.
- Door rules, fitted to 23 doors from a game-round-tripped ship (18/18 offset observations): a door needs BOTH sides to accept; ADL offsets are sprite-frame via `local = rotCw(worldOffset - shift, rot) + (rect.x, rect.y)` with a min-corner shift per rotation (`doorFrameShift`); quarters take one door on their north side only, airlocks one door on their south edge (`MAX_DOORS_PER_PART`); placement never anchors on a part whose single door is spent; reachability covers every part crew can walk through, so airlocks and fire extinguishers count.
- One reactor per ship. When power runs short, buyFixes upgrades small -> medium -> large instead of adding a duplicate; separate reactors only pay off on large hulls to split crew travel.
- No batteries in the core list. Storage pays off only as a remote refill buffer with dedicated crews, not inside one compact hull.
- Non-directional parts (quarters, control rooms, storage, shields) rotate freely; weapons and thrusters stay at rot 0 until arc/exhaust reservations learn rotated directions.
- Door selection is a Prim expansion from the quarters with walk-speed costs: corridor doors are free, room doors cost 1, routing through weapons or thrusters costs +2. Each part gets exactly one door on its path to the core.
- Weapons place immediately after the reactor so their firing arcs reserve before core parts pick spots.
- Export writes the game's full native schema, not just Parts/Doors. The game rejects minimal JSON; a loadable file carries all 45 top-level keys (Version 3, ShipRulesID, Roles, RoofBase*, ...). A real game-exported ship (`scripts/qa-fixtures/valid-ship-template.json`) is the template; `buildGameShipJson` overrides Parts/Doors and regenerates the part-referencing fields (CrewSourceRoles quarters -> Redshirt mask, PartUIToggleStates for control rooms, airlocks, extinguishers).
- The .ship.png payload is `[u32 BE length]["COSMOSHIP"][gzip(OBNode)]`. Omitting the COSMOSHIP magic produces a file the site can read but the game rejects. The image itself is the sprite render from the rawdata tool (not a blank canvas) so the blueprint previews as the ship it contains.

## First job

One narrow slice: a laser ship at a 100000 budget.

1. Promote `parts-db.ts`, `model.ts`, `power.ts` into `src/lib/shipgen/`. The rawdata tests already import from `../../src/lib/shipgen/*`, so they double as the promotion verifier under vitest.
2. Write `partlist.ts` with the balanced strategy only, laser as weapon, wired to real pricing, and the shipdb comparison query beside it. Verifier: unit test asserts price within 100000, power surplus positive, crew surplus nonnegative, at least one laser.
3. Port placement (`shuffle.ts` plus `generator.ts` validation) and emit ship JSON to the debug tool. Verifier: generate one ship end to end, validate it, preview it in the debug tool.

The other strategies, firing-arc and logistics validators, and PNG export follow after this slice works.
