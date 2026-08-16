"use client";

import { useState, useCallback } from "react";
import { TAG_CATEGORIES, ALL_USER_TAG_VALUES } from "@/lib/user-tag-data";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  value: string[];
  onChange: (tags: string[]) => void;
  brand?: string;
  onBrandChange?: (brand: string) => void;
}

export default function UserTagEditor({ value, onChange, brand, onBrandChange }: Props) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    () => Object.fromEntries(TAG_CATEGORIES.map((c) => [c.id, false]))
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [freeForm, setFreeForm] = useState<string[]>([]);
  const [freeText, setFreeText] = useState("");
  const { user } = useAuth();
  const isExcelsiorMember = user?.guild === "exl";

  const combinedValue = [...new Set([...value, ...freeForm])];
  const emit = useCallback(
    (nextValue: string[]) => {
      const nextFree = nextValue.filter((t) => !ALL_USER_TAG_VALUES.has(t));
      setFreeForm(nextFree);
      onChange(nextValue.filter((t) => ALL_USER_TAG_VALUES.has(t)));
    },
    [onChange]
  );

  const toggle = useCallback(
    (v: string, type: "radio" | "checkbox", group?: string) => {
      if (type === "radio") {
        const siblings = TAG_CATEGORIES.find((c) => c.id === group)?.options.map((o) => o.value) ?? [];
        const withoutSiblings = value.filter((t) => !siblings.includes(t) && !freeForm.includes(t));
        const next = value.includes(v) ? withoutSiblings : [...withoutSiblings, v];
        onChange(next);
      } else {
        onChange(value.includes(v) ? value.filter((t) => t !== v) : [...value, v]);
      }
    },
    [value, freeForm, onChange]
  );

  const addFreeTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed || combinedValue.includes(trimmed)) return;
    emit([...combinedValue, trimmed]);
    setFreeText("");
  };

  const removeFreeTag = (tag: string) => emit(combinedValue.filter((t) => t !== tag));

  const selectedCount = (categoryId: string) => {
    const cat = TAG_CATEGORIES.find((c) => c.id === categoryId);
    if (!cat) return 0;
    return cat.options.filter((o) => value.includes(o.value)).length;
  };

  const matchingCategories = searchTerm
    ? TAG_CATEGORIES.filter((c) =>
        c.options.some((o) => o.label.toLowerCase().includes(searchTerm.toLowerCase()) || o.value.includes(searchTerm))
      )
    : TAG_CATEGORIES;

  return (
    <div className="space-y-3">
      <p className="text-blue-200 text-sm mb-2">
        Add classification tags to help others find your ship.
      </p>

      {/* Search filters the predefined tags below */}
      <input
        type="search"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder="Filter tags…"
        className="w-full px-3 py-2 text-sm text-white bg-[#021526] border border-[#1C598C]/40 rounded-md focus:outline-none focus:ring-1 focus:ring-cyan-400"
      />

      {/* Free-form custom tags */}
      <div>
        <label className="block text-blue-200 text-xs mb-1">Custom tags</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {freeForm.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              {t}
              <button
                type="button"
                onClick={() => removeFreeTag(t)}
                aria-label={`Remove tag ${t}`}
                className="hover:text-cyan-200"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addFreeTag(freeText);
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addFreeTag(freeText);
              }
            }}
            placeholder="Type a custom tag and press Enter"
            className="flex-1 px-3 py-2 text-sm text-white bg-[#021526] border border-[#1C598C]/40 rounded-md focus:outline-none focus:ring-1 focus:ring-cyan-400"
          />
          <button
            type="submit"
            onClick={() => addFreeTag(freeText)}
            className="px-3 py-1.5 text-xs font-medium text-cyan-300 border border-cyan-400/30 rounded-md hover:bg-cyan-400/10"
          >
            Add
          </button>
        </form>
      </div>

      {/* Desktop: 2-column grid */}
      <div className="hidden sm:grid sm:grid-cols-2 gap-3">
        {matchingCategories.map((cat) => (
          <TagSection
            key={cat.id}
            category={cat}
            value={value}
            searchTerm={searchTerm}
            onToggle={toggle}
          />
        ))}
      </div>

      {/* Excelsior toggle — visible on both desktop (below grid) and mobile */}
      {isExcelsiorMember && onBrandChange && (
        <button
          type="button"
          onClick={() => onBrandChange(brand === "exl" ? "gen" : "exl")}
          aria-pressed={brand === "exl"}
          aria-label="Toggle Excelsior Library design mark"
          className={`hidden sm:flex items-center gap-3 w-full px-4 py-3 rounded-lg border transition-colors ${
            brand === "exl"
              ? "bg-yellow-900/20 text-yellow-300 border-yellow-600/40"
              : "bg-[#0a1e33]/80 text-blue-200 border-[#1C598C]/30 hover:border-[#1C598C]/60"
          }`}
        >
          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
            brand === "exl"
              ? "border-yellow-400 bg-yellow-400/20"
              : "border-blue-400/40"
          }`}>
            {brand === "exl" && (
              <svg className="w-3 h-3 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <div className="text-left">
            <p className="text-sm font-medium">Excelsior Library</p>
            <p className="text-xs opacity-60">Marks ship as Excelsior design</p>
          </div>
        </button>
      )}

      {/* Mobile: collapsible sections */}
      <div className="sm:hidden space-y-2">
        {matchingCategories.map((cat) => {
          const count = selectedCount(cat.id);
          const isOpen = openSections[cat.id];
          return (
            <div
              key={cat.id}
              className="border border-[#1C598C]/40 rounded-lg overflow-hidden"
            >
              <button
                type="button"
                onClick={() =>
                  setOpenSections((prev) => ({
                    ...prev,
                    [cat.id]: !prev[cat.id],
                  }))
                }
                aria-expanded={isOpen}
                aria-controls={`tag-section-${cat.id}`}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-[#0a1e33]/80 text-left"
              >
                <span className="text-blue-200 text-sm font-medium">
                  {cat.label}
                  {cat.options.length === 0 && searchTerm && <span className="ml-1 text-xs opacity-60">(no matches)</span>}
                </span>
                <div className="flex items-center gap-2">
                  {count > 0 && (
                    <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-1.5 py-0.5 rounded-full">
                      {count}
                    </span>
                  )}
                  <svg
                    className={`w-4 h-4 text-blue-300 transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </button>
              {isOpen && (
                <div id={`tag-section-${cat.id}`} className="px-3 py-3 bg-[#021526]/60">
                  <TagSection
                    category={cat}
                    value={value}
                    searchTerm={searchTerm}
                    onToggle={toggle}
                  />
                </div>
              )}
            </div>
          );
        })}
        {isExcelsiorMember && onBrandChange && (
          <div className="border border-[#1C598C]/40 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => onBrandChange(brand === "exl" ? "gen" : "exl")}
              aria-pressed={brand === "exl"}
              aria-label="Toggle Excelsior Library design mark"
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                brand === "exl"
                  ? "bg-yellow-900/20 text-yellow-300"
                  : "bg-[#0a1e33]/80 text-blue-200"
              }`}
            >
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                brand === "exl"
                  ? "border-yellow-400 bg-yellow-400/20"
                  : "border-blue-400/40"
              }`}>
                {brand === "exl" && (
                  <svg className="w-3 h-3 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <div>
                <p className="text-sm font-medium">Excelsior Library</p>
                <p className="text-xs opacity-60">Marks ship as Excelsior design</p>
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TagSection({
  category,
  value,
  searchTerm = "",
  onToggle,
}: {
  category: (typeof TAG_CATEGORIES)[number];
  value: string[];
  searchTerm?: string;
  onToggle: (v: string, type: "radio" | "checkbox", group?: string) => void;
}) {
  const term = searchTerm.toLowerCase();
  const options = term
    ? category.options.filter(
        (opt) =>
          opt.label.toLowerCase().includes(term) || opt.value.includes(term)
      )
    : category.options;

  return (
    <div className="border border-[#1C598C]/30 rounded-lg bg-[#0a1e33]/50 p-3">
      <p className="text-blue-300/80 text-xs font-medium uppercase tracking-wider mb-2">
        {category.label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const selected = value.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onToggle(opt.value, category.type, category.id)}
              aria-pressed={selected}
              aria-label={`${opt.label} tag`}
              className={`
                inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all
                ${
                  selected
                    ? category.type === "radio"
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_8px_rgba(0,200,255,0.15)]"
                      : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_8px_rgba(0,200,255,0.15)]"
                    : "bg-[#021526]/80 text-blue-200/60 border border-[#1C598C]/30 hover:border-[#1C598C]/60 hover:text-blue-200"
                }
              `}
            >
              {category.type === "radio" ? (
                <span
                  className={`w-3 h-3 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    selected
                      ? "border-cyan-400 bg-cyan-400/30"
                      : "border-blue-400/40"
                  }`}
                >
                  {selected && (
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  )}
                </span>
              ) : (
                <span
                  className={`w-3 h-3 rounded border-2 flex items-center justify-center shrink-0 ${
                    selected
                      ? "border-cyan-400 bg-cyan-400/30"
                      : "border-blue-400/40"
                  }`}
                >
                  {selected && (
                    <svg
                      className="w-2.5 h-2.5 text-cyan-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </span>
              )}
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
