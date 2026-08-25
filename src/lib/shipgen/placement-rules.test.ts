import { describe, expect, it } from "vitest";

import { genPartsById, generatorRotsFor } from "./parts-db";
import type { PlacedPart, Rotation } from "./model";
import {
  footprintCells,
  key,
  localToWorldOffset,
  wedgePlacementLegal,
  wedgeShapeOf,
} from "./model";
import { exhaustDepthFor, reservedCellsFor } from "./constraints";

function placed(id: string, loc: [number, number], rot: Rotation = 0): PlacedPart {
  return { part: genPartsById[id], loc, rot };
}

function cellsOf(...ps: PlacedPart[]): Set<string> {
  const s = new Set<string>();
  for (const p of ps) for (const c of footprintCells(p)) s.add(c);
  return s;
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

describe("wedge armor attachment (rules-file geometry)", () => {
  it("knows the slope and flat faces of every wedge type", () => {
    expect(wedgeShapeOf("cosmoteer.armor_wedge")).toEqual({
      slope: [[0, -1], [-1, 0]],
      flat: [[1, 0], [0, 1]],
    });
    // Bottom edge only: both upper sides are slope.
    expect(wedgeShapeOf("cosmoteer.armor_tri")?.flat).toEqual([[0, 1]]);
    expect(wedgeShapeOf("cosmoteer.armor_1x3_wedge")?.slope).toEqual([
      [0, -1],
      [-1, 0],
      [-1, 1],
      [-1, 2],
    ]);
    expect(wedgeShapeOf("cosmoteer.armor")).toBeNull();
  });

  it("never maps a face offset into the part's own footprint", () => {
    for (const id of Object.keys(genPartsById)) {
      const shape = wedgeShapeOf(id);
      if (!shape) continue;
      for (const rot of [0, 1, 2, 3] as Rotation[]) {
        const p = placed(id, [5, 7], rot);
        const own = footprintCells(p);
        for (const face of [...shape.slope, ...shape.flat]) {
          expect(own.has(key(localToWorldOffset(p, face))), `${id} rot ${rot} ${face}`).toBe(false);
        }
      }
    }
  });

  it("attaches wedges by their flat edges with slopes facing open space", () => {
    const hull = placed("cosmoteer.armor", [0, 0]);

    // Wedge above the hull piece: flat bottom edge bonds, slope faces up/left.
    expect(wedgePlacementLegal(placed("cosmoteer.armor_wedge", [0, -1]), cellsOf(hull))).toBe(true);

    // Slope cell occupied by another part reads as detached - reject.
    expect(
      wedgePlacementLegal(
        placed("cosmoteer.armor_wedge", [0, -1]),
        cellsOf(hull, placed("cosmoteer.armor", [-1, -1])),
      ),
    ).toBe(false);

    // Touching only diagonally: no flat bond - reject.
    expect(wedgePlacementLegal(placed("cosmoteer.armor_wedge", [1, -1]), cellsOf(hull))).toBe(false);

    // Flat parts are never subject to the rule.
    expect(wedgePlacementLegal(placed("cosmoteer.armor", [1, 0]), cellsOf(hull))).toBe(true);
  });

  it("keeps rotated wedges honest via the shared door-frame transform", () => {
    // armor_1x2_wedge rot 1: its open (slope) side must land on one world
    // side and its bottom flat on the opposite side of the rotated box.
    const w = placed("cosmoteer.armor_1x2_wedge", [3, 4], 1);
    const own = footprintCells(w); // 2x1 box at (3,4)-(4,4)
    const a = localToWorldOffset(w, [-1, 0]);
    const b = localToWorldOffset(w, [0, 2]);
    expect(own.has(key(a))).toBe(false);
    expect(own.has(key(b))).toBe(false);
    expect(a[1]).not.toBe(b[1]);
  });
});
