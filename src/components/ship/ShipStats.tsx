"use client";

import { useState, useEffect } from "react";
import Card from "@/components/ui/Card";
import { useShipDecode } from "@/hooks/useShipDecode";
import { calculateShipStatsAsync } from "@/lib/physics";
import type { ShipStats as ShipStatsType } from "@/lib/physics";
import dynamic from "next/dynamic";

const ShipReconstruction = dynamic(() => import("./ShipReconstruction"), {
  ssr: false,
});
const ShipStatsPanel = dynamic(() => import("./ShipStatsPanel"), { ssr: false });

interface Props {
  imageUrl: string;
}

interface CachedStats {
  stats: ShipStatsType;
  parts: {
    ID: string;
    Location: [number, number];
    Rotation: number;
    FlipX?: number;
  }[];
}

const MAX_CACHE_SIZE = 50;
const statsCache = new Map<string, CachedStats>();

function evictCache() {
  if (statsCache.size <= MAX_CACHE_SIZE) return;
  const oldest = statsCache.keys().next().value;
  if (oldest !== undefined) statsCache.delete(oldest);
}

export default function ShipStats({ imageUrl }: Props) {
  const { decoded, loading, error: decodeError } = useShipDecode(imageUrl);

  const [cached, setCached] = useState<CachedStats | null>(() => {
    return statsCache.get(imageUrl) ?? null;
  });

  useEffect(() => {
    if (!decoded || cached) return;

    let active = true;

    (async () => {
      try {
        const stats = await calculateShipStatsAsync(decoded);
        const result: CachedStats = { stats, parts: decoded.Parts };
        evictCache();
        statsCache.set(imageUrl, result);
        if (active) setCached(result);
      } catch (err) {
        console.error("Stats error:", err);
      }
    })();

    return () => {
      active = false;
    };
  }, [decoded, cached, imageUrl]);

  if (loading || !cached) {
    return (
      <Card className="mt-6">
        <div className="flex items-center gap-3" role="status" aria-label="Analyzing ship">
          <div className="h-5 w-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-blue-200">Analyzing ship...</p>
        </div>
      </Card>
    );
  }

  if (decodeError) {
    return (
      <Card className="mt-6">
        <p className="text-red-400" role="alert">{decodeError}</p>
      </Card>
    );
  }

  if (!cached) return null;

  return (
    <Card className="mt-6">
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-shrink-0 w-full max-w-[512px] flex items-start justify-center">
          <ShipReconstruction stats={cached.stats} parts={cached.parts} />
        </div>
        <div className="flex-1 min-w-0">
          <ShipStatsPanel stats={cached.stats} />
        </div>
      </div>
    </Card>
  );
}
