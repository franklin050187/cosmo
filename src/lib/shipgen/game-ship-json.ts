import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Builds ship JSON in the game's full native schema.
 *
 * The game rejects ships that only carry Parts/Doors/Name: a loadable file
 * needs the complete key set (Version, ShipRulesID, Roles, RoofBase*,
 * CrewSourceRoles, PartUIToggleStates, ...). The template is a real
 * game-exported ship (scripts/qa-fixtures/valid-ship-template.json) whose
 * non-layout keys are kept verbatim; only layout-derived keys are replaced.
 *
 * Tooling-only module: nothing in the app imports it.
 */

export const TEMPLATE_PATH = "scripts/qa-fixtures/valid-ship-template.json";

export interface GameShipPart {
  ID: string;
  Location: readonly [number, number];
  Rotation: number;
  FlipX?: boolean;
}

export interface GameShipDoor {
  Cell: readonly [number, number];
  Orientation: number;
}

export interface GameShipLayout {
  Name?: string;
  Author?: string;
  Parts: readonly GameShipPart[];
  Doors: readonly GameShipDoor[];
}

/** Bitmask of the template's "Redshirt" role (ID -2147483648). */
const CREW_ROLE_MASK = 2147483648;

function partRef(part: GameShipPart): Record<string, unknown> {
  return {
    FlipX: part.FlipX ?? false,
    ID: part.ID,
    Location: [part.Location[0], part.Location[1]],
    Rotation: part.Rotation,
  };
}

/**
 * Per-part UI toggle entries, mirroring what the game writes for these
 * part types in a real export: control rooms and airlocks are on,
 * fire extinguishers have thermal overclock off.
 */
function uiTogglesFor(part: GameShipPart): { Key: [Record<string, unknown>, string]; Value: number }[] {
  if (part.ID.includes("control_room")) {
    return [{ Key: [partRef(part), "on_off"], Value: 1 }];
  }
  if (part.ID.includes("airlock")) {
    return [{ Key: [partRef(part), "on_off"], Value: 1 }];
  }
  if (part.ID.includes("fire_extinguisher")) {
    return [{ Key: [partRef(part), "thermal_overclock"], Value: 0 }];
  }
  return [];
}

export function isGameShipTree(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "Parts" in value &&
    Array.isArray((value as { Parts: unknown }).Parts)
  );
}

/**
 * Loads the game-exported template. Returns the raw tree; colors stay as
 * {"parts": [...]} objects exactly like on disk.
 */
export function loadGameShipTemplate(templatePath = TEMPLATE_PATH): Record<string, unknown> {
  const raw = readFileSync(path.resolve(process.cwd(), templatePath), "utf8");
  const tree: unknown = JSON.parse(raw);
  if (!isGameShipTree(tree)) {
    throw new Error(`ship template at ${templatePath} has no Parts array`);
  }
  return tree;
}

export function buildGameShipJson(
  layout: GameShipLayout,
  template: Record<string, unknown> = loadGameShipTemplate(),
): Record<string, unknown> {
  const tree: Record<string, unknown> = structuredClone(template);

  tree.Parts = layout.Parts.map((p) => partRef(p));
  tree.Doors = layout.Doors.map((d) => ({
    Cell: [d.Cell[0], d.Cell[1]],
    ID: "cosmoteer.door",
    Orientation: d.Orientation,
  }));

  tree.CrewSourceRoles = layout.Parts
    .filter((p) => p.ID.includes("crew_quarters"))
    .map((p) => ({ Key: partRef(p), Value: CREW_ROLE_MASK }));

  tree.PartUIToggleStates = layout.Parts.flatMap(uiTogglesFor);

  tree.Name = layout.Name ?? tree.Name;
  tree.Author = layout.Author ?? "autogenerate";

  return tree;
}
