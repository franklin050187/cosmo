"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import GameCard from "@/components/games/GameCard";
import { useAuth } from "@/hooks/useAuth";
import type { GameSummary } from "@/lib/types";

interface GamesData {
  public: GameSummary[];
  mine: GameSummary[];
  past: GameSummary[];
}

function GamesSection({ title, games, empty }: { title: string; games: GameSummary[]; empty: string }) {
  return (
    <section className="mb-10">
      <h2 className="text-xl text-white uppercase mb-4">{title}</h2>
      {games.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {games.map((g) => <GameCard key={g.id} game={g} />)}
        </div>
      ) : (
        <p className="text-center text-blue-200 py-10">{empty}</p>
      )}
    </section>
  );
}

export default function GamesPage() {
  const { isLoggedIn, hydrated } = useAuth();
  const [data, setData] = useState<GamesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showPast, setShowPast] = useState(false);

  const load = useCallback(() => {
    const controller = new AbortController();
    setError(false);
    fetch("/api/games", { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json();
      })
      .then((json) => setData(json.data ?? null))
      .catch(() => {
        if (controller.signal.aborted) return;
        setData(null);
        setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return controller;
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() resets error state before fetching
    const controller = load();
    return () => controller.abort();
  }, [load]);

  const pastCount = data?.past.length ?? 0;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-4xl text-white uppercase">Games</h1>
        {isLoggedIn && (
          <Link href="/games/new" aria-label="Create a new game">
            <Button>+ New Game</Button>
          </Link>
        )}
      </div>

      {loading ? (
        <p className="text-center text-blue-200" role="status">Loading...</p>
      ) : error ? (
        <div className="text-center py-10" role="alert">
          <p className="text-red-300 mb-4">Could not load games. Check your connection and try again.</p>
          <Button onClick={() => { setLoading(true); load(); }}>Try again</Button>
        </div>
      ) : (
        <>
          {hydrated && isLoggedIn && data?.mine && data.mine.length > 0 && (
            <GamesSection title="Your Games" games={data.mine} empty="No games." />
          )}

          <section className="mb-10">
            <div className="flex items-center justify-between gap-4 mb-4">
              <h2 className="text-xl text-white uppercase">Upcoming Games</h2>
              {pastCount > 0 && (
                <button
                  onClick={() => setShowPast((v) => !v)}
                  aria-expanded={showPast}
                  aria-label={showPast ? "Hide past games" : `Show past games (${pastCount})`}
                  className="text-sm text-blue-300 hover:text-cyan-300 transition-colors"
                >
                  {showPast ? "Hide past games" : `Show past games (${pastCount})`}
                </button>
              )}
            </div>
            {data?.public && data.public.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {data.public.map((g) => <GameCard key={g.id} game={g} />)}
              </div>
            ) : (
              <p className="text-center text-blue-200 py-10">No games scheduled yet.</p>
            )}
          </section>

          {showPast && (
            <GamesSection title="Past Games" games={data?.past ?? []} empty="No past games." />
          )}
        </>
      )}
    </div>
  );
}