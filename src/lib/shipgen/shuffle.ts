import type { PlacedPart, DoorSpec, Rotation } from "./model";
import { footprintCells, doorEndpoints, isDoorLegal, key, unkey } from "./model";
import { buildOwnersMap } from "./connectivity";
import { genPartsById } from "./parts-db";
import type { PartListResult } from "./partlist";
import { expandList } from "./partlist";
import { reservedCellsFor, isThrusterPart } from "./constraints";
import { computeBalance } from "./balance";

/**
 * Shuffle engine: takes a budget-first part list and arranges every instance
 * into a valid, connected ship layout.
 *
 * Placement phases:
 *   1. Seed the reactor at the origin.
 *   2. Functional core (crew quarters, control room, power storage) around it.
 *   3. Thrusters to the rear (+y), lasers to the front (-y).
 *   4. Fire extinguisher + airlocks on exposed edges.
 *   5. Corridors to fill the interior and guarantee attach points.
 *   6. Armor last, grown as an outer shell.
 *
 * Every non-seed part must be door-connectable to the existing ship
 * (isDoorLegal, one side suffices). Armor (ADL = []) connects because its
 * neighbor corridor/reactor auto-passes or because armor-armor edges pass the
 * same-ID rule — matching the reference ships.
 */

export interface ShuffleSpec {
  list: PartListResult;
  variant?: number;
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

function hasLegalDoorAdjacency(
  candidate: PlacedPart,
  placedOwners: Map<string, PlacedPart[]>,
): boolean {
  // Parts capped at one door (quarters, airlocks) spend it on their own
  // placement; later parts may not anchor on them.
  const cappedAnchor = (list: PlacedPart[]) =>
    list.some(
      (o) =>
        o !== candidate &&
        (o.part.typeCategories.includes("provides_crew") ||
          o.part.typeCategories.includes("airlock")),
    );
  const candidateCells = footprintCells(candidate);
  for (const cell of candidateCells) {
    const [cx, cy] = cell.split(",").map(Number);
    for (const [dx, dy] of [
      [0, -1],
      [-1, 0],
      [0, 1],
      [1, 0],
    ] as [number, number][]) {
      const nbKey = key([cx + dx, cy + dy]);
      const nb = placedOwners.get(nbKey);
      if (!nb) continue;
      const door: DoorSpec =
        dy === -1
          ? { cell: [cx, cy], orientation: 0 }
          : dx === -1
            ? { cell: [cx, cy], orientation: 1 }
            : dy === 1
              ? { cell: [cx, cy + 1], orientation: 0 }
              : { cell: [cx + 1, cy], orientation: 1 };
      // Build a minimal owners map covering only the two door endpoints.
      // The candidate owns its footprint cell; the neighbor's cell is owned by
      // the already-placed part(s). Mirrors isDoorLegal's exclusive-owner rule.
      const [a, b] = doorEndpoints(door);
      const owners = new Map<string, PlacedPart[]>();
      owners.set(key(a), candidateCells.has(key(a)) ? [candidate] : placedOwners.get(key(a)) ?? []);
      owners.set(key(b), candidateCells.has(key(b)) ? [candidate] : placedOwners.get(key(b)) ?? []);
      if (cappedAnchor(owners.get(key(a)) ?? []) || cappedAnchor(owners.get(key(b)) ?? [])) {
        continue;
      }
      if (isDoorLegal(door, owners)) return true;
    }
  }
  return false;
}

/** True if the candidate shares an orthogonal edge with any placed part. */
function hasPhysicalAdjacency(
  candidate: PlacedPart,
  occupied: Set<string>,
): boolean {
  for (const cell of footprintCells(candidate)) {
    const [cx, cy] = cell.split(",").map(Number);
    for (const [dx, dy] of [
      [0, -1],
      [-1, 0],
      [0, 1],
      [1, 0],
    ] as [number, number][]) {
      if (occupied.has(key([cx + dx, cy + dy]))) return true;
    }
  }
  return false;
}

function rotsFor(partId: string): Rotation[] {
  return genPartsById[partId].isRotateable ? [0, 1, 2, 3] : [0];
}

function findPlacement(
  placed: PlacedPart[],
  partId: string,
  rots: Rotation[],
  target: { x: number; y: number },
  pad = 5,
  reserved: Set<string> = new Set(),
): PlacedPart | null {
  const occupied = new Set<string>();
  for (const p of placed) {
    for (const c of footprintCells(p)) occupied.add(c);
  }
  const touchesReserved = (cand: PlacedPart): boolean => {
    for (const c of footprintCells(cand)) {
      if (reserved.has(c)) return true;
    }
    return false;
  };

  const owners = buildOwnersMap(placed);
  const noDoorPart =
    genPartsById[partId].allowedDoors !== null &&
    genPartsById[partId].allowedDoors.length === 0;

  const b = boundsOf(placed);
  let best: PlacedPart | null = null;
  let bestDist = Infinity;

  for (let y = b.minY - pad; y <= b.maxY + pad; y++) {
    for (let x = b.minX - pad; x <= b.maxX + pad; x++) {
      for (const rot of rots) {
        const cand = pp(partId, [x, y], rot);
        if (overlaps(cand, occupied)) continue;
        if (touchesReserved(cand)) continue;
        if (placed.length > 0) {
          const ok = noDoorPart
            ? hasPhysicalAdjacency(cand, occupied)
            : hasLegalDoorAdjacency(cand, owners);
          if (!ok) continue;
        }
        let sx = 0;
        let sy = 0;
        let n = 0;
        for (const c of footprintCells(cand)) {
          const [cx, cy] = c.split(",").map(Number);
          sx += cx;
          sy += cy;
          n++;
        }
        const dist = (sx / n - target.x) ** 2 + (sy / n - target.y) ** 2;
        if (dist < bestDist) {
          bestDist = dist;
          best = cand;
        }
      }
    }
  }
  return best;
}

/** Place a single instance of a part near `target`; null if no legal spot. */
function place(
  placed: PlacedPart[],
  partId: string,
  target: { x: number; y: number },
  reserved: Set<string>,
  pad = 5,
): PlacedPart | null {
  return findPlacement(placed, partId, rotsFor(partId), target, pad, reserved);
}

function reserveFor(placedPart: PlacedPart, reserved: Set<string>): void {
  for (const c of reservedCellsFor(placedPart)) reserved.add(c);
}

/** Place `count` instances of a part, fanning targets around `center`. */
function placeN(
  placed: PlacedPart[],
  partId: string,
  count: number,
  center: { x: number; y: number },
  radius: number,
  reserved: Set<string>,
): PlacedPart[] {
  const out: PlacedPart[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / Math.max(1, count)) * Math.PI * 2 + Math.PI / 2;
    const t = {
      x: Math.round(center.x + Math.cos(angle) * radius),
      y: Math.round(center.y + Math.sin(angle) * radius),
    };
    const p = place(placed, partId, t, reserved, 6);
    if (p) {
      placed.push(p);
      reserveFor(p, reserved);
      out.push(p);
    }
  }
  return out;
}

