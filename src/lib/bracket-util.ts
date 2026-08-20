import type { GameMatch, BracketType } from "@/lib/types";

/** Compute the tournament champion from the recorded match winners, or null. */
export function computeChampion(
  matches: GameMatch[],
  bracketType: BracketType,
): number | null {
  const winners = matches.filter((m) => m.bracket === "winners");
  const grandFinal = matches.filter((m) => m.bracket === "grand_final");

  if (bracketType !== "double_elim") {
    const maxRound = winners.reduce((mx, m) => Math.max(mx, m.round), 0);
    const final = winners.find((m) => m.round === maxRound && m.position === 0) ?? null;
    return final?.winner ?? null;
  }

  const gf1 = grandFinal.find((m) => m.round === 1) ?? null;
  const gf2 = grandFinal.find((m) => m.round === 2) ?? null;
  // Double elimination: a losers-side win in the grand final round 1 forces a
  // reset — the reset-round winner is the champion.
  if (gf2?.winner != null) return gf2.winner;
  if (gf1?.winner != null && gf1.winner === gf1.contestant_a) return gf1.winner;
  return null;
}

/** Contestant ids eliminated with a single loss (non-winners in single elim). */
export function computeRunnerUp(
  matches: GameMatch[],
  bracketType: BracketType,
): number | null {
  const winners = matches.filter((m) => m.bracket === "winners");
  const grandFinal = matches.filter((m) => m.bracket === "grand_final");
  const finalMatch = bracketType !== "double_elim"
    ? winners.reduce<GameMatch | null>((best, m) => (best && best.round > m.round ? best : m), null)
    : (grandFinal.find((m) => m.round === 1) ?? null);
  if (!finalMatch || finalMatch.winner == null) return null;
  const loser = finalMatch.contestant_a === finalMatch.winner ? finalMatch.contestant_b : finalMatch.contestant_a;
  return loser;
}