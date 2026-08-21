export const DISPLAY_TAGS = [
  "cannon", "deck_cannon", "emp_missiles", "flak_battery",
  "he_missiles", "large_cannon", "mines", "nukes", "railgun", "factories",
  "disruptors", "heavy_laser", "ion_beam", "ion_prism", "laser", "mining_laser",
  "point_defense", "kiter", "avoider", "rammer", "orbiter", "campaign_ship",
  "elimination_ship", "domination_ship", "diagonal", "splitter", "chaingun",
  "scout/racer", "broadsider", "waste_ship", "debugging_tool", "sundiver",
  "cargo_ship", "spinner",
];

export function formatPrice(price: number): string {
  if (price >= 1_000_000) return `${(price / 1_000_000).toFixed(1)}M`;
  if (price >= 1_000) return `${(price / 1_000).toFixed(1)}K`;
  return price.toString();
}
