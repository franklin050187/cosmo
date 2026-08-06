export interface TagOption {
  value: string;
  label: string;
}

export interface TagCategory {
  id: string;
  label: string;
  type: "radio" | "checkbox";
  options: TagOption[];
}

export const TAG_CATEGORIES: TagCategory[] = [
  {
    id: "thrust",
    label: "Thrust Arrangement",
    type: "radio",
    options: [
      { value: "bidirectional_thrust", label: "Bidirectional" },
      { value: "mono_thrust", label: "Mono-Thrust" },
      { value: "multi_thrust", label: "Multi-Thrust" },
      { value: "omni_thrust", label: "Omni-Thrust" },
      { value: "no_thrust", label: "No Thrust" },
    ],
  },
  {
    id: "type",
    label: "Ship Type",
    type: "checkbox",
    options: [
      { value: "kiter", label: "Kiter" },
      { value: "diagonal", label: "Diagonal" },
      { value: "avoider", label: "Avoider" },
      { value: "painted", label: "Painted" },
      { value: "splitter", label: "Splitter" },
      { value: "rammer", label: "Rammer" },
      { value: "orbiter", label: "Orbiter" },
      { value: "scout/racer", label: "Scout/Racer" },
      { value: "broadsider", label: "Broadsider" },
      { value: "waste_ship", label: "Waste Ship" },
      { value: "sundiver", label: "Sundiver" },
      { value: "cargo_ship", label: "Cargo Ship" },
      { value: "spinner", label: "Spinner" },
      { value: "module", label: "Module" },
      { value: "scarlet-mod", label: "Scarlet Mod" },
    ],
  },
  {
    id: "defense",
    label: "Defenses",
    type: "radio",
    options: [
      { value: "armor_defenses", label: "Armor" },
      { value: "mixed_defenses", label: "Mixed" },
      { value: "shield_defenses", label: "Shield" },
      { value: "no_defenses", label: "No Defenses" },
    ],
  },
  {
    id: "mode",
    label: "Game Mode",
    type: "checkbox",
    options: [
      { value: "campaign_ship", label: "Campaign" },
      { value: "elimination_ship", label: "Elimination" },
      { value: "domination_ship", label: "Domination" },
      { value: "debugging_tool", label: "Debugging Tool" },
    ],
  },
];

export const ALL_USER_TAG_VALUES = new Set(
  TAG_CATEGORIES.flatMap((c) => c.options.map((o) => o.value))
);

export function extractUserTags(allTags: string[]): {
  userTags: string[];
  autoTags: string[];
} {
  const userTags: string[] = [];
  const autoTags: string[] = [];
  for (const tag of allTags) {
    if (ALL_USER_TAG_VALUES.has(tag)) {
      userTags.push(tag);
    } else {
      autoTags.push(tag);
    }
  }
  return { userTags, autoTags };
}
