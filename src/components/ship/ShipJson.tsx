"use client";

import { useEffect, useState } from "react";
import { useShipDecode } from "@/hooks/useShipDecode";
import { stringifyChunked } from "@/lib/serializers";
import type { DecodedShip } from "@/hooks/useShipDecode";

interface Props {
  imageUrl: string;
}

export default function ShipJson({ imageUrl }: Props) {
  const { decoded, loading, error } = useShipDecode(imageUrl);
  const [result, setResult] = useState<{ decoded: DecodedShip; json: string } | null>(null);

  useEffect(() => {
    if (!decoded) return;
    let cancelled = false;

    (async () => {
      const json = await stringifyChunked(decoded);
      if (cancelled) return;
      setResult({ decoded, json });
    })();

    return () => {
      cancelled = true;
    };
  }, [decoded]);

  const json = result && result.decoded === decoded ? result.json : null;
  const serializing = decoded !== null && json === null;

  if (loading) {
    return (
      <div className="flex items-center gap-3 mt-2" role="status" aria-label="Decoding ship blueprint">
        <div className="h-4 w-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-blue-200 text-sm">Decoding ship blueprint...</p>
      </div>
    );
  }

  if (error) {
    return <p className="text-red-400 mt-2" role="alert">{error}</p>;
  }

  if (serializing) {
    return (
      <div className="flex items-center gap-3 mt-2" role="status" aria-label="Preparing JSON">
        <div className="h-4 w-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-blue-200 text-sm">Preparing JSON...</p>
      </div>
    );
  }

  if (!json) return null;

  return (
    <pre className="mt-2 p-2 bg-black/50 rounded text-xs text-green-400 overflow-auto max-h-96 border border-[#1C598C]">
      {json}
    </pre>
  );
}