function countById(list: ReturnType<typeof expandList>, id: string): number {
  return list.filter((x) => x === id).length;
}

/**
 * Build a ship layout from a part list. Every part instance is placed; returns
 * the placed parts (caller runs autoDoors/pruneDoors/validateShip).
 */
export function buildShipFromPartList(spec: ShuffleSpec): {
  parts: PlacedPart[];
  skipped: string[];
} {
  const ids = expandList(spec.list.entries);
  const placed: PlacedPart[] = [];
  const skipped: string[] = [];
  const reserved: Set<string> = new Set();
  const c = (id: string) => countById(ids, id);

  // 1. Seed reactor.
  const reactor = c("cosmoteer.reactor_small");
  placed.push(pp("cosmoteer.reactor_small", [0, 0]));
  for (let i = 1; i < reactor; i++) {
    const p = place(placed, "cosmoteer.reactor_small", { x: 0, y: 0 }, reserved);
    if (p) placed.push(p);
    else skipped.push("cosmoteer.reactor_small");
  }

  const coreCounts = new Map<string, number>();
  for (const id of ids) coreCounts.set(id, (coreCounts.get(id) ?? 0) + 1);

  // 1b. Fire extinguisher: accepts its single door on the south edge only,
  //     so it sits directly above the reactor (reactor accepts anywhere).
  //     Placed early to guarantee the cell stays free.
  const feCount = coreCounts.get("cosmoteer.fire_extinguisher") ?? 0;
  for (let i = 0; i < feCount; i++) {
    const p = place(placed, "cosmoteer.fire_extinguisher", { x: i, y: -1 }, reserved, 2);
    if (p) {
      placed.push(p);
      reserveFor(p, reserved);
    } else skipped.push("cosmoteer.fire_extinguisher");
  }

  // 1c. Weapons front and center, placed before anything else so their
  //     firing arcs are reserved before core parts pick spots. A laser's
  //     door slots sit on its bottom cell's sides and south edge, so the
  //     bank hugs the reactor's north face.
  const laserCount = coreCounts.get("cosmoteer.laser_blaster_small") ?? 0;
  for (let i = 0; i < laserCount; i++) {
    const t = { x: Math.round((i - (laserCount - 1) / 2) * 2), y: -2 };
    const p = place(placed, "cosmoteer.laser_blaster_small", t, reserved);
    if (p) {
      placed.push(p);
      reserveFor(p, reserved);
    } else skipped.push("cosmoteer.laser_blaster_small");
  }

  // 2. Functional core around the reactor, mirrored left/right about the
  //    reactor's center line so the mass centroid stays near x=0. Crew
  //    quarters attach best to the reactor's top edge (reactor accepts
  //    doors anywhere).
  const coreTargets: Record<string, [number, number][]> = {
    "cosmoteer.crew_quarters_med": [
      [-3, -3],
      [2, -3],
      [-3, 0],
      [2, 0],
    ],
    "cosmoteer.crew_quarters_small": [
      [-1, -3],
      [2, -3],
    ],
    "cosmoteer.control_room_small": [
      [-3, 1],
      [2, 1],
    ],
    "cosmoteer.power_storage": [
      [2, 1],
      [-3, 1],
      [2, 4],
      [-3, 4],
    ],
  };
  for (const [id, targets] of Object.entries(coreTargets)) {
    const n = coreCounts.get(id) ?? 0;
    for (let i = 0; i < n; i++) {
      const seq = targets[i] ?? [0, targets[0][1]];
      const p = place(placed, id, { x: seq[0], y: seq[1] }, reserved);
      if (p) {
        placed.push(p);
        reserveFor(p, reserved);
      } else skipped.push(id);
    }
  }

  // 3. Thrusters to the rear (+y) as one symmetric row: bigger engines
  //    toward the centerline, spread evenly about x=0. Lasers to the front
  //    (-y), also spread symmetrically. Exhaust sides have no door, so the
  //    door-check orients them outward.
  const bankIds = [
    "cosmoteer.thruster_large",
    "cosmoteer.thruster_med",
    "cosmoteer.thruster_small",
  ].flatMap((tId) => Array<string>(coreCounts.get(tId) ?? 0).fill(tId));
  const n = bankIds.length;
  const mid = Math.floor((n - 1) / 2);
  const slots: number[] = [];
  for (let i = 0; i < n; i++) {
    slots.push(i % 2 === 0 ? mid + i / 2 : mid - (i + 1) / 2);
  }
  const spaced = (slot: number) => Math.round((slot - (n - 1) / 2) * 2);
  const rearY = boundsOf(placed).maxY + 1;
  const coreX = computeBalance(placed).com.x;
  for (let i = 0; i < n; i++) {
    const p = place(placed, bankIds[i], { x: coreX + spaced(slots[i]), y: rearY }, reserved);
    if (p) {
      placed.push(p);
      reserveFor(p, reserved);
    } else skipped.push(bankIds[i]);
  }
  for (let i = 0; i < (coreCounts.get("cosmoteer.thruster_small_2way") ?? 0); i++) {
    const t = { x: i % 2 === 0 ? -3 : 3, y: 5 };
    const p = place(placed, "cosmoteer.thruster_small_2way", t, reserved);
    if (p) {
      placed.push(p);
      reserveFor(p, reserved);
    } else skipped.push("cosmoteer.thruster_small_2way");
  }

  // 4. Utility on exposed edges.
  const airlockCount = coreCounts.get("cosmoteer.airlock") ?? 0;
  for (let i = 0; i < airlockCount; i++) {
    const t = { x: i % 2 === 0 ? -4 : 4, y: -2 - Math.floor(i / 2) * 2 };
    const p = place(placed, "cosmoteer.airlock", t, reserved);
    if (p) {
      placed.push(p);
      reserveFor(p, reserved);
    } else skipped.push("cosmoteer.airlock");
  }

  // 5. Corridors: fill the interior around the centroid.
  const corridorCount = coreCounts.get("cosmoteer.corridor") ?? 0;
  const centroid = centroidOf(placed);
  placeN(placed, "cosmoteer.corridor", corridorCount, centroid, 2, reserved);


  // 6. Armor last, grown like a snail shell: each piece targets the free
  //    cell closest to the existing ship, so armor wraps the hull tightly
  //    and fills interior gaps before reaching outward. Weapon-arc and
  //    exhaust reservations stay forbidden, exposing guns and engines.
  const armorIds = ids.filter((id) => id.startsWith("cosmoteer.armor"));
  const occupiedCells = new Set<string>();
  for (const p of placed) {
    for (const c of footprintCells(p)) occupiedCells.add(c);
  }
  for (let i = 0; i < armorIds.length; i++) {
    const b = boundsOf(placed);
    const pad = 3;
    const dist = new Map<string, number>();
    let frontier: [number, number][] = [];
    for (const c of occupiedCells) {
      dist.set(c, 0);
      frontier.push(c.split(",").map(Number) as [number, number]);
    }
    const inBounds = (x: number, y: number) =>
      x >= b.minX - pad && x <= b.maxX + pad && y >= b.minY - pad && y <= b.maxY + pad;
    let layer = 0;
    let best: { x: number; y: number } | null = null;
    const centroid = centroidOf(placed);
    // Armor is most of the ship's mass, so steer its growth: pick the
    // anchor that would put the final COM on the thrust line given the
    // mass placed so far and the armor still to come. Recomputing per
    // piece makes this a feedback loop instead of a blind pile-up.
    const balNow = computeBalance(placed);
    const remainingMass = armorIds
      .slice(i)
      .reduce((s, id) => s + genPartsById[id].maxHealth, 0);
    let anchorX = balNow.thrustCenter.x;
    if (remainingMass > 0 && balNow.totalMass > 0) {
      anchorX =
        (balNow.thrustCenter.x * (balNow.totalMass + remainingMass) -
          balNow.totalMass * balNow.com.x) /
        remainingMass;
      anchorX = Math.max(b.minX - 2, Math.min(b.maxX + 2, anchorX));
    }
    while (frontier.length && !best) {
      const next: [number, number][] = [];
      layer++;
      for (const [x, y] of frontier) {
        for (const [dx, dy] of [[0, -1], [-1, 0], [0, 1], [1, 0]] as [number, number][]) {
          const nx = x + dx;
          const ny = y + dy;
          const k = key([nx, ny]);
          if (!inBounds(nx, ny) || dist.has(k) || occupiedCells.has(k) || reserved.has(k)) {
            continue;
          }
          dist.set(k, layer);
          next.push([nx, ny]);
          const dc = Math.abs(nx - anchorX) + Math.abs(ny - centroid.y);
          const bc = best
            ? Math.abs(best.x - anchorX) + Math.abs(best.y - centroid.y)
            : Infinity;
          if (!best || dc < bc) best = { x: nx, y: ny };
        }
      }
      frontier = next;
    }
    if (!best) {
      skipped.push(armorIds[i]);
      continue;
    }
    const p = place(placed, armorIds[i], best, reserved, 2);
    if (p) {
      placed.push(p);
      for (const c of footprintCells(p)) occupiedCells.add(c);
    } else {
      skipped.push(armorIds[i]);
    }
  }

  // 7. Flight balance: walk the thruster bank sideways until the center of
  //    thrust sits under the center of mass. Armor yields its cells: a
  //    thruster may displace 1x1 armor, which re-settles into the vacated
  //    cells, so the shell stays solid after the move.
  const thrusters = placed.filter(isThrusterPart);
  for (let pass = 0; pass < 8; pass++) {
    const bal = computeBalance(placed);
    if (bal.balanced || thrusters.length === 0) break;
    let dx = Math.round(-bal.lateralOffset);
    if (dx === 0) dx = -Math.sign(bal.lateralOffset);
    let movedAny = false;
    for (const t of thrusters) {
      const others = placed.filter((p) => p !== t);
      const occ = new Map<string, PlacedPart>();
      for (const p of others) {
        for (const c of footprintCells(p)) occ.set(c, p);
      }
      const ownCells = new Set(footprintCells(t));
      const targetCells = [...footprintCells(t)].map(unkey).map(([x, y]) => key([x + dx, y]));      const displaced = new Set<PlacedPart>();
      let legal = true;
      for (const k of targetCells) {
        if (ownCells.has(k)) continue;
        const blocker = occ.get(k);
        if (!blocker) continue;
        if (
          blocker.part.size[0] !== 1 ||
          blocker.part.size[1] !== 1 ||
          !blocker.part.typeCategories.includes("armor")
        ) {
          legal = false;
          break;
        }
        displaced.add(blocker);
      }
      if (!legal) continue;
      const blocked = new Set<string>();
      for (const p of others) {
        if (displaced.has(p)) continue;
        for (const c of reservedCellsFor(p)) blocked.add(c);
      }
      if (targetCells.some((k) => blocked.has(k))) continue;
      const survivors = others.filter((p) => !displaced.has(p));
      const movedT = pp(t.part.id, [t.loc[0] + dx, t.loc[1]], t.rot);
      const survivorAt = new Map<string, PlacedPart>();
      for (const p of survivors) {
        for (const c of footprintCells(p)) survivorAt.set(c, p);
      }
      if (
        reservedCellsFor(movedT).some((k) => {
          const b = survivorAt.get(k);
          return b && !isThrusterPart(b);
        })
      ) {
        continue;
      }
      if (survivors.length > 0 && !hasLegalDoorAdjacency(movedT, buildOwnersMap(survivors))) {
        continue;
      }
      const vacated = [...ownCells].filter((k) => !blocked.has(k));
      if (vacated.length < displaced.size) continue;
      t.loc = [t.loc[0] + dx, t.loc[1]];
      for (const a of displaced) {
        const home = vacated.pop();
        if (!home) break;
        const [hx, hy] = unkey(home);
        a.loc = [hx, hy];
      }
      movedAny = true;
    }
    if (!movedAny) break;
  }
  reserved.clear();
  for (const p of placed) reserveFor(p, reserved);

  return { parts: placed, skipped };
}
