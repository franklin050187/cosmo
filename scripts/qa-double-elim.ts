// Focused test for Phase 4 double-elimination brackets.
// Exercises the API end-to-end: create game (double_elim), add contestants,
// generate bracket, play out a bracket-reset scenario, verify match structure
// + loss tracking + champion derivation. Cleans up after itself.
// Run: cd /home/johnn/cosmo && node --env-file=.env --no-warnings scripts/qa-double-elim.ts

import { spawnSync } from "node:child_process";
import {
  openSession,
  httpFetch,
  SESSION_QA,
  dbInit,
  dbClose,
  q,
} from "./qa-lib.ts";

const HOME = "http://localhost:8000";
const S = SESSION_QA;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function createGameViaApi(opts: {
  bracketType?: "single_elim" | "double_elim";
} = {}): Promise<{ id: number }> {
  const res = await httpFetch(S, `${HOME}/api/games`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: `QA double elim ${Date.now()}`,
      description: "",
      game_mode: "tournament",
      visibility: "public",
      collection_id: null,
      game_date: new Date(Date.now() + 7 * 86400000).toISOString(),
      roulette_enabled: false,
      bracket_type: opts.bracketType ?? "double_elim",
    }),
  });
  const data = (res.body as { data?: { id?: number } })?.data;
  assert(res.status === 201 && data?.id != null, `create game ${res.status}: ${JSON.stringify(res.body)}`);
  return { id: data!.id! };
}

async function addContestant(id: number, username: string) {
  const res = await httpFetch(S, `${HOME}/api/games/${id}/contestants`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
  assert(res.status === 200, `add contestant ${username} ${res.status}: ${JSON.stringify(res.body)}`);
}

async function setWinner(id: number, matchId: number, winnerId: number) {
  const res = await httpFetch(S, `${HOME}/api/games/${id}/matches/${matchId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ winner: winnerId }),
  });
  assert(res.status === 200 && (res.body as { ok?: boolean })?.ok, `set winner ${matchId} ${res.status}: ${JSON.stringify(res.body)}`);
}

async function resetWinner(id: number, matchId: number) {
  const res = await httpFetch(S, `${HOME}/api/games/${id}/matches/${matchId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reset: true }),
  });
  assert(res.status === 200 && (res.body as { ok?: boolean })?.ok, `reset winner ${matchId} ${res.status}: ${JSON.stringify(res.body)}`);
}

type MC = {
  id: number;
  bracket: string;
  round: number;
  position: number;
  contestant_a: number | null;
  contestant_b: number | null;
  winner: number | null;
};

async function matchesFor(id: number): Promise<MC[]> {
  const { rows } = await q<MC>(
    "SELECT id, bracket, round, position, contestant_a, contestant_b, winner FROM game_matches WHERE game_id = $1 ORDER BY bracket, round, position",
    [id]
  );
  return rows;
}

async function lossesFor(id: number): Promise<Record<string, number>> {
  const { rows } = await q<{ discord_username: string; losses: number }>(
    "SELECT discord_username, losses FROM game_contestants WHERE game_id = $1 ORDER BY seed",
    [id]
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.discord_username] = r.losses;
  return out;
}

