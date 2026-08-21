"use client";

import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import { priceAnalysis } from "@/lib/price-analysis";
import type { DecodedShip } from "@/hooks/useShipDecode";

interface Props {
  decoded: DecodedShip;
}

const CATEGORY_LABELS = ["Shield", "Weapon", "Thrust", "Misc", "Crew", "Power", "Armor", "Storage"];
const NUM_CATEGORIES = CATEGORY_LABELS.length;
const ANGLE = (2 * Math.PI) / NUM_CATEGORIES;

function drawRadarChart(
  canvas: HTMLCanvasElement,
  categories: Record<string, { price: number; percent: number }>,
  total: number
) {
  const SIZE = 420;
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const radius = SIZE / 2 - 70;

  ctx.fillStyle = "#0a1a2b";
  ctx.fillRect(0, 0, SIZE, SIZE);

  const values = CATEGORY_LABELS.map((cat) => categories[cat]?.price ?? 0);
  const maxVal = Math.max(...values, 1);

  const dataPoints: [number, number][] = values.map((v, i) => {
    const norm = Math.max(v / maxVal, 0.05);
    return [
      cx + radius * norm * Math.cos(i * ANGLE - Math.PI / 2),
      cy + radius * norm * Math.sin(i * ANGLE - Math.PI / 2),
    ];
  });

  ctx.fillStyle = "rgba(11, 90, 150, 0.45)";
  ctx.strokeStyle = "rgb(28, 89, 140)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  dataPoints.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  for (let i = 0; i < NUM_CATEGORIES; i++) {
    const ex = cx + radius * Math.cos(i * ANGLE - Math.PI / 2);
    const ey = cy + radius * Math.sin(i * ANGLE - Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    const nx = cx + radius * Math.cos((i + 1) * ANGLE - Math.PI / 2);
    const ny = cy + radius * Math.sin((i + 1) * ANGLE - Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(nx, ny);
    ctx.stroke();
  }

  for (let i = 0; i < NUM_CATEGORIES; i++) {
    const norm = Math.max(values[i] / maxVal, 0.05);
    const px = cx + radius * norm * Math.cos(i * ANGLE - Math.PI / 2);
    const py = cy + radius * norm * Math.sin(i * ANGLE - Math.PI / 2);
    ctx.fillStyle = "rgb(10, 212, 72)";
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();

    const labelR = radius + 24;
    const lx = cx + labelR * Math.cos(i * ANGLE - Math.PI / 2);
    const ly = cy + labelR * Math.sin(i * ANGLE - Math.PI / 2);
    const pct = total > 0 ? ((values[i] / total) * 100).toFixed(1) : "0.0";
    const label = `${CATEGORY_LABELS[i]}: ${values[i].toLocaleString()} | ${pct}%`;

    ctx.fillStyle = "#8fd3ff";
    ctx.font = "13px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, lx, ly);
  }

  ctx.fillStyle = "#dbeafe";
  ctx.font = "bold 16px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`Price Analysis — Total cost: ${total.toLocaleString()}₡`, cx, 30);
}

export default function ShipPriceAnalysis({ decoded }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analysis = useMemo(() => priceAnalysis(decoded), [decoded]);
  const [readout, setReadout] = useState<{
    label: string;
    price: number;
    percent: number;
  } | null>(null);

  const nearestCategory = useCallback((x: number, y: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = x - cx;
    const dy = y - cy;
    if (Math.hypot(dx, dy) < 20) return null;
    const angle = (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
    const idx = Math.round(angle / ANGLE) % NUM_CATEGORIES;
    return CATEGORY_LABELS[idx];
  }, []);

  const handleMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const label = nearestCategory(e.clientX, e.clientY);
      if (!label) {
        setReadout(null);
        return;
      }
      const d = analysis.categories[label];
      setReadout(d ? { label, price: d.price, percent: d.percent * 100 } : null);
    },
    [analysis.categories, nearestCategory]
  );

  const downloadChart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "price-analysis.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawRadarChart(canvas, analysis.categories, analysis.total);
  }, [analysis]);

  return (
    <div className="flex flex-col md:flex-row gap-6">
      <div className="flex-shrink-0 md:w-[420px] flex items-start justify-center relative">
        <canvas
          ref={canvasRef}
          className="w-full h-auto border border-[#1C598C] rounded touch-none"
          onPointerMove={handleMove}
          onPointerLeave={() => setReadout(null)}
          aria-label="Price analysis radar chart"
        />
        {readout && (
          <div className="absolute bottom-2 left-2 px-3 py-1.5 rounded bg-black/80 border border-[#1C598C] text-xs text-white pointer-events-none" role="status">
            <span className="text-blue-200">{readout.label}:</span>{" "}
            <span className="text-[#0AD448]">{readout.price.toLocaleString()}₡</span>{" "}
            <span className="text-cyan-400">({readout.percent.toFixed(1)}%)</span>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <p className="text-blue-200 text-sm font-semibold">Price by Category</p>
          <button
            type="button"
            onClick={downloadChart}
            className="text-xs px-2 py-1 rounded border border-[#1C598C]/60 text-cyan-300 hover:bg-cyan-400/15 transition-colors"
          >
            ⬇ Download chart
          </button>
        </div>
        <table className="w-full text-sm">
          <caption className="sr-only">
            Price breakdown of the ship by category, in credits
          </caption>
          <thead>
            <tr className="text-blue-200 border-b border-[#1C598C]">
              <th scope="col" className="text-left py-1">Category</th>
              <th scope="col" className="text-right py-1">Price</th>
              <th scope="col" className="text-right py-1">%</th>
            </tr>
          </thead>
          <tbody>
            {CATEGORY_LABELS.map((cat) => {
              const d = analysis.categories[cat];
              if (!d || d.price === 0) return null;
              return (
                <tr key={cat} className="border-b border-[#1C598C]/30 text-white">
                  <th scope="row" className="text-left py-1 font-normal">{cat}</th>
                  <td className="text-right py-1 text-[#0AD448]">
                    {d.price.toLocaleString()}₡
                  </td>
                  <td className="text-right py-1 text-cyan-400">
                    {(d.percent * 100).toFixed(1)}%
                  </td>
                </tr>
              );
            })}
            <tr className="font-bold text-white border-t border-[#1C598C]">
              <th scope="row" className="text-left py-1">Total</th>
              <td className="text-right py-1 text-[#0AD448]">
                {analysis.total.toLocaleString()}₡
              </td>
              <td className="text-right py-1 text-cyan-400">100%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}