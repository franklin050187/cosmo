"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { centerOfMass, type ShipStats } from "@/lib/physics";
import { partPhysics } from "@/lib/physics-data";

interface Part {
  ID: string;
  Location: [number, number];
  Rotation: number;
  FlipX?: number;
}

interface Props {
  stats: ShipStats;
  parts: Part[];
}

interface Overlays {
  com: boolean;
  thrust: boolean;
  tractor: boolean;
}

const UP_TURRET_PARTS = new Set([
  "cosmoteer.laser_blaster_small",
  "cosmoteer.laser_blaster_large",
  "cosmoteer.disruptor",
  "cosmoteer.ion_beam_emitter",
  "cosmoteer.ion_beam_prism",
  "cosmoteer.point_defense",
  "cosmoteer.cannon_med",
  "cosmoteer.cannon_large",
  "cosmoteer.cannon_deck",
  "cosmoteer.missile_launcher",
  "cosmoteer.railgun_launcher",
  "cosmoteer.flak_cannon_large",
  "cosmoteer.shield_gen_small",
  "cosmoteer.chaingun",
  "cosmoteer.resonance_beam_turret",
]);

const DOWN_TURRET_PARTS = new Set([
  "cosmoteer.thruster_small",
  "cosmoteer.thruster_med",
  "cosmoteer.thruster_large",
  "cosmoteer.thruster_huge",
  "cosmoteer.thruster_boost",
]);

function spritePosition(part: Part, pos: [number, number]): [number, number] {
  const p = partPhysics[part.ID];
  if (!p || !p.spriteSize) return pos;
  const [px, py] = pos;

  if (part.Rotation === 0 && UP_TURRET_PARTS.has(part.ID)) {
    return [px, py - (p.spriteSize[1] - p.size[1])];
  }
  if (part.Rotation === 3 && UP_TURRET_PARTS.has(part.ID)) {
    return [px - (p.spriteSize[1] - p.size[1]), py];
  }
  if (part.Rotation === 1 && DOWN_TURRET_PARTS.has(part.ID)) {
    return [px - (p.spriteSize[1] - p.size[1]), py];
  }
  if (part.Rotation === 2 && DOWN_TURRET_PARTS.has(part.ID)) {
    return [px, py - (p.spriteSize[1] - p.size[1])];
  }

  if (part.ID === "cosmoteer.thruster_small_2way") {
    if (part.Rotation === 1) return [px - 1, py];
    if (part.Rotation === 2) return [px - 1, py - 1];
    if (part.Rotation === 3) return [px, py - 1];
  }
  if (part.ID === "cosmoteer.thruster_small_3way") {
    if (part.Rotation === 0) return [px - 1, py];
    if (part.Rotation === 1) return [px - 1, py - 1];
    if (part.Rotation === 2) return [px - 1, py - 1];
    if (part.Rotation === 3) return [px, py - 1];
  }

  return pos;
}

const spriteCache = new Map<string, HTMLImageElement>();

function loadSprite(partId: string): Promise<HTMLImageElement> {
  const name = partId.replace("cosmoteer.", "");
  const cached = spriteCache.get(name);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      spriteCache.set(name, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error(`Failed to load sprite: ${name}`));
    img.src = `/sprites/${name}.png`;
  });
}

function getRotatedSize(partId: string, rotation: number): [number, number] {
  const p = partPhysics[partId];
  if (!p) return [1, 1];
  if (rotation === 1 || rotation === 3) return [p.size[1], p.size[0]];
  return [p.size[0], p.size[1]];
}

const ZOOM_STEP = 1.25;

