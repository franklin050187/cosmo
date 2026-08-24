import { describe, it, expect } from "vitest";
import {
  buildPartList,
  expandList,
  typePrice,
} from "./partlist";
import { buildShipFromPartList } from "./shuffle";
import { autoDoors, pruneDoors, validateShip } from "./generator";
import { buildOwnersMap } from "./connectivity";
import { footprintCells, doorEndpoints, key } from "./model";
import type { PlacedPart } from "./model";
import { calculatePrice } from "@/lib/price";

function countPart(parts: PlacedPart[], id: string): number {
  return parts.filter((p) => p.part.id === id).length;
}

function countCells(parts: PlacedPart[]): number {
  const seen = new Set<string>();
  for (const p of parts) {
    for (const c of footprintCells(p)) seen.add(c);
  }
  return seen.size;
}

function partCost(parts: PlacedPart[]): number {
  return parts.reduce((s, p) => s + typePrice(p.part.id), 0);
}

interface ShipTree {
  Name: string;
  Parts: { FlipX: boolean; ID: string; Location: [number, number]; Rotation: number }[];
  Doors: { Cell: [number, number]; ID: string; Orientation: number }[];
}

describe("budget-first part list", () => {
  it("builds a part list within the target budget split", () => {
    for (const budget of [90000, 75000]) {
      for (let variant = 0; variant < 3; variant++) {
        const result = buildPartList({ budget, variant });
        const b = result.budget;
        const total = b.functionalSpent + b.armorSpent + b.hullSpent;
        expect(result.withinBudget, `budget ${budget} v${variant}`).toBe(true);
        expect(total).toBeLessThanOrEqual(budget * 1.05);
        // Functional ~80%, armor ~15%, hull ~5% with slack.
        expect(b.functionalSpent).toBeLessThanOrEqual(b.functional * 1.05);
        expect(b.armorSpent).toBeLessThanOrEqual(b.armor * 1.05);
        expect(b.hullSpent).toBeLessThanOrEqual(b.hull * 1.05);
      }
    }
  });

  it("reports a small budget as outside budget when the mandatory set cannot fit", () => {
    // 60k cannot fit the mandatory set (reactor+control+quarters+2 lasers+4
    // thrusters+2 airlocks+power+fire ≈ 57.7k) under the 80% functional cap.
    const result = buildPartList({ budget: 60000 });
    expect(result.withinBudget).toBe(false);
    // Mandatory parts are still all present; the list is honest about cost.
    const ids = expandList(result.entries);
    const count = (id: string) => ids.filter((x) => x === id).length;
    expect(count("cosmoteer.reactor_small")).toBeGreaterThanOrEqual(1);
    expect(count("cosmoteer.laser_blaster_small")).toBeGreaterThanOrEqual(2);
  });

  it("always includes the mandatory standard set", () => {
    for (const budget of [60000, 75000, 90000]) {
      const result = buildPartList({ budget });
      const ids = expandList(result.entries);
      const count = (id: string) => ids.filter((x) => x === id).length;
      expect(count("cosmoteer.reactor_small"), "reactor").toBeGreaterThanOrEqual(1);
      expect(count("cosmoteer.control_room_small"), "control room").toBeGreaterThanOrEqual(1);
      expect(count("cosmoteer.crew_quarters_med"), "crew quarters").toBeGreaterThanOrEqual(1);
      expect(count("cosmoteer.laser_blaster_small"), "lasers").toBeGreaterThanOrEqual(2);
      expect(
        count("cosmoteer.thruster_small") +
          count("cosmoteer.thruster_med") +
          count("cosmoteer.thruster_large") +
          count("cosmoteer.thruster_small_2way"),
        "thrusters",
      ).toBeGreaterThanOrEqual(4);
      expect(count("cosmoteer.airlock"), "airlocks").toBeGreaterThanOrEqual(2);
      expect(count("cosmoteer.fire_extinguisher"), "fire extinguisher").toBeGreaterThanOrEqual(1);
      expect(count("cosmoteer.power_storage"), "power storage").toBeGreaterThanOrEqual(1);
    }
  });
});

describe("shuffle pipeline", () => {
  it("places every part into a valid ship within budget", () => {
    for (const budget of [90000, 75000]) {
      for (let variant = 0; variant < 5; variant++) {
        const list = buildPartList({ budget, variant });
        const { parts, skipped } = buildShipFromPartList({ list, variant });
        const doors = pruneDoors(parts, autoDoors(parts));

        // Every planned instance is placed; nothing skipped.
        expect(skipped, `budget ${budget} v${variant} skipped`).toEqual([]);

        // No overlap.
        expect(countCells(parts), `budget ${budget} v${variant} overlap`).toBe(
          parts.reduce((s, p) => s + footprintCells(p).size, 0),
        );

        // Mandatory set survives placement.
        expect(
          countPart(parts, "cosmoteer.reactor_small"),
          `budget ${budget} v${variant} reactor`,
        ).toBeGreaterThanOrEqual(1);
        expect(
          countPart(parts, "cosmoteer.laser_blaster_small"),
          `budget ${budget} v${variant} lasers`,
        ).toBeGreaterThanOrEqual(2);

        // Full game validation passes.
        const validation = validateShip(parts, doors);
        expect(validation.valid, `budget ${budget} v${variant}: ${validation.errors.join("; ")}`).toBe(
          true,
        );

        // Total price (parts + doors) stays at or near the budget.
        const tree: ShipTree = {
          Name: "test",
          Parts: parts.map((p) => ({
            FlipX: false,
            ID: p.part.id,
            Location: p.loc,
            Rotation: p.rot,
          })),
          Doors: doors.map((d) => ({
            Cell: d.cell,
            ID: "cosmoteer.door",
            Orientation: d.orientation,
          })),
        };
        const price = calculatePrice(tree);
        expect(price.price, `budget ${budget} v${variant} price`).toBeLessThanOrEqual(
          budget * 1.05,
        );
      }
    }
  }, 60000);

  it("places no doors touching armor (armor attaches physically)", () => {
    const list = buildPartList({ budget: 90000, variant: 0 });
    const { parts } = buildShipFromPartList({ list, variant: 0 });
    const doors = pruneDoors(parts, autoDoors(parts));
    const owners = buildOwnersMap(parts);
    for (const d of doors) {
      const [a, b] = doorEndpoints(d);
      const all = [...(owners.get(key(a)) ?? []), ...(owners.get(key(b)) ?? [])];
      expect(
        all.some((p) => p.part.typeCategories.includes("armor")),
        `door at ${d.cell} touches armor`,
      ).toBe(false);
    }
  });

  it("respects the 15/5/80 budget split in the final ship", () => {
    const list = buildPartList({ budget: 90000, variant: 0 });
    const { parts } = buildShipFromPartList({ list, variant: 0 });
    const doors = pruneDoors(parts, autoDoors(parts));
    const armor = parts.filter((p) => p.part.typeCategories.includes("armor"));
    const functional = parts.filter(
      (p) => !p.part.typeCategories.includes("armor") && p.part.id !== "cosmoteer.corridor",
    );
    const corridors = parts.filter((p) => p.part.id === "cosmoteer.corridor");
    const armor$ = partCost(armor);
    const func$ = partCost(functional);
    const hull$ = partCost(corridors) + doors.length * 100;
    const total = func$ + armor$ + hull$;
    expect(func$ / total).toBeGreaterThan(0.7);
    expect(armor$ / total).toBeGreaterThan(0.1);
    expect(hull$ / total).toBeLessThan(0.1);
  });
});
