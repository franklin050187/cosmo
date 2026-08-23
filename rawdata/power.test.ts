import { describe, it, expect } from "vitest";
import {
  computePowerStats,
  checkPartPower,
  checkPowerValid,
  computeCrewStats,
} from "../../src/lib/shipgen/power";
import type { PlacedPart } from "../../src/lib/shipgen/model";
import { genPartsById } from "../../src/lib/shipgen/parts-db";

const reactor = genPartsById["cosmoteer.reactor_small"];
const controlRoom = genPartsById["cosmoteer.control_room_small"];
const thruster = genPartsById["cosmoteer.thruster_small"];
const armor = genPartsById["cosmoteer.armor_wedge"];
const quarters = genPartsById["cosmoteer.crew_quarters_med"];

function pp(id: string, loc: [number, number] = [0, 0]): PlacedPart {
  return { part: genPartsById[id], loc, rot: 0 };
}

describe("power", () => {
  it("reactor generates power", () => {
    const parts: PlacedPart[] = [pp("cosmoteer.reactor_small")];
    const stats = computePowerStats(parts);
    expect(stats.totalPowerGen).toBeGreaterThan(0);
    expect(stats.powerSurplus).toBeGreaterThan(0);
  });

  it("armor has zero power", () => {
    const parts: PlacedPart[] = [pp("cosmoteer.armor_wedge")];
    const stats = computePowerStats(parts);
    expect(stats.totalPowerGen).toBe(0);
    expect(stats.totalPowerUse).toBe(0);
    expect(stats.totalBattery).toBe(0);
  });

  it("reactor + thruster is balanced", () => {
    const parts: PlacedPart[] = [
      pp("cosmoteer.reactor_small", [0, 0]),
      pp("cosmoteer.thruster_small", [2, 0]),
    ];
    const result = checkPowerValid(parts);
    expect(result.ok).toBe(true);
    expect(result.stats.powerSurplus).toBeGreaterThanOrEqual(0);
  });

  it("part power check passes for thruster", () => {
    const parts: PlacedPart[] = [
      pp("cosmoteer.thruster_small"),
      pp("cosmoteer.reactor_small", [2, 0]),
    ];
    const result = checkPartPower(parts);
    expect(result.ok).toBe(true);
  });

  it("crew stats for quarters + control room", () => {
    const parts: PlacedPart[] = [
      pp("cosmoteer.crew_quarters_med", [0, 0]),
      pp("cosmoteer.control_room_small", [2, 0]),
    ];
    const stats = computeCrewStats(parts);
    expect(stats.totalCrewAvailable).toBeGreaterThan(0);
    expect(stats.totalCrewRequired).toBeGreaterThan(0);
  });

  it("crew surplus is available - required", () => {
    const parts: PlacedPart[] = [pp("cosmoteer.crew_quarters_med")];
    const stats = computeCrewStats(parts);
    expect(stats.crewSurplus).toBe(stats.totalCrewAvailable - stats.totalCrewRequired);
  });
});
