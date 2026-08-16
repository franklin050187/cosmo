"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useDropdown } from "@/hooks/useDropdown";

interface AuthorOption { author: string; count: number; }

interface AuthorFilterProps {
  value: string;
  onChange: (val: string) => void;
  counts?: Map<string, number>;
}

export default function AuthorFilter({ value, onChange, counts }: AuthorFilterProps) {
  const [input, setInput] = useState(value);
  const [prevValue, setPrevValue] = useState(value);
  const [options, setOptions] = useState<AuthorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const { wrapRef, showDD, setShowDD, ddPos, highlight, setHighlight } = useDropdown();

  if (value !== prevValue) {
    setPrevValue(value);
    setInput(value);
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/ship/authors", { signal: controller.signal })
      .then(r => r.json())
      .then((d: { data: AuthorOption[] }) => setOptions(d.data ?? []))
      .catch((e) => { if ((e as Error).name !== "AbortError") console.error("Failed to fetch authors:", e); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const filtered = input
    ? options.filter(o => o.author.toLowerCase().includes(input.toLowerCase()))
    : options;

  const matches = filtered.slice(0, 10).map((o) => ({
    ...o,
    count: counts ? counts.get(o.author) ?? 0 : o.count,
    disabled: counts ? (counts.get(o.author) ?? 0) === 0 && o.author !== value : false,
  }));
  const LIST_ID = "author-filter-list";
  const activeId = highlight >= 0 && highlight < matches.length ? `${LIST_ID}-${matches[highlight].author}` : undefined;

  const select = useCallback((a: string) => {
    setInput(a); onChange(a); setShowDD(false); setHighlight(-1);
  }, [onChange, setShowDD, setHighlight]);

  const onKey = (e: React.KeyboardEvent) => {
    if (!showDD) return;
    if (e.key === "Enter") {
      e.preventDefault();
      if (highlight >= 0 && highlight < matches.length && !matches[highlight].disabled) {
        select(matches[highlight].author);
      } else if (input.trim()) {
        const firstEnabled = matches.findIndex(m => !m.disabled);
        if (firstEnabled >= 0) select(matches[firstEnabled].author);
        else select(input.trim());
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight(i => Math.min(i + 1, Math.max(matches.length - 1, -1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight(i => Math.max(i - 1, -1));
    } else if (e.key === "Escape") {
      setShowDD(false);
      (e.currentTarget as HTMLInputElement).blur();
    }
  };

  const loadingOptions = loading;

  const dropdown = showDD ? createPortal(
    <div
      id={LIST_ID}
      role="listbox"
      className="fixed z-[9999] bg-[#0a1a2e] border border-[#1C598C]/60 rounded-lg shadow-xl shadow-black/40 max-h-48 overflow-y-auto overscroll-contain scrollbar-themed"
      style={{ top: ddPos.top, left: ddPos.left, width: ddPos.width }}
    >
      {!input && (
        <div className="px-3 pt-2 pb-1 text-[10px] text-gray-600 uppercase tracking-wider font-medium">
          All authors ({options.length})
        </div>
      )}
      {loadingOptions ? (
        <div className="px-3 py-2 text-[12px] text-gray-500">Loading authors…</div>
      ) : matches.length === 0 ? (
        <div className="px-3 py-2 text-[12px] text-gray-500" role="option" aria-selected="false" aria-disabled="true">
          No matches
        </div>
      ) : (
        matches.map((m, i) => (
          <button
            key={m.author}
            id={`${LIST_ID}-${m.author}`}
            type="button"
            role="option"
            aria-selected={highlight === i}
            aria-disabled={m.disabled || undefined}
            aria-posinset={i + 1}
            aria-setsize={matches.length}
            onMouseEnter={() => setHighlight(i)}
            onMouseDown={e => {
              e.preventDefault();
              if (!m.disabled) select(m.author);
            }}
            className={`w-full text-left px-3 py-1.5 flex items-center justify-between gap-2 transition-colors ${
              m.disabled
                ? "cursor-not-allowed opacity-50 text-gray-600"
                : i === highlight
                  ? "bg-cyan-400/15 text-white"
                  : "text-gray-300 hover:bg-cyan-400/8"
            }`}
          >
            <span className="text-[12px] truncate">{m.author}</span>
            <span className="text-[10px] text-gray-600 tabular-nums shrink-0">{m.count}</span>
          </button>
        ))
      )}
    </div>,
    document.body
  ) : null;

  return (
    <div ref={wrapRef} role="combobox" aria-expanded={showDD} aria-haspopup="listbox"
      aria-controls={showDD ? LIST_ID : undefined} className="relative">
      <div className="relative">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        <input
          type="text"
          value={input}
          onChange={e => { setInput(e.target.value); setShowDD(true); setHighlight(-1); if (!e.target.value) onChange(""); }}
          onFocus={() => { setShowDD(true); setHighlight(-1); }}
          onKeyDown={onKey}
          placeholder="Search authors..."
          aria-label="Search authors"
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          autoComplete="off"
          className="w-full pl-8 pr-7 py-2 bg-[#061220] border border-[#1C598C]/60 rounded-lg text-white text-[13px] placeholder:text-gray-600 focus:outline-none focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/20 transition-all"
        />
        {input && (
          <button onClick={() => { setInput(""); onChange(""); }} aria-label="Clear author" className="absolute right-1 top-1/2 -translate-y-1/2 min-w-[32px] min-h-[32px] flex items-center justify-center text-gray-600 hover:text-gray-300">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        )}
      </div>
      {dropdown}
    </div>
  );
}
