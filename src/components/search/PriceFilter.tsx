"use client";

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

export default function PriceFilter({ min, max, onChange }: PriceFilterProps) {
  const isActive = (p: typeof PRESETS[number]) => min === p.min && max === p.max;

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {PRESETS.map(p => (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange(p.min, p.max)}
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
            value={min}
            onChange={e => onChange(e.target.value, max)}
            placeholder="Min"
            min={0}
            className="w-full pl-5 pr-2 py-1.5 bg-[#061220] border border-[#1C598C]/50 rounded-md text-white text-[12px] placeholder:text-gray-700 focus:outline-none focus:border-cyan-400/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
        <span className="text-gray-700 text-xs">&ndash;</span>
        <div className="relative flex-1">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600 text-[11px]">$</span>
          <input
            type="number"
            value={max}
            onChange={e => onChange(min, e.target.value)}
            placeholder="Max"
            min={0}
            className="w-full pl-5 pr-2 py-1.5 bg-[#061220] border border-[#1C598C]/50 rounded-md text-white text-[12px] placeholder:text-gray-700 focus:outline-none focus:border-cyan-400/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
      </div>
    </div>
  );
}
