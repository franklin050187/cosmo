import type { Metadata } from "next";
import { Suspense } from "react";
import { searchFromQueryString, listUpcomingGames } from "@/lib/db";
import HomeContent from "@/components/HomeContent";
import UpcomingGamesBanner, { type UpcomingGameItem } from "@/components/UpcomingGamesBanner";
import { upcomingWhenLabel } from "@/lib/format-date";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "CosmoShip : Cosmoteer Ship Library",
  description:
    "Browse, search, and download community ship designs for Cosmoteer: Starship Architect & Commander.",
};

export default async function HomePage() {
  const result = await searchFromQueryString("order=new&page=1");
  const upcomingGames = await listUpcomingGames(3).catch(() => []);
  const bannerGames: UpcomingGameItem[] = upcomingGames.map((g) => ({
    id: g.id,
    title: g.title,
    game_date: g.game_date,
    participant_count: g.participant_count,
    when_label: upcomingWhenLabel(g.game_date),
  }));

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20" role="status" aria-label="Loading ships">
          <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <UpcomingGamesBanner games={bannerGames} />
        <HomeContent
          initialShips={result.data ?? []}
          initialTotalCount={result.total_count ?? 0}
          initialMaxPage={result.max_page ?? 1}
          initialAuthorCounts={result.author_counts ?? []}
          initialTagCounts={result.tag_counts ?? []}
          initialHasPrice={result.has_price}
          initialHasCrew={result.has_crew}
        />
      </div>
    </Suspense>
  );
}
