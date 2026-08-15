"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import RouletteGame from "@/components/roulette/RouletteGame";
import { type CollectionDetail, type CollectionSummary } from "@/lib/types";

export default function RoulettePage() {
  return (
    <Suspense fallback={<p className="text-center text-blue-200">Loading roulette…</p>}>
      <RouletteInner />
    </Suspense>
  );
}

function RouletteInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramId = searchParams.get("collection");

  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [collection, setCollection] = useState<CollectionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Load the picker list.
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    fetch("/api/collections?page=1", { signal: controller.signal })
      .then((r) => r.json())
      .then((json) => {
        if (!active) return;
        const list: CollectionSummary[] = (json.data?.data ?? json.data ?? []).filter(
          (c: CollectionSummary) => (c.ship_count ?? 0) > 0,
        );
        setCollections(list);
      })
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => { active = false; controller.abort(); };
  }, []);

  const loadDetail = useCallback((id: number) => {
    const controller = new AbortController();
    fetch(`/api/collections/${id}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((json) => {
        const data = json.data ?? json;
        if (data?.id) setCollection(data);
      })
      .catch(() => setCollection(null));
    return controller;
  }, []);

  // Initial load from the URL param (e.g. a shared link).
  useEffect(() => {
    if (!paramId) return;
    const id = parseInt(paramId, 10);
    if (!isNaN(id)) loadDetail(id);
  }, [paramId, loadDetail]);

  const handleSelect = (id: number) => {
    router.replace(`/roulette?collection=${id}`);
    loadDetail(id);
  };

  return (
    <div className="flex flex-col items-center">
      <h1 className="text-4xl text-white text-center uppercase mb-2">Ship Roulette</h1>
      <p className="text-blue-200 text-center text-sm mb-6">
        Pick a collection, pull the lever, and drop a ship based on how popular it is.
        Share the link to let others roll the same collection.
      </p>

      {/* Collection picker */}
      <div className="w-full max-w-md mb-6">
        <label htmlFor="roulette-collection" className="block text-xs uppercase tracking-wider text-slate-500 mb-1">
          Collection
        </label>
        <select
          id="roulette-collection"
          value={collection?.id ?? ""}
          onChange={(e) => {
            const id = parseInt(e.target.value, 10);
            if (!isNaN(id)) handleSelect(id);
          }}
          className="w-full bg-[#06121f] border border-[#1C598C] rounded-md px-3 py-2 text-cyan-100 outline-none focus:border-cyan-400"
        >
          {!collection && (
            <option value="">
              {loading ? "Loading collections…" : "Choose a collection"}
            </option>
          )}
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} ({c.ship_count} ships)
            </option>
          ))}
        </select>
      </div>

      {collection ? (
        <div className="w-full max-w-md">
          <p className="text-center text-slate-400 text-xs mb-3">
            Playing <span className="text-cyan-300">{collection.title}</span> · by{" "}
            {collection.owner}
          </p>
          <RouletteGame collection={collection} />
        </div>
      ) : (
        <p className="text-center text-blue-200/70 text-sm">
          {loading ? "Loading…" : (
            <>
              Choose a collection above. Run out?{" "}
              <Link href="/collections" className="text-cyan-400 hover:underline">
                Browse collections
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}