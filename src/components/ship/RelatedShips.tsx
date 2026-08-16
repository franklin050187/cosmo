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
  similar: ShipRow[];
}

export default function RelatedShips({ ship }: RelatedShipsProps) {
  const [buckets, setBuckets] = useState<RelatedBuckets>({ author: [], tags: [], similar: [] });
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

        const similarParams = new URLSearchParams({ order: "pop", page: "1" });
        const price = ship.price || 0;
        const crew = ship.crew || 0;
        if (price > 0) {
          similarParams.set("minprice", String(Math.max(0, Math.round(price * 0.7))));
          similarParams.set("maxprice", String(Math.round(price * 1.3)));
        }
        if (crew > 1) {
          similarParams.set("min-crew", String(Math.max(1, Math.round(crew * 0.75))));
          similarParams.set("max-crew", String(Math.round(crew * 1.25)));
        }

        const [author, tags, similar] = await Promise.all([
          ship.author ? get(new URLSearchParams({ author: ship.author, order: "pop", page: "1" })) : Promise.resolve([]),
          ship.tags.length
            ? get(new URLSearchParams({ tag: ship.tags[0], order: "pop", page: "1" }))
            : Promise.resolve([]),
          similarParams.size ? get(similarParams) : Promise.resolve([]),
        ]);

        if (cancelled || shipIdRef.current !== id) return;

        const scored = similar
          .filter((s) => s.price > 0 || s.crew > 1)
          .map((s) => {
            const p = s.price || 0;
            const c = s.crew || 0;
            const pScore = price > 0 ? Math.abs(p - price) / price : 0;
            const cScore = crew > 1 ? Math.abs(c - crew) / crew : 0;
            return { s, score: pScore + cScore };
          })
          .sort((a, b) => a.score - b.score)
          .map((x) => x.s);

        setBuckets({ author, tags, similar: scored.slice(0, 8) });
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
  const bySimilar = buckets.similar.filter(
    (s) => s.id !== ship.id && !byAuthor.some((a) => a.id === s.id) && !byTags.some((t) => t.id === s.id)
  );

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
  const hasSimilar = bySimilar.length > 0;
  if (!hasAuthor && !hasTags && !hasSimilar) return null;

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
      {hasSimilar && (
        <section>
          <h2 className="text-xl text-white font-semibold mb-4">
            Similar ships
          </h2>
          <ShipGrid ships={bySimilar.slice(0, 8)} />
        </section>
      )}
    </div>
  );
}