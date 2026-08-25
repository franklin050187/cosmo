import { describe, expect, it } from "vitest";
import { genPartsById } from "./parts-db";
import {
  allowedDoorOutsideCells,
  doorEndpoints,
  footprintCells,
  footprintBounds,
  isDoorAllowedForPart,
  isDoorLegal,
  key,
  rotCcw,
  rotCw,
  type DoorSpec,
  type PlacedPart,
} from "./model";

function placed(id: string, loc: [number, number], rot: 0 | 1 | 2 | 3 = 0): PlacedPart {
  return { part: genPartsById[id], loc, rot };
}

function cells(pp: PlacedPart): string[] {
  return [...footprintCells(pp)]
    .map((c) => c.split(",").map(Number))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .map(([x, y]) => `${x},${y}`);
}

function norm(v: [number, number]): [number, number] {
  return v.map((n) => (Object.is(n, -0) ? 0 : n)) as [number, number];
}

function ownersOf(pp: PlacedPart): Map<string, PlacedPart[]> {
  const m = new Map<string, PlacedPart[]>();
  for (const c of footprintCells(pp)) m.set(c, [pp]);
  return m;
}

function hasKey(set: Set<string>, ...coords: [number, number][]): void {
  for (const c of coords) expect(set.has(key(c))).toBe(true);
}

describe("rotCw / rotCcw", () => {
  it("are inverse rotations", () => {
    for (const r of [0, 1, 2, 3] as const) {
      for (const v of [
        [0, 0],
        [1, 0],
        [2, -3],
      ] as [number, number][]) {
        expect(rotCcw(rotCw(v, r), r)).toEqual(v);
      }
    }
  });
  it("rotates cardinal directions ccw", () => {
    expect(norm(rotCcw([1, 0], 1))).toEqual([0, 1]);
    expect(norm(rotCcw([1, 0], 2))).toEqual([-1, 0]);
    expect(norm(rotCcw([1, 0], 3))).toEqual([0, -1]);
  });
});

describe("footprintCells (Location = collision box min corner)", () => {
  it("railgun_launcher rect [0,1,2,3] collides on a 2x3 box", () => {
    expect(cells(placed("cosmoteer.railgun_launcher", [0, 0]))).toEqual([
      "0,0", "0,1", "0,2", "1,0", "1,1", "1,2",
    ]);
  });

  it("disruptor rect [0,1,1,3] collides on a 1x3 box", () => {
    expect(cells(placed("cosmoteer.disruptor", [0, 0]))).toEqual(["0,0", "0,1", "0,2"]);
  });

  it("chaingun_magazine rect [0,0,1,2] (full box)", () => {
    expect(cells(placed("cosmoteer.chaingun_magazine", [0, 0]))).toEqual(["0,0", "0,1"]);
  });

  it("odd rotations swap the box dims", () => {
    expect(cells(placed("cosmoteer.disruptor", [0, 0], 1))).toEqual(["0,0", "1,0", "2,0"]);
    const set = footprintCells(placed("cosmoteer.railgun_launcher", [0, 0], 1));
    hasKey(set, [0,0],[1,0],[2,0],[0,1],[1,1],[2,1]);
    expect(set.size).toBe(6);
  });

  it("offsets by Location", () => {
    expect(cells(placed("cosmoteer.disruptor", [5, -3]))).toEqual([
      "5,-3", "5,-2", "5,-1",
    ]);
  });

  it("footprintBounds matches footprintCells extents", () => {
    const pp = placed("cosmoteer.railgun_launcher", [3, 1], 2);
    const b = footprintBounds(pp);
    const set = footprintCells(pp);
    for (const c of set) {
      const [x, y] = c.split(",").map(Number);
      expect(x).toBeGreaterThanOrEqual(b.minX);
      expect(x).toBeLessThanOrEqual(b.maxX);
      expect(y).toBeGreaterThanOrEqual(b.minY);
      expect(y).toBeLessThanOrEqual(b.maxY);
    }
  });
});

