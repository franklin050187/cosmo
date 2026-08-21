"use client";

import type { ShipStats } from "@/lib/physics";
import { partPhysics } from "@/lib/physics-data";

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

interface Part {
  ID: string;
  Location: [number, number];
  Rotation: number;
  FlipX?: number;
}

interface Props {
  stats: ShipStats;
  parts?: Part[];
}

function computeBounds(parts?: Part[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const part of parts ?? []) {
    const p = partPhysics[part.ID];
    const w = p ? p.size[0] : 1;
    const h = p ? p.size[1] : 1;
    const x = part.Location[0];
    const y = part.Location[1];
    if (x < minX) minX = x;
    if (x + w > maxX) maxX = x + w;
    if (y < minY) minY = y;
    if (h + y > maxY) maxY = y + h;
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return { minX, minY, maxX, maxY };
}

export default function ShipStatsPanel({ stats, parts }: Props) {
  const fwdDir = DIR_ORDER[stats.flightDirection] ?? "N";
  const bounds = computeBounds(parts);

  const normX = bounds.maxX > bounds.minX ? (stats.centerX - bounds.minX) / (bounds.maxX - bounds.minX) : 0.5;
  const normY = bounds.maxY > bounds.minY ? (stats.centerY - bounds.minY) / (bounds.maxY - bounds.minY) : 0.5;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="space-y-2">
        <StatRow label="Mass (t)" value={stats.mass.toFixed(2)} />
        <StatRow label="Top Speed (m/s)" value={stats.topSpeed.toFixed(2)} />
        <StatRow
          label="Center of Mass (cell)"
          value={`(${stats.centerX.toFixed(2)}, ${stats.centerY.toFixed(2)})`}
        />
        <StatRow
          label="Flight Direction"
          value={`${fwdDir} \u2014 ${DIR_LABELS[fwdDir] ?? fwdDir}`}
        />

        {parts && parts.length > 0 && (
          <div>
            <p className="text-blue-200 text-sm mb-1">Center of Mass</p>
            <div className="relative w-full max-w-[160px] aspect-square border border-[#1C598C]/60 rounded bg-black/40" role="img" aria-label="Center of mass position within the ship bounding box">
              <div
                className="absolute w-2 h-2 rounded-full bg-green-400 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${Math.min(96, Math.max(4, normX * 100))}%`, top: `${Math.min(96, Math.max(4, normY * 100))}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div>
        <p className="text-blue-200 text-sm mb-1">Speed &amp; Thrust by Direction</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-blue-200 border-b border-[#1C598C]">
              <th className="text-left py-1">Direction</th>
              <th className="text-right py-1">Thrust</th>
              <th className="text-right py-1">Speed (m/s)</th>
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
