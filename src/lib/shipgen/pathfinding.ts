import type { PlacedPart, DoorSpec } from "./model";
import { footprintCells, doorEndpoints, key, isCorridorPart } from "./model";

/**
 * Crew pathfinding over a placed layout.
 *
 * Walk speed per cell comes from the part's crewSpeedFactor, with optional
 * directional overrides in crewSpeedByDir (part-local [forward, right,
 * backward, left] multipliers rotated into world space). Crossing between two
 * different parts requires a door, except adjacent corridors which merge.
 * Armor and other zero-speed cells block movement entirely.
 */

export const CREW_BASE_SPEED = 3.2;

const DIRS: [number, number, number][] = [
  [0, -1, 0],
  [1, 0, 1],
  [0, 1, 2],
  [-1, 0, 3],
];

interface CellInfo {
  part: PlacedPart;
  speedFactor: number;
}

function dirMultiplier(part: PlacedPart, worldDirIndex: number): number {
  const byDir = part.part.crewSpeedByDir;
  if (!byDir) return part.part.crewSpeedFactor;
  const local = (((worldDirIndex - part.rot) % 4) + 4) % 4;
  return byDir[local];
}

function buildCellMap(parts: PlacedPart[]): Map<string, CellInfo> {
  const cells = new Map<string, CellInfo>();
  for (const p of parts) {
    for (const c of footprintCells(p)) {
      if (!cells.has(c)) {
        cells.set(c, { part: p, speedFactor: p.part.crewSpeedFactor });
      }
    }
  }
  return cells;
}

function doorPairs(doors: DoorSpec[]): Set<string> {
  const pairs = new Set<string>();
  for (const d of doors) {
    const [a, b] = doorEndpoints(d);
    pairs.add(`${key(a)}|${key(b)}`);
    pairs.add(`${key(b)}|${key(a)}`);
  }
  return pairs;
}

export interface WalkGraph {
  adj: Map<string, { to: string; seconds: number }[]>;
}

export function buildWalkGraph(parts: PlacedPart[], doors: DoorSpec[]): WalkGraph {
  const cells = buildCellMap(parts);
  const doorSet = doorPairs(doors);
  const adj = new Map<string, { to: string; seconds: number }[]>();
  for (const [cellKey, info] of cells) {
    const [x, y] = cellKey.split(",").map(Number);
    for (const [dx, dy, dirIdx] of DIRS) {
      const nbKey = key([x + dx, y + dy]);
      const nb = cells.get(nbKey);
      if (!nb) continue;
      const sameOwner = nb.part === info.part;
      const mergedCorridor = isCorridorPart(info.part) && isCorridorPart(nb.part);
      const hasDoor = doorSet.has(`${cellKey}|${nbKey}`);
      if (!sameOwner && !mergedCorridor && !hasDoor) continue;
      if (nb.speedFactor <= 0) continue;
      const mult = dirMultiplier(nb.part, dirIdx);
      const seconds = 1 / (CREW_BASE_SPEED * Math.max(0.01, mult));
      if (!adj.has(cellKey)) adj.set(cellKey, []);
      adj.get(cellKey)!.push({ to: nbKey, seconds });
    }
  }
  return { adj };
}

/** Shortest walk time (seconds) from the nearest source cell to every reachable cell. */
export function dijkstra(graph: WalkGraph, sources: string[]): Map<string, number> {
  const dist = new Map<string, number>();
  const queue: [string, number][] = [];
  for (const s of sources) {
    dist.set(s, 0);
    queue.push([s, 0]);
  }
  while (queue.length) {
    queue.sort((a, b) => a[1] - b[1]);
    const [cur, d] = queue.shift()!;
    if (d > (dist.get(cur) ?? Infinity)) continue;
    for (const edge of graph.adj.get(cur) ?? []) {
      const nd = d + edge.seconds;
      if (nd < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, nd);
        queue.push([edge.to, nd]);
      }
    }
  }
  return dist;
}

export interface SupplyStats {
  avgSeconds: number;
  maxSeconds: number;
  unreachableConsumers: string[];
}

/**
 * Walk times from crew quarters to every drain part (thrusters, ammo
 * weapons). These are the trips refill crews make, so they set the real
 * refill rate.
 */
export function supplyStats(
  parts: PlacedPart[],
  doors: DoorSpec[],
): SupplyStats {
  const quarters = parts.filter((p) => p.part.providesCrew > 0);
  if (quarters.length === 0) {
    return { avgSeconds: NaN, maxSeconds: NaN, unreachableConsumers: [] };
  }
  const graph = buildWalkGraph(parts, doors);
  const sources: string[] = [];
  for (const q of quarters) {
    for (const c of footprintCells(q)) sources.push(c);
  }
  const dist = dijkstra(graph, sources);
  const consumers = parts.filter(
    (p) =>
      (p.part.thrusterForce > 0 && p.part.fuelUsage > 0) ||
      (p.part.typeCategories.includes("uses_ammo") && p.part.resourcesUsed > 0),
  );
  const times: number[] = [];
  const unreachable: string[] = [];
  for (const c of consumers) {
    let best = Infinity;
    for (const cell of footprintCells(c)) {
      const d = dist.get(cell);
      if (d !== undefined && d < best) best = d;
    }
    if (best === Infinity) unreachable.push(c.part.id);
    else times.push(best);
  }
  const avgSeconds = times.length ? times.reduce((a, b) => a + b, 0) / times.length : NaN;
  const maxSeconds = times.length ? Math.max(...times) : NaN;
  return { avgSeconds, maxSeconds, unreachableConsumers: unreachable };
}
