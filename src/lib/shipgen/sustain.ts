import type { GenPartDef } from "./parts-db";

/**
 * Sustain analysis: can this ship fire and fly continuously?
 *
 * Model, driven entirely by GenPartDef fields:
 * - Grid consumers (powerUsePerSec > 0) draw from reactor output directly.
 * - Thrusters burn their own battery (fuelUsage/sec) while at full throttle
 *   and never touch the grid. A crew member must walk power over from a
 *   reactor or power storage once the battery drops below resupplyThreshold.
 * - Weapons tagged uses_ammo consume resourcesUsed per shot from ship ammo
 *   storage, also restocked by crew.
 *
 * One crew delivers one resupplyThreshold-sized load per round trip. Trip
 * time is walk there, load, walk back. Distances are manhattan estimates;
 * callers with a placed layout pass real per-part distances.
 */

export const CREW_SPEED = 3.2;

const LOAD_SECONDS = 2;

export const DEFAULT_DISTANCE = 12;

function tripSeconds(distance: number): number {
  return (2 * distance) / CREW_SPEED + LOAD_SECONDS;
}

export function refillRate(threshold: number, tripSecondsValue: number = tripSeconds(DEFAULT_DISTANCE)): number {
  return threshold / tripSecondsValue;
}

export interface SustainOptions {
  /** Average one-way walk distance in cells when no layout exists yet. */
  distance?: number;
  /** Real one-way walk time in seconds from pathfinding over a placed layout. */
  tripSeconds?: number;
}

export interface PartCount {
  id: string;
  count: number;
}

export interface DefLookup {
  (id: string): GenPartDef | undefined;
}

export function isThruster(def: GenPartDef): boolean {
  return def.thrusterForce > 0 && def.fuelUsage > 0;
}

export function usesAmmo(def: GenPartDef): boolean {
  return def.typeCategories.includes("uses_ammo") && def.resourcesUsed > 0 && def.fireInterval > 0;
}

export interface SustainReport {
  gridGen: number;
  gridUse: number;
  gridSurplus: number;
  fuelDrainPerSec: number;
  ammoDrainPerSec: number;
  refillDemandPerSec: number;
  refillCrewNeeded: number;
  operatorCrew: number;
  crewProvided: number;
  crewRequiredTotal: number;
  crewSurplus: number;
  energyOk: boolean;
  crewOk: boolean;
  ok: boolean;
  problems: string[];
}

/** Simulated engagement length in seconds. */
export const HORIZON_SECONDS = 60;

/**
 * 60-second continuous-fire, full-throttle balance.
 * - Instantaneous: grid consumers must never exceed generator output.
 * - Over the run: refill energy comes from accumulated grid surplus plus
 *   stored charge in ship batteries (power storage parts).
 */
export function analyzeSustain(
  counts: PartCount[],
  defs: DefLookup,
  opts: SustainOptions = {},
): SustainReport {
  const walkSeconds =
    opts.tripSeconds ?? tripSeconds(opts.distance ?? DEFAULT_DISTANCE);
  let gridGen = 0;
  let gridUse = 0;
  let fuelDrain = 0;
  let ammoDrain = 0;
  let operators = 0;
  let provided = 0;
  let storedEnergy = 0;

  for (const { id, count } of counts) {
    const def = defs(id);
    if (!def) continue;
    gridGen += def.powerGenPerSec * count;
    gridUse += def.powerUsePerSec * count;
    operators += def.crew * count;
    provided += def.providesCrew * count;
    if (isThruster(def)) fuelDrain += def.fuelUsage * count;
    if (usesAmmo(def)) {
      const shotsPerSec = 1 / def.fireInterval;
      ammoDrain += def.resourcesUsed * shotsPerSec * count;
    }
    if (def.typeCategories.includes("storage")) {
      storedEnergy += def.batteryCapacity * count;
    }
  }

  const gridSurplus = gridGen - gridUse;
  const refillDemandPerSec = fuelDrain + ammoDrain;
  const demandOverRun = refillDemandPerSec * HORIZON_SECONDS;
  const supplyOverRun = Math.max(0, gridSurplus) * HORIZON_SECONDS + storedEnergy;
  const unserved = Math.max(0, demandOverRun - supplyOverRun);

  // Mixed thresholds: weight each consumer's share of demand by its own
  // threshold-derived rate. Approximate with the modal threshold of drains.
  const rates: number[] = [];
  for (const { id, count } of counts) {
    const def = defs(id);
    if (!def) continue;
    if ((isThruster(def) || usesAmmo(def)) && count > 0) {
      rates.push(refillRate(Math.max(1, def.resupplyThreshold), walkSeconds * 2 + LOAD_SECONDS));
    }
  }
  const typicalRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : Infinity;
  const refillCrewNeeded = refillDemandPerSec > 0 ? Math.ceil(refillDemandPerSec / typicalRate) : 0;
  const gridInstantOk = gridUse <= gridGen;

  const crewRequiredTotal = operators + refillCrewNeeded;
  const crewSurplus = provided - crewRequiredTotal;
  const energyOk = gridInstantOk && unserved <= 0;
  const problems: string[] = [];
  if (!gridInstantOk) {
    problems.push(
      `grid draw ${Math.round(gridUse)}/s exceeds generator output ${Math.round(gridGen)}/s`,
    );
  }
  if (unserved > 0) {
    problems.push(
      `battery and ammo refills short by ${Math.ceil(unserved)} energy over ${HORIZON_SECONDS}s`,
    );
  }
  if (crewSurplus < 0) {
    problems.push(
      `${-crewSurplus} more crew needed for refills and operation (${provided} provided)`,
    );
  }

  return {
    gridGen,
    gridUse,
    gridSurplus,
    fuelDrainPerSec: fuelDrain,
    ammoDrainPerSec: ammoDrain,
    refillDemandPerSec,
    refillCrewNeeded,
    operatorCrew: operators,
    crewProvided: provided,
    crewRequiredTotal,
    crewSurplus,
    energyOk,
    crewOk: crewSurplus >= 0,
    ok: energyOk && crewSurplus >= 0,
    problems,
  };
}

/** Seconds a battery-backed part lasts at full activity before dropping below threshold. */
export function timeToResupply(def: GenPartDef): number {
  const drain = isThruster(def)
    ? def.fuelUsage
    : usesAmmo(def)
      ? def.resourcesUsed / def.fireInterval
      : 0;
  if (drain <= 0) return Infinity;
  return Math.max(0, def.batteryCapacity - def.resupplyThreshold) / drain;
}
