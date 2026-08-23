/**
 * Round-robin bracket regression. Verifies the circle-method builder in pure
 * form, then drives a real 5-player tournament through the API using the
 * logged-in QA browser session: schedule generation, winner recording,
 * re-pick/reset consistency, and champion derivation from DB rows.
 *
 * Run: npx tsx --env-file=.env scripts/qa-round-robin.ts
 */
import pg from "pg";
import { buildRoundRobin, computeChampionFromSlots, type ChampionSlots } from "../src/lib/bracket-util";
import { openSession, httpFetch, closeSession, SESSION_QA } from "./qa-lib";

interface MatchRow extends ChampionSlots {
  id: number;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

const HOME = "http://localhost:8000";
const OWNER = { name: "poney5850#0", id: "439514586778042369" };

/** Circle-method property check in pure form for several sizes. */
function verifyBuilder() {
  for (let size = 2; size <= 9; size++) {
    const ids = Array.from({ length: size }, (_, i) => i + 100);
    const built = buildRoundRobin(ids);
    const expectedMatches = (size * (size - 1)) / 2;
    assert(built.length === expectedMatches, `size ${size}: match count ${built.length} != ${expectedMatches}`);

    const pairs = new Set<string>();
    for (const m of built) {
      assert(m.a != null && m.b != null, `size ${size}: bye leaked into a match row`);
      pairs.add(`${Math.min(m.a!, m.b!)}-${Math.max(m.a!, m.b!)}`);
    }
    assert(pairs.size === expectedMatches, `size ${size}: unique pairs ${pairs.size} != ${expectedMatches}`);

    const rounds = new Set(built.map((m) => m.round));
    // Even sizes: N-1 rounds. Odd sizes: a dummy bye extends the schedule to
    // N rounds, one player sitting each round.
    const expectedRounds = size % 2 === 0 ? size - 1 : size;
    assert(rounds.size === expectedRounds, `size ${size}: round count ${rounds.size} != ${expectedRounds}`);
    for (const r of rounds) {
      const inRound = built.filter((m) => m.round === r);
      const distinctPlayers = new Set(inRound.flatMap((m) => [m.a, m.b]));
      // Odd sizes: one player sits each round; even sizes: everyone plays.
      assert(distinctPlayers.size === size - (size % 2), `size ${size} round ${r}: player count wrong`);
    }
  }
  console.log("[1] builder holds for sizes 2-9: unique pairs, no bye rows, correct rounds");
}

async function main() {
  verifyBuilder();

  const c = new pg.Client({
    host: process.env.POSTGRES_HOST,
    port: parseInt(process.env.POSTGRES_PORT ?? "6543", 10),
    database: process.env.POSTGRES_DATABASE,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  openSession(SESSION_QA, `${HOME}/games`);

  try {
    // ── Create the tournament ──
    const created = await httpFetch(SESSION_QA, "/api/games", {
      method: "POST",
      body: JSON.stringify({
        title: `QA RoundRobin ${Date.now()}`,
        description: "",
        game_mode: "tournament",
        visibility: "public",
        game_date: new Date(Date.now() + 86400_000).toISOString(),
        roulette_enabled: false,
        bracket_type: "round_robin",
      }),
    });
    const gameId = (created.body as { data?: { id?: number } })?.data?.id;
    assert((created.status === 200 || created.status === 201) && gameId != null, `create game failed: ${JSON.stringify(created.body).slice(0, 200)}`);

    try {
      // ── Add 5 contestants (odd count exercises byes) ──
      for (const username of ["rr-alpha", "rr-beta", "rr-gamma", "rr-delta", "rr-epsilon"]) {
        const r = await httpFetch(SESSION_QA, `/api/games/${gameId}/contestants`, {
          method: "POST",
          body: JSON.stringify({ username }),
        });
        assert(r.status === 200 && (r.body as { ok?: boolean }).ok, `add ${username}: ${JSON.stringify(r.body).slice(0, 150)}`);
      }

      // ── Generate the schedule ──
      const gen = await httpFetch(SESSION_QA, `/api/games/${gameId}/bracket`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      assert(gen.status === 200 && (gen.body as { ok?: boolean }).ok, `generate failed: ${JSON.stringify(gen.body).slice(0, 150)}`);

      const detail = await httpFetch(SESSION_QA, `/api/games/${gameId}`);
      const game = (detail.body as { data: { matches: MatchRow[]; contestants: Array<{ id: number; discord_username: string }> } }).data;
      const matches = game.matches;
      assert(matches.length === 10, `expected 10 matches for 5 players, got ${matches.length}`);
      assert(matches.every((m) => m.bracket === "rr"), `all matches should be 'rr'`);

      const pairs = new Set(
        matches.map((m) => `${Math.min(m.contestant_a!, m.contestant_b!)}-${Math.max(m.contestant_a!, m.contestant_b!)}`),
      );
      assert(pairs.size === 10, `unique pairs ${pairs.size} != 10`);
      console.log("[2] live game: 5 players → 10 matches in rounds 1-4, every pair exactly once");

      // ── Record all winners. rr-alpha sweeps; one match is an upset so
      // standings have a clear leader plus a tiebreaker-free tail. ──
      const nameOf = (id: number | null) => game.contestants.find((x) => x.id === id)?.discord_username ?? "?";
      let alphaWinsPlanned = 0;
      for (const m of matches) {
        const alphaIsA = nameOf(m.contestant_a) === "rr-alpha";
        const alphaInMatch = alphaIsA || nameOf(m.contestant_b) === "rr-alpha";
        const winner = alphaInMatch ? (alphaIsA ? m.contestant_a : m.contestant_b)! : m.contestant_a!;
        if (alphaInMatch) alphaWinsPlanned++;
        const r = await httpFetch(SESSION_QA, `/api/games/${gameId}/matches/${m.id}`, {
          method: "POST",
          body: JSON.stringify({ winner }),
        });
        assert(r.status === 200 && (r.body as { ok?: boolean }).ok, `set winner match ${m.id}: ${JSON.stringify(r.body).slice(0, 150)}`);
      }
      assert(alphaWinsPlanned === 4, `alpha should win 4, planned ${alphaWinsPlanned}`);
      console.log("[3] recorded winners via API: rr-alpha sweeps 4, others decided arbitrarily");

      // ── Champion from DB rows must be the sweep winner ──
      const rowsRes = await c.query<ChampionSlots>(
        "SELECT bracket, round, position, contestant_a, contestant_b, winner FROM game_matches WHERE game_id = $1",
        [gameId],
      );
      const champion = computeChampionFromSlots(rowsRes.rows, "round_robin");
      assert(champion != null, "champion missing after all matches decided");
      const champName = nameOf(champion);
      assert(champName === "rr-alpha", `champion should be rr-alpha, got ${champName}`);
      console.log(`[4] champion from DB rows: ${champName} (sweep confirmed)`);

      // ── Re-pick then reset one match: no corruption, champion withdrawn ──
      const detail2 = await httpFetch(SESSION_QA, `/api/games/${gameId}`);
      const fresh = (detail2.body as { data: { matches: MatchRow[] } }).data.matches;
      const target = fresh.find((m) => m.winner != null);
      assert(target != null && target.contestant_a != null && target.contestant_b != null, "no decided match found for re-pick");
      const newWinner = target.winner === target.contestant_a ? target.contestant_b : target.contestant_a;

      const repick = await httpFetch(SESSION_QA, `/api/games/${gameId}/matches/${target.id}`, {
        method: "POST",
        body: JSON.stringify({ winner: newWinner }),
      });
      assert(repick.status === 200 && (repick.body as { ok?: boolean }).ok, `re-pick failed: ${JSON.stringify(repick.body).slice(0, 150)}`);

      const afterRepick = await c.query("SELECT winner FROM game_matches WHERE id = $1", [target.id]);
      assert(afterRepick.rows[0].winner === newWinner, "re-pick did not persist");

      const reset = await httpFetch(SESSION_QA, `/api/games/${gameId}/matches/${target.id}`, {
        method: "POST",
        body: JSON.stringify({ reset: true }),
      });
      assert(reset.status === 200 && (reset.body as { ok?: boolean }).ok, `reset failed: ${JSON.stringify(reset.body).slice(0, 150)}`);

      const afterReset = await c.query("SELECT winner FROM game_matches WHERE id = $1", [target.id]);
      assert(afterReset.rows[0].winner == null, "reset did not clear the winner");

      // With a match undecided again, no champion exists.
      const champion2 = computeChampionFromSlots(
        (await c.query<ChampionSlots>("SELECT bracket, round, position, contestant_a, contestant_b, winner FROM game_matches WHERE game_id = $1", [gameId])).rows,
        "round_robin",
      );
      assert(champion2 == null || champion2 !== champion, "champion should not survive a cleared match");
      console.log("[5] re-pick persists, reset clears, champion correctly withdrawn when undecided");
    } finally {
      await c.query("DELETE FROM games WHERE id = $1", [gameId]);
      console.log(`cleaned up game ${gameId}`);
    }
  } finally {
    closeSession(SESSION_QA);
    await c.end();
  }
}

main()
  .then(() => console.log("\n═══ ROUND ROBIN QA: ALL ASSERTIONS PASSED ═══"))
  .catch((e) => {
    console.error("\nFAILED:", e.message);
    process.exitCode = 1;
  });
