import type { PlacedPart, DoorSpec } from "./model";
import { footprintCells, doorEndpoints, key, isDoorLegal } from "./model";
import {
  buildOwnersMap,
  checkCrewConnectivity,
  checkFunctionalConnectivity,
  checkSingleComponent,
} from "./connectivity";
import { checkPowerValid, computeCrewStats } from "./power";
import { genPartsById } from "./parts-db";
import { checkDirectionalConstraints } from "./constraints";

function pp(id: string, loc: [number, number], rot: 0 | 1 | 2 | 3 = 0): PlacedPart {
  return { part: genPartsById[id], loc, rot };
}

/**
 * Game rule (confirmed in game): some parts accept at most one door no
 * matter how many slots their ADL lists. Quarters cannot serve as
 * passages; an airlock is a single hatch.
 */
export const MAX_DOORS_PER_PART: Record<string, number> = {
  provides_crew: 1,
  airlock: 1,
};

function doorCapFor(p: PlacedPart): number {
  let cap = Infinity;
  for (const c of p.part.typeCategories) {
    const v = MAX_DOORS_PER_PART[c];
    if (v !== undefined) cap = Math.min(cap, v);
  }
  return cap;
}

/**
 * Auto-discover legal doors between adjacent cells of different parts.
 * Uses includes() so parts sharing a location are compared correctly.
 * Per-part door caps are respected: a part at its cap blocks new doors.
 */
export function autoDoors(parts: PlacedPart[]): DoorSpec[] {
  const doors: DoorSpec[] = [];
  const owners = buildOwnersMap(parts);
  const seen = new Set<string>();
  const doorCount = new Map<PlacedPart, number>();

  const atCap = (p: PlacedPart): boolean => {
    return (doorCount.get(p) ?? 0) >= doorCapFor(p);
  };

  for (const p of parts) {
    for (const cell of footprintCells(p)) {
      const [cx, cy] = cell.split(",").map(Number);
      for (const [dx, dy] of [[0, -1], [-1, 0], [0, 1], [1, 0]] as [number, number][]) {
        const nbKey = key([cx + dx, cy + dy]);
        const nb = owners.get(nbKey);
        if (!nb || nb.includes(p)) continue;

        let doorSpec: DoorSpec | null = null;
        if (dy === -1) doorSpec = { cell: [cx, cy], orientation: 0 };
        else if (dx === -1) doorSpec = { cell: [cx, cy], orientation: 1 };
        else if (dy === 1) doorSpec = { cell: [cx, cy + 1], orientation: 0 };
        else if (dx === 1) doorSpec = { cell: [cx + 1, cy], orientation: 1 };

        if (doorSpec) {
          const doorId = `${doorSpec.cell[0]},${doorSpec.cell[1]},${doorSpec.orientation}`;
          if (!seen.has(doorId)) {
            seen.add(doorId);
            if (isDoorLegal(doorSpec, owners)) {
              const sides = [...new Set([...(owners.get(key(doorSpec.cell)) ?? []), ...(owners.get(key(doorEndpoints(doorSpec)[1])) ?? [])])];
              if (sides.some(atCap)) continue;
              doors.push(doorSpec);
              for (const s of sides) doorCount.set(s, (doorCount.get(s) ?? 0) + 1);
            }
          }
        }
      }
    }
  }
  return doors;
}

/**
 * Reduce a door set to a minimal set that keeps every part in the same door-graph
 * component (a spanning forest). Redundant doors — extra parallel doors between
 * the same part pair and doors closing cycles — are dropped. Doors that are
 * bridges (the only connection of a sub-ship) are always retained.
 *
 * A room that ends up with two doors still acts as a passway; a leaf room keeps
 * exactly its single access door.
 */
