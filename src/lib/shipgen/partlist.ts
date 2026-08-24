import { calculatePrice } from "@/lib/price";
import { genPartsById } from "./parts-db";
import { analyzeSustain } from "./sustain";

/**
 * Budget-first part list builder. Splits the budget into functional / armor /
 * hull buckets (80/15/5), buys a mandatory core, then fills each bucket
 * greedily under its cap.
 */

export interface PartListEntry {
  id: string;
  count: number;
}

export interface BudgetSplit {
  functionalSpent: number;
  armorSpent: number;
  hullSpent: number;
  functional: number;
  armor: number;
  hull: number;
}

export interface PartListResult {
  entries: PartListEntry[];
  budget: BudgetSplit;
  withinBudget: boolean;
}

const BUCKET_SLACK = 1.05;

const priceCache = new Map<string, number>();

/** Price of one part, matching src/lib/price.ts part accounting. */
export function typePrice(id: string): number {
  const cached = priceCache.get(id);
  if (cached !== undefined) return cached;
  const price = calculatePrice({ Parts: [{ ID: id }] }).price;
  priceCache.set(id, price);
  return price;
}

export function expandList(entries: PartListEntry[]): string[] {
  const ids: string[] = [];
  for (const e of entries) {
    for (let i = 0; i < e.count; i++) ids.push(e.id);
  }
  return ids;
}

interface CoreSpec {
  id: string;
  count: number;
}

function mandatoryCore(): CoreSpec[] {
  return [
    { id: "cosmoteer.reactor_small", count: 1 },
    { id: "cosmoteer.control_room_small", count: 1 },
    { id: "cosmoteer.crew_quarters_med", count: 1 },
    { id: "cosmoteer.laser_blaster_small", count: 2 },
    { id: "cosmoteer.thruster_small", count: 4 },
    { id: "cosmoteer.airlock", count: 2 },
    { id: "cosmoteer.fire_extinguisher", count: 1 },
    { id: "cosmoteer.power_storage", count: 1 },
  ];
}

const THRUSTER_IDS = [
  "cosmoteer.thruster_large",
  "cosmoteer.thruster_med",
  "cosmoteer.thruster_small",
  "cosmoteer.thruster_small_2way",
];

const ARMOR_FILLER: string[][] = [
  ["cosmoteer.armor_2x1", "cosmoteer.armor_wedge", "cosmoteer.armor_tri"],
  ["cosmoteer.armor_wedge", "cosmoteer.armor_tri", "cosmoteer.armor_2x1"],
];

function countOf(entries: PartListEntry[], id: string): number {
  return entries.find((e) => e.id === id)?.count ?? 0;
}

function addEntry(entries: PartListEntry[], id: string, n = 1): void {
  const e = entries.find((x) => x.id === id);
  if (e) e.count += n;
  else entries.push({ id, count: n });
}

