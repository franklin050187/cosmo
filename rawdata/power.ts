import type { PlacedPart } from "./model";

/**
 * Aggregate power statistics from placed parts.
 * - totalPowerGen: sum of powerGenPerSec across all parts
 * - totalPowerUse: sum of powerUsePerSec across all parts
 * - totalBattery: sum of batteryCapacity across all parts
 * - powerSurplus: totalPowerGen - totalPowerUse (must be >= 0)
 */
export function computePowerStats(parts: PlacedPart[]): {
  totalPowerGen: number;
  totalPowerUse: number;
  totalBattery: number;
  powerSurplus: number;
} {
  let totalPowerGen = 0;
  let totalPowerUse = 0;
  let totalBattery = 0;
  for (const p of parts) {
    totalPowerGen += p.part.powerGenPerSec;
    totalPowerUse += p.part.powerUsePerSec;
    totalBattery += p.part.batteryCapacity;
  }
  return {
    totalPowerGen,
    totalPowerUse,
    totalBattery,
    powerSurplus: totalPowerGen - totalPowerUse,
  };
}

/**
 * Check that every part with powerUsePerSec > 0 has enough battery capacity
 * to survive until resupply. A part is OK if:
 * - batteryCapacity >= resupplyThreshold, OR
 * - powerUsePerSec === 0 (doesn't consume power)
 * Returns { ok, underpowered } listing parts that fail the check.
 */
export function checkPartPower(
  parts: PlacedPart[],
): { ok: boolean; underpowered: number[] } {
  const underpowered: number[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].part;
    if (p.powerUsePerSec > 0 && p.batteryCapacity < p.resupplyThreshold) {
      underpowered.push(i);
    }
  }
  return { ok: underpowered.length === 0, underpowered };
}

/**
 * Full power validation: ship has positive power surplus and all parts are
 * individually powered.
 */
export function checkPowerValid(parts: PlacedPart[]): {
  ok: boolean;
  stats: ReturnType<typeof computePowerStats>;
  underpowered: number[];
} {
  const stats = computePowerStats(parts);
  const partCheck = checkPartPower(parts);
  return {
    ok: stats.powerSurplus >= 0 && partCheck.ok,
    stats,
    underpowered: partCheck.underpowered,
  };
}

/**
 * Aggregate crew statistics.
 * - totalCrewAvailable: sum of providesCrew
 * - totalCrewRequired: sum of crew for parts that need it
 * - crewSurplus: available - required
 */
export function computeCrewStats(parts: PlacedPart[]): {
  totalCrewAvailable: number;
  totalCrewRequired: number;
  crewSurplus: number;
} {
  let totalCrewAvailable = 0;
  let totalCrewRequired = 0;
  for (const p of parts) {
    totalCrewAvailable += p.part.providesCrew;
    totalCrewRequired += p.part.crew;
  }
  return {
    totalCrewAvailable,
    totalCrewRequired,
    crewSurplus: totalCrewAvailable - totalCrewRequired,
  };
}
