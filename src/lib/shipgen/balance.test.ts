import { describe, expect, it } from "vitest";
import type { PlacedPart } from "./model";
import { genPartsById } from "./parts-db";
import { computeBalance, LATERAL_TOLERANCE, rebalanceThrusters } from "./balance";

function pp(id: string, loc: [number, number]): PlacedPart {
  return { part: genPartsById[id], loc, rot: 0 };
}

describe("computeBalance", () => {
  it("is balanced when thrust sits under the mass", () => {
    const parts = [
      pp("cosmoteer.reactor_small", [0, 0]),
      pp("cosmoteer.thruster_small", [-1, 3]),
      pp("cosmoteer.thruster_small", [1, 3]),
    ];
    expect(computeBalance(parts).balanced).toBe(true);
  });

  it("reports the lateral gap when thrust is off-center", () => {
    const parts = [
      pp("cosmoteer.reactor_small", [0, 0]),
      pp("cosmoteer.armor", [0, -1]),
      pp("cosmoteer.thruster_small", [3, 3]),
    ];
    const r = computeBalance(parts);
    expect(r.lateralOffset).toBeGreaterThan(LATERAL_TOLERANCE);
    expect(r.balanced).toBe(false);
  });

  it("weights mass by maxHealth so armor pulls the COM", () => {
    const parts = [
      pp("cosmoteer.reactor_small", [0, 0]),
      pp("cosmoteer.armor", [-5, 0]),
      pp("cosmoteer.thruster_small", [0, 3]),
    ];
    expect(computeBalance(parts).com.x).toBeLessThan(0);
  });
});

describe("rebalanceThrusters", () => {
  it("shifts the bank toward the COM and converges", () => {
    const parts = [
      pp("cosmoteer.reactor_small", [0, 0]),
      pp("cosmoteer.armor", [2, 0]),
      pp("cosmoteer.armor", [2, -1]),
      pp("cosmoteer.thruster_small", [-3, 3]),
    ];
    const before = computeBalance(parts);
    expect(before.balanced).toBe(false);
    const { parts: after, moved } = rebalanceThrusters(parts, () => true);
    expect(moved).toBeGreaterThan(0);
    expect(computeBalance(after).balanced).toBe(true);
  });

  it("leaves a balanced ship untouched", () => {
    const parts = [
      pp("cosmoteer.reactor_small", [0, 0]),
      pp("cosmoteer.thruster_small", [0, 3]),
    ];
    const { moved } = rebalanceThrusters(parts, () => true);
    expect(moved).toBe(0);
  });
});
