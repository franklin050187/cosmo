import { partsResources, lookupResourcePrice, lookupResourceStackSize } from "./price-data";

interface DecodedShip {
  Parts: {
    ID: string;
    Location: [number, number];
    Rotation: number;
    FlipX?: number;
  }[];
  Doors?: { ID: string }[];
  FlightDirection: number;
  PartUIToggleStates?: Array<{
    Key: [{ ID: string; Location: [number, number] }, string];
    Value: number;
  }>;
  NewFlexResourceGridTypes?: Array<{ Value: string }>;
  [key: string]: unknown;
}

const catWeapons = new Set([
  "cosmoteer.cannon_deck", "cosmoteer.cannon_large", "cosmoteer.cannon_med",
  "cosmoteer.disruptor", "cosmoteer.flak_cannon_large", "cosmoteer.ion_beam_emitter",
  "cosmoteer.ion_beam_prism", "cosmoteer.laser_blaster_large", "cosmoteer.laser_blaster_small",
  "cosmoteer.mining_laser_small", "cosmoteer.missile_launcher", "cosmoteer.point_defense",
  "cosmoteer.railgun_accelerator", "cosmoteer.railgun_launcher", "cosmoteer.railgun_loader",
  "he_missiles", "nukes", "mines", "emp_missiles",
  "cosmoteer.chaingun", "cosmoteer.chaingun_magazine", "cosmoteer.resonance_beam_turret",
]);

const catArmor = new Set([
  "cosmoteer.armor", "cosmoteer.armor_1x2_wedge", "cosmoteer.armor_1x3_wedge",
  "cosmoteer.armor_2x1", "cosmoteer.armor_structure_hybrid_1x1",
  "cosmoteer.armor_structure_hybrid_1x2", "cosmoteer.armor_structure_hybrid_1x3",
  "cosmoteer.armor_structure_hybrid_tri", "cosmoteer.armor_tri", "cosmoteer.armor_wedge",
  "cosmoteer.structure", "cosmoteer.structure_1x2_wedge", "cosmoteer.structure_1x3_wedge",
  "cosmoteer.structure_tri", "cosmoteer.structure_wedge",
]);

const catCrew = new Set([
  "cosmoteer.crew_quarters_med", "cosmoteer.crew_quarters_small",
]);

const catMovement = new Set([
  "cosmoteer.engine_room", "cosmoteer.thruster_boost", "cosmoteer.thruster_huge",
  "cosmoteer.thruster_large", "cosmoteer.thruster_med", "cosmoteer.thruster_small",
  "cosmoteer.thruster_small_2way", "cosmoteer.thruster_small_3way",
]);

const catPower = new Set([
  "cosmoteer.power_storage", "cosmoteer.reactor_large", "cosmoteer.reactor_med",
  "cosmoteer.reactor_small",
]);

const catShield = new Set([
  "cosmoteer.shield_gen_large", "cosmoteer.shield_gen_small",
]);

const catStorage = new Set([
  "cosmoteer.storage_2x2", "cosmoteer.storage_3x2", "cosmoteer.storage_3x3",
  "cosmoteer.storage_4x3", "cosmoteer.storage_4x4",
]);

const missileMapping: Record<number, string> = {
  0: "he_missiles",
  1: "emp_missiles",
  2: "nukes",
  3: "mines",
  4: "thermal_missiles",
};

const partsResourcesMap = new Map(partsResources.map((p) => [p.ID, p.Resources]));

function priceOfPart(itemId: string): number {
  const resources = partsResourcesMap.get(itemId);
  if (!resources) return 0;
  let price = 0;
  for (const [resId, qty] of resources) {
    price += lookupResourcePrice(resId) * parseInt(qty, 10);
  }
  return price;
}

function categorize(itemId: string): string {
  if (catWeapons.has(itemId)) return "Weapon";
  if (catArmor.has(itemId)) return "Armor";
  if (catCrew.has(itemId)) return "Crew";
  if (catMovement.has(itemId)) return "Thrust";
  if (catPower.has(itemId)) return "Power";
  if (catShield.has(itemId)) return "Shield";
  if (catStorage.has(itemId)) return "Storage";
  return "Misc";
}

export interface PriceBreakdown {
  total: number;
  categories: Record<string, { price: number; percent: number }>;
}

export function priceAnalysis(data: DecodedShip): PriceBreakdown {
  const prices: Record<string, number> = {
    Weapon: 0, Armor: 0, Crew: 0, Thrust: 0,
    Power: 0, Shield: 0, Storage: 0, Misc: 0,
  };

  const parts = data.Parts ?? [];

  for (const item of parts) {
    const itemPrice = priceOfPart(item.ID);
    if (itemPrice > 0) {
      prices[categorize(item.ID)] += itemPrice;
    }
  }

  const missileTypes: number[] = [];
  for (const entry of data.PartUIToggleStates ?? []) {
    const key = entry.Key;
    if (
      key?.length === 2 &&
      typeof key[0] === "object" &&
      (key[0] as { ID?: string }).ID === "cosmoteer.missile_launcher" &&
      key[1] === "missile_type"
    ) {
      missileTypes.push(entry.Value);
    }
  }

  for (const mt of missileTypes) {
    const missileId = missileMapping[mt];
    if (missileId) {
      prices.Weapon += priceOfPart(missileId);
    }
  }

  let doorPrice = 0;
  for (const door of data.Doors ?? []) {
    doorPrice += priceOfPart(door.ID);
  }
  prices.Misc += doorPrice;

  let crewQuartersPrice = 0;
  for (const item of parts) {
    if (item.ID === "cosmoteer.crew_quarters_small") crewQuartersPrice += 1000;
    else if (item.ID === "cosmoteer.crew_quarters_med") crewQuartersPrice += 3000;
    else if (item.ID === "cosmoteer.crew_quarters_large") crewQuartersPrice += 12000;
  }
  prices.Crew += crewQuartersPrice;

  let storagePrice = 0;
  for (const item of data.NewFlexResourceGridTypes ?? []) {
    if (item.Value) {
      const resPrice = lookupResourcePrice(item.Value);
      const maxStack = lookupResourceStackSize(item.Value);
      storagePrice += resPrice * maxStack;
    }
  }
  prices.Storage += storagePrice;

  const total = Object.values(prices).reduce((a, b) => a + b, 0);

  const categories: Record<string, { price: number; percent: number }> = {};
  for (const [cat, price] of Object.entries(prices)) {
    categories[cat] = {
      price,
      percent: total > 0 ? price / total : 0,
    };
  }

  return { total, categories };
}
