"use client";

import { useState } from "react";
import Link from "next/link";
import type { GameSummary } from "@/lib/types";
import { htmlToText } from "@/lib/html-text";
import { formatDateTimeWithTz, upcomingWhenLabel, countdownLabel } from "@/lib/format-date";

const MODE_LABELS: Record<string, string> = {
  pvp: "PvP",
  tournament: "Tournament",
  campaign: "Campaign",
};

const STATUS_STYLES: Record<string, string> = {
  open: "border-emerald-500/50 text-emerald-300",
  closed: "border-gray-500/50 text-gray-300",
  finished: "border-blue-500/50 text-blue-300",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  closed: "Closed",
  finished: "Finished",
};

function Badge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`shrink-0 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${className}`}
    >
      {children}
    </span>
  );
}

export default function GameCard({ game }: { game: GameSummary }) {
  // Captured once so relative labels are stable across re-renders (purity rule).
  const [now] = useState(() => Date.now());
  const isPast = new Date(game.game_date).getTime() < now;
  const dateLabel = isPast
    ? `${formatDateTimeWithTz(game.game_date)} · ${countdownLabel(game.game_date, now)}`
    : `${formatDateTimeWithTz(game.game_date)} · ${upcomingWhenLabel(game.game_date, now)}`;

  return (
    <Link
      href={`/games/${game.id}`}
      aria-label={`View game ${game.title}`}
      className="block border border-[#1C598C] rounded-md bg-[#021526]/65 backdrop-blur p-4 hover:border-cyan-400/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-white font-semibold truncate">{game.title}</h3>
        <span className="shrink-0 text-xs px-2 py-0.5 rounded border border-[#1C598C]/40 text-cyan-300">
          {MODE_LABELS[game.game_mode] ?? game.game_mode}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <Badge className={STATUS_STYLES[game.status] ?? "border-[#1C598C]/40 text-blue-300"}>
          {STATUS_LABELS[game.status] ?? game.status}
        </Badge>
        {game.visibility === "private" && <Badge className="border-amber-500/50 text-amber-300">Private</Badge>}
        {game.roulette_enabled && <Badge className="border-fuchsia-500/50 text-fuchsia-300">Roulette</Badge>}
        {game.registered && <Badge className="border-cyan-400/60 text-cyan-300">You&apos;re registered</Badge>}
      </div>

      <p className="text-blue-200 text-xs mb-3 line-clamp-2 min-h-[2rem]">
        {htmlToText(game.description) || "No description."}
      </p>
      <p className="text-cyan-300 text-xs mb-2" title={formatDateTimeWithTz(game.game_date)}>
        Game day: {dateLabel}
      </p>
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span className="truncate">by {game.owner_name}</span>
        <span className="shrink-0 ml-2">
          {game.participant_count} player{game.participant_count === 1 ? "" : "s"} · {game.ship_count} ship
          {game.ship_count === 1 ? "" : "s"}
        </span>
      </div>
    </Link>
  );
}