export function buildPartList({
  budget,
  variant = 0,
}: {
  budget: number;
  variant?: number;
}): PartListResult {
  const caps = {
    functional: budget * 0.8,
    armor: budget * 0.15,
    hull: budget * 0.05,
  };
  const entries: PartListEntry[] = [];
  let funcSpent = 0;
  let coreSpent = 0;
  let armorSpent = 0;
  let hullSpent = 0;

  for (const { id, count } of mandatoryCore()) {
    addEntry(entries, id, count);
    funcSpent += typePrice(id) * count;
    coreSpent += typePrice(id) * count;
  }

  const fitsCap = (id: string) => funcSpent + typePrice(id) <= caps.functional * BUCKET_SLACK;
  const addPart = (id: string) => {
    addEntry(entries, id);
    funcSpent += typePrice(id);
  };
  const removePart = (id: string) => {
    const e = entries.find((x) => x.id === id);
    if (!e) return;
    e.count--;
    funcSpent -= typePrice(id);
    if (e.count <= 0) entries.splice(entries.indexOf(e), 1);
  };
  const counts = () =>
    entries.map((e) => ({ id: e.id, count: e.count }));
  const sustainOk = () => analyzeSustain(counts(), (id) => genPartsById[id]).ok;

  // Every candidate must leave the ship sustainable at full throttle and
  // continuous fire. A weapon or thruster that breaks the crew or energy
  // balance pulls in its fix (reactor for energy, quarters for crew); if the
  // fix does not fit the bucket, the candidate is rejected.
  const REACTOR_TIERS_BY_PRICE = ["cosmoteer.reactor_small", "cosmoteer.reactor_med"];
  const QUARTERS_TIERS_BY_PRICE = [
    "cosmoteer.crew_quarters_med",
    "cosmoteer.crew_quarters_large",
  ];
  const buyFixes = (): boolean => {
    for (let guard = 0; guard < 20; guard++) {
      if (sustainOk()) return true;
      const report = analyzeSustain(counts(), (id) => genPartsById[id]);
      let fixed = false;
      if (!report.energyOk) {
        const tier = REACTOR_TIERS_BY_PRICE.find(fitsCap);
        if (tier) {
          addPart(tier);
          fixed = true;
        }
      } else if (!report.crewOk) {
        const tier = QUARTERS_TIERS_BY_PRICE.find(fitsCap);
        if (tier) {
          addPart(tier);
          fixed = true;
        }
      }
      if (!fixed) return false;
    }
    return false;
  };

  // Pass A claims the grid and crew for weapons. Pass B fills what remains
  // with defense, thrust, and buffers under the same sustain rule.
  const weaponPass = ["cosmoteer.laser_blaster_small"];
  const supportOrder = [
    "cosmoteer.shield_gen_small",
    "cosmoteer.thruster_med",
    "cosmoteer.power_storage",
  ];
  const rotatedSupport = supportOrder
    .slice(variant % supportOrder.length)
    .concat(supportOrder.slice(0, variant % supportOrder.length));

  const tryFill = (ids: string[], maxStorage: number): number => {
    let stalled = 0;
    let guard = 0;
    while (stalled < ids.length && guard < 60) {
      guard++;
      for (const id of ids) {
        if (id === "cosmoteer.power_storage" && countOf(entries, id) >= maxStorage) {
          stalled++;
          continue;
        }
        if (!fitsCap(id)) {
          stalled++;
          continue;
        }
        addPart(id);
        if (buyFixes()) {
          stalled = 0;
        } else {
          removePart(id);
          stalled++;
        }
      }
    }
    return stalled;
  };

  tryFill(weaponPass, 2);
  tryFill(rotatedSupport, 2);

  const armorOrder = ARMOR_FILLER[variant % ARMOR_FILLER.length];
  let armorIdx = 0;
  while (armorOrder.length > 0) {
    const id = armorOrder[armorIdx % armorOrder.length];
    if (armorSpent + typePrice(id) > caps.armor * BUCKET_SLACK) break;
    addEntry(entries, id);
    armorSpent += typePrice(id);
    armorIdx++;
    if (armorIdx > 500) break;
  }

  // Corridors: enough to give the arranger interior attach points without
  // blowing the hull share once door costs (about one door per part) land.
  const corridorTarget = Math.min(24, Math.max(10, Math.round(budget / 7500)));
  const corridorPrice = typePrice("cosmoteer.corridor");
  let corridors = 0;
  while (
    corridors < corridorTarget &&
    hullSpent + corridorPrice <= caps.hull * BUCKET_SLACK
  ) {
    addEntry(entries, "cosmoteer.corridor");
    hullSpent += corridorPrice;
    corridors++;
  }

  // The slack tolerance is for filler. A mandatory core that already busts
  // its bucket means the budget cannot honestly fit a standard ship.
  const withinBudget =
    coreSpent <= caps.functional &&
    funcSpent <= caps.functional * BUCKET_SLACK &&
    armorSpent <= caps.armor * BUCKET_SLACK &&
    hullSpent <= caps.hull * BUCKET_SLACK &&
    funcSpent + armorSpent + hullSpent <= budget * BUCKET_SLACK &&
    THRUSTER_IDS.reduce((s, t) => s + countOf(entries, t), 0) >= 4;

  return {
    entries,
    budget: {
      functionalSpent: funcSpent,
      armorSpent: armorSpent,
      hullSpent: hullSpent,
      functional: caps.functional,
      armor: caps.armor,
      hull: caps.hull,
    },
    withinBudget,
  };
}
