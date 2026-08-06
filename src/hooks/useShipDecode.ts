"use client";

import { useState, useEffect, useRef } from "react";
import { Ship } from "@/lib/cosmoShip";

export interface DecodedShip {
  Parts: {
    ID: string;
    Location: [number, number];
    Rotation: number;
    FlipX?: number;
  }[];
  Doors?: { ID: string }[];
  FlightDirection: number;
  PartUIToggleStates?: Array<{
    Key: [{ ID: string; Location: [number, number] }, string];
    Value: number;
  }>;
  NewFlexResourceGridTypes?: Array<{ Value: string }>;
  [key: string]: unknown;
}

const MAX_CACHE_SIZE = 50;
const cache = new Map<string, DecodedShip>();
const inflight = new Map<string, Promise<DecodedShip>>();

function evictCache() {
  if (cache.size <= MAX_CACHE_SIZE) return;
  const oldest = cache.keys().next().value;
  if (oldest !== undefined) cache.delete(oldest);
}

export function useShipDecode(imageUrl: string) {
  const [decoded, setDecoded] = useState<DecodedShip | null>(() => {
    return cache.get(imageUrl) ?? null;
  });
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef(imageUrl);

  useEffect(() => {
    if (imageUrl !== urlRef.current) {
      urlRef.current = imageUrl;
      setDecoded(cache.get(imageUrl) ?? null);
      setError(null);
    }
  }, [imageUrl]);

  useEffect(() => {
    if (decoded || error) return;

    let active = true;

    let promise = inflight.get(imageUrl);
    if (!promise) {
      promise = (async () => {
        const res = await fetch(imageUrl);
        if (!res.ok) throw new Error("Failed to fetch ship image");
        const blob = await res.blob();
        const ship = await Ship.fromSource(blob);
        const result = ship.data as DecodedShip;
        evictCache();
        cache.set(imageUrl, result);
        return result;
      })();
      inflight.set(imageUrl, promise);
      promise.finally(() => {
        inflight.delete(imageUrl);
      });
    }

    promise
      .then((result) => {
        if (active) setDecoded(result);
      })
      .catch((err) => {
        console.error("Decode error:", err);
        if (active) setError("Failed to decode ship data from image.");
      });

    return () => {
      active = false;
    };
  }, [imageUrl, decoded, error]);

  const loading = !decoded && !error;

  return { decoded, loading, error };
}
