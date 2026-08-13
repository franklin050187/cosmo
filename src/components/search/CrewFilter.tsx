"use client";

interface CrewFilterProps {
  maxCrew: string;
  onChange: (val: string) => void;
}

const PRESETS = [
  { label: "Any", value: "" },
  { label: "≤25", value: "25" },
  { label: "≤50", value: "50" },
  { label: "≤100", value: "100" },
  { label: "≤250", value: "250" },
  { label: "≤500", value: "500" },
];

export default function CrewFilter({ maxCrew, onChange }: CrewFilterProps) {
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {PRESETS.map(p => (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange(p.value)}
            aria-pressed={maxCrew === p.value}
            aria-label={`Max crew ${p.label}`}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
              maxCrew === p.value
                ? "bg-cyan-400/20 text-cyan-300 border border-cyan-400/40"
                : "bg-[#061220] text-gray-400 border border-[#1C598C]/40 hover:text-gray-200 hover:border-[#1C598C]"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <input
        type="number"
        value={maxCrew}
        onChange={e => onChange(e.target.value)}
        placeholder="Custom max crew..."
        aria-label="Custom maximum crew size"
        min={0}
        max={1000}
        className="w-full px-3 py-1.5 bg-[#061220] border border-[#1C598C]/50 rounded-md text-white text-[12px] placeholder:text-gray-700 focus:outline-none focus:border-cyan-400/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
    </div>
  );
}
