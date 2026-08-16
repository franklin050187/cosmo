"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import SearchBar from "@/components/search/SearchBar";
import FilterBody from "@/components/search/FilterBody";
import ActiveFilters from "@/components/search/ActiveFilters";
import ShipGrid from "@/components/ship/ShipGrid";
import ShipGridSkeleton from "@/components/ship/ShipGridSkeleton";
import { useFilters } from "@/hooks/useFilters";
import { type ShipRow } from "@/lib/db";
import type { FacetCounts } from "@/components/search/FilterBody";

const FilterDrawer = dynamic(() => import("@/components/search/FilterDrawer"), { ssr: false });

const SIBLINGS = 1;

// Builds a page-number list with ellipsis (null) markers for middle gaps.
// e.g. current=6, max=20 -> [1, null, 5,6,7, 8,9,10, 19,20] style.
function buildPageRange(current: number, max: number): (number | null)[] {
  if (max <= 7) return Array.from({ length: max }, (_, i) => i + 1);

  const startBlocks: number[] = [1];
  const endBlocks: number[] = [max - 1, max];
  const windowStart = Math.max(1, current - SIBLINGS);
  const windowEnd = Math.min(max, current + SIBLINGS);
  const middleStart = Math.max(2, windowStart);
  const middleEnd = Math.min(max - 1, windowEnd);

  const pages: (number | null)[] = [];
  const pushBlock = (arr: number[]) => {
    if (arr.length === 0) return;
    if (pages.length && pages[pages.length - 1] !== null) pages.push(null);
    pages.push(...arr);
  };

  pushBlock(startBlocks.slice());
  // middle window
  const middle: number[] = [];
  for (let p = middleStart; p <= middleEnd; p++) middle.push(p);
  pushBlock(middle);
  pushBlock(endBlocks.slice());
  return pages;
}


interface HomeContentProps {
  initialShips: ShipRow[];
  initialTotalCount: number;
  initialMaxPage: number;
  initialAuthorCounts?: Array<{ author: string; count: number }>;
  initialTagCounts?: Array<{ tag: string; count: number }>;
  initialHasPrice?: boolean;
  initialHasCrew?: boolean;
}

