"use client";

import { useRef, useEffect, useState } from "react";

interface FilterSectionProps {
  title: string;
  icon?: React.ReactNode;
  badge?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export default function FilterSection({ title, icon, badge = 0, defaultOpen = true, children }: FilterSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = `filter-section-${title.toLowerCase().replace(/\s+/g, "-")}`;
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">(defaultOpen ? "auto" : 0);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    if (open) {
      setHeight(el.scrollHeight);
      const timer = setTimeout(() => setHeight("auto"), 200);
      return () => clearTimeout(timer);
    } else {
      setHeight(el.scrollHeight);
      requestAnimationFrame(() => setHeight(0));
    }
  }, [open]);

  return (
    <div className="py-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={contentId}
        className="w-full flex items-center gap-2.5 text-left group"
      >
        {icon && (
          <span className="text-cyan-400/70 group-hover:text-cyan-400 transition-colors shrink-0">
            {icon}
          </span>
        )}
        <span className="flex-1 text-[13px] font-semibold text-blue-100/90 group-hover:text-white transition-colors">
          {title}
        </span>
        {badge > 0 && (
          <span className="bg-cyan-400/20 text-cyan-300 text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
            {badge}
          </span>
        )}
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform duration-200 shrink-0 ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        id={contentId}
        ref={contentRef}
        className="overflow-hidden transition-[max-height,opacity] duration-200 ease-out"
        style={{ maxHeight: height === "auto" ? "none" : `${height}px`, opacity: open ? 1 : 0 }}
        hidden={!open}
        aria-hidden={!open}
      >
        <div className="pt-2.5 pr-1">
          {children}
        </div>
      </div>
    </div>
  );
}
