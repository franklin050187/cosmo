"use client";

import { useEffect, useState } from "react";
import { useShipDecode } from "@/hooks/useShipDecode";
import { stringifyChunked } from "@/lib/serializers";

interface Props {
  imageUrl: string;
}

export default function ShipJson({ imageUrl }: Props) {
  const { decoded, loading, error } = useShipDecode(imageUrl);
  const [json, setJson] = useState<string | null>(null);
  const [serializing, setSerializing] = useState(false);

  useEffect(() => {
    if (!decoded) return;
    let cancelled = false;

    setSerializing(true);
    setJson(null);

    (async () => {
      const result = await stringifyChunked(decoded);
      if (cancelled) return;
      setJson(result);
      setSerializing(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [decoded]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 mt-2">
        <div className="h-4 w-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-blue-200 text-sm">Decoding ship blueprint...</p>
      </div>
    );
  }

  if (error) {
    return <p className="text-red-400 mt-2">{error}</p>;
  }

  if (serializing) {
    return (
      <div className="flex items-center gap-3 mt-2">
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
