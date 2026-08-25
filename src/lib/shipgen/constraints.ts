import type { PlacedPart } from "./model";
import { key, unkey, footprintCells } from "./model";

/**
 * Directional placement rules. North is -y.
 *
 * - Weapons fire north: nothing may occupy the column north of a weapon,
 *   all the way past the hull edge. Weapons are the front of the ship.
 * - Thrusters exhaust south: nothing may occupy the cells south of a
 *   thruster's exhaust edge. Thrusters may stack behind each other.
 */

export const WEAPON_ARC_DEPTH = 64;
export const THRUSTER_EXHAUST_DEPTH = 3;

export function isWeapon(p: PlacedPart): boolean {
  return p.part.typeCategories.includes("weapon");
}

export function isThrusterPart(p: PlacedPart): boolean {
  return p.part.thrusterForce > 0 && p.part.fuelUsage > 0;
}

function worldCells(p: PlacedPart): [number, number][] {
  return [...footprintCells(p)].map(unkey);
}

function extremeRowCells(p: PlacedPart, side: "min" | "max"): [number, number][] {
  const cells = worldCells(p);
  const bound = Math.min(...cells.map((c) => c[1]));
  const boundMax = Math.max(...cells.map((c) => c[1]));
  return cells.filter(([, y]) => (side === "min" ? y === bound : y === boundMax));
}

/** Cells this part reserves so the layout respects arcs and exhausts. */
export function reservedCellsFor(p: PlacedPart): string[] {
  const reserved: string[] = [];
  if (isWeapon(p)) {
    for (const [x, y] of extremeRowCells(p, "min")) {
      for (let d = 1; d <= WEAPON_ARC_DEPTH; d++) reserved.push(key([x, y - d]));
    }
  }
  if (isThrusterPart(p)) {
    for (const [x, y] of extremeRowCells(p, "max")) {
      for (let d = 1; d <= THRUSTER_EXHAUST_DEPTH; d++) reserved.push(key([x, y + d]));
    }
  }
  return reserved;
}

export interface ConstraintViolation {
  cell: string;
  reason: string;
  offender: string;
}

/** Check every weapon arc and thruster exhaust against the final layout. */
export function checkDirectionalConstraints(
  parts: PlacedPart[],
): { ok: boolean; violations: ConstraintViolation[] } {
  const violations: ConstraintViolation[] = [];
  const occupants = new Map<string, PlacedPart>();
  for (const p of parts) {
    for (const c of worldCells(p)) {
      occupants.set(key(c), p);
    }
  }
  for (const p of parts) {
    for (const cellKey of reservedCellsFor(p)) {
      const blocker = occupants.get(cellKey);
      if (blocker && blocker !== p) {
        if (isThrusterPart(p) && isThrusterPart(blocker)) continue;
        const reason = isWeapon(p)
          ? `fires north through ${cellKey}`
          : `exhausts south through ${cellKey}`;
        violations.push({ cell: cellKey, reason, offender: blocker.part.id });
      }
    }
  }
  return { ok: violations.length === 0, violations };
}
