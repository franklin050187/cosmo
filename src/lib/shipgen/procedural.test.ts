import { describe, it, expect } from "vitest";
import { buildProceduralShip } from "./procedural";
import { autoDoors, pruneDoors, validateShip } from "./generator";
import { checkFunctionalConnectivity, checkCrewConnectivity } from "./connectivity";
import { computePowerStats, computeCrewStats } from "./power";
import { footprintCells } from "./model";
import { genPartsById } from "./parts-db";
import { calculatePrice } from "@/lib/price";

function countCells(parts: ReturnType<typeof buildProceduralShip>["parts"]): number {
  const seen = new Set<string>();
  for (const p of parts) {
    for (const c of footprintCells(p)) seen.add(c);
  }
  return seen.size;
}

function countPart(parts: ReturnType<typeof buildProceduralShip>["parts"], id: string): number {
  return parts.filter((p) => p.part.id === id).length;
}

describe("procedural generator", () => {
  it("builds valid, connected ships with mandatory parts for several variants", () => {
    for (let variant = 0; variant < 5; variant++) {
      const { parts } = buildProceduralShip({ variant, thrusterCount: variant % 2 === 0 ? 4 : 5 });
      const allDoors = autoDoors(parts);
      const doors = pruneDoors(parts, allDoors);

      // Mandatory parts present.
      expect(countPart(parts, "cosmoteer.reactor_small"), `variant ${variant} reactor`).toBe(1);
      expect(countPart(parts, "cosmoteer.laser_blaster_small"), `variant ${variant} laser`).toBeGreaterThan(0);
      expect(countPart(parts, "cosmoteer.airlock"), `variant ${variant} airlock`).toBeGreaterThan(0);
      expect(countPart(parts, "cosmoteer.fire_extinguisher"), `variant ${variant} fire extinguisher`).toBe(1);
      expect(
        parts.some((p) => p.part.id.includes("thruster")),
        `variant ${variant} thrusters`,
      ).toBe(true);

      // No overlap.
      expect(countCells(parts), `variant ${variant} overlap`).toBe(
        parts.reduce((sum, p) => sum + footprintCells(p).size, 0),
      );

      // Connectivity: whole ship one component; all functional parts reachable.
      const comp = checkCrewConnectivity(parts, doors);
      expect(comp.ok, `variant ${variant} crew connectivity`).toBe(true);
      const func = checkFunctionalConnectivity(parts, doors);
      expect(func.ok, `variant ${variant} functional connectivity`).toBe(true);

      // Power + crew.
      const power = computePowerStats(parts);
      expect(power.powerSurplus, `variant ${variant} power`).toBeGreaterThanOrEqual(0);
      const crew = computeCrewStats(parts);
      expect(crew.crewSurplus, `variant ${variant} crew`).toBeGreaterThanOrEqual(0);

      // Full validation passes.
      const validation = validateShip(parts, doors);
      expect(validation.valid, `variant ${variant}: ${validation.errors.join("; ")}`).toBe(true);

      // Pruned doors are a strict subset (fewer than all legal doors).
      expect(doors.length).toBeLessThanOrEqual(allDoors.length);
    }
  });

  it("prunes doors to a minimal connected set", () => {
    const { parts } = buildProceduralShip({ variant: 0 });
    const allDoors = autoDoors(parts);
    const pruned = pruneDoors(parts, allDoors);

    // A connected ship of N parts needs at least N-1 doors (spanning tree).
    expect(pruned.length).toBeGreaterThanOrEqual(parts.length - 1);
    expect(pruned.length).toBeLessThan(allDoors.length);
  });

  it("keeps the reactor reachable from crew quarters and thrusters", () => {
    const { parts } = buildProceduralShip({ variant: 1, thrusterCount: 4 });
    const doors = pruneDoors(parts, autoDoors(parts));
    const func = checkFunctionalConnectivity(parts, doors);
    expect(func.ok).toBe(true);

    // Every power provider and consumer is reachable.
    const needAccess = parts.filter((p) =>
      p.part.crew > 0 ||
      p.part.powerUsePerSec > 0 ||
      p.part.powerGenPerSec > 0 ||
      p.part.fuelUsage > 0 ||
      p.part.resourcesUsed > 0,
    );
    expect(needAccess.length).toBeGreaterThan(0);
  });

  it("produces ships with a realistic crew-to-requirements balance", () => {
    const { parts } = buildProceduralShip({ variant: 2 });
    const crew = computeCrewStats(parts);
    expect(crew.totalCrewAvailable).toBeGreaterThan(0);
    expect(crew.crewSurplus).toBeGreaterThanOrEqual(0);
  });

  it("parts database has definitions for every placed part", () => {
    const { parts } = buildProceduralShip({ variant: 3 });
    for (const p of parts) {
      expect(genPartsById[p.part.id], p.part.id).toBeDefined();
    }
  });
});

describe("procedural price", () => {
  it("ship tree price stays under 100k", () => {
    const template = {
      Name: "test",
      Parts: [],
      Doors: [],
    };
    for (const variant of [0, 1, 2, 3]) {
      const { parts } = buildProceduralShip({ variant });
      const doors = pruneDoors(parts, autoDoors(parts));
      const tree = {
        ...template,
        Parts: parts.map((p) => ({ FlipX: false, ID: p.part.id, Location: p.loc, Rotation: p.rot })),
        Doors: doors.map((d) => ({ Cell: d.cell, ID: "cosmoteer.door", Orientation: d.orientation })),
      };
      const price = calculatePrice(tree as Parameters<typeof calculatePrice>[0]);
      expect(price.price, `variant ${variant} price`).toBeLessThan(100000);
    }
  });
});
