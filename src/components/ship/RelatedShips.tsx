"use client";

import { useState, useEffect, useRef } from "react";
import Card from "@/components/ui/Card";
import ShipGrid from "@/components/ship/ShipGrid";
import { type ShipRow } from "@/lib/db";

interface RelatedShipsProps {
  ship: ShipRow;
}

interface RelatedBuckets {
  author: ShipRow[];
  tags: ShipRow[];
}

export default function RelatedShips({ ship }: RelatedShipsProps) {
  const [buckets, setBuckets] = useState<RelatedBuckets>({ author: [], tags: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const shipIdRef = useRef(ship.id);

  useEffect(() => {
    const id = ship.id;
    shipIdRef.current = id;
    let cancelled = false;

    (async () => {
      try {
        const get = async (params: URLSearchParams) => {
          const res = await fetch(`/api/ship/search?${params.toString()}`);
          if (!res.ok) throw new Error(`Search failed (${res.status})`);
          const json = await res.json();
          const data: ShipRow[] = json.data?.data ?? [];
          return data.filter((s) => s.id !== id);
        };

        const [author, tags] = await Promise.all([
          ship.author ? get(new URLSearchParams({ author: ship.author, order: "pop", page: "1" })) : Promise.resolve([]),
          ship.tags.length
            ? get(new URLSearchParams({ tag: ship.tags[0], order: "pop", page: "1" }))
            : Promise.resolve([]),
        ]);

        if (cancelled || shipIdRef.current !== id) return;
        setBuckets({ author, tags });
      } catch (err) {
        if (cancelled || shipIdRef.current !== id) return;
        console.error("Failed to fetch related ships:", err);
        setError("Could not load related ships.");
      } finally {
        if (!cancelled && shipIdRef.current === id) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      shipIdRef.current = -1;
    };
  }, [ship]);

  const byAuthor = buckets.author.filter((s) => s.author === ship.author);
  const byTags = buckets.tags.filter((s) => s.author !== ship.author);

  if (loading) {
    return (
      <Card className="mt-6">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-blue-200">Finding related ships…</p>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="mt-6">
        <p className="text-red-400" role="alert">{error}</p>
      </Card>
    );
  }

  const hasAuthor = byAuthor.length > 0;
  const hasTags = byTags.length > 0;
  if (!hasAuthor && !hasTags) return null;

  return (
    <div className="mt-10 space-y-8" aria-label="Related ships">
      {hasAuthor && (
        <section>
          <h2 className="text-xl text-white font-semibold mb-4">
            More by {ship.author}
          </h2>
          <ShipGrid ships={byAuthor.slice(0, 8)} />
        </section>
      )}
      {hasTags && (
        <section>
          <h2 className="text-xl text-white font-semibold mb-4">
            More ships with {ship.tags[0]}
          </h2>
          <ShipGrid ships={byTags.slice(0, 8)} />
        </section>
      )}
    </div>
  );
}