describe("doorEndpoints", () => {
  it("orientation 0 spans (x,y)-(x,y-1)", () => {
    expect(doorEndpoints({ cell: [3, 4], orientation: 0 })).toEqual([
      [3, 4],
      [3, 3],
    ]);
  });
  it("orientation 1 spans (x,y)-(x-1,y)", () => {
    expect(doorEndpoints({ cell: [3, 4], orientation: 1 })).toEqual([
      [3, 4],
      [2, 4],
    ]);
  });
});

describe("isDoorAllowedForPart (ADL in sprite frame, Location anchors collision box)", () => {
  it("disruptor (rect y0=1) accepts a side door on its bottom collision cell", () => {
    const pp = placed("cosmoteer.disruptor", [0, 0]);
    const door: DoorSpec = { cell: [0, 2], orientation: 1 }; // (0,2)<->(-1,2)
    const r = isDoorAllowedForPart(pp, door);
    expect(r.valid).toBe(true);
    expect(r.localOffset).toEqual([-1, 3]);
  });

  it("disruptor rejects a side door on its middle collision cell", () => {
    const pp = placed("cosmoteer.disruptor", [0, 0]);
    const door: DoorSpec = { cell: [0, 1], orientation: 1 }; // (0,1)<->(-1,1)
    expect(isDoorAllowedForPart(pp, door).valid).toBe(false);
  });

  it("disruptor accepts a door below the collision box", () => {
    const pp = placed("cosmoteer.disruptor", [0, 0]);
    const door: DoorSpec = { cell: [0, 3], orientation: 0 }; // (0,3)<->(0,2)
    expect(isDoorAllowedForPart(pp, door).valid).toBe(true);
  });

  it("chaingun_magazine (rect y0=0) accepts top + side doors", () => {
    const pp = placed("cosmoteer.chaingun_magazine", [0, 0]);
    expect(isDoorAllowedForPart(pp, { cell: [0, 2], orientation: 0 }).valid).toBe(true); // (0,2)<->(0,1)
    expect(isDoorAllowedForPart(pp, { cell: [0, 1], orientation: 1 }).valid).toBe(true); // (0,1)<->(-1,1)
    expect(isDoorAllowedForPart(pp, { cell: [0, 0], orientation: 0 }).valid).toBe(false); // (0,0)<->(0,-1)
  });

  it("null allowedDoors auto-passes (corridor)", () => {
    const pp = placed("cosmoteer.corridor", [0, 0]);
    expect(isDoorAllowedForPart(pp, { cell: [0, 0], orientation: 0 }).valid).toBe(true);
  });

  it("empty allowedDoors never passes (armor)", () => {
    const pp = placed("cosmoteer.armor", [0, 0]);
    expect(isDoorAllowedForPart(pp, { cell: [0, 0], orientation: 0 }).valid).toBe(false);
  });

  it("returns invalid when the door does not touch an owned cell", () => {
    const pp = placed("cosmoteer.disruptor", [0, 0]);
    expect(isDoorAllowedForPart(pp, { cell: [10, 10], orientation: 1 }).valid).toBe(false);
  });
});

