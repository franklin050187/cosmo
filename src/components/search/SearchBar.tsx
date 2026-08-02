"use client";

import { useState, useCallback, useEffect } from "react";

interface SearchBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  onFilterOpen: () => void;
  activeFilterCount: number;
}

export default function SearchBar({
  query,
  onQueryChange,
  onFilterOpen,
  activeFilterCount,
}: SearchBarProps) {
  const [input, setInput] = useState(query);

  useEffect(() => {
    setInput(query);
  }, [query]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onQueryChange(input);
  };

  const handleClear = useCallback(() => {
    setInput("");
    onQueryChange("");
  }, [onQueryChange]);

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <div className="relative flex-1">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search ships..."
          className="w-full pl-9 pr-8 py-2.5 bg-[#0a1e33] border border-[#1C598C] rounded-lg text-white text-sm placeholder:text-gray-500 focus:outline-none focus:border-cyan-400 transition-colors"
        />
        {input && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear search"
            className="absolute right-1 top-1/2 -translate-y-1/2 min-w-[32px] min-h-[32px] flex items-center justify-center text-gray-500 hover:text-white"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <button
        type="submit"
        aria-label="Submit search"
        className="p-2.5 bg-[#0a1e33] border border-[#1C598C] rounded-lg text-cyan-400 hover:bg-cyan-400/10 transition-colors md:hidden"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </button>

      <button
        type="button"
        onClick={onFilterOpen}
        aria-label={`Open filters${activeFilterCount > 0 ? `, ${activeFilterCount} active` : ""}`}
        className="relative p-2.5 bg-[#0a1e33] border border-[#1C598C] rounded-lg text-cyan-400 hover:bg-cyan-400/10 transition-colors lg:hidden"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
        {activeFilterCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-cyan-400 text-[#021526] text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
            {activeFilterCount}
          </span>
        )}
      </button>
    </form>
  );
}