async function main() {
  await dbInit();

  let gameId = 0;

  try {
    console.log("═══ FOCUSED DOUBLE-ELIMINATION TEST ═══\n");

    // Session for authenticated API calls.
    openSession(S, HOME);
    await new Promise((r) => setTimeout(r, 3000));

    // [1] Create a double-elimination tournament.
    console.log("[1] Create double-elim tournament...");
    const { id } = await createGameViaApi({ bracketType: "double_elim" });
    gameId = id;
    const g = await q("SELECT bracket_type FROM games WHERE id = $1", [id]);
    assert(g.rows[0].bracket_type === "double_elim", `bracket_type=${g.rows[0].bracket_type}`);
    console.log(`       game id=${id}, bracket_type=double_elim OK`);

    // [2] Add 4 contestants: qa-p1..qa-p4.
    console.log("[2] Add 4 contestants...");
    for (const u of ["qa-p1", "qa-p2", "qa-p3", "qa-p4"]) {
      await addContestant(id, u);
    }

    // [3] Generate the bracket (double elimination).
    console.log("[3] Generate double-elim bracket...");
    const br = await httpFetch(S, `${HOME}/api/games/${id}/bracket`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shuffle: false, bracketType: "double_elim" }),
    });
    assert(br.status === 200 && (br.body as { ok?: boolean })?.ok, `bracket ${br.status}: ${JSON.stringify(br.body)}`);

    const ms = await matchesFor(id);
    const wb = ms.filter((m) => m.bracket === "winners");
    const lb = ms.filter((m) => m.bracket === "losers");
    const gf = ms.filter((m) => m.bracket === "grand_final");
    assert(wb.length === 3, `WB matches=${wb.length} (expected 3)`);
    assert(lb.length === 2, `LB matches=${lb.length} (expected 2)`);
    assert(gf.length === 2, `GF matches=${gf.length} (expected 2)`);
    assert(ms.length === 7, `total matches=${ms.length} (expected 7 = 2P-1 for P=4)`);
    console.log(`       WB=${wb.length}, LB=${lb.length}, GF=${gf.length} OK`);

    // Round 1 winners-bracket matches have 4 contestants in standard seeding.
    const wbR1 = wb.filter((m) => m.round === 1).sort((a, b) => a.position - b.position);
    const filled = wbR1.flatMap((m) => [m.contestant_a, m.contestant_b]).filter((x) => x != null);
    assert(filled.length === 4, `round 1 filled contestants=${filled.length}`);
    const gfR2 = gf.find((m) => m.round === 2);
    assert(gfR2 && gfR2.contestant_a == null && gfR2.contestant_b == null, "GF reset round should start empty");
    console.log(`       round 1 pairing filled OK, GF reset round empty OK`);

    // [4] Play WB round 1: top seeds win (p1 over p4, p2 over p3).
    console.log("[4] Play winners round 1...");
    const cons = await q<{ id: number; discord_username: string }>(
      "SELECT id, discord_username FROM game_contestants WHERE game_id = $1 ORDER BY seed",
      [id]
    );
    const ids = Object.fromEntries(cons.rows.map((r) => [r.discord_username, r.id]));

    const wbR1m0 = wbR1[0];
    const wbR1m1 = wbR1[1];
    const wbR1w0 = wbR1m0.contestant_a!; // p1 wins
    const wbR1w1 = wbR1m1.contestant_a!; // p3 wins
    await setWinner(id, wbR1m0.id, wbR1w0);
    await setWinner(id, wbR1m1.id, wbR1w1);

    let ms2 = await matchesFor(id);
    let wbR2 = ms2.find((m) => m.bracket === "winners" && m.round === 2 && m.position === 0)!;
    let lbR1 = ms2.filter((m) => m.bracket === "losers" && m.round === 1).sort((a, b) => a.position - b.position);
    assert(
      (wbR2.contestant_a === wbR1w0 || wbR2.contestant_b === wbR1w0) &&
        (wbR2.contestant_a === wbR1w1 || wbR2.contestant_b === wbR1w1),
      "WB R2 should contain both WB R1 winners"
    );
    // Losers of WB R1 (b-side) drop into LB round 1 (positions 0 and 1).
    const lbSlots = lbR1.flatMap((m) => [m.contestant_a, m.contestant_b]);
    assert(lbSlots.includes(wbR1m0.contestant_b!), `LB R1 should include WB R1 pos0 loser`);
    assert(lbSlots.includes(wbR1m1.contestant_b!), `LB R1 should include WB R1 pos1 loser`);
    console.log(`       WB R2 advance + LB R1 drop-in OK`);

    // [5] Play LB round 1: the WB R1 pos0 loser (slot A) beats the pos1 loser.
    const lbR1a = lbR1[0].contestant_a!;
    await setWinner(id, lbR1[0].id, lbR1a);

    let ms3 = await matchesFor(id);
    let lbR2 = ms3.find((m) => m.bracket === "losers" && m.round === 2 && m.position === 0)!;
    assert(lbR2.contestant_b === lbR1a, "LB R2 slot B should hold LB R1 winner");
    console.log(`       LB R2 slot B fill OK`);

    // [6] Play WB round 2 (final): p1 beats p2 → p1 to GF slot A, p2 (1 loss) drops to LB R2 slot A.
    await setWinner(id, wbR2.id, wbR1w0);

    let ms4 = await matchesFor(id);
    let gf1 = ms4.find((m) => m.bracket === "grand_final" && m.round === 1)!;
    assert(gf1.contestant_a === wbR1w0, "GF slot A should hold the WB champion");
    let lbR2b = ms4.find((m) => m.bracket === "losers" && m.round === 2 && m.position === 0)!;
    assert(lbR2b.contestant_a != null && lbR2b.contestant_b != null, "LB R2 should now have both slots filled");
    console.log(`       GF slot A (WB champion) + LB R2 injection OK`);

    // [7] Play LB round 2: p4 (LB R1 winner, slot B) beats p2 → p4 to GF slot B.
    const lbR2Winner = lbR2b.contestant_b!;
    await setWinner(id, lbR2b.id, lbR2Winner);

    let ms5 = await matchesFor(id);
    let gf1b = ms5.find((m) => m.bracket === "grand_final" && m.round === 1)!;
    assert(gf1b.contestant_b === lbR2Winner, "GF slot B should hold the LB champion");
    console.log(`       GF slot B (LB champion) OK`);

    // [8] Loss tracking after the WB + LB rounds:
    // p1: 0 losses (WB champion); p2: lost WB R2 (1) → LB R2 loss (2);
    // p3: lost WB R1 (1) + LB R1 (2); p4: lost WB R1 only (1, LB champion).
    let losses = await lossesFor(id);
    assert(losses["qa-p1"] === 0, `p1 losses=${losses["qa-p1"]}`);
    assert(losses["qa-p2"] === 2, `p2 losses=${losses["qa-p2"]}`);
    assert(losses["qa-p3"] === 2, `p3 losses=${losses["qa-p3"]}`);
    assert(losses["qa-p4"] === 1, `p4 losses=${losses["qa-p4"]}`);
    console.log(`       losses ${JSON.stringify(losses)} OK`);

    // [9] Grand final round 1: losers-side (p4) wins → bracket reset must fire.
    await setWinner(id, gf1b.id, lbR2Winner);
    let ms6 = await matchesFor(id);
    let gf2 = ms6.find((m) => m.bracket === "grand_final" && m.round === 2)!;
    assert(gf2.contestant_a === gf1b.contestant_a, "GF reset A = WB champion");
    assert(gf2.contestant_b === lbR2Winner, "GF reset B = GF R1 winner");
    console.log(`       GF reset match filled OK`);

    // [10] Play GF reset: WB champion (p1) wins → p1 is champion, p4 gets 2nd loss.
    await setWinner(id, gf2.id, gf1b.contestant_a!);
    let losses2 = await lossesFor(id);
    assert(losses2["qa-p1"] === 1, `p1 losses after reset=${losses2["qa-p1"]}`);
    assert(losses2["qa-p2"] === 2, `p2 losses after reset=${losses2["qa-p2"]}`);
    assert(losses2["qa-p4"] === 2, `p4 losses after reset=${losses2["qa-p4"]}`);
    let ms7 = await matchesFor(id);
    let gf2b = ms7.find((m) => m.bracket === "grand_final" && m.round === 2)!;
    assert(gf2b.winner === gf1b.contestant_a, "GF reset winner = champion");
    console.log(`       champion (GF reset winner) + final losses OK`);

    // [11] Undo the GF R1 pick (losers-side win) → the reset match should be cleared.
    console.log("[11] Undo grand final round 1 (reset regression)...");
    await resetWinner(id, gf1b.id);
    let ms8 = await matchesFor(id);
    let gf2c = ms8.find((m) => m.bracket === "grand_final" && m.round === 2)!;
    assert(
      gf2c.contestant_a == null && gf2c.contestant_b == null && gf2c.winner == null,
      "GF reset round should be cleared after GF R1 undo"
    );
    let losses3 = await lossesFor(id);
    assert(losses3["qa-p1"] === 0, `p1 losses after GF R1 undo=${losses3["qa-p1"]}`);
    assert(losses3["qa-p4"] === 2, `p4 losses after GF R1 undo=${losses3["qa-p4"]}`);
    console.log(`       GF reset cleared + losses restored OK`);

    // [12] Re-pick GF R1 the other way (winners-side wins) → champion without reset.
    await setWinner(id, gf1b.id, gf1b.contestant_a!);
    let ms9 = await matchesFor(id);
    let gf2d = ms9.find((m) => m.bracket === "grand_final" && m.round === 2)!;
    assert(gf2d.contestant_a == null, "no reset when winners-side wins GF R1");
    let losses4 = await lossesFor(id);
    assert(losses4["qa-p1"] === 0, `p1 losses after GF R1 re-pick=${losses4["qa-p1"]}`);
    assert(losses4["qa-p4"] === 3, `p4 losses after GF R1 re-pick=${losses4["qa-p4"]}`);
    console.log(`       winners-side GF R1 win → no reset, champion decided OK`);

    // [13] Single-elimination regression: 3 players (bye case) + winner advance.
    console.log("\n[13] Single-elimination regression (3 players, bye)...");
    const { id: seId } = await createGameViaApi({ bracketType: "single_elim" });
    try {
      for (const u of ["qa-s1", "qa-s2", "qa-s3"]) {
        await addContestant(seId, u);
      }
      const seBr = await httpFetch(S, `${HOME}/api/games/${seId}/bracket`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shuffle: false, bracketType: "single_elim" }),
      });
      assert(seBr.status === 200 && (seBr.body as { ok?: boolean })?.ok, `single-elim bracket ${seBr.status}: ${JSON.stringify(seBr.body)}`);

      const seMs = await matchesFor(seId);
      assert(seMs.length === 3, `single-elim matches=${seMs.length} (expected 3 for P=4, 3 players)`);
      const seWb = seMs.filter((m) => m.bracket === "winners");
      assert(seWb.length === 3, `single-elim winners matches=${seWb.length}`);
      assert(seMs.every((m) => m.bracket === "winners"), "single elim should have no losers/GF matches");

      // Round 1 has one bye (auto-advance) and one real match.
      const seR1 = seWb.filter((m) => m.round === 1).sort((a, b) => a.position - b.position);
      const byeMatch = seR1.find((m) => (m.contestant_a == null) !== (m.contestant_b == null));
      const realMatch = seR1.find((m) => m.contestant_a != null && m.contestant_b != null);
      assert(byeMatch != null && byeMatch.winner != null, "bye should auto-advance with a winner");
      assert(realMatch != null && realMatch.winner == null, "real match should be undecided");

      // Real match: left side wins → advances into round 2.
      await setWinner(seId, realMatch.id, realMatch.contestant_a!);
      const seR2 = (await matchesFor(seId)).find((m) => m.bracket === "winners" && m.round === 2 && m.position === 0)!;
      const advanced = [seR2.contestant_a, seR2.contestant_b];
      assert(advanced.includes(byeMatch.winner!), "round 2 should contain the bye winner");
      assert(advanced.includes(realMatch.contestant_a!), "round 2 should contain the round 1 winner");
      console.log(`       single-elim structure, bye auto-advance, R2 fill OK`);
    } finally {
      await q("DELETE FROM game_matches WHERE game_id = $1", [seId]);
      await q("DELETE FROM game_contestants WHERE game_id = $1", [seId]);
      await q("DELETE FROM game_registrations WHERE game_id = $1", [seId]);
      await q("DELETE FROM game_ship_draws WHERE game_id = $1", [seId]);
      await q("DELETE FROM game_ships WHERE game_id = $1", [seId]);
      await q("DELETE FROM games WHERE id = $1", [seId]);
    }

    console.log("\n═══ TEST COMPLETE: ALL ASSERTIONS PASSED ═══");
  } catch (e) {
    console.error("\nTEST FAILED:", e);
    process.exitCode = 1;
  } finally {
    if (gameId) {
      try {
        await q("DELETE FROM game_matches WHERE game_id = $1", [gameId]);
        await q("DELETE FROM game_contestants WHERE game_id = $1", [gameId]);
        await q("DELETE FROM game_registrations WHERE game_id = $1", [gameId]);
        await q("DELETE FROM game_ship_draws WHERE game_id = $1", [gameId]);
        await q("DELETE FROM game_ships WHERE game_id = $1", [gameId]);
        await q("DELETE FROM games WHERE id = $1", [gameId]);
        console.log(`\nCleaned up game ${gameId}`);
      } catch (err) {
        console.error("Cleanup error:", err);
      }
    }
    spawnSync("playwright-cli", ["kill", S], { encoding: "utf8", stdio: "ignore" });
    spawnSync("playwright-cli", ["kill-all"], { encoding: "utf8", stdio: "ignore" });
    await dbClose();
  }
}

main();