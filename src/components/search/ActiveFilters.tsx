"use client";

import type { Filters } from "@/hooks/useFilters";

interface ActiveFiltersProps {
  filters: Filters;
  setFilter: (key: string, value: string | string[]) => void;
  setFilters: (entries: [string, string | string[]][]) => void;
  clearFilters: () => void;
}

function formatPrice(val: string): string {
  const n = parseInt(val, 10);
  if (!n) return "";
  if (n >= 1_000_000) return `₡${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₡${(n / 1_000).toFixed(0)}K`;
  return `₡${n}`;
}

interface Chip { label: string; onRemove: () => void; kind?: "include" | "exclude" | "normal" }

export default function ActiveFilters({ filters, setFilter, setFilters, clearFilters }: ActiveFiltersProps) {
  const chips: Chip[] = [];

  if (filters.q) {
    chips.push({ label: `"${filters.q}"`, onRemove: () => setFilter("q", "") });
  }
  filters.tags.forEach(tag => {
    chips.push({ label: tag, kind: "include", onRemove: () => setFilter("tag", filters.tags.filter(t => t !== tag)) });
  });
  filters.notags.forEach(tag => {
    chips.push({ label: `-${tag}`, kind: "exclude", onRemove: () => setFilter("notag", filters.notags.filter(t => t !== tag)) });
  });
  if (filters.author) {
    chips.push({ label: `by ${filters.author}`, onRemove: () => setFilter("author", "") });
  }
  if (filters.minprice || filters.maxprice) {
    const min = filters.minprice ? formatPrice(filters.minprice) : "0";
    const max = filters.maxprice ? formatPrice(filters.maxprice) : "∞";
    chips.push({ label: `${min} – ${max}`, onRemove: () => { setFilters([["minprice", ""], ["maxprice", ""]]); } });
  }
  if (filters.maxCrew) {
    chips.push({ label: `Crew ≤ ${filters.maxCrew}`, onRemove: () => setFilter("max-crew", "") });
  }
  if (filters.brand === "exl") {
    chips.push({ label: "Excelsior", onRemove: () => setFilter("brand", "") });
  }
  if (filters.brand === "gen") {
    chips.push({ label: "Casual", onRemove: () => setFilter("brand", "") });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
      <div className="flex gap-1.5 flex-nowrap">
        {chips.map((chip, i) => (
          <span
            key={`${chip.label}-${i}`}
            className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md whitespace-nowrap transition-colors ${
              chip.kind === "exclude"
                ? "bg-red-500/10 text-red-300 border border-red-500/20"
                : chip.kind === "include"
                  ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20"
                  : "bg-white/5 text-gray-300 border border-white/10"
            }`}
          >
            {chip.label}
            <button onClick={chip.onRemove} aria-label={`Remove filter ${chip.label}`} className="ml-0.5 min-w-[36px] min-h-[36px] flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </span>
        ))}
      </div>
      {chips.length > 1 && (
        <button onClick={clearFilters} className="text-[11px] text-gray-500 hover:text-red-300 whitespace-nowrap transition-colors">
          Clear all
        </button>
      )}
    </div>
  );
}
