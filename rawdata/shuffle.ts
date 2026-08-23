import type { PlacedPart, DoorSpec, Rotation } from "./model";
import { footprintCells, doorEndpoints, isDoorLegal, key } from "./model";
import { buildOwnersMap } from "./connectivity";
import { genPartsById } from "./parts-db";
import type { PartListResult } from "./partlist";
import { expandList } from "./partlist";

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
): PlacedPart | null {
  const occupied = new Set<string>();
  for (const p of placed) {
    for (const c of footprintCells(p)) occupied.add(c);
  }

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
  pad = 5,
): PlacedPart | null {
  return findPlacement(placed, partId, rotsFor(partId), target, pad);
}

/** Place `count` instances of a part, fanning targets around `center`. */
function placeN(
  placed: PlacedPart[],
  partId: string,
  count: number,
  center: { x: number; y: number },
  radius: number,
): PlacedPart[] {
  const out: PlacedPart[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / Math.max(1, count)) * Math.PI * 2 + Math.PI / 2;
    const t = {
      x: Math.round(center.x + Math.cos(angle) * radius),
      y: Math.round(center.y + Math.sin(angle) * radius),
    };
    const p = place(placed, partId, t, 6);
    if (p) {
      placed.push(p);
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
  const variant = spec.variant ?? 0;
  const ids = expandList(spec.list.entries);
  const placed: PlacedPart[] = [];
  const skipped: string[] = [];
  const c = (id: string) => countById(ids, id);

  // 1. Seed reactor.
  const reactor = c("cosmoteer.reactor_small");
  placed.push(pp("cosmoteer.reactor_small", [0, 0]));
  for (let i = 1; i < reactor; i++) {
    const p = place(placed, "cosmoteer.reactor_small", { x: 0, y: 0 });
    if (p) placed.push(p);
    else skipped.push("cosmoteer.reactor_small");
  }

  // 2. Functional core around the reactor. Crew quarters attach best to the
  //    reactor's top edge (reactor accepts doors anywhere).
  const core: [string, { x: number; y: number }][] = [
    ["cosmoteer.crew_quarters_med", { x: 0, y: -3 }],
    ["cosmoteer.crew_quarters_small", { x: 0, y: -3 }],
    ["cosmoteer.control_room_small", { x: -3, y: 1 }],
    ["cosmoteer.power_storage", { x: 3, y: 1 }],
  ];
  const coreCounts = new Map<string, number>();
  for (const id of ids) coreCounts.set(id, (coreCounts.get(id) ?? 0) + 1);
  for (const [id, target] of core) {
    const n = coreCounts.get(id) ?? 0;
    for (let i = 0; i < n; i++) {
      const t = {
        x: target.x + (i % 2 === 0 ? 0 : 4),
        y: target.y + (i % 2 === 0 ? 0 : 4),
      };
      const p = place(placed, id, t);
      if (p) placed.push(p);
      else skipped.push(id);
    }
  }

  // 3. Thrusters to the rear (+y), lasers to the front (-y). Exhaust sides
  //    have no door, so the door-check orients them outward.
  const rear = { x: 0, y: 6 };
  for (const tId of [
    "cosmoteer.thruster_large",
    "cosmoteer.thruster_med",
    "cosmoteer.thruster_small",
  ]) {
    const n = coreCounts.get(tId) ?? 0;
    placeN(placed, tId, n, rear, 2).forEach(() => {});
  }
  for (let i = 0; i < (coreCounts.get("cosmoteer.thruster_small_2way") ?? 0); i++) {
    const t = { x: i % 2 === 0 ? -3 : 3, y: 5 };
    const p = place(placed, "cosmoteer.thruster_small_2way", t);
    if (p) placed.push(p);
    else skipped.push("cosmoteer.thruster_small_2way");
  }
  const laserCount = coreCounts.get("cosmoteer.laser_blaster_small") ?? 0;
  for (let i = 0; i < laserCount; i++) {
    const t = { x: (i - (laserCount - 1) / 2) * 3, y: -6 };
    const p = place(placed, "cosmoteer.laser_blaster_small", t);
    if (p) placed.push(p);
    else skipped.push("cosmoteer.laser_blaster_small");
  }

  // 4. Utility on exposed edges.
  const airlockCount = coreCounts.get("cosmoteer.airlock") ?? 0;
  for (let i = 0; i < airlockCount; i++) {
    const t = { x: i % 2 === 0 ? -4 : 4, y: -2 - Math.floor(i / 2) * 2 };
    const p = place(placed, "cosmoteer.airlock", t);
    if (p) placed.push(p);
    else skipped.push("cosmoteer.airlock");
  }
  const feCount = coreCounts.get("cosmoteer.fire_extinguisher") ?? 0;
  for (let i = 0; i < feCount; i++) {
    const t = { x: 3 - i, y: -3 };
    const p = place(placed, "cosmoteer.fire_extinguisher", t);
    if (p) placed.push(p);
    else skipped.push("cosmoteer.fire_extinguisher");
  }

  // 5. Corridors: fill the interior around the centroid.
  const corridorCount = coreCounts.get("cosmoteer.corridor") ?? 0;
  const centroid = centroidOf(placed);
  placeN(placed, "cosmoteer.corridor", corridorCount, centroid, 2);

  // 6. Armor last, grown as an outer shell around the bounding box.
  const armorIds = ids.filter((id) => id.startsWith("cosmoteer.armor"));
  for (let i = 0; i < armorIds.length; i++) {
    const b = boundsOf(placed);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const r = Math.max(b.maxX - b.minX, b.maxY - b.minY) / 2 + 2;
    const angle = (i / Math.max(1, armorIds.length)) * Math.PI * 2 + variant;
    const t = {
      x: Math.round(cx + Math.cos(angle) * r),
      y: Math.round(cy + Math.sin(angle) * r),
    };
    const p = place(placed, armorIds[i], t, 5);
    if (p) placed.push(p);
    else skipped.push(armorIds[i]);
  }

  return { parts: placed, skipped };
}
