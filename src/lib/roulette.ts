import { type ShipRow } from "./db";

/**
 * Ship Roulette — rarity + weighted "loot box" draw.
 *
 * Rarity is derived from popularity (downloads + fav) within a collection, so
 * the most-downloaded ships drop as the rarest tier, CS:GO-lootbox style.
 * A draw first picks a rarity by drop weight (rares are genuinely rare), then
 * a random ship within that tier.
 */

export type Rarity = "legendary" | "epic" | "rare" | "uncommon" | "common";

export const RARITY_ORDER: Rarity[] = ["legendary", "epic", "rare", "uncommon", "common"];

export interface RarityMeta {
  key: Rarity;
  label: string;
  /** relative drop likelihood — higher = more common */
  weight: number;
  /** tailwind border ring color */
  ring: string;
  /** text color class */
  text: string;
  /** banner gradient classes */
  banner: string;
  /** box-shadow glow (inline style, safe value) */
  glow: string;
  /** css color used for the circular aura / confetti */
  aura: string;
}

export const RARITY_META: Record<Rarity, RarityMeta> = {
  legendary: {
    key: "legendary",
    label: "LEGENDARY",
    weight: 2,
    ring: "border-amber-400",
    text: "text-amber-300",
    banner: "from-amber-500/40 via-yellow-400/10 to-amber-600/40",
    glow: "0 0 45px 8px rgba(251,191,36,0.55), 0 0 110px 24px rgba(251,191,36,0.18)",
    aura: "#ffd700",
  },
  epic: {
    key: "epic",
    label: "EPIC",
    weight: 7,
    ring: "border-fuchsia-500",
    text: "text-fuchsia-300",
    banner: "from-fuchsia-500/35 via-purple-500/10 to-fuchsia-600/35",
    glow: "0 0 34px 5px rgba(217,70,239,0.5)",
    aura: "#d946ef",
  },
  rare: {
    key: "rare",
    label: "RARE",
    weight: 16,
    ring: "border-blue-500",
    text: "text-blue-300",
    banner: "from-blue-600/35 via-blue-500/10 to-blue-700/35",
    glow: "0 0 26px 4px rgba(59,130,246,0.5)",
    aura: "#3b82f6",
  },
  uncommon: {
    key: "uncommon",
    label: "UNCOMMON",
    weight: 26,
    ring: "border-emerald-500",
    text: "text-emerald-300",
    banner: "from-emerald-600/35 via-emerald-500/10 to-emerald-700/35",
    glow: "0 0 20px 3px rgba(16,185,129,0.45)",
    aura: "#10b981",
  },
  common: {
    key: "common",
    label: "COMMON",
    weight: 46,
    ring: "border-slate-500",
    text: "text-slate-300",
    banner: "from-slate-600/30 to-slate-700/30",
    glow: "0 0 12px 2px rgba(148,163,184,0.3)",
    aura: "#94a3b8",
  },
};

/** 0-based rank within the popularity-sorted collection. */
export function rarityForRank(rank: number, total: number): Rarity {
  if (rank <= 0) return "legendary";
  const p = rank / Math.max(1, total);
  if (p < 0.06) return "legendary";
  if (p < 0.16) return "epic";
  if (p < 0.35) return "rare";
  if (p < 0.62) return "uncommon";
  return "common";
}

/** Just the fields popularity ranking needs (full ShipRow and the slimmer
 * game-detail ship projections both satisfy this). */
export interface PopularityLike {
  id: number;
  downloads?: number | null;
  fav?: number | null;
}

export function popularityOf(ship: PopularityLike): number {
  return (ship.downloads ?? 0) * 3 + (ship.fav ?? 0);
}

/** Popularity-sorted copy of a ship list (ties broken by id) — shared by the
 * roulette picker and every rarity display so ranks can never drift apart. */
export function sortShipsByPopularity<T extends PopularityLike>(ships: T[]): T[] {
  return [...ships].sort(
    (a, b) => popularityOf(b) - popularityOf(a) || a.id - b.id,
  );
}

export interface DrawResult {
  ship: ShipRow;
  rarity: RarityMeta;
}

/** Pick a weighted-rarity random ship. Returns null if the collection is empty. */
export function drawShip(ships: ShipRow[]): DrawResult | null {
  if (!ships || ships.length === 0) return null;

  const sorted = sortShipsByPopularity(ships);

  const buckets = new Map<Rarity, ShipRow[]>();
  sorted.forEach((ship, rank) => {
    const r = rarityForRank(rank, sorted.length);
    const list = buckets.get(r);
    if (list) list.push(ship);
    else buckets.set(r, [ship]);
  });

  // Weigh tiers that actually contain ships, so nothing is ever "impossible".
  const tiers = RARITY_ORDER.filter((r) => (buckets.get(r)?.length ?? 0) > 0);
  let totalW = 0;
  for (const r of tiers) totalW += RARITY_META[r].weight;

  let rnd = Math.random() * totalW;
  let chosen = tiers[0];
  for (const r of tiers) {
    rnd -= RARITY_META[r].weight;
    if (rnd < 0) {
      chosen = r;
      break;
    }
  }

  const inTier = buckets.get(chosen)!;
  const ship = inTier[Math.floor(Math.random() * inTier.length)];
  return { ship, rarity: RARITY_META[chosen] };
}