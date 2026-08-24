import type { PlacedPart, DoorSpec, Rotation } from "./model";
import { footprintCells, isDoorLegal, key } from "./model";
import { buildOwnersMap } from "./connectivity";
import { genPartsById } from "./parts-db";

/**
 * Data-driven procedural ship builder.
 *
 * Places parts one at a time onto a shared grid with two hard constraints:
 *   1. Parts never overlap.
 *   2. Every non-seed part must be door-connectable to the already-placed parts.
 *      Connectivity uses the game's real rule (isDoorLegal): a door is legal if
 *      EITHER exclusive side accepts it (null-ADL parts like corridors/reactors
 *      accept anywhere). This means parts with restricted ADLs (e.g.
 *      crew_quarters_med allows doors only on its top edge) still connect fine
 *      when placed against a corridor/reactor.
 *
 * Soft scoring pulls parts toward a per-phase target so the ship grows into a
 * compact cluster (thrusters to the rear, weapon to the front, etc.).
 */

export interface ProceduralSpec {
  /** Selects seed jitter among variants. */
  variant?: number;
  /** Number of thrusters to place (small/med mix). Default 4. */
  thrusterCount?: number;
  /** Number of laser_blaster_small. Default 1. */
  laserCount?: number;
  /** Include a control_room_small. Default true. */
  includeControlRoom?: boolean;
  /** Include a storage_2x2. Default true. */
  includeStorage?: boolean;
  /** Number of airlocks. Default 2. */
  airlockCount?: number;
}

function pp(id: string, loc: [number, number], rot: Rotation = 0): PlacedPart {
  return { part: genPartsById[id], loc, rot };
}

function overlaps(p: PlacedPart, occupied: Set<string>): boolean {
  for (const c of footprintCells(p)) {
    if (occupied.has(c)) return true;
  }
  return false;
}

function centroidOf(placed: PlacedPart[]): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const p of placed) {
    for (const c of footprintCells(p)) {
      const [x, y] = c.split(",").map(Number);
      sx += x;
      sy += y;
      n++;
    }
  }
  return n === 0 ? { x: 0, y: 0 } : { x: sx / n, y: sy / n };
}

/**
 * True if a door placed between `candidate` and any already-placed part would
 * be legal under the game's rule (isDoorLegal, one side suffices). Mirrors the
 * autoDoors neighbor->door convention so the doors we later auto-place are
 * exactly the ones the validator accepts.
 */
function hasLegalDoorAdjacency(
  candidate: PlacedPart,
  placed: PlacedPart[],
): boolean {
  const owners = buildOwnersMap([...placed, candidate]);
  for (const cell of footprintCells(candidate)) {
    const [cx, cy] = cell.split(",").map(Number);
    for (const [dx, dy] of [
      [0, -1],
      [-1, 0],
      [0, 1],
      [1, 0],
    ] as [number, number][]) {
      const nbKey = key([cx + dx, cy + dy]);
      const nb = owners.get(nbKey);
      if (!nb || nb.includes(candidate)) continue;
      const door: DoorSpec =
        dy === -1
          ? { cell: [cx, cy], orientation: 0 }
          : dx === -1
            ? { cell: [cx, cy], orientation: 1 }
            : dy === 1
              ? { cell: [cx, cy + 1], orientation: 0 }
              : { cell: [cx + 1, cy], orientation: 1 };
      if (isDoorLegal(door, owners)) return true;
    }
  }
  return false;
}

