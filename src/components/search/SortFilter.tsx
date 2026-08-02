"use client";

interface SortFilterProps {
  value: string;
  onChange: (val: string) => void;
}

const OPTIONS = [
  { value: "new", label: "Newest", icon: "🕐" },
  { value: "pop", label: "Popular", icon: "🔥" },
  { value: "fav", label: "Favorited", icon: "⭐" },
];

export default function SortFilter({ value, onChange }: SortFilterProps) {
  return (
    <div className="space-y-1">
      {OPTIONS.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all text-left ${
            value === opt.value
              ? "bg-cyan-400/10 text-cyan-300 border border-cyan-400/30"
              : "text-gray-400 hover:text-gray-200 hover:bg-white/[0.03] border border-transparent"
          }`}
        >
          <span className="text-sm">{opt.icon}</span>
          <span>{opt.label}</span>
          {value === opt.value && (
            <svg className="w-3.5 h-3.5 ml-auto text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          )}
        </button>
      ))}
    </div>
  );
}