export default function ShipReconstruction({ stats, parts }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [rendering, setRendering] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [overlays, setOverlays] = useState<Overlays>({ com: true, thrust: true, tractor: true });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  const zoomBy = useCallback((factor: number) => {
    setZoom((z) => Math.min(16, Math.max(0.25, z * factor)));
  }, []);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
  }, [pan]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    setPan({ x: drag.panX + dx, y: drag.panY + dy });
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const onWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    setZoom((z) => Math.min(16, Math.max(0.25, z * factor)));
  }, []);

  useEffect(() => {
    let cancelled = false;

    const yieldToMain = () => new Promise<void>((r) => setTimeout(r, 0));
    const DRAW_CHUNK = 400;

    async function render() {
      const canvas = canvasRef.current;
      if (!canvas) return;

      setRendering(true);
      setProgress(0);
      setRenderError(null);

      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;

      for (const part of parts) {
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

      const PADDING = 8;
      minX -= PADDING;
      minY -= PADDING;
      maxX += PADDING;
      maxY += PADDING;

      const rangeX = maxX - minX;
      const rangeY = maxY - minY;
      const side = Math.max(rangeX, rangeY);
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      const SIZE = 512;
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext("2d")!;

      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, SIZE, SIZE);

      const SPRITE_REF_PX = 16;
      const baseScale = SIZE / side;
      const scale = baseScale * zoom;
      const offsetX = SIZE / 2 - centerX * baseScale + pan.x;
      const offsetY = SIZE / 2 - centerY * baseScale + pan.y;

      const toX = (cellX: number) => cellX * scale + offsetX;
      const toY = (cellY: number) => cellY * scale + offsetY;

      const orderedParts = [...parts];
      const reorder = ["cannon_deck", "ion_beam_prism", "resonance_beam_turret"];
      for (let i = orderedParts.length - 1; i >= 0; i--) {
        const suffix = orderedParts[i].ID.replace("cosmoteer.", "");
        if (reorder.includes(suffix)) {
          orderedParts.push(orderedParts.splice(i, 1)[0]);
        }
      }

      const loadResults = await Promise.all(
        orderedParts.map((p) => loadSprite(p.ID).then((img) => ({ img, ok: true as const })).catch(() => ({ img: null, ok: false as const })))
      );
      const failed = loadResults.filter((r) => !r.ok).length;

      if (cancelled) return;

      if (failed > 0) {
        setRenderError(`${failed} sprite${failed > 1 ? "s" : ""} could not be loaded.`);
      }

      for (let i = 0; i < orderedParts.length; i++) {
        const part = orderedParts[i];
        const result = loadResults[i];
        if (!result.ok || !result.img) continue;

        const p = partPhysics[part.ID];
        if (!p) continue;

        let xCoord = part.Location[0];
        let yCoord = part.Location[1];

        [xCoord, yCoord] = spritePosition(part, [xCoord, yCoord]);

        const sx = toX(xCoord);
        const sy = toY(yCoord);

        const spriteW = (result.img.naturalWidth / 4) / SPRITE_REF_PX * scale;
        const spriteH = (result.img.naturalHeight / 4) / SPRITE_REF_PX * scale;

        const rotation = part.Rotation ?? 0;
        const hasSpriteSize = !!p.spriteSize;

        ctx.save();

        if (hasSpriteSize) {
          ctx.translate(sx + spriteW / 2, sy + spriteH / 2);
        } else {
          const [rw, rh] = getRotatedSize(part.ID, rotation);
          ctx.translate(toX(xCoord + rw / 2), toY(yCoord + rh / 2));
        }

        ctx.rotate((rotation * Math.PI) / 2);

        if (part.FlipX) {
          ctx.scale(-1, 1);
        }

        if (hasSpriteSize && (rotation === 1 || rotation === 3)) {
          ctx.drawImage(result.img, -spriteH / 2, -spriteW / 2, spriteH, spriteW);
        } else {
          ctx.drawImage(result.img, -spriteW / 2, -spriteH / 2, spriteW, spriteH);
        }

        ctx.restore();

        if (i > 0 && i % DRAW_CHUNK === 0) {
          setProgress(Math.round(((i + 1) / orderedParts.length) * 100));
          await yieldToMain();
          if (cancelled) return;
        }
      }

      if (overlays.com) {
        const comX = toX(stats.centerX);
        const comY = toY(stats.centerY);
        ctx.fillStyle = "#00ff00";
        ctx.beginPath();
        ctx.arc(comX, comY, Math.max(4, 8 * zoom), 0, Math.PI * 2);
        ctx.fill();
      }

      if (overlays.tractor) {
        const tractorParts = parts.filter(
          (p) => p.ID === "cosmoteer.tractor_beam_emitter"
        );
        if (tractorParts.length > 0) {
          const tbCom = centerOfMass(tractorParts);
          const tbX = toX(tbCom.x);
          const tbY = toY(tbCom.y);
          ctx.fillStyle = "#ff0000";
          ctx.beginPath();
          ctx.arc(tbX, tbY, Math.max(4, 6 * zoom), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (overlays.thrust) {
        const arrowLen = 35;
        const drawArrow = (
          ox: number,
          oy: number,
          dx: number,
          dy: number,
          color: string
        ) => {
          const startX = toX(ox);
          const startY = toY(oy);
          const endX = toX(ox + dx * arrowLen);
          const endY = toY(oy + dy * arrowLen);

          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(endX, endY);
          ctx.stroke();

          const angle = Math.atan2(endY - startY, endX - startX);
          const headLen = 8;
          ctx.beginPath();
          ctx.moveTo(endX, endY);
          ctx.lineTo(
            endX - headLen * Math.cos(angle - Math.PI / 6),
            endY - headLen * Math.sin(angle - Math.PI / 6)
          );
          ctx.moveTo(endX, endY);
          ctx.lineTo(
            endX - headLen * Math.cos(angle + Math.PI / 6),
            endY - headLen * Math.sin(angle + Math.PI / 6)
          );
          ctx.stroke();

          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(startX, startY, 3, 0, Math.PI * 2);
          ctx.fill();
        };

        const totalThrust = stats.thrustDirection.reduce((a, b) => a + b, 0) || 1;

        for (let i = 0; i < 8; i++) {
          const origin = stats.originThrust[i];
          if (!origin) continue;
          if (stats.thrustDirection[i] === 0) continue;

          const dx = (stats.thrustVector[i].x - origin.x) / totalThrust;
          const dy = (stats.thrustVector[i].y - origin.y) / totalThrust;
          drawArrow(origin.x, origin.y, dx, dy, i === 7 ? "#00c800" : "#ffff00");
        }
      }

      setProgress(100);
      if (!cancelled) setRendering(false);
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [stats, parts, overlays, zoom, pan]);

  return (
    <div ref={wrapRef} className="relative">
      <canvas
        ref={canvasRef}
        className="w-full h-auto border border-[#1C598C] rounded cursor-grab active:cursor-grabbing touch-none"
        aria-label="Ship reconstruction"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      />

      <div className="flex items-center gap-1 absolute top-2 right-2">
        <button
          type="button"
          onClick={() => zoomBy(ZOOM_STEP)}
          aria-label="Zoom in"
          className="w-7 h-7 rounded bg-[#021526]/85 border border-[#1C598C]/60 text-cyan-300 hover:bg-cyan-400/15 transition-colors text-sm"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => zoomBy(1 / ZOOM_STEP)}
          aria-label="Zoom out"
          className="w-7 h-7 rounded bg-[#021526]/85 border border-[#1C598C]/60 text-cyan-300 hover:bg-cyan-400/15 transition-colors text-sm"
        >
          −
        </button>
        <button
          type="button"
          onClick={resetView}
          aria-label="Reset zoom"
          className="w-7 h-7 rounded bg-[#021526]/85 border border-[#1C598C]/60 text-cyan-300 hover:bg-cyan-400/15 transition-colors text-[10px] font-semibold"
        >
          1:1
        </button>
      </div>

      <div className="flex items-center gap-3 mt-2 flex-wrap">
        <span className="text-[11px] text-gray-400">Overlays:</span>
        {([
          ["com", "Center of mass"],
          ["thrust", "Thrust"],
          ["tractor", "Tractor CoM"],
        ] as [keyof Overlays, string][]).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setOverlays((o) => ({ ...o, [key]: !o[key] }))}
            aria-pressed={overlays[key]}
            className={`px-2 py-0.5 rounded text-[11px] border transition-colors ${
              overlays[key]
                ? "border-cyan-400 bg-cyan-400/15 text-cyan-300"
                : "border-[#1C598C]/50 text-gray-400 hover:text-cyan-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {rendering && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#021526]/70 rounded" role="status" aria-label="Generating ship image">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-blue-200 text-sm">
              {progress !== null ? `Generating ship image… ${progress}%` : "Generating ship image…"}
            </p>
          </div>
        </div>
      )}
      {!rendering && renderError && (
        <p className="text-amber-300 text-xs mt-2" role="status">
          {renderError}
        </p>
      )}
    </div>
  );
}