import { describe, expect, it } from "vitest";

import { genPartsById, generatorRotsFor } from "./parts-db";
import type { PlacedPart } from "./model";
import { exhaustDepthFor, reservedCellsFor } from "./constraints";

function placed(id: string, loc: [number, number], rot: 0 | 1 | 2 | 3 = 0): PlacedPart {
  return { part: genPartsById[id], loc, rot };
}

describe("game-authoritative placement data (part rules files)", () => {
  it("matches AllowedDoorLocations for parts with hard-coded spots", () => {
    // Values read from the game's <part>.rules files.
    expect(genPartsById["cosmoteer.control_room_small"].allowedDoors).toEqual([
      [-1, 1],
      [2, 1],
      [0, 2],
      [1, 2],
    ]);
    expect(genPartsById["cosmoteer.crew_quarters_large"].allowedDoors).toEqual([
      [1, -1],
      [1, 4],
    ]);
    expect(genPartsById["cosmoteer.fire_extinguisher"].allowedDoors).toEqual([[0, 1]]);
    expect(genPartsById["cosmoteer.shield_gen_small"].allowedDoors).toEqual([
      [-1, 2],
      [2, 2],
      [0, 3],
      [1, 3],
    ]);
    // No ADL key in rules = accepts doors anywhere; empty list = never.
    expect(genPartsById["cosmoteer.corridor"].allowedDoors).toBeNull();
    expect(genPartsById["cosmoteer.armor"].allowedDoors).toEqual([]);
    expect(genPartsById["cosmoteer.structure"].allowedDoors).toEqual([]);
  });

  it("carries ProhibitAbove barrel clearance for weapons", () => {
    expect(genPartsById["cosmoteer.laser_blaster_small"].prohibit?.[2]).toBe(1);
    expect(genPartsById["cosmoteer.laser_blaster_large"].prohibit?.[2]).toBe(2);
    expect(genPartsById["cosmoteer.cannon_large"].prohibit?.[2]).toBe(2);
  });

  it("carries ProhibitBelow exhaust depth for thrusters", () => {
    expect(genPartsById["cosmoteer.thruster_small"].prohibit?.[3]).toBe(3);
    expect(genPartsById["cosmoteer.thruster_med"].prohibit?.[3]).toBe(5);
    expect(genPartsById["cosmoteer.thruster_large"].prohibit?.[3]).toBe(7);
    expect(genPartsById["cosmoteer.thruster_huge"].prohibit?.[3]).toBe(10);
    expect(genPartsById["cosmoteer.thruster_boost"].prohibit?.[3]).toBe(18);
  });

  it("marks rotateable exactly the non-directional gameplay parts", () => {
    // Quarters/control/shield/storage rotate freely (seen rotated in a
    // round-tripped ship); weapons and thrusters are game-rotateable but
    // pinned at rot 0 by generator policy.
    for (const id of [
      "cosmoteer.laser_blaster_small",
      "cosmoteer.thruster_med",
    ]) {
      expect(generatorRotsFor(id)).toEqual([0]);
    }
    for (const id of [
      "cosmoteer.crew_quarters_small",
      "cosmoteer.control_room_small",
      // No directional gameplay and no no-build zone: rotates freely.
      "cosmoteer.fire_extinguisher",
    ]) {
      expect(generatorRotsFor(id)).toEqual([0, 1, 2, 3]);
    }
    // Corridor, reactors, and storage are IsRotateable=false in the rules files.
    expect(genPartsById["cosmoteer.corridor"].isRotateable).toBe(false);
    expect(genPartsById["cosmoteer.reactor_small"].isRotateable).toBe(false);
    expect(generatorRotsFor("cosmoteer.storage_2x2")).toEqual([0]);
  });
});

describe("per-part exhaust depth", () => {
  it("scales reserved cells with ProhibitBelow", () => {
    const small = exhaustDepthFor(placed("cosmoteer.thruster_small", [0, 0], 0));
    const large = exhaustDepthFor(placed("cosmoteer.thruster_huge", [0, 0], 0));
    expect(small).toBe(3);
    expect(large).toBe(10);
  });

  it("reserves deeper exhaust columns behind larger thrusters", () => {
    const p = placed("cosmoteer.thruster_huge", [0, 0], 0);
    const cells = reservedCellsFor(p).map((c) => c.split(","));
    const ys = cells.map(([, y]) => Number(y));
    expect(Math.max(...ys)).toBe(12);
  });
});
