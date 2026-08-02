"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import SearchBar from "@/components/search/SearchBar";
import FilterBody from "@/components/search/FilterBody";
import ActiveFilters from "@/components/search/ActiveFilters";
import ShipGrid from "@/components/ship/ShipGrid";
import { useFilters } from "@/hooks/useFilters";
import { type ShipRow } from "@/lib/db";

const FilterDrawer = dynamic(() => import("@/components/search/FilterDrawer"), { ssr: false });

interface HomeContentProps {
  initialShips: ShipRow[];
  initialTotalCount: number;
  initialMaxPage: number;
}

export default function HomeContent({ initialShips, initialTotalCount, initialMaxPage }: HomeContentProps) {
  const { filters, setFilter, setFilters, clearFilters, activeCount, toQueryString } = useFilters();
  const [ships, setShips] = useState<ShipRow[]>(initialShips);
  const [loading, setLoading] = useState(false);
  const [maxPage, setMaxPage] = useState(initialMaxPage);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [totalResults, setTotalResults] = useState(initialTotalCount);
  const isInitialMount = useRef(true);

  const fetchShips = useCallback(async (queryString: string, pageNum: number, signal?: AbortSignal) => {
    try {
      const params = new URLSearchParams(queryString);
      params.set("page", pageNum.toString());
      if (!params.has("order")) params.set("order", "new");

      const res = await fetch(`/api/ship/search?${params.toString()}`, { signal });
      if (res.ok) {
        const data = await res.json();
        setShips(data.data ?? []);
        setMaxPage(data.max_page ?? 1);
        setTotalResults(data.total_count ?? data.data?.length ?? 0);
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      console.error("Failed to fetch ships:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const abortController = new AbortController();
    setLoading(true);
    fetchShips(toQueryString(), filters.page, abortController.signal);
    return () => abortController.abort();
  }, [filters, fetchShips, toQueryString]);

  const handleQueryChange = useCallback((q: string) => {
    setFilter("q", q);
  }, [setFilter]);

  const sortLabels: Record<string, string> = { new: "Newest", pop: "Most Popular", fav: "Most Favorited" };

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* ── Desktop sidebar ──────────────────────────────── */}
      <aside className="hidden lg:block w-64 shrink-0">
        <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto scrollbar-themed">
          <div className="bg-[#021526]/70 backdrop-blur border border-[#1C598C]/40 rounded-xl p-4">
            <h2 className="text-white font-semibold text-sm uppercase tracking-wide mb-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Filters
              {activeCount > 0 && (
                <span className="bg-cyan-400/20 text-cyan-300 text-[10px] px-1.5 py-0.5 rounded-full">
                  {activeCount}
                </span>
              )}
            </h2>
            <FilterBody
              filters={filters}
              setFilter={setFilter}
              setFilters={setFilters}
              clearFilters={clearFilters}
              showSort
            />
          </div>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────── */}
      <main className="flex-1 min-w-0">
        {/* Search bar */}
        <div className="mb-4">
          <SearchBar
            query={filters.q}
            onQueryChange={handleQueryChange}
            onFilterOpen={() => setDrawerOpen(true)}
            activeFilterCount={activeCount}
          />
        </div>

        {/* Active filter chips */}
        {activeCount > 0 && (
          <div className="mb-4">
            <ActiveFilters
              filters={filters}
              setFilter={setFilter}
              setFilters={setFilters}
              clearFilters={clearFilters}
            />
          </div>
        )}

        {/* Results header */}
        <div className="flex items-center justify-between mb-4 px-1">
          <div className="flex items-center gap-3">
            <p className="text-sm text-blue-200">
              {loading ? (
                "Loading..."
              ) : totalResults > 0 ? (
                <>
                  <span className="text-white font-semibold">{ships.length.toLocaleString()}</span>
                  {" "}of{" "}
                  <span className="text-white font-semibold">{totalResults.toLocaleString("en-US")}</span>
                  {" "}ship{totalResults !== 1 ? "s" : ""}
                </>
              ) : (
                <>
                  <span className="text-white font-semibold">{ships.length.toLocaleString()}</span>
                  {" "}ship{ships.length !== 1 ? "s" : ""}
                </>
              )}
            </p>
          </div>

          {/* Sort chips — mobile: inline, desktop: hidden (in sidebar) */}
          <div className="flex items-center gap-1.5 lg:hidden">
            {(["new", "pop", "fav"] as const).map((o) => (
              <button
                key={o}
                onClick={() => setFilter("order", o)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  filters.order === o
                    ? "bg-cyan-400/20 text-cyan-300 border border-cyan-400/40"
                    : "text-gray-400 border border-[#1C598C]/40 hover:text-white hover:border-cyan-400/20"
                }`}
              >
                {o === "new" ? "New" : o === "pop" ? "Popular" : "Favorited"}
              </button>
            ))}
          </div>

          {/* Sort label — desktop: show current sort */}
          <span className="hidden lg:inline text-xs text-gray-500">
            {sortLabels[filters.order] ?? "Newest"}
          </span>
        </div>

        {/* Ship grid or loading */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
              <p className="text-sm text-blue-200">Loading ships...</p>
            </div>
          </div>
        ) : ships.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <svg className="w-16 h-16 text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="text-blue-200 text-lg mb-2">No ships found</p>
            <p className="text-gray-500 text-sm mb-4">Try adjusting your filters or search terms</p>
            <button
              onClick={clearFilters}
              className="px-4 py-2 text-sm text-cyan-400 border border-[#1C598C] rounded-lg hover:bg-cyan-400/10 transition-colors"
            >
              Clear all filters
            </button>
          </div>
        ) : (
          <ShipGrid ships={ships} />
        )}

        {/* Pagination */}
        {maxPage > 1 && (
          <div className="flex items-center justify-center gap-1.5 mt-8 flex-wrap">
            {filters.page > 1 && (
              <button
                onClick={() => setFilter("page", (filters.page - 1).toString())}
                aria-label="Previous page"
                className="px-3 py-2 border border-[#1C598C] rounded-lg text-cyan-400 hover:bg-cyan-400/20 hover:text-white transition-colors text-sm"
              >
                &laquo;
              </button>
            )}
            {Array.from({ length: Math.min(maxPage, 7) }, (_, i) => {
              let p: number;
              if (maxPage <= 7) {
                p = i + 1;
              } else if (filters.page <= 4) {
                p = i + 1;
              } else if (filters.page >= maxPage - 3) {
                p = maxPage - 6 + i;
              } else {
                p = filters.page - 3 + i;
              }
              return (
                <button
                  key={p}
                  onClick={() => setFilter("page", p.toString())}
                  className={`w-9 h-9 rounded-lg transition-colors text-sm ${
                    p === filters.page
                      ? "bg-cyan-400/20 text-white font-bold border border-cyan-400/40"
                      : "text-cyan-400 border border-[#1C598C] hover:bg-cyan-400/20 hover:text-white"
                  }`}
                >
                  {p}
                </button>
              );
            })}
            {filters.page < maxPage && (
              <button
                onClick={() => setFilter("page", (filters.page + 1).toString())}
                aria-label="Next page"
                className="px-3 py-2 border border-[#1C598C] rounded-lg text-cyan-400 hover:bg-cyan-400/20 hover:text-white transition-colors text-sm"
              >
                &raquo;
              </button>
            )}
          </div>
        )}
      </main>

      {/* ── Mobile filter drawer ─────────────────────────── */}
      <FilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        filters={filters}
        setFilter={setFilter}
        setFilters={setFilters}
        clearFilters={clearFilters}
        activeCount={activeCount}
        resultCount={ships.length}
      />
    </div>
  );
}
