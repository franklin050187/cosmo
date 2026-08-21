"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useShipDecode } from "@/hooks/useShipDecode";
import { stringifyChunked } from "@/lib/serializers";
import type { DecodedShip } from "@/hooks/useShipDecode";

interface Props {
  imageUrl: string;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ShipJson({ imageUrl }: Props) {
  const { decoded, loading, error } = useShipDecode(imageUrl);
  const [result, setResult] = useState<{ decoded: DecodedShip; json: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  const json = result && result.decoded === decoded ? result.json : null;
  const serializing = decoded !== null && json === null;

  const handleCopy = useCallback(async () => {
    if (!json) return;
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setCopyError(false);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopyError(true);
      timerRef.current = setTimeout(() => setCopyError(false), 2000);
    }
  }, [json]);

  const handleDownload = useCallback(() => {
    if (!json) return;
    downloadBlob(new Blob([json], { type: "application/json" }), "blueprint.json");
  }, [json]);

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
    <div className="mt-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm text-blue-200 font-medium">Raw blueprint (JSON)</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy ship JSON to clipboard"
            className="px-2 py-1 border border-[#1C598C] rounded text-xs text-cyan-400 hover:bg-cyan-400/10 transition-colors"
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            aria-label="Download ship JSON file"
            className="px-2 py-1 border border-[#1C598C] rounded text-xs text-cyan-400 hover:bg-cyan-400/10 transition-colors"
          >
            ↓ Download
          </button>
        </div>
      </div>
      {copyError && (
        <p className="text-red-400 text-xs mt-1" role="alert">Could not copy to clipboard.</p>
      )}
      <pre
        className="mt-2 p-2 bg-black/50 rounded text-xs text-green-400 overflow-auto max-h-96 border border-[#1C598C]"
        aria-label="Ship JSON blueprint"
      >
        {json}
      </pre>
    </div>
  );
}