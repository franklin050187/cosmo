"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Button from "@/components/ui/Button";

interface ShipShareButtonProps {
  shipName: string;
  className?: string;
}

export default function ShipShareButton({ shipName, className = "" }: ShipShareButtonProps) {
  const [shared, setShared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/ship/${window.location.pathname.split("/").pop()}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: shipName, url });
      } else {
        await navigator.clipboard.writeText(url);
      }
      setShared(true);
      setError(null);
      timerRef.current = setTimeout(() => setShared(false), 1500);
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      setError("Could not copy link");
      timerRef.current = setTimeout(() => setError(null), 2000);
    }
  }, [shipName]);

  return (
    <span className={className}>
      <Button
        onClick={handleShare}
        aria-label={shared ? "Link copied!" : "Copy link to ship"}
        aria-live="polite"
      >
        {shared ? "✓ Copied" : "⧉ Share"}
      </Button>
      {error && (
        <span className="ml-2 text-xs text-red-400" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}