function boundsOf(placed: PlacedPart[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of placed) {
    for (const c of footprintCells(p)) {
      const [x, y] = c.split(",").map(Number);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Find a placement for `partId` that (a) never overlaps existing parts and
 * (b) has a door the part itself accepts connecting it to an existing part.
 * Among valid spots, prefers the one closest to `target`. Returns null if no
 * valid spot exists in the searched region.
 */
function findPlacement(
  placed: PlacedPart[],
  partId: string,
  rots: Rotation[],
  target: { x: number; y: number },
  pad = 5,
): PlacedPart | null {
  const occupied = new Set<string>();
  for (const p of placed) {
    for (const c of footprintCells(p)) occupied.add(c);
  }

  const b = boundsOf(placed);
  let best: PlacedPart | null = null;
  let bestDist = Infinity;

  for (let y = b.minY - pad; y <= b.maxY + pad; y++) {
    for (let x = b.minX - pad; x <= b.maxX + pad; x++) {
      for (const rot of rots) {
        const cand = pp(partId, [x, y], rot);
        if (overlaps(cand, occupied)) continue;
        if (placed.length > 0 && !hasLegalDoorAdjacency(cand, placed)) continue;
        // Distance from the part's footprint center to the target.
        let sx = 0;
        let sy = 0;
        let n = 0;
        for (const c of footprintCells(cand)) {
          const [cx, cy] = c.split(",").map(Number);
          sx += cx;
          sy += cy;
          n++;
        }
        const dist =
          (sx / n - target.x) ** 2 + (sy / n - target.y) ** 2;
        if (dist < bestDist) {
          bestDist = dist;
          best = cand;
        }
      }
    }
  }
  return best;
}

/** Rotations a part may adopt. Non-rotatable parts keep rot 0 only. */
function rotsFor(partId: string): Rotation[] {
  return genPartsById[partId].isRotateable ? [0, 1, 2, 3] : [0];
}

/**
 * Build a ship layout from a spec. Guarantees all mandatory parts present,
 * no overlaps, and every part door-connected via a door it accepts.
 */
export function buildProceduralShip(spec: ProceduralSpec = {}): {
  parts: PlacedPart[];
} {
  const variant = spec.variant ?? 0;
  const thrusterCount = spec.thrusterCount ?? 4;
  const laserCount = spec.laserCount ?? 1;
  const includeControlRoom = spec.includeControlRoom ?? true;
  const includeStorage = spec.includeStorage ?? true;
  const airlockCount = spec.airlockCount ?? 2;

  const placed: PlacedPart[] = [];

  // Seed: reactor at origin.
  placed.push(pp("cosmoteer.reactor_small", [0, 0]));

  // Crew quarters: crew quarters only accepts doors on its top edge, so place it
  // directly above the reactor (reactor accepts doors anywhere).
  const quarters = findPlacement(
    placed,
    "cosmoteer.crew_quarters_med",
    rotsFor("cosmoteer.crew_quarters_med"),
    { x: 0, y: -3 },
  );
  if (quarters) placed.push(quarters);

  // Rear thrusters (high y = rear), alternating small/med. The exhaust side has
  // no door, so the engine's own-door check orients them correctly.
  const thrusterIds =
    variant % 2 === 0
      ? ["cosmoteer.thruster_small", "cosmoteer.thruster_med"]
      : ["cosmoteer.thruster_med", "cosmoteer.thruster_small"];
  for (let i = 0; i < thrusterCount; i++) {
    const t = findPlacement(
      placed,
      thrusterIds[i % thrusterIds.length],
      [0],
      { x: 0, y: 6 },
    );
    if (t) placed.push(t);
  }

  // Weapon(s): front (low y).
  for (let i = 0; i < laserCount; i++) {
    const laser = findPlacement(
      placed,
      "cosmoteer.laser_blaster_small",
      [0, 3],
      { x: 0, y: -6 },
    );
    if (laser) placed.push(laser);
  }

  // Command + storage: neutral sides.
  if (includeControlRoom) {
    const cr = findPlacement(
      placed,
      "cosmoteer.control_room_small",
      rotsFor("cosmoteer.control_room_small"),
      { x: -5, y: -1 },
    );
    if (cr) placed.push(cr);
  }
  if (includeStorage) {
    const st = findPlacement(
      placed,
      "cosmoteer.storage_2x2",
      rotsFor("cosmoteer.storage_2x2"),
      { x: 5, y: 1 },
    );
    if (st) placed.push(st);
  }

  // Fire extinguisher + airlocks: exposed edges.
  const fe = findPlacement(
    placed,
    "cosmoteer.fire_extinguisher",
    rotsFor("cosmoteer.fire_extinguisher"),
    { x: 3, y: -2 },
  );
  if (fe) placed.push(fe);
  for (let i = 0; i < airlockCount; i++) {
    const air = findPlacement(
      placed,
      "cosmoteer.airlock",
      rotsFor("cosmoteer.airlock"),
      { x: i === 0 ? -4 : 4, y: -3 },
    );
    if (air) placed.push(air);
  }

  return { parts: placed };
}
