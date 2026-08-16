"use client";

import { useCallback } from "react";
import type { Filters } from "@/hooks/useFilters";
import FilterSection from "./FilterSection";
import TagFilter from "./TagFilter";
import PriceFilter from "./PriceFilter";
import CrewFilter from "./CrewFilter";
import AuthorFilter from "./AuthorFilter";
import SortFilter from "./SortFilter";

interface FilterBodyProps {
  filters: Filters;
  setFilter: (key: string, value: string | string[]) => void;
  setFilters: (entries: [string, string | string[]][]) => void;
  clearFilters: () => void;
  showSort?: boolean;
  defaultSectionOpen?: boolean;
  facets?: FacetCounts;
}

export interface FacetCounts {
  authors: Array<{ author: string; count: number }>;
  tags: Array<{ tag: string; count: number }>;
  hasPrice: boolean;
  hasCrew: boolean;
}

const toCountMap = (items: Array<{ author: string; count: number }> | Array<{ tag: string; count: number }> | undefined) => {
  const m = new Map<string, number>();
  if (!items) return m;
  for (const item of items) {
    const key = "author" in item ? item.author : item.tag;
    m.set(key, Number(item.count));
  }
  return m;
};

function TagIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
    </svg>
  );
}
function PriceIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function CrewIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
function AuthorIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}
function SortIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
    </svg>
  );
}

function LibraryIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
    </svg>
  );
}

export default function FilterBody({ filters, setFilter, setFilters, clearFilters, showSort = false, defaultSectionOpen = true, facets }: FilterBodyProps) {
  const handleTagChange = useCallback(
    (tagsOn: string[], tagsOff: string[]) => {
      setFilters([["tag", tagsOn], ["notag", tagsOff]]);
    },
    [setFilters]
  );

  return (
    <div className="divide-y divide-[#1C598C]/15">
      {showSort && (
        <FilterSection title="Sort by" icon={<SortIcon />} defaultOpen={defaultSectionOpen}>
          <SortFilter
            value={filters.order}
            dir={filters.dir}
            onChange={v => setFilter("order", v)}
            onDirChange={v => setFilter("dir", v)}
          />
        </FilterSection>
      )}

      <FilterSection title="Tags" icon={<TagIcon />} badge={filters.tags.length + filters.notags.length} defaultOpen={defaultSectionOpen}>
        <TagFilter
          tagsOn={filters.tags}
          tagsOff={filters.notags}
          onChange={handleTagChange}
          counts={facets ? toCountMap(facets.tags) : undefined}
        />
      </FilterSection>

      <FilterSection title="Price" icon={<PriceIcon />} badge={(filters.minprice ? 1 : 0) + (filters.maxprice ? 1 : 0)} defaultOpen={defaultSectionOpen}>
        <PriceFilter
          min={filters.minprice}
          max={filters.maxprice}
          onChange={(min, max) => { setFilters([["minprice", min], ["maxprice", max]]); }}
        />
      </FilterSection>

      <FilterSection title="Crew" icon={<CrewIcon />} badge={filters.maxCrew ? 1 : 0} defaultOpen={defaultSectionOpen}>
        <CrewFilter maxCrew={filters.maxCrew} onChange={v => setFilter("max-crew", v)} />
      </FilterSection>

      <FilterSection title="Author" icon={<AuthorIcon />} badge={filters.author ? 1 : 0} defaultOpen={defaultSectionOpen}>
        <AuthorFilter value={filters.author} onChange={v => setFilter("author", v)} counts={facets ? toCountMap(facets.authors) : undefined} />
      </FilterSection>

      <FilterSection title="Library" icon={<LibraryIcon />} badge={filters.brand ? 1 : 0} defaultOpen={defaultSectionOpen}>
        <div className="flex gap-1.5 flex-wrap">
          {(["", "gen", "exl"] as const).map((val) => {
            const label = val === "" ? "All" : val === "gen" ? "Casual" : "Excelsior";
            const isActive = (filters.brand || "") === val;
            return (
              <button
                key={val}
                type="button"
                onClick={() => setFilter("brand", val)}
                aria-label={`${label} ships`}
                aria-pressed={isActive}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  isActive
                    ? val === "exl"
                      ? "bg-yellow-500/20 text-yellow-300 border border-yellow-500/40"
                      : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                    : "text-gray-400 border border-[#1C598C]/40 hover:text-white hover:border-cyan-400/20"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </FilterSection>

      <div className="pt-3">
        <button
          type="button"
          onClick={clearFilters}
          className="w-full py-2 rounded-lg text-[13px] font-medium text-gray-500 border border-[#1C598C]/30 hover:text-red-300 hover:border-red-400/30 hover:bg-red-400/5 transition-all"
        >
          Clear all filters
        </button>
      </div>
    </div>
  );
}
