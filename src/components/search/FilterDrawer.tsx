"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Filters } from "@/hooks/useFilters";
import FilterBody from "./FilterBody";
import type { FacetCounts } from "./FilterBody";

interface FilterDrawerProps {
  open: boolean;
  onClose: () => void;
  filters: Filters;
  setFilters: (entries: [string, string | string[]][]) => void;
  activeCount: number;
  resultCount: number;
  facets?: FacetCounts;
}

const DRAFT_DEFAULTS: Pick<Filters, "q" | "author" | "tags" | "notags" | "minprice" | "maxprice" | "maxCrew" | "order" | "dir" | "brand"> = {
  q: "", author: "", tags: [], notags: [], minprice: "", maxprice: "", maxCrew: "",
  order: "new", dir: "", brand: "",
};

export default function FilterDrawer({
  open,
  onClose,
  filters,
  setFilters,
  activeCount,
  resultCount,
  facets,
}: FilterDrawerProps) {
  const [draft, setDraft] = useState<Filters>({ ...filters });
  const [isDirty, setIsDirty] = useState(false);

  const setDraftFilter = useCallback((key: string, value: string | string[]) => {
    setDraft((d) => {
      const next = { ...d, [key]: value };
      return next;
    });
    setIsDirty(true);
  }, []);

  const setDraftFilters = useCallback((entries: [string, string | string[]][]) => {
    setDraft((d) => {
      const next = { ...d };
      for (const [k, v] of entries) (next as Record<string, unknown>)[k] = v;
      return next;
    });
    setIsDirty(true);
  }, []);

  const clearDraft = useCallback(() => {
    setDraft((d) => ({ ...DRAFT_DEFAULTS, page: d.page, order: d.order }));
    setIsDirty(true);
  }, []);

  const commit = useCallback(() => {
    const entries: [string, string | string[]][] = [];
    const d = { ...draft };
    delete (d as Partial<Filters>).page;
    for (const key of ["q", "author", "minprice", "maxprice", "maxCrew", "order", "dir", "brand"] as const) {
      const val = d[key];
      entries.push([key, Array.isArray(val) ? val : String(val ?? "")]);
    }
    const tagEntries: [string, string[]][] = [];
    if (d.tags?.length) tagEntries.push(["tag", d.tags]);
    if (d.notags?.length) tagEntries.push(["notag", d.notags]);
    setFilters([...entries, ...tagEntries]);
    setIsDirty(false);
    onClose();
  }, [draft, setFilters, onClose]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const drawerRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (open && window.innerWidth < 1024) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      prevFocusRef.current = document.activeElement as HTMLElement | null;
      const drawer = drawerRef.current;
      if (drawer) {
        const first = drawer.querySelector<HTMLElement>(
          "a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex=\"-1\"])"
        );
        first?.focus();
      }
    } else if (prevFocusRef.current) {
      prevFocusRef.current.focus();
      prevFocusRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onCloseRef.current();
      if (e.key !== "Tab" || !open) return;
      const drawer = drawerRef.current;
      if (!drawer) return;
      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex=\"-1\"])"
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm lg:hidden"
          onClick={handleClose}
        />
      )}

      {open && (
       <div
         ref={drawerRef}
         role="dialog"
         aria-modal="true"
         aria-labelledby="filter-drawer-title"
         className="fixed inset-x-0 bottom-0 z-50 bg-[#021526] border-t border-[#1C598C] rounded-t-2xl lg:hidden max-h-[85vh]"
       >
         <div className="flex flex-col h-full max-h-[85vh]">
           <div className="flex items-center justify-between px-4 py-3 border-b border-[#1C598C]/30 shrink-0">
             <div className="flex items-center gap-2">
               <h2 id="filter-drawer-title" className="text-white font-semibold">Filters</h2>
               {activeCount > 0 && (
                 <span className="bg-cyan-400/20 text-cyan-300 text-xs px-2 py-0.5 rounded-full">
                   {activeCount}
                 </span>
               )}
             </div>
             <button onClick={handleClose} aria-label="Close filters" className="min-w-[40px] min-h-[40px] flex items-center justify-center text-gray-400 hover:text-white">
               <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                 <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
               </svg>
             </button>
           </div>

           <div className="flex-1 overflow-y-auto px-4 py-3 scrollbar-themed">
             <FilterBody
               filters={draft}
               setFilter={setDraftFilter}
               setFilters={setDraftFilters}
               clearFilters={clearDraft}
               showSort
               defaultSectionOpen={false}
               facets={facets}
             />
           </div>

           <div className="flex gap-2 px-4 py-3 border-t border-[#1C598C]/30 shrink-0">
             <button
               type="button"
               onClick={handleClose}
               className="flex-1 py-3 rounded-lg text-sm font-medium text-gray-400 border border-[#1C598C]/30 hover:text-white hover:border-cyan-400/30 transition-colors"
             >
               Cancel
             </button>
             <button
               type="button"
               onClick={commit}
               disabled={!isDirty}
               aria-label="Apply filters and show results"
               className="flex-1 py-3 rounded-lg text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
             >
               Show {resultCount} result{resultCount !== 1 ? "s" : ""}
             </button>
           </div>
         </div>
       </div>
      )}
    </>
  );
}
