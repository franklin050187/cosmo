"use client";

import type { ShipStats } from "@/lib/physics";

const DIR_ORDER = ["NW", "N", "NE", "E", "SE", "S", "SW", "W"];

const DIR_LABELS: Record<string, string> = {
  N: "North (Up)",
  NE: "North-East",
  E: "East (Right)",
  SE: "South-East",
  S: "South (Down)",
  SW: "South-West",
  W: "West (Left)",
  NW: "North-West",
};

interface Props {
  stats: ShipStats;
}

export default function ShipStatsPanel({ stats }: Props) {
  const fwdDir = DIR_ORDER[stats.flightDirection] ?? "N";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="space-y-2">
        <StatRow label="Mass" value={stats.mass.toFixed(2)} />
        <StatRow label="Top Speed" value={stats.topSpeed.toFixed(2)} />
        <StatRow
          label="Center of Mass"
          value={`(${stats.centerX.toFixed(2)}, ${stats.centerY.toFixed(2)})`}
        />
        <StatRow
          label="Flight Direction"
          value={`${fwdDir} \u2014 ${DIR_LABELS[fwdDir] ?? fwdDir}`}
        />
      </div>

      <div>
        <p className="text-blue-200 text-sm mb-1">Speed &amp; Thrust by Direction</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-blue-200 border-b border-[#1C598C]">
              <th className="text-left py-1">Direction</th>
              <th className="text-right py-1">Thrust</th>
              <th className="text-right py-1">Speed</th>
            </tr>
          </thead>
          <tbody>
            {DIR_ORDER.map((dir) => {
              const d = stats.directions[dir];
              if (!d) return null;
              const isFwd = dir === fwdDir;
              return (
                <tr
                  key={dir}
                  className={`border-b border-[#1C598C]/30 ${
                    isFwd ? "text-cyan-300 font-bold" : "text-white"
                  }`}
                >
                  <td className="py-1">
                    {dir}
                    {isFwd && (
                      <span className="ml-1 text-[#0AD448] text-xs">(forward)</span>
                    )}
                  </td>
                  <td className="text-right py-1 text-[#0AD448]">
                    {Math.round(d.thrust).toLocaleString()}
                  </td>
                  <td className="text-right py-1 text-cyan-400">
                    {d.speed.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-white">
      <span className="text-blue-200">{label}:</span>{" "}
      <span className="text-cyan-400">{value}</span>
    </p>
  );
}
