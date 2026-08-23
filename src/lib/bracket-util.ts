import type { GameMatch, BracketType } from "@/lib/types";

/** The match fields the champion/runner-up math needs (client and server rows both satisfy this). */
export interface ChampionSlots {
  bracket: string;
  round: number;
  position: number;
  contestant_a: number | null;
  contestant_b: number | null;
  winner: number | null;
}

/** Compute the tournament champion from the recorded match winners, or null. */
export function computeChampionFromSlots(
  matches: ChampionSlots[],
  bracketType: BracketType,
): number | null {
  const winners = matches.filter((m) => m.bracket === "winners");
  const grandFinal = matches.filter((m) => m.bracket === "grand_final");

  if (bracketType === "round_robin") {
    return roundRobinChampion(matches);
  }

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

/** Compute the tournament champion from full client-side matches, or null. */
export function computeChampion(
  matches: GameMatch[],
  bracketType: BracketType,
): number | null {
  return computeChampionFromSlots(matches, bracketType);
}

/** Contestant ids eliminated with a single loss (non-winners in single elim). */
export function computeRunnerUp(
  matches: GameMatch[],
  bracketType: BracketType,
): number | null {
  if (bracketType === "round_robin") return null;
  const winners = matches.filter((m) => m.bracket === "winners");
  const grandFinal = matches.filter((m) => m.bracket === "grand_final");
  const finalMatch = bracketType !== "double_elim"
    ? winners.reduce<GameMatch | null>((best, m) => (best && best.round > m.round ? best : m), null)
    : (grandFinal.find((m) => m.round === 1) ?? null);
  if (!finalMatch || finalMatch.winner == null) return null;
  const loser = finalMatch.contestant_a === finalMatch.winner ? finalMatch.contestant_b : finalMatch.contestant_a;
  return loser;
}

/**
 * Round robin: every contestant plays every other once. Champion is the best
 * win record after every match is decided; ties break by head-to-head result
 * among the tied group, then by lowest contestant id.
 */
function roundRobinChampion(matches: ChampionSlots[]): number | null {
  if (matches.length === 0 || matches.some((m) => m.winner == null)) return null;

  const wins = new Map<number, number>();
  for (const m of matches) {
    if (m.winner == null) continue;
    wins.set(m.winner, (wins.get(m.winner) ?? 0) + 1);
  }
  const topWins = Math.max(...wins.values());
  const tied = [...wins.entries()].filter(([, w]) => w === topWins).map(([id]) => id);
  if (tied.length === 1) return tied[0];

  const h2h = new Map<number, number>(tied.map((id) => [id, 0]));
  for (const m of matches) {
    const { contestant_a: a, contestant_b: b, winner } = m;
    if (winner == null || a == null || b == null) continue;
    if (tied.includes(a) && tied.includes(b)) {
      h2h.set(winner, (h2h.get(winner) ?? 0) + 1);
    }
  }
  const bestH2H = Math.max(...h2h.values());
  const stillTied = tied.filter((id) => h2h.get(id) === bestH2H);
  return Math.min(...stillTied);
}

export interface RRMatch {
  bracket: "rr";
  round: number;
  position: number;
  a: number | null;
  b: number | null;
  winner: number | null;
}

/**
 * Build a round-robin schedule with the circle method: fix the first entrant,
 * rotate the rest one step per round. N contestants produce N-1 rounds of
 * N/2 matches; with an odd count the dummy bye removes exactly one player
 * per round and no match row is created for it. Every pair meets exactly once.
 */
export function buildRoundRobin(ids: number[]): RRMatch[] {
  if (ids.length < 2) return [];
  const list: Array<number | null> = [...ids];
  if (list.length % 2 === 1) list.push(null);

  const n = list.length;
  const matches: RRMatch[] = [];
  let rot = list.slice(1);

  for (let round = 1; round <= n - 1; round++) {
    const lineup = [list[0], ...rot];
    let position = 0;
    for (let i = 0; i < n / 2; i++) {
      const a = lineup[i];
      const b = lineup[n - 1 - i];
      if (a == null || b == null) continue;
      matches.push({ bracket: "rr", round, position, a, b, winner: null });
      position++;
    }
    rot = [rot[rot.length - 1], ...rot.slice(0, rot.length - 1)];
  }
  return matches;
}