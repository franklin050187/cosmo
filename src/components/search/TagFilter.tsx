"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useDropdown } from "@/hooks/useDropdown";

interface TagOption { tag: string; count: number; }

interface TagFilterProps {
  tagsOn: string[];
  tagsOff: string[];
  onChange: (tagsOn: string[], tagsOff: string[]) => void;
}

export default function TagFilter({ tagsOn, tagsOff, onChange }: TagFilterProps) {
  const [input, setInput] = useState("");
  const [options, setOptions] = useState<TagOption[]>([]);
  const { wrapRef, showDD, setShowDD, ddPos, highlight, setHighlight } = useDropdown();

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/ship/tags", { signal: controller.signal })
      .then(r => r.json())
      .then((d: { data: TagOption[] }) => setOptions(d.data ?? []))
      .catch((e) => { if ((e as Error).name !== "AbortError") console.error("Failed to fetch tags:", e); });
    return () => controller.abort();
  }, []);

  const selected = new Set([...tagsOn, ...tagsOff]);
  const filtered = input
    ? options.filter(o => o.tag.toLowerCase().includes(input.toLowerCase()) && !selected.has(o.tag))
    : options.filter(o => !selected.has(o.tag));

  const matches = filtered.slice(0, 10);

  const add = useCallback((tag: string, excl: boolean) => {
    if (excl) {
      onChange(tagsOn, [...tagsOff, tag]);
    } else {
      onChange([...tagsOn, tag], tagsOff);
    }
    setInput("");
    setShowDD(false);
    setHighlight(-1);
  }, [tagsOn, tagsOff, onChange, setShowDD, setHighlight]);

  const remove = useCallback((tag: string) => {
    onChange(tagsOn.filter(t => t !== tag), tagsOff.filter(t => t !== tag));
  }, [tagsOn, tagsOff, onChange]);

  const toggle = useCallback((tag: string) => {
    if (tagsOn.includes(tag)) { onChange(tagsOn.filter(t => t !== tag), [...tagsOff, tag]); }
    else if (tagsOff.includes(tag)) { onChange([...tagsOn, tag], tagsOff.filter(t => t !== tag)); }
  }, [tagsOn, tagsOff, onChange]);

  const onKey = (e: React.KeyboardEvent) => {
    if (!showDD) return;
    if (e.key === "Enter") {
      e.preventDefault();
      if (highlight >= 0 && highlight < matches.length) add(matches[highlight].tag, false);
      else if (input.startsWith("-")) add(input.slice(1).trim(), true);
      else if (input.trim()) add(input.trim(), false);
    } else if (e.key === "ArrowDown") { e.preventDefault(); setHighlight(i => Math.min(i + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight(i => Math.max(i - 1, -1)); }
    else if (e.key === "Escape") { setShowDD(false); (e.currentTarget as HTMLInputElement).blur(); }
  };

  const dropdown = showDD && matches.length > 0 ? createPortal(
    <div
      className="fixed z-[9999] bg-[#0a1a2e] border border-[#1C598C]/60 rounded-lg shadow-xl shadow-black/40 max-h-48 overflow-y-auto overscroll-contain scrollbar-themed"
      style={{ top: ddPos.top, left: ddPos.left, width: ddPos.width }}
    >
      {!input && (
        <div className="px-3 pt-2 pb-1 text-[10px] text-gray-600 uppercase tracking-wider font-medium">
          All tags ({options.length})
        </div>
      )}
      {matches.map((o, i) => (
        <button
          key={o.tag}
          type="button"
          onMouseDown={e => { e.preventDefault(); add(o.tag, false); }}
          className={`w-full text-left px-3 py-1.5 flex items-center justify-between gap-2 transition-colors ${
            i === highlight ? "bg-cyan-400/15 text-white" : "text-gray-300 hover:bg-cyan-400/8"
          }`}
        >
          <span className="text-[12px] truncate">{o.tag}</span>
          <span className="text-[10px] text-gray-600 tabular-nums shrink-0">{o.count}</span>
        </button>
      ))}
    </div>,
    document.body
  ) : null;

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
        </svg>
        <input
          type="text"
          value={input}
          onChange={e => { setInput(e.target.value); setShowDD(true); setHighlight(-1); }}
          onFocus={() => { setShowDD(true); setHighlight(-1); }}
          onKeyDown={onKey}
          placeholder='Search tags... prefix "-" to exclude'
          aria-label="Search tags. Prefix with dash to exclude."
          className="w-full pl-8 pr-3 py-2 bg-[#061220] border border-[#1C598C]/60 rounded-lg text-white text-[13px] placeholder:text-gray-600 focus:outline-none focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/20 transition-all"
        />
      </div>

      {dropdown}

      {(tagsOn.length > 0 || tagsOff.length > 0) && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {tagsOn.map(tag => (
            <span key={`on-${tag}`} className="inline-flex items-center gap-1 bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 text-[11px] font-medium px-2 py-0.5 rounded-md">
              {tag}
              <button onClick={() => toggle(tag)} aria-label={`Switch ${tag} to exclude`} className="min-w-[36px] min-h-[36px] flex items-center justify-center text-cyan-500/60 hover:text-cyan-300" title="Switch to exclude">
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </button>
              <button onClick={() => remove(tag)} aria-label={`Remove tag ${tag}`} className="min-w-[36px] min-h-[36px] flex items-center justify-center text-cyan-600/60 hover:text-white">&times;</button>
            </span>
          ))}
          {tagsOff.map(tag => (
            <span key={`off-${tag}`} className="inline-flex items-center gap-1 bg-red-500/10 text-red-300 border border-red-500/20 text-[11px] font-medium px-2 py-0.5 rounded-md line-through decoration-red-400/40">
              {tag}
              <button onClick={() => toggle(tag)} aria-label={`Switch ${tag} to include`} className="min-w-[36px] min-h-[36px] flex items-center justify-center text-red-500/60 hover:text-red-300 no-underline" title="Switch to include">
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
              </button>
              <button onClick={() => remove(tag)} aria-label={`Remove excluded tag ${tag}`} className="min-w-[36px] min-h-[36px] flex items-center justify-center text-red-600/60 hover:text-white no-underline">&times;</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