export function pruneDoors(parts: PlacedPart[], doors: DoorSpec[]): DoorSpec[] {
  const owners = buildOwnersMap(parts);
  const indexOf = new Map<PlacedPart, number>();
  parts.forEach((p, i) => indexOf.set(p, i));

  // Part graph; each undirected edge keeps its cheapest representative door.
  const edgeDoor = new Map<string, DoorSpec>();
  const edgeCost = new Map<string, number>();
  const graph = new Map<number, Set<number>>();
  for (const p of parts) graph.set(indexOf.get(p)!, new Set());

  const isCorridor = (p: PlacedPart) => p.part.id === "cosmoteer.corridor";
  const isPassagePenalty = (p: PlacedPart) =>
    p.part.typeCategories.includes("weapon") || p.part.thrusterForce > 0;

  for (const door of doors) {
    if (!isDoorLegal(door, owners)) continue;
    const [a, b] = doorEndpoints(door);
    const oa = owners.get(key(a)) ?? [];
    const ob = owners.get(key(b)) ?? [];
    for (const pa of oa) {
      const ia = indexOf.get(pa);
      if (ia === undefined) continue;
      for (const pb of ob) {
        const ib = indexOf.get(pb);
        if (ib === undefined || ia === ib) continue;
        const ek = ia < ib ? `${ia}:${ib}` : `${ib}:${ia}`;
        // Crew walks corridors at full speed and rooms at half, so
        // corridor-involved doors make the fastest passages. Routing crew
        // through weapons or thrusters works but is slow and exposes the
        // part, so those cost more.
        let cost = isCorridor(pa) || isCorridor(pb) ? 0 : 1;
        if (isPassagePenalty(pa) || isPassagePenalty(pb)) cost += 2;
        if (!edgeDoor.has(ek) || cost < edgeCost.get(ek)!) {
          edgeDoor.set(ek, door);
          edgeCost.set(ek, cost);
        }
        graph.get(ia)!.add(ib);
        graph.get(ib)!.add(ia);
      }
    }
  }

  // Prim expansion from the crew core (quarters, then reactor): every part
  // gets exactly one door on its path to the core, so leaf parts keep a
  // single door and nothing redundant survives.
  const root = parts.findIndex((p) => p.part.providesCrew > 0);
  const start = root >= 0 ? root : 0;
  const visited = new Set<number>([start]);
  const kept = new Set<string>();
  while (visited.size < parts.length) {
    let best: { cost: number; from: number; to: number } | null = null;
    for (const from of visited) {
      for (const to of graph.get(from) ?? []) {
        if (visited.has(to)) continue;
        const ek = from < to ? `${from}:${to}` : `${to}:${from}`;
        const cost = edgeCost.get(ek) ?? 99;
        if (!best || cost < best.cost) best = { cost, from, to };
      }
    }
    if (!best) break;
    visited.add(best.to);
    const ek = best.from < best.to ? `${best.from}:${best.to}` : `${best.to}:${best.from}`;
    const d = edgeDoor.get(ek);
    if (d) kept.add(`${d.cell[0]},${d.cell[1]},${d.orientation}`);
  }

  return doors.filter(
    (d) => kept.has(`${d.cell[0]},${d.cell[1]},${d.orientation}`),
  );
}

/**
 * Compact connected ship layout with variant support for generating different ships.
 * Variant 0-4 produce different weapon/laser configurations.
 */
function buildModelSLike(variant: number = 0): { parts: PlacedPart[]; doors: DoorSpec[] } {
  const laserLocs: [number, number][] = [
    [9, 1],
    [10, 2],
    [9, 3],
    [10, 1],
    [11, 1],
  ];
  const laserLoc = laserLocs[variant % laserLocs.length];

  const parts: PlacedPart[] = [
    pp("cosmoteer.armor_wedge", [0, 0]),
    pp("cosmoteer.armor_wedge", [2, 0]),
    pp("cosmoteer.armor_wedge", [4, 0]),
    pp("cosmoteer.armor_wedge", [6, 0]),
    pp("cosmoteer.armor_wedge", [7, 0]),
    pp("cosmoteer.armor_wedge", [8, 0]),

    pp("cosmoteer.corridor", [0, 1]),
    pp("cosmoteer.corridor", [2, 1]),
    pp("cosmoteer.control_room_small", [2, 2]),
    pp("cosmoteer.corridor", [4, 1]),
    pp("cosmoteer.corridor", [6, 1]),
    pp("cosmoteer.corridor", [7, 1]),
    pp("cosmoteer.corridor", [8, 1]),

    pp("cosmoteer.corridor", [0, 2]),
    pp("cosmoteer.corridor", [4, 2]),
    pp("cosmoteer.corridor", [6, 2]),
    pp("cosmoteer.corridor", [7, 2]),
    pp("cosmoteer.corridor", [8, 2]),

    pp("cosmoteer.corridor", [0, 3]),
    pp("cosmoteer.corridor", [4, 3]),
    pp("cosmoteer.corridor", [6, 3]),
    pp("cosmoteer.corridor", [8, 3]),

    pp("cosmoteer.reactor_small", [0, 4]),
    pp("cosmoteer.corridor", [2, 4]),
    pp("cosmoteer.crew_quarters_med", [4, 4]),
    pp("cosmoteer.corridor", [6, 4]),
    pp("cosmoteer.corridor", [8, 4]),

    pp("cosmoteer.corridor", [2, 5]),
    pp("cosmoteer.corridor", [6, 5]),
    pp("cosmoteer.corridor", [8, 5]),

    pp("cosmoteer.corridor", [0, 6]),
    pp("cosmoteer.storage_2x2", [2, 6]),
    pp("cosmoteer.corridor", [4, 6]),
    pp("cosmoteer.fire_extinguisher", [6, 6]),
    pp("cosmoteer.corridor", [8, 6]),

    pp("cosmoteer.corridor", [0, 7]),
    pp("cosmoteer.corridor", [4, 7]),
    pp("cosmoteer.corridor", [6, 7]),
    pp("cosmoteer.corridor", [8, 7]),

    pp("cosmoteer.thruster_small", [0, 7]),
    pp("cosmoteer.thruster_med", [4, 7]),
    pp("cosmoteer.thruster_small", [6, 7]),
    pp("cosmoteer.thruster_small", [8, 7]),

    pp("cosmoteer.airlock", [-1, 2]),
    pp("cosmoteer.airlock", [-1, 3]),

    // Laser position varies by variant
    pp("cosmoteer.laser_blaster_small", laserLoc, 3),
  ];

  // Add a second weapon for some variants, placed adjacent to the hull's
  // right edge (x=8) so autoDoors can connect them via legal doors.
  if (variant === 1) {
    parts.push(pp("cosmoteer.disruptor", [9, 2], 0));
  } else if (variant === 2) {
    parts.push(pp("cosmoteer.point_defense", [9, 1], 0));
  } else if (variant === 3) {
    parts.push(pp("cosmoteer.cannon_med", [9, 1], 1));
  } else if (variant === 4) {
    parts.push(pp("cosmoteer.railgun_launcher", [9, 1], 0));
  }

  const doors = autoDoors(parts);
  return { parts, doors };
}

