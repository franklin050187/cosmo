"use client";

import { useState, useRef, useEffect } from "react";

interface PriceFilterProps {
  min: string;
  max: string;
  onChange: (min: string, max: string) => void;
}

const PRESETS = [
  { label: "Any", min: "", max: "" },
  { label: "<$10K", min: "", max: "10000" },
  { label: "$10K–50K", min: "10000", max: "50000" },
  { label: "$50K–200K", min: "50000", max: "200000" },
  { label: "$200K–1.5M", min: "200000", max: "1500000" },
  { label: "≈$1.5M", min: "1400000", max: "1540000" },
  { label: "$1.5M+", min: "1500000", max: "" },
];

const COMMIT_MS = 400;

export default function PriceFilter({ min, max, onChange }: PriceFilterProps) {
  const [localMin, setLocalMin] = useState(min);
  const [localMax, setLocalMax] = useState(max);
  const [prev, setPrev] = useState<{ min: string; max: string }>({ min, max });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => clearTimeout(timer.current);
  }, []);

  if (prev.min !== min || prev.max !== max) {
    setPrev({ min, max });
    setLocalMin(min);
    setLocalMax(max);
  }

  const commit = (nextMin: string, nextMax: string) => {
    clearTimeout(timer.current);
    onChange(nextMin, nextMax);
  };

  const schedule = (nextMin: string, nextMax: string) => {
    setLocalMin(nextMin);
    setLocalMax(nextMax);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(nextMin, nextMax), COMMIT_MS);
  };

  const isActive = (p: typeof PRESETS[number]) => min === p.min && max === p.max;

  const invalid = localMin !== "" && localMax !== "" && Number(localMin) > Number(localMax);

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {PRESETS.map(p => (
          <button
            key={p.label}
            type="button"
            onClick={() => commit(p.min, p.max)}
            aria-pressed={isActive(p)}
            aria-label={`Price filter ${p.label}`}
            className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-all ${
              isActive(p)
                ? "bg-cyan-400/20 text-cyan-300 border border-cyan-400/40"
                : "bg-[#061220] text-gray-400 border border-[#1C598C]/40 hover:text-gray-200 hover:border-[#1C598C]"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600 text-[11px]">$</span>
          <input
            type="number"
            value={localMin}
            onChange={e => schedule(e.target.value, localMax)}
            onBlur={() => commit(localMin, localMax)}
            placeholder="Min"
            aria-label="Minimum price"
            aria-invalid={invalid || undefined}
            min={0}
            className="w-full pl-5 pr-2 py-1.5 bg-[#061220] border border-[#1C598C]/50 rounded-md text-white text-[12px] placeholder:text-gray-700 focus:outline-none focus:border-cyan-400/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
        <span className="text-gray-700 text-xs">&ndash;</span>
        <div className="relative flex-1">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600 text-[11px]">$</span>
          <input
            type="number"
            value={localMax}
            onChange={e => schedule(localMin, e.target.value)}
            onBlur={() => commit(localMin, localMax)}
            placeholder="Max"
            aria-label="Maximum price"
            aria-invalid={invalid || undefined}
            min={0}
            className="w-full pl-5 pr-2 py-1.5 bg-[#061220] border border-[#1C598C]/50 rounded-md text-white text-[12px] placeholder:text-gray-700 focus:outline-none focus:border-cyan-400/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
      </div>
      {invalid && (
        <p className="text-red-400 text-[11px] mt-1.5" role="alert">Min can&apos;t be greater than max.</p>
      )}
    </div>
  );
}
