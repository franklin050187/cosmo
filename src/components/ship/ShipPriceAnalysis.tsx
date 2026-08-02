"use client";

import { useRef, useEffect, useMemo } from "react";
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

  ctx.fillStyle = "#ffffff";
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

  ctx.fillStyle = "rgb(230, 216, 173)";
  ctx.strokeStyle = "rgb(128, 128, 128)";
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
    ctx.fillStyle = "rgb(255, 0, 0)";
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();

    const labelR = radius + 24;
    const lx = cx + labelR * Math.cos(i * ANGLE - Math.PI / 2);
    const ly = cy + labelR * Math.sin(i * ANGLE - Math.PI / 2);
    const pct = total > 0 ? ((values[i] / total) * 100).toFixed(1) : "0.0";
    const label = `${CATEGORY_LABELS[i]}: ${values[i].toLocaleString()} | ${pct}%`;

    ctx.fillStyle = "#000000";
    ctx.font = "13px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, lx, ly);
  }

  ctx.fillStyle = "#000000";
  ctx.font = "bold 16px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`Price Analysis — Total cost: ${total.toLocaleString()}`, cx, 30);
}

export default function ShipPriceAnalysis({ decoded }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analysis = useMemo(() => priceAnalysis(decoded), [decoded]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawRadarChart(canvas, analysis.categories, analysis.total);
  }, [analysis]);

  return (
    <div className="flex flex-col md:flex-row gap-6">
      <div className="flex-shrink-0 md:w-[420px] flex items-start justify-center">
        <canvas
          ref={canvasRef}
          className="w-full h-auto border border-[#1C598C] rounded"
        />
      </div>
      <div className="flex-1 min-w-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-blue-200 border-b border-[#1C598C]">
              <th className="text-left py-1">Category</th>
              <th className="text-right py-1">Price</th>
              <th className="text-right py-1">%</th>
            </tr>
          </thead>
          <tbody>
            {CATEGORY_LABELS.map((cat) => {
              const d = analysis.categories[cat];
              if (!d || d.price === 0) return null;
              return (
                <tr key={cat} className="border-b border-[#1C598C]/30 text-white">
                  <td className="py-1">{cat}</td>
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
              <td className="py-1">Total</td>
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
