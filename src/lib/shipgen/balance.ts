import type { PlacedPart } from "./model";
import { footprintCells, key, unkey } from "./model";
import { isThrusterPart } from "./constraints";

/**
 * Flight balance. The ship translates north (-y) under rear thruster thrust,
 * so net torque comes from the lateral (x) gap between the mass-weighted
 * center of mass and the force-weighted center of thrust. A gap spins the
 * ship in flight.
 *
 * The extracted parts db carries no mass field, so maxHealth stands in as
 * the mass proxy: armor (4000) out-masses corridors (1000) the same way
 * Cosmoteer masses them.
 */

export const LATERAL_TOLERANCE = 0.5;

export interface BalanceReport {
  com: { x: number; y: number };
  thrustCenter: { x: number; y: number };
  totalForce: number;
  totalMass: number;
  lateralOffset: number;
  balanced: boolean;
}

export function computeBalance(parts: PlacedPart[]): BalanceReport {
  let mass = 0;
  let mx = 0;
  let my = 0;
  for (const p of parts) {
    const cells = [...footprintCells(p)].map(unkey);
    const perCell = p.part.maxHealth / cells.length;
    for (const [x, y] of cells) {
      mass += perCell;
      mx += perCell * x;
      my += perCell * y;
    }
  }
  const com = mass > 0 ? { x: mx / mass, y: my / mass } : { x: 0, y: 0 };

  let force = 0;
  let fx = 0;
  let fy = 0;
  for (const p of parts) {
    if (!isThrusterPart(p)) continue;
    const cells = [...footprintCells(p)].map(unkey);
    const perCell = p.part.thrusterForce / cells.length;
    for (const [x, y] of cells) {
      force += perCell;
      fx += perCell * x;
      fy += perCell * y;
    }
  }
  const thrustCenter = force > 0 ? { x: fx / force, y: fy / force } : { x: 0, y: 0 };
  const lateralOffset = thrustCenter.x - com.x;
  return {
    com,
    thrustCenter,
    totalForce: force,
    totalMass: mass,
    lateralOffset,
    balanced: Math.abs(lateralOffset) <= LATERAL_TOLERANCE,
  };
}

/**
 * Shift thrusters laterally toward the center of mass. All thrusters push
 * the same direction, so a uniform shift of the whole bank moves the center
 * of thrust by that amount. Parts that cannot legally move stay put.
 */
export function rebalanceThrusters(
  parts: PlacedPart[],
  canPlace: (id: string, x: number, y: number, skip: PlacedPart) => boolean,
): { parts: PlacedPart[]; moved: number } {
  const thrusters = parts.filter(isThrusterPart);
  if (thrusters.length === 0) return { parts, moved: 0 };
  let moved = 0;
  for (let pass = 0; pass < 8; pass++) {
    const report = computeBalance(parts);
    if (report.balanced) break;
    let dx = Math.round(-report.lateralOffset);
    if (dx === 0) dx = -Math.sign(report.lateralOffset);
    const skip = new Set(thrusters);
    let passMoved = 0;
    for (const t of thrusters) {
      const nx = t.loc[0] + dx;
      if (canPlace(t.part.id, nx, t.loc[1], t)) {
        t.loc = [nx, t.loc[1]];
        passMoved++;
      }
    }
    if (passMoved === 0) break;
    moved += passMoved;
  }
  return { parts, moved };
}
