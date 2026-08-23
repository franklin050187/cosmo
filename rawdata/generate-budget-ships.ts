import path from "path";
import fs from "fs";
import { buildPartList } from "../src/lib/shipgen/partlist";
import { buildShipFromPartList } from "../src/lib/shipgen/shuffle";
import { autoDoors, pruneDoors, validateShip } from "../src/lib/shipgen/generator";
import { calculatePrice } from "../src/lib/price";
import { loadJsonTemplate, buildShipTree, jsonReplacer } from "./generate-ships";

/**
 * Budget-first ship generator with a full ship template.
 *
 * The game ship file needs many header/footer keys beyond Parts/Doors (Version,
 * ShipRulesID, Roles, RoofBaseColor, BuildMirrorAxis, PartUIToggleStates, ...).
 * We load the reference template (a real game-parsed ship in the game's native
 * JSON text format, scripts/qa-fixtures/valid-ship.json) and only override the
 * Parts and Doors keys — everything else carries over verbatim. Part-instance
 * reference fields are cleared to "Unset" because they point at the template
 * ship's parts, which do not exist in the generated ship.
 */
export function generateBudgetShips(
  budgets: number[] = [90000],
  variants: number[] = [0, 1, 2, 3, 4],
  outDir: string = path.join(process.cwd(), "output", "ships", "json"),
): void {
  const template = loadJsonTemplate();
  fs.mkdirSync(outDir, { recursive: true });
  let written = 0;
  for (const budget of budgets) {
    for (const variant of variants) {
      const list = buildPartList({ budget, variant });
      const { parts, skipped } = buildShipFromPartList({ list, variant });
      const doors = pruneDoors(parts, autoDoors(parts));
      const validation = validateShip(parts, doors);

      const tree = buildShipTree(template, parts, doors) as Record<string, unknown>;
      tree.Name = `Budget ${budget} Variant ${variant}`;
      const price = calculatePrice(tree as any);

      // Clear part-instance reference fields: they reference the template
      // ship's parts (by ID + Location + Rotation), which do not exist in the
      // generated ship. "Unset" is the game's canonical "no value" marker.
      const unsetRefFields = [
        "CrewSourceRoles",
        "CrewSourceTargets",
        "PartUIToggleStates",
        "PartControlGroups",
        "PartUIColorValues",
        "ResourceConsumptionToggles",
        "ResourceSupplierTargets",
        "ResourceSupplyToggles",
        "WeaponDirectControlBindings",
        "WeaponSelfTargets",
        "WeaponShipRelativeTargets",
        "Decals1",
        "Decals2",
        "Decals3",
      ];
      for (const key of unsetRefFields) {
        tree[key] = "Unset";
      }

      const name = `budget-${budget}-v${variant}`;
      const filePath = path.join(outDir, `${name}.json`);
      fs.writeFileSync(filePath, JSON.stringify(tree, jsonReplacer, 2));
      written++;

      const armor = parts.filter((p) => p.part.typeCategories.includes("armor")).length;
      console.log(
        `${name}: price=${price.price} parts=${parts.length} (armor=${armor}) ` +
          `doors=${doors.length} crew=${price.crew} valid=${validation.valid} ` +
          `skipped=${skipped.length} -> ${filePath}`,
      );
      if (!validation.valid) {
        console.log(`  errors: ${validation.errors.join("; ")}`);
      }
    }
  }
  console.log(`\nWrote ${written} ship JSON files to ${outDir}`);
}

if (process.argv[1] && process.argv[1].endsWith("generate-budget-ships.ts")) {
  const budgetArg = process.argv[2];
  const budgets = budgetArg ? budgetArg.split(",").map(Number) : [90000];
  generateBudgetShips(budgets);
}
