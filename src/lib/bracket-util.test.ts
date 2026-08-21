import { describe, expect, it } from "vitest";
import { computeChampionFromSlots, computeChampion, computeRunnerUp, type ChampionSlots } from "./bracket-util";
import type { GameMatch } from "@/lib/games-types";

type Slot = Partial<ChampionSlots> & Pick<ChampionSlots, "bracket" | "round"> & { position?: number };

function slot(spec: Slot): ChampionSlots {
  return { contestant_a: null, contestant_b: null, winner: null, position: 0, ...spec };
}

let nextId = 1;

function match(bracket: GameMatch["bracket"], round: number, fields: Partial<GameMatch>): GameMatch {
  return {
    id: nextId++,
    bracket,
    round,
    position: 0,
    contestant_a: null,
    contestant_b: null,
    winner: null,
    a_username: null,
    b_username: null,
    winner_username: null,
    ...fields,
  };
}

describe("computeChampionFromSlots", () => {
  it("single elim takes the winners-bracket final winner", () => {
    const matches = [
      slot({ bracket: "winners", round: 1, position: 0, contestant_a: 1, contestant_b: 2, winner: 2 }),
      slot({ bracket: "winners", round: 2, position: 0, contestant_a: 2, contestant_b: 3, winner: 7 }),
    ];
    expect(computeChampionFromSlots(matches, "single_elim")).toBe(7);
  });

  it("single elim returns null while the final is undecided", () => {
    const matches = [
      slot({ bracket: "winners", round: 1, position: 0, contestant_a: 1, contestant_b: 2, winner: 2 }),
      slot({ bracket: "winners", round: 2, position: 0, contestant_a: 2, contestant_b: 3 }),
    ];
    expect(computeChampionFromSlots(matches, "single_elim")).toBeNull();
  });

  it("double elim grand final round 2 overrides the reset", () => {
    const matches = [
      slot({ bracket: "grand_final", round: 1, contestant_a: 4, contestant_b: 9, winner: 9 }),
      slot({ bracket: "grand_final", round: 2, contestant_a: 4, contestant_b: 9, winner: 4 }),
    ];
    expect(computeChampionFromSlots(matches, "double_elim")).toBe(4);
  });

  it("double elim winners-side gf1 win crowns the champion before a reset", () => {
    const matches = [slot({ bracket: "grand_final", round: 1, contestant_a: 4, contestant_b: 9, winner: 4 })];
    expect(computeChampionFromSlots(matches, "double_elim")).toBe(4);
  });

  it("double elim losers-side gf1 win means the bracket awaits its reset", () => {
    const matches = [slot({ bracket: "grand_final", round: 1, contestant_a: 4, contestant_b: 9, winner: 9 })];
    expect(computeChampionFromSlots(matches, "double_elim")).toBeNull();
  });

  it("double elim with no grand final matches has no champion", () => {
    expect(
      computeChampionFromSlots([slot({ bracket: "winners", round: 1, position: 0, winner: 1 })], "double_elim"),
    ).toBeNull();
  });
});

describe("computeRunnerUp", () => {
  it("single elim loses the final to the champion", () => {
    const matches = [
      match("winners", 1, { position: 0, contestant_a: 1, contestant_b: 2, winner: 1 }),
      match("winners", 2, { position: 0, contestant_a: 1, contestant_b: 5, winner: 5 }),
    ];
    expect(computeRunnerUp(matches, "single_elim")).toBe(1);
  });

  it("double elim runner-up comes from grand final round 1", () => {
    const matches = [
      match("grand_final", 1, { contestant_a: 4, contestant_b: 9, winner: 9 }),
      match("grand_final", 2, { contestant_a: 4, contestant_b: 9, winner: 9 }),
    ];
    expect(computeRunnerUp(matches, "double_elim")).toBe(4);
  });

  it("undecided final has no runner-up", () => {
    const matches = [match("winners", 2, { position: 0, contestant_a: 1, contestant_b: 5 })];
    expect(computeRunnerUp(matches, "single_elim")).toBeNull();
  });
});

describe("computeChampion", () => {
  it("delegates to computeChampionFromSlots", () => {
    const matches = [match("grand_final", 2, { contestant_a: 2, contestant_b: 8, winner: 8 })];
    expect(computeChampion(matches, "double_elim")).toBe(8);
  });
});
