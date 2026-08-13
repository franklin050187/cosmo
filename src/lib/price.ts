import { partsResources, computePartCost, resourceCost } from "./part-data";
import { partTagMap, missileTagMap } from "./tag-data";

const CREW_QUARTERS: Record<string, { price: number; crew: number }> = {
  "cosmoteer.crew_quarters_small": { price: 1000, crew: 2 },
  "cosmoteer.crew_quarters_med": { price: 3000, crew: 6 },
  "cosmoteer.crew_quarters_large": { price: 12000, crew: 24 },
};

function getPartCostCache(): Map<string, number> {
  const cache = new Map<string, number>();
  for (const part of partsResources) {
    cache.set(part.ID, computePartCost(part));
  }
  return cache;
}

function lookupResourcePrice(resourceId: string): number {
  const res = resourceCost.find((r) => r.ID === resourceId);
  return res ? res.BuyPrice * res.MaxStackSize : 0;
}

interface PartUIToggleState {
  Key: unknown[];
  Value: unknown;
}

interface ShipData {
  Parts?: Array<{ ID: string }>;
  Doors?: Array<{ ID: string }>;
  PartUIToggleStates?: PartUIToggleState[];
  NewFlexResourceGridTypes?: Array<{ Value?: string }>;
  Author?: string;
}

function getMissileTypes(data: ShipData): number[] {
  const missileTypes: number[] = [];
  for (const entry of data.PartUIToggleStates ?? []) {
    const key = entry.Key;
    if (
      Array.isArray(key) &&
      key.length === 2 &&
      typeof key[0] === "object" &&
      key[0] !== null &&
      (key[0] as { ID?: string }).ID === "cosmoteer.missile_launcher" &&
      key[1] === "missile_type"
    ) {
      missileTypes.push(entry.Value as number);
    }
  }
  return missileTypes;
}

export interface PriceResult {
  price: number;
  crew: number;
}

export function calculatePrice(data: ShipData): PriceResult {
  const partCostCache = getPartCostCache();
  const parts = data.Parts ?? [];
  const doors = data.Doors ?? [];

  let price = 0;
  let crew = 0;

  for (const item of parts) {
    price += partCostCache.get(item.ID) ?? 0;
  }

  for (const mt of getMissileTypes(data)) {
    const id = missileTagMap[mt];
    if (id) price += partCostCache.get(id) ?? 0;
  }

  for (const door of doors) {
    price += partCostCache.get(door.ID) ?? 0;
  }

  for (const item of parts) {
    const cq = CREW_QUARTERS[item.ID];
    if (cq) {
      price += cq.price;
      crew += cq.crew;
    }
  }

  for (const item of data.NewFlexResourceGridTypes ?? []) {
    if (item.Value) price += lookupResourcePrice(item.Value);
  }

  return { price, crew };
}

export interface TagResult {
  author: string;
  tags: string[];
}

export function extractTags(data: ShipData): TagResult {
  const author = data.Author ?? "unknown";
  const parts = data.Parts ?? [];
  const tags = new Set<string>();

  for (const item of parts) {
    const tag = partTagMap[item.ID];
    if (tag) tags.add(tag);
  }

  for (const mt of getMissileTypes(data)) {
    const tag = missileTagMap[mt];
    if (tag) tags.add(tag);
  }

  return { author, tags: [...tags] };
}

export interface PriceResponse extends PriceResult, TagResult {}

export function calculateShipPrice(data: ShipData): PriceResponse {
  return { ...calculatePrice(data), ...extractTags(data) };
}
