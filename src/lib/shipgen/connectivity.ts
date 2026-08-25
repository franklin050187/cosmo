import type { PlacedPart, DoorSpec } from "./model";
import { footprintCells, doorEndpoints, key, isDoorLegal } from "./model";

/**
 * Cell-key -> parts owning that cell. A cell can be shared by several
 * instances of the same part ID (the generator relies on that).
 */
export function buildOwnersMap(parts: PlacedPart[]): Map<string, PlacedPart[]> {
  const owners = new Map<string, PlacedPart[]>();
  for (const p of parts) {
    for (const cell of footprintCells(p)) {
      const list = owners.get(cell);
      if (list) {
        if (!list.includes(p)) list.push(p);
      } else {
        owners.set(cell, [p]);
      }
    }
  }
  return owners;
}

function isWalkable(p: PlacedPart): boolean {
  return p.part.crewSpeedFactor > 0;
}

export function isCrewedPart(p: PlacedPart): boolean {
  return p.part.crew > 0;
}

const NON_FUNCTIONAL_CATEGORIES = new Set(["armor", "structure"]);

export function isFunctionalPart(p: PlacedPart): boolean {
  if (p.part.typeCategories.some((c) => NON_FUNCTIONAL_CATEGORIES.has(c))) {
    return false;
  }
  return (
    p.part.crew > 0 ||
    p.part.providesCrew > 0 ||
    p.part.powerGenPerSec > 0 ||
    p.part.powerUsePerSec > 0 ||
    p.part.thrusterForce > 0 ||
    p.part.fireInterval > 0 ||
    p.part.batteryCapacity >= 500 ||
    p.part.typeCategories.includes("storage") ||
    p.part.typeCategories.includes("command")
  );
}

/**
 * Crew walk graph over placed parts. Two parts are connected when a legal
 * door joins two of their cells and both parts are walkable. Armor and other
 * zero-speed parts never appear in the graph.
 */
function crewGraph(
  parts: PlacedPart[],
  doors: DoorSpec[],
  owners: Map<string, PlacedPart[]>,
): Map<PlacedPart, Set<PlacedPart>> {
  const graph = new Map<PlacedPart, Set<PlacedPart>>();
  for (const p of parts) {
    if (isWalkable(p)) graph.set(p, new Set());
  }
  for (const door of doors) {
    if (!isDoorLegal(door, owners)) continue;
    const [a, b] = doorEndpoints(door);
    for (const pa of owners.get(key(a)) ?? []) {
      if (!isWalkable(pa)) continue;
      for (const pb of owners.get(key(b)) ?? []) {
        if (pa === pb || !isWalkable(pb)) continue;
        graph.get(pa)!.add(pb);
        graph.get(pb)!.add(pa);
      }
    }
  }
  return graph;
}

function reachFromQuarters(
  parts: PlacedPart[],
  doors: DoorSpec[],
): Set<PlacedPart> {
  const owners = buildOwnersMap(parts);
  const graph = crewGraph(parts, doors, owners);
  const reached = new Set<PlacedPart>();
  const queue: PlacedPart[] = [];
  for (const p of parts) {
    if (p.part.providesCrew > 0 && !reached.has(p)) {
      reached.add(p);
      queue.push(p);
    }
  }
  while (queue.length) {
    const cur = queue.shift()!;
    for (const nb of graph.get(cur) ?? []) {
      if (!reached.has(nb)) {
        reached.add(nb);
        queue.push(nb);
      }
    }
  }
  return reached;
}

export function checkCrewConnectivity(
  parts: PlacedPart[],
  doors: DoorSpec[],
): { ok: boolean; unreachable: PlacedPart[] } {
  const reached = reachFromQuarters(parts, doors);
  // Every part crew can walk through needs door access: weapons and control
  // rooms are crewed, but airlocks and fire extinguishers are not crewed
  // and still must be reachable (game-verified misses).
  const unreachable = parts.filter(
    (p) => (p.part.crew > 0 || p.part.crewSpeedFactor > 0) && !reached.has(p),
  );
  return { ok: unreachable.length === 0, unreachable };
}

export function checkFunctionalConnectivity(
  parts: PlacedPart[],
  doors: DoorSpec[],
): { ok: boolean; unreachable: PlacedPart[] } {
  const reached = reachFromQuarters(parts, doors);
  const unreachable = parts.filter((p) => isFunctionalPart(p) && !reached.has(p));
  return { ok: unreachable.length === 0, unreachable };
}

/**
 * Physical component count over footprint adjacency, ignoring doors.
 * Armor-only satellites fail this check through their neighbors.
 */
export function checkSingleComponent(
  parts: PlacedPart[],
): { ok: boolean; components: number } {
  if (parts.length === 0) return { ok: true, components: 0 };
  const owners = buildOwnersMap(parts);
  const seen = new Set<PlacedPart>();
  let components = 0;
  for (const seed of parts) {
    if (seen.has(seed)) continue;
    components++;
    seen.add(seed);
    const queue = [seed];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const cell of footprintCells(cur)) {
        const [cx, cy] = cell.split(",").map(Number);
        for (const [dx, dy] of [[0, -1], [-1, 0], [0, 1], [1, 0]] as [number, number][]) {
          for (const nb of owners.get(key([cx + dx, cy + dy])) ?? []) {
            if (!seen.has(nb)) {
              seen.add(nb);
              queue.push(nb);
            }
          }
        }
      }
    }
  }
  return { ok: components === 1, components };
}
