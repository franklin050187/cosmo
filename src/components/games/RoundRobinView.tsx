"use client";

import { useMemo, useState } from "react";
import type { GameMatch, GameContestant } from "@/lib/types";
import Button from "@/components/ui/Button";

interface RoundRobinViewProps {
  gameId: number;
  matches: GameMatch[];
  contestants: GameContestant[];
  isOwner: boolean;
  onChanged: () => Promise<void>;
}

interface Standing {
  id: number;
  name: string;
  played: number;
  wins: number;
  losses: number;
}

export default function RoundRobinView({ gameId, matches, contestants, isOwner, onChanged }: RoundRobinViewProps) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const standings = useMemo<Standing[]>(() => {
    const rows = new Map<number, Standing>(
      contestants.map((c) => [c.id, { id: c.id, name: c.discord_username, played: 0, wins: 0, losses: 0 }]),
    );
    for (const m of matches) {
      if (m.winner == null || m.contestant_a == null || m.contestant_b == null) continue;
      const loser = m.winner === m.contestant_a ? m.contestant_b : m.contestant_a;
      const w = rows.get(m.winner);
      const l = rows.get(loser);
      if (w) {
        w.played += 1;
        w.wins += 1;
      }
      if (l) {
        l.played += 1;
        l.losses += 1;
      }
    }
    return [...rows.values()].sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name));
  }, [matches, contestants]);

  const allDecided = matches.length > 0 && matches.every((m) => m.winner != null);
  const leader = standings[0];

  const rounds = useMemo(() => {
    const byRound = new Map<number, GameMatch[]>();
    for (const m of matches) {
      const list = byRound.get(m.round) ?? [];
      list.push(m);
      byRound.set(m.round, list);
    }
    return [...byRound.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([round, list]) => ({ round, list: list.sort((x, y) => x.position - y.position) }));
  }, [matches]);

  const setWinner = async (match: GameMatch, contestantId: number) => {
    if (!isOwner) return;
    setBusy(match.id);
    setError(null);
    try {
      const res = await fetch(`/api/games/${gameId}/matches/${match.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winner: contestantId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Failed to record winner");
        return;
      }
      await onChanged();
    } catch {
      setError("Failed to record winner");
    } finally {
      setBusy(null);
    }
  };

  const clearWinner = async (match: GameMatch) => {
    if (!isOwner) return;
    setBusy(match.id);
    setError(null);
    try {
      const res = await fetch(`/api/games/${gameId}/matches/${match.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Failed to clear winner");
        return;
      }
      await onChanged();
    } catch {
      setError("Failed to clear winner");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Standings */}
      <div>
        <h3 className="text-sm uppercase tracking-wider text-blue-200 mb-2">
          Standings{allDecided && leader ? ` — ${leader.name} leads` : ""}
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 text-xs uppercase tracking-wide border-b border-[#1C598C]/40">
              <th scope="col" className="py-1.5 pr-2">#</th>
              <th scope="col" className="py-1.5 pr-2">Player</th>
              <th scope="col" className="py-1.5 pr-2 text-center">W</th>
              <th scope="col" className="py-1.5 pr-2 text-center">L</th>
              <th scope="col" className="py-1.5 text-center">Played</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s, i) => (
              <tr key={s.id} className={`border-b border-[#1C598C]/20 ${allDecided && s === leader ? "text-cyan-300" : ""}`}>
                <td className="py-1.5 pr-2 text-gray-500">{i + 1}</td>
                <td className="py-1.5 pr-2 text-white">{s.name}</td>
                <td className="py-1.5 pr-2 text-center font-semibold">{s.wins}</td>
                <td className="py-1.5 pr-2 text-center text-gray-400">{s.losses}</td>
                <td className="py-1.5 text-center text-gray-400">{s.played}/{contestants.length - 1}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!allDecided && (
          <p className="text-gray-500 text-xs mt-1.5">
            {matches.filter((m) => m.winner != null).length}/{matches.length} matches decided.
            Best record when every match is played becomes the champion; ties break head-to-head.
          </p>
        )}
      </div>

      {error && <p className="text-red-400 text-sm" role="alert">{error}</p>}

      {/* Rounds */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rounds.map(({ round, list }) => (
          <div key={round} className="rounded-xl border border-[#1C598C]/40 bg-[#021526]/60 p-3">
            <h4 className="text-xs uppercase tracking-wider text-cyan-400 mb-2">Round {round}</h4>
            <div className="space-y-2">
              {list.map((m) => {
                const decided = m.winner != null;
                return (
                  <div
                    key={m.id}
                    className={`rounded-lg border px-2 py-1.5 flex items-center justify-between gap-2 ${
                      decided ? "border-[#1C598C]/25 bg-[#0a1e33]/40" : "border-[#1C598C]/50"
                    }`}
                  >
                    <div className="min-w-0 text-sm">
                      <span className={decided && m.winner === m.contestant_a ? "text-cyan-300 font-semibold" : "text-white"}>
                        {m.a_username ?? "—"}
                      </span>
                      <span className="text-gray-500 mx-1.5">vs</span>
                      <span className={decided && m.winner === m.contestant_b ? "text-cyan-300 font-semibold" : "text-white"}>
                        {m.b_username ?? "—"}
                      </span>
                    </div>
                    {isOwner && (
                      <div className="flex items-center gap-1 shrink-0">
                        {decided ? (
                          <button
                            type="button"
                            onClick={() => clearWinner(m)}
                            disabled={busy === m.id}
                            aria-label="Clear winner"
                            title="Clear winner"
                            className="w-7 h-7 inline-flex items-center justify-center rounded text-red-400 hover:bg-red-400/20 hover:text-red-300 disabled:opacity-40 transition-colors"
                          >
                            ✗
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => setWinner(m, m.contestant_a!)}
                              disabled={busy === m.id}
                              aria-label={`Mark ${m.a_username} as winner`}
                              title="Mark as winner"
                              className="w-7 h-7 inline-flex items-center justify-center rounded text-green-400 hover:bg-green-400/20 hover:text-green-300 disabled:opacity-40 transition-colors"
                            >
                              ✓
                            </button>
                            <button
                              type="button"
                              onClick={() => setWinner(m, m.contestant_b!)}
                              disabled={busy === m.id}
                              aria-label={`Mark ${m.b_username} as winner`}
                              title="Mark as winner"
                              className="w-7 h-7 inline-flex items-center justify-center rounded text-green-400 hover:bg-green-400/20 hover:text-green-300 disabled:opacity-40 transition-colors"
                            >
                              ✓
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {isOwner && matches.length > 0 && (
        <p className="text-gray-500 text-xs">
          Mark each matchup&apos;s winner with the check (✓); the cross (✗) clears a pick.
          When every match has a result the best record is crowned champion.
        </p>
      )}

      {allDecided && leader && (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => onChanged()}>
            Refresh results
          </Button>
        </div>
      )}
    </div>
  );
}
