"use client";

import { useState, useMemo } from "react";
import type { GameMatch, GameContestant } from "@/lib/types";

interface Props {
  gameId: number;
  matches: GameMatch[];
  contestants: GameContestant[];
  isOwner: boolean;
  onChanged?: () => void;
}

function PlayerRow({
  name,
  isWinner,
  onWin,
  onClear,
  busy,
}: {
  name: string | null;
  isWinner: boolean;
  onWin?: () => void;
  onClear?: () => void;
  busy?: boolean;
}) {
  const icons = name && (onWin || onClear) && (
    <span className="ml-2 flex items-center gap-1">
      {onWin && (
        <button
          type="button"
          onClick={onWin}
          disabled={busy}
          aria-label={`Mark ${name} as winner`}
          title="Mark as winner"
          className="w-5 h-5 inline-flex items-center justify-center rounded text-green-400 hover:bg-green-400/20 hover:text-green-300 disabled:opacity-40 transition-colors"
        >
          ✓
        </button>
      )}
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          disabled={busy}
          aria-label={`Remove ${name} as winner`}
          title="Remove winner"
          className="w-5 h-5 inline-flex items-center justify-center rounded text-red-400 hover:bg-red-400/20 hover:text-red-300 disabled:opacity-40 transition-colors"
        >
          ✗
        </button>
      )}
    </span>
  );

  const namePart = name ? (
    <span className="truncate">{name}</span>
  ) : (
    <span className="text-gray-600">—</span>
  );

  return (
    <div
      className={`flex items-center justify-between w-full px-3 py-2 text-sm text-left ${
        isWinner ? "text-cyan-300 font-semibold" : "text-white"
      }`}
    >
      {namePart}
      {icons}
    </div>
  );
}

export default function Bracket({ gameId, matches, contestants, isOwner, onChanged }: Props) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of contestants) map.set(c.id, c.discord_username);
    return map;
  }, [contestants]);

  const rounds = useMemo(() => {
    const maxRound = matches.reduce((acc, m) => Math.max(acc, m.round), 0);
    const groups: GameMatch[][] = [];
    for (let r = 1; r <= maxRound; r++) {
      groups.push(matches.filter((m) => m.round === r).sort((a, b) => a.position - b.position));
    }
    return groups;
  }, [matches]);

  const finalRound = rounds[rounds.length - 1] ?? [];
  const championId = finalRound[0]?.winner ?? null;
  const champion = championId != null ? nameById.get(championId) ?? null : null;

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
      onChanged?.();
    } catch {
      setError("Failed to record winner");
    } finally {
      setBusy(null);
    }
  };

  const resetWinner = async (match: GameMatch) => {
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
      onChanged?.();
    } catch {
      setError("Failed to clear winner");
    } finally {
      setBusy(null);
    }
  };

  if (matches.length === 0) {
    return <p className="text-blue-200 text-sm">Bracket not generated yet.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-6 min-w-max">
          {rounds.map((roundMatches, idx) => (
            <div key={idx} className="flex flex-col gap-4 justify-around">
              <p className="text-xs uppercase tracking-wide text-blue-300">
                {idx === rounds.length - 1 ? "Final" : `Round ${idx + 1}`}
              </p>
              {roundMatches.map((match) => {
                const a = match.contestant_a != null ? nameById.get(match.contestant_a) ?? null : null;
                const b = match.contestant_b != null ? nameById.get(match.contestant_b) ?? null : null;
                const matchBusy = busy === match.id;
                const undecided = match.winner == null && isOwner;
                return (
                  <div
                    key={match.id}
                    className="border border-[#1C598C]/60 rounded bg-[#021526]/60 min-w-44"
                  >
                    <PlayerRow
                      name={a}
                      isWinner={match.winner === match.contestant_a}
                      onWin={undecided && match.contestant_a != null ? () => match.contestant_a != null && setWinner(match, match.contestant_a) : undefined}
                      onClear={isOwner && match.winner === match.contestant_a ? () => resetWinner(match) : undefined}
                      busy={matchBusy}
                    />
                    <div className="border-t border-[#1C598C]/40" />
                    <PlayerRow
                      name={b}
                      isWinner={match.winner === match.contestant_b}
                      onWin={undecided && match.contestant_b != null ? () => match.contestant_b != null && setWinner(match, match.contestant_b) : undefined}
                      onClear={isOwner && match.winner === match.contestant_b ? () => resetWinner(match) : undefined}
                      busy={matchBusy}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {champion && (
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded border border-amber-500/50 text-amber-300">
          <span>🏆</span>
          <span className="font-semibold">{champion}</span>
        </div>
      )}

      {isOwner && error && <p className="text-red-400 text-sm" role="alert">{error}</p>}
    </div>
  );
}