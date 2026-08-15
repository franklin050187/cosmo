"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const HIDE_KEY = "cosmo.hideUpcomingGames";

export interface UpcomingGameItem {
  id: number;
  title: string;
  game_date: string;
  participant_count: number;
  when_label: string;
}

export default function UpcomingGamesBanner({ games }: { games: UpcomingGameItem[] }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    Promise.resolve().then(() => {
      try {
        setDismissed(localStorage.getItem(HIDE_KEY) === "1");
      } catch {
        /* ignore */
      }
    });
  }, []);

  if (dismissed || games.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-[#1C598C]/50 bg-[#021526]/70 backdrop-blur px-4 py-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-sm text-cyan-300 uppercase tracking-wide flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path strokeLinecap="round" d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          Upcoming games
        </p>
        <div className="flex items-center gap-3">
          <Link href="/games" className="text-xs text-blue-300 hover:text-cyan-300 transition-colors">
            View all
          </Link>
          <button
            type="button"
            onClick={() => {
              setDismissed(true);
              try {
                localStorage.setItem(HIDE_KEY, "1");
              } catch {
                /* ignore */
              }
            }}
            aria-label="Dismiss upcoming games"
            className="text-gray-500 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {games.map((g) => (
          <Link
            key={g.id}
            href={`/games/${g.id}`}
            className="group flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#1C598C]/40 text-sm text-blue-100 hover:border-cyan-400/50 hover:text-cyan-300 transition-colors"
          >
            <span className="truncate max-w-[16rem]">{g.title}</span>
            <span className="text-xs text-cyan-400">{g.when_label}</span>
            {g.participant_count > 0 && (
              <span className="text-xs text-gray-500">{g.participant_count} player{g.participant_count === 1 ? "" : "s"}</span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}