describe("isDoorLegal (full rule)", () => {
  it("a door with no owners is OK (noOwner policy)", () => {
    expect(isDoorLegal({ cell: [5, 5], orientation: 0 }, new Map())).toBe(true);
  });

  it("internal doors (one part owns both cells) are OK", () => {
    const pp = placed("cosmoteer.chaingun_magazine", [0, 0]);
    const owners = ownersOf(pp);
    // (0,1)<->(0,0) both owned by the magazine; door is internal
    expect(isDoorLegal({ cell: [0, 1], orientation: 0 }, owners)).toBe(true);
  });

  it("same-part-ID doors still need ADL acceptance on both sides", () => {
    const a = placed("cosmoteer.disruptor", [0, 0]);
    const b = placed("cosmoteer.disruptor", [1, 0]);
    const owners = new Map<string, PlacedPart[]>();
    for (const c of footprintCells(a)) owners.set(c, [a]);
    for (const c of footprintCells(b)) owners.set(c, [b]);
    // door (0,1)<->(1,1): middle-cell side slots are not in the ADL
    expect(isDoorLegal({ cell: [1, 1], orientation: 1 }, owners)).toBe(false);
    // door (0,2)<->(1,2): bottom-cell side slots are, on both sides
    expect(isDoorLegal({ cell: [1, 2], orientation: 1 }, owners)).toBe(true);
  });

  it("one side suffices: weapon + null-ADL corridor", () => {
    const wp = placed("cosmoteer.disruptor", [0, 0]);
    const co = placed("cosmoteer.corridor", [1, 0]);
    const owners = new Map<string, PlacedPart[]>();
    for (const c of footprintCells(wp)) owners.set(c, [wp]);
    for (const c of footprintCells(co)) owners.set(c, [co]);
    // (0,2)<->(1,2): disruptor side rejects, corridor auto-passes
    expect(isDoorLegal({ cell: [1, 2], orientation: 1 }, owners)).toBe(true);
  });

  it("both restrictive sides must match; rejects when neither does", () => {
    const wp = placed("cosmoteer.disruptor", [0, 0]);
    const arTop = placed("cosmoteer.armor", [1, 2]);
    const arBottom = placed("cosmoteer.armor", [1, 0]);
    const owners = new Map<string, PlacedPart[]>();
    for (const c of footprintCells(wp)) owners.set(c, [wp]);
    for (const c of footprintCells(arTop)) owners.set(c, [arTop]);
    for (const c of footprintCells(arBottom)) owners.set(c, [arBottom]);
    // (0,2)<->(1,2): disruptor rejects (sizeTL [1,1] not in ADL), armor rejects ([])
    expect(isDoorLegal({ cell: [1, 2], orientation: 1 }, owners)).toBe(false);
    // (0,0)<->(1,0): disruptor accepts (sizeTL [1,3] in ADL), but armor ([]) forbids
    // all doors — reference ships never place doors touching armor
    expect(isDoorLegal({ cell: [1, 0], orientation: 1 }, owners)).toBe(false);
  });
});

describe("allowedDoorOutsideCells", () => {
  it("returns null for unrestricted parts", () => {
    expect(allowedDoorOutsideCells(placed("cosmoteer.corridor", [0, 0]))).toBeNull();
  });

  it("disruptor converts ADL through the sprite frame", () => {
    const set = allowedDoorOutsideCells(placed("cosmoteer.disruptor", [0, 0]));
    expect(set).toEqual([
      [-1, 2],
      [1, 2],
      [0, 3],
    ]);
  });

  it("chaingun_magazine uses the locUp frame directly", () => {
    const set = allowedDoorOutsideCells(placed("cosmoteer.chaingun_magazine", [0, 0]));
    expect(set).toEqual([
      [0, 2],
      [-1, 1],
      [1, 1],
    ]);
  });

  it("rotates ADL positions with the part", () => {
    const set = allowedDoorOutsideCells(placed("cosmoteer.chaingun_magazine", [0, 0], 1));
    // ADL -> collision-local -> rotCcw -> + min-corner shift (h-1, 0) for rot 1
    const expected: [number, number][] = [
      [0, 2],
      [-1, 1],
      [1, 1],
    ].map((u) => {
      const [ox, oy] = rotCcw(u as [number, number], 1);
      return [ox + 1, oy] as [number, number];
    });
    expect(set).toEqual(expected);
  });

  it("every returned position pairs with an owned cell via isDoorLegal", () => {
    const pp = placed("cosmoteer.disruptor", [3, 2]);
    const owners = ownersOf(pp);
    const outside = allowedDoorOutsideCells(pp)!;
    for (const [ox, oy] of outside) {
      const candidates: DoorSpec[] = [];
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as [number, number][]) {
        const nx = ox + dx;
        const ny = oy + dy;
        if (!owners.has(key([nx, ny]))) continue;
        if (dx !== 0) {
          const cell: [number, number] = dx > 0 ? [nx, ny] : [ox, oy];
          candidates.push({ cell, orientation: 1 });
        } else {
          const cell: [number, number] = dy > 0 ? [nx, ny] : [ox, oy];
          candidates.push({ cell, orientation: 0 });
        }
      }
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.some((d) => isDoorLegal(d, owners))).toBe(true);
    }
  });
});
