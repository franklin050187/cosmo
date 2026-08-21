"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import ShipGrid from "@/components/ship/ShipGrid";
import RequireAuth from "@/components/RequireAuth";
import { useAuthFetch } from "@/hooks/useAuthFetch";
import { type ShipRow } from "@/lib/db";

const PAGE = 24;

type SortKey = "new" | "name" | "price" | "downloads" | "favorites";

const SORTERS: Record<SortKey, (a: ShipRow, b: ShipRow) => number> = {
  new: (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  name: (a, b) => a.ship_name.localeCompare(b.ship_name),
  price: (a, b) => b.price - a.price,
  downloads: (a, b) => b.downloads - a.downloads,
  favorites: (a, b) => b.fav - a.fav,
};

function MyShipsContent() {
  const { data, loading, error, refetch } = useAuthFetch<{ data: ShipRow[] }>("/api/ship/my-ships");
  const ships = useMemo(() => data?.data ?? [], [data]);

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("new");
  const [visible, setVisible] = useState(PAGE);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? ships.filter(
          (s) =>
            s.ship_name.toLowerCase().includes(q) ||
            (s.author ?? "").toLowerCase().includes(q),
        )
      : ships;
    return [...matched].sort(SORTERS[sort]);
  }, [ships, query, sort]);

  const shown = filtered.slice(0, visible);

  return (
    <>
      <h1 className="text-4xl text-white text-center uppercase mb-8">
        My Ships
      </h1>

      {loading ? (
        <p className="text-center text-blue-200" role="status">Loading...</p>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-12 text-center" role="alert">
          <p className="text-blue-200 text-lg mb-2">Couldn&apos;t load your ships</p>
          <p className="text-gray-500 text-sm mb-4">{error}</p>
          <button
            onClick={refetch}
            aria-label="Retry loading your ships"
            className="px-4 py-2 text-sm text-cyan-400 border border-[#1C598C] rounded-lg hover:bg-cyan-400/10 transition-colors"
          >
            Retry
          </button>
        </div>
      ) : ships.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-blue-200 text-lg mb-2">You haven&apos;t uploaded any ships yet</p>
          <p className="text-gray-500 text-sm mb-5">Upload a blueprint to share it with the fleet.</p>
          <Link
            href="/upload"
            className="px-4 py-2 text-sm font-semibold text-cyan-300 border border-cyan-500/60 rounded-lg bg-cyan-400/10 hover:bg-cyan-400/20 transition-colors"
          >
            Upload a ship
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <p className="text-blue-200">
              {filtered.length === ships.length
                ? `You have uploaded ${ships.length} ship${ships.length !== 1 ? "s" : ""}`
                : `${filtered.length} of ${ships.length} ships`}
            </p>
            <div className="flex items-center gap-2">
              <label htmlFor="my-ships-filter" className="sr-only">Filter ships by name or author</label>
              <input
                id="my-ships-filter"
                type="search"
                placeholder="Filter by name or author…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setVisible(PAGE);
                }}
                className="bg-[#06121f] border border-[#1C598C] rounded-md px-3 py-1.5 text-sm text-cyan-100 outline-none focus:border-cyan-400 w-52"
              />
              <label htmlFor="my-ships-sort" className="sr-only">Sort ships</label>
              <select
                id="my-ships-sort"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="bg-[#06121f] border border-[#1C598C] rounded-md px-2 py-1.5 text-sm text-cyan-100 outline-none focus:border-cyan-400"
              >
                <option value="new">Newest first</option>
                <option value="name">Name A–Z</option>
                <option value="price">Highest price</option>
                <option value="downloads">Most downloads</option>
                <option value="favorites">Most favorited</option>
              </select>
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="text-center text-blue-200 py-10">No ships match that filter.</p>
          ) : (
            <>
              <ShipGrid ships={shown} />
              {visible < filtered.length && (
                <div className="flex justify-center mt-6">
                  <button
                    onClick={() => setVisible((v) => v + PAGE)}
                    aria-label={`Show more ships (${filtered.length - visible} remaining)`}
                    className="px-4 py-2 text-sm text-cyan-400 border border-[#1C598C] rounded-lg hover:bg-cyan-400/10 transition-colors"
                  >
                    Show more ({filtered.length - visible})
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}

export default function MyShipsPage() {
  return (
    <RequireAuth>
      <MyShipsContent />
    </RequireAuth>
  );
}