export default function HomeContent({ initialShips, initialTotalCount, initialMaxPage, initialAuthorCounts, initialTagCounts, initialHasPrice, initialHasCrew }: HomeContentProps) {
  const { filters, setFilter, setFilters, clearFilters, activeCount, toQueryString } = useFilters();
  const [ships, setShips] = useState<ShipRow[]>(initialShips);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maxPage, setMaxPage] = useState(initialMaxPage);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [totalResults, setTotalResults] = useState(initialTotalCount);
  const [facets, setFacets] = useState<FacetCounts>({
    authors: initialAuthorCounts ?? [],
    tags: initialTagCounts ?? [],
    hasPrice: initialHasPrice ?? false,
    hasCrew: initialHasCrew ?? false,
  });
  const isInitialMount = useRef(true);
  const prevPage = useRef(filters.page);

  useEffect(() => {
    if (prevPage.current !== filters.page) {
      prevPage.current = filters.page;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [filters.page]);

  const fetchShips = useCallback(async (queryString: string, pageNum: number, signal?: AbortSignal) => {
    setError(null);
    try {
      const params = new URLSearchParams(queryString);
      params.set("page", pageNum.toString());
      if (!params.has("order")) params.set("order", "new");

      const res = await fetch(`/api/ship/search?${params.toString()}`, { signal });
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      const json = await res.json();
      const payload = json.data ?? {};
      setShips(payload.data ?? []);
      setMaxPage(payload.max_page ?? 1);
      setTotalResults(payload.total_count ?? payload.data?.length ?? 0);
      setFacets({
        authors: payload.author_counts ?? [],
        tags: payload.tag_counts ?? [],
        hasPrice: payload.has_price ?? false,
        hasCrew: payload.has_crew ?? false,
      });
      if (payload.page != null && payload.page !== pageNum) {
        setFilter("page", payload.page.toString());
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      console.error("Failed to fetch ships:", err);
      setError((err as Error)?.message || "Failed to load ships.");
    } finally {
      setLoading(false);
    }
  }, [setFilter]);

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
              facets={facets}
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
            <p className="text-sm text-blue-200" aria-live="polite" aria-busy={loading}>
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
            {!loading && maxPage > 1 && (
              <span className="text-xs text-gray-500">
                Page {filters.page} of {maxPage}
              </span>
            )}
          </div>

          {/* Sort chips — mobile: inline, desktop: hidden (in sidebar) */}
          <div className="flex items-center gap-1.5 lg:hidden">
            {(["new", "pop", "fav"] as const).map((o) => (
              <button
                key={o}
                onClick={() => setFilter("order", o)}
                aria-pressed={filters.order === o}
                aria-label={`Sort by ${sortLabels[o] ?? o}`}
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

        {/* Ship grid: error / skeleton / empty / results */}
        {error ? (
          <div className="flex flex-col items-center justify-center py-20 text-center" role="alert">
            <svg className="w-16 h-16 text-red-400/70 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-blue-200 text-lg mb-2">Couldn&apos;t load ships</p>
            <p className="text-gray-500 text-sm mb-4">{error}</p>
            <button
              onClick={() => {
                setLoading(true);
                fetchShips(toQueryString(), filters.page);
              }}
              aria-label="Retry loading ships"
              className="px-4 py-2 text-sm text-cyan-400 border border-[#1C598C] rounded-lg hover:bg-cyan-400/10 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : loading && ships.length === 0 ? (
          <ShipGridSkeleton />
        ) : ships.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <svg className="w-16 h-16 text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="text-blue-200 text-lg mb-2">No ships found</p>
            <p className="text-gray-500 text-sm mb-4">Try adjusting your filters or search terms</p>
            <button
              onClick={clearFilters}
              aria-label="Clear all filters"
              className="px-4 py-2 text-sm text-cyan-400 border border-[#1C598C] rounded-lg hover:bg-cyan-400/10 transition-colors"
            >
              Clear all filters
            </button>
          </div>
        ) : (
          <div aria-busy={loading} className={loading ? "opacity-50 transition-opacity duration-200" : "transition-opacity duration-200"}>
            <ShipGrid ships={ships} />
          </div>
        )}

        {/* Pagination */}
         {maxPage > 1 && (
           <nav className="flex items-center justify-center mt-8" aria-label="Pagination">
            <ul className="flex items-center gap-1 flex-wrap justify-center">
              {filters.page > 1 && (
                <li>
                  <button
                    onClick={() => setFilter("page", (filters.page - 1).toString())}
                    aria-label="Previous page"
                    className="px-3 py-2 border border-[#1C598C] rounded-lg text-cyan-400 hover:bg-cyan-400/20 hover:text-white transition-colors text-sm"
                  >
                    &laquo;
                  </button>
                </li>
              )}
              {buildPageRange(filters.page, maxPage).map((p, i) =>
                p === null ? (
                  <li key={`e-${i}`} aria-hidden="true">
                    <span className="px-1.5 py-2 text-gray-500 text-sm">…</span>
                  </li>
                ) : (
                  <li key={p}>
                    <button
                      onClick={() => setFilter("page", p.toString())}
                      aria-label={`Page ${p}`}
                      aria-current={p === filters.page ? "page" : undefined}
                      className={`w-9 h-9 rounded-lg transition-colors text-sm ${
                        p === filters.page
                          ? "bg-cyan-400/20 text-white font-bold border border-cyan-400/40"
                          : "text-cyan-400 border border-[#1C598C] hover:bg-cyan-400/20 hover:text-white"
                      }`}
                    >
                      {p}
                    </button>
                  </li>
                )
              )}
              {filters.page < maxPage && (
                <li>
                  <button
                    onClick={() => setFilter("page", (filters.page + 1).toString())}
                    aria-label="Next page"
                    className="px-3 py-2 border border-[#1C598C] rounded-lg text-cyan-400 hover:bg-cyan-400/20 hover:text-white transition-colors text-sm"
                  >
                    &raquo;
                  </button>
                </li>
              )}
            </ul>
          </nav>
         )}
      </main>

      {/* ── Mobile filter drawer ─────────────────────────── */}
      <FilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        filters={filters}
        setFilters={setFilters}
        activeCount={activeCount}
        resultCount={ships.length}
        facets={facets}
      />
    </div>
  );
}