export function validateShip(
  parts: PlacedPart[],
  doors: DoorSpec[],
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const cellOwners = new Map<string, PlacedPart>();
  for (const placedPart of parts) {
    for (const cell of footprintCells(placedPart)) {
      if (cellOwners.has(cell)) {
        errors.push(
          `Overlap at ${cell}: ${cellOwners.get(cell)!.part.id} vs ${placedPart.part.id}`,
        );
      }
      cellOwners.set(cell, placedPart);
    }
  }

  const owners = buildOwnersMap(parts);
  for (const door of doors) {
    if (!isDoorLegal(door, owners)) {
      errors.push(`Illegal door at ${door.cell[0]},${door.cell[1]} orient=${door.orientation}`);
    }
  }

  const doorCount = new Map<PlacedPart, number>();
  for (const door of doors) {
    const [a, b] = doorEndpoints(door);
    const sides = new Set([
      ...(owners.get(key(a)) ?? []),
      ...(owners.get(key(b)) ?? []),
    ]);
    for (const s of sides) doorCount.set(s, (doorCount.get(s) ?? 0) + 1);
  }
  for (const p of parts) {
    const cap = doorCapFor(p);
    if ((doorCount.get(p) ?? 0) > cap) {
      errors.push(
        `${p.part.id} at ${p.loc.join(",")} has ${doorCount.get(p)} doors, cap ${cap}`,
      );
    }
  }

  const crewResult = checkCrewConnectivity(parts, doors);
  if (!crewResult.ok) {
    errors.push(
      `Crew connectivity failed: ${crewResult.unreachable.length} unreachable parts`,
    );
  }

  const compResult = checkSingleComponent(parts);
  if (!compResult.ok) {
    errors.push(`Ship has ${compResult.components} disconnected components`);
  }

  const funcResult = checkFunctionalConnectivity(parts, doors);
  if (!funcResult.ok) {
    errors.push(
      `${funcResult.unreachable.length} functional parts unreachable from crew quarters`,
    );
  }

  const powerResult = checkPowerValid(parts);
  if (!powerResult.ok) {
    if (powerResult.stats.powerSurplus < 0) {
      errors.push(
        `Power deficit: ${powerResult.stats.totalPowerGen} gen vs ${powerResult.stats.totalPowerUse} use`,
      );
    }
    if (powerResult.underpowered.length > 0) {
      errors.push(`${powerResult.underpowered.length} underpowered parts`);
    }
  }

  const crewStats = computeCrewStats(parts);
  if (crewStats.crewSurplus < 0) {
    errors.push(
      `Crew deficit: ${crewStats.totalCrewAvailable} available vs ${crewStats.totalCrewRequired} required`,
    );
  }

  const directional = checkDirectionalConstraints(parts);
  for (const v of directional.violations) {
    errors.push(`Directional rule broken at ${v.cell}: ${v.reason} (offender ${v.offender})`);
  }

  return { valid: errors.length === 0, errors };
}

export function generateShip(variant: number = 0): {
  parts: PlacedPart[];
  doors: DoorSpec[];
  valid: boolean;
  errors: string[];
} {
  const { parts, doors } = buildModelSLike(variant);
  const validation = validateShip(parts, doors);
  return { parts, doors, ...validation };
}
