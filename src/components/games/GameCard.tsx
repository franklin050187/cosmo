import Link from "next/link";
import type { GameSummary } from "@/lib/types";
import { formatDateTime } from "@/lib/format-date";

const MODE_LABELS: Record<string, string> = {
  pvp: "PvP",
  tournament: "Tournament",
  campaign: "Campaign",
};

export default function GameCard({ game }: { game: GameSummary }) {
  return (
    <Link
      href={`/games/${game.id}`}
      className="block border border-[#1C598C] rounded-md bg-[#021526]/65 backdrop-blur p-4 hover:border-cyan-400/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-white font-semibold truncate">{game.title}</h3>
        <span className="shrink-0 text-xs px-2 py-0.5 rounded border border-[#1C598C]/40 text-cyan-300">
          {MODE_LABELS[game.game_mode] ?? game.game_mode}
        </span>
      </div>
      <p className="text-blue-200 text-xs mb-3 line-clamp-2 min-h-[2rem]">
        {game.description || "No description."}
      </p>
      <p className="text-cyan-300 text-xs mb-2">Game day: {formatDateTime(game.game_date)}</p>
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