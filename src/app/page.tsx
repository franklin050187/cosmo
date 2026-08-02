import type { Metadata } from "next";
import { Suspense } from "react";
import { searchFromQueryString } from "@/lib/db";
import HomeContent from "@/components/HomeContent";

export const metadata: Metadata = {
  title: "CosmoShip : Cosmoteer Ship Library",
  description:
    "Browse, search, and download community ship designs for Cosmoteer: Starship Architect & Commander.",
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(sp)) {
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v);
    } else if (value !== undefined) {
      params.set(key, value);
    }
  }
  if (!params.has("order")) params.set("order", "new");
  if (!params.has("page")) params.set("page", "1");

  const result = await searchFromQueryString(params.toString());

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
        </div>
      }
    >
      <HomeContent
        initialShips={result.data ?? []}
        initialTotalCount={result.total_count ?? 0}
        initialMaxPage={result.max_page ?? 1}
      />
    </Suspense>
  );
}
