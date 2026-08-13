"use client";

import { useRef, useEffect, useState } from "react";
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

export default function ShipReconstruction({ stats, parts }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const yieldToMain = () => new Promise<void>((r) => setTimeout(r, 0));
    const DRAW_CHUNK = 400;

    async function render() {
      const canvas = canvasRef.current;
      if (!canvas) return;

      setRendering(true);

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
      const scale = SIZE / side;
      const offsetX = SIZE / 2 - centerX * scale;
      const offsetY = SIZE / 2 - centerY * scale;

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

      const loadPromises = orderedParts.map((p) => loadSprite(p.ID).catch(() => null));
      const sprites = await Promise.all(loadPromises);

      if (cancelled) return;

      for (let i = 0; i < orderedParts.length; i++) {
        const part = orderedParts[i];
        const sprite = sprites[i];
        if (!sprite) continue;

        const p = partPhysics[part.ID];
        if (!p) continue;

        let xCoord = part.Location[0];
        let yCoord = part.Location[1];

        [xCoord, yCoord] = spritePosition(part, [xCoord, yCoord]);

        const sx = toX(xCoord);
        const sy = toY(yCoord);

        const spriteW = (sprite.naturalWidth / 4) / SPRITE_REF_PX * scale;
        const spriteH = (sprite.naturalHeight / 4) / SPRITE_REF_PX * scale;

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
          ctx.drawImage(sprite, -spriteH / 2, -spriteW / 2, spriteH, spriteW);
        } else {
          ctx.drawImage(sprite, -spriteW / 2, -spriteH / 2, spriteW, spriteH);
        }

        ctx.restore();

        if (i > 0 && i % DRAW_CHUNK === 0) {
          await yieldToMain();
          if (cancelled) return;
        }
      }

      const comX = toX(stats.centerX);
      const comY = toY(stats.centerY);

      const tractorParts = parts.filter(
        (p) => p.ID === "cosmoteer.tractor_beam_emitter"
      );
      if (tractorParts.length > 0) {
        const tbCom = centerOfMass(tractorParts);
        const tbX = toX(tbCom.x);
        const tbY = toY(tbCom.y);
        ctx.fillStyle = "#ff0000";
        ctx.beginPath();
        ctx.arc(tbX, tbY, 6, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = "#00ff00";
      ctx.beginPath();
      ctx.arc(comX, comY, 8, 0, Math.PI * 2);
      ctx.fill();

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

      if (!cancelled) setRendering(false);
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [stats, parts]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="w-full h-auto border border-[#1C598C] rounded"
      />
      {rendering && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#021526]/70 rounded" role="status" aria-label="Generating ship image">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-blue-200 text-sm">Generating ship image…</p>
          </div>
        </div>
      )}
    </div>
  );
}
