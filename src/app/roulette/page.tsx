"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
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
  const [listError, setListError] = useState(false);
  const [copied, setCopied] = useState(false);
  const detailController = useRef<AbortController | null>(null);

  // Load the full picker list; ?page=-1 lifts the 24-per-page cap so deep
  // links to older collections still have their entry in the dropdown.
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset stale error before the fetch
    setListError(false);
    fetch("/api/collections?page=-1", { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        return r.json();
      })
      .then((json) => {
        if (!active) return;
        const list: CollectionSummary[] = (json.data?.data ?? json.data ?? []).filter(
          (c: CollectionSummary) => (c.ship_count ?? 0) > 0,
        );
        setCollections(list);
      })
      .catch((e: unknown) => {
        if (active && !controller.signal.aborted && (e as Error)?.name !== "AbortError") setListError(true);
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; controller.abort(); };
  }, []);

  const loadDetail = useCallback((id: number) => {
    // Abort the previous detail fetch so a slow earlier response can never
    // overwrite a faster later selection.
    detailController.current?.abort();
    const controller = new AbortController();
    detailController.current = controller;
    fetch(`/api/collections/${id}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        return r.json();
      })
      .then((json) => {
        const data = json.data ?? json;
        if (data?.id) setCollection(data);
      })
      .catch((e: unknown) => {
        if ((e as Error)?.name !== "AbortError") setCollection(null);
      });
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

  const handleCopyLink = async () => {
    if (!collection) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/roulette?collection=${collection.id}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  // A deep-linked collection may sit outside the picker list; keep its own
  // entry so the select never renders a blank value.
  const pickerItems: CollectionSummary[] =
    collection && !collections.some((c) => c.id === collection.id)
      ? [{
          id: collection.id,
          title: collection.title,
          owner: collection.owner,
          description: "",
          ship_count: collection.ships.length,
          thumb_url: null,
          created_at: "",
        }]
      : [];

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
              {listError ? "Could not load collections" : loading ? "Loading collections…" : "Choose a collection"}
            </option>
          )}
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} ({c.ship_count} ships)
            </option>
          ))}
          {pickerItems.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} ({c.ship_count} ships)
            </option>
          ))}
        </select>
        {listError && !loading && (
          <p className="text-red-300 text-sm mt-1" role="alert">
            Could not load the collection list.{" "}
            <button type="button" className="underline hover:text-red-200" onClick={() => window.location.reload()}>
              Retry
            </button>
          </p>
        )}
      </div>

      {collection ? (
        <div className="w-full max-w-md">
          <div className="flex items-center justify-center gap-3 mb-3">
            <p className="text-center text-slate-400 text-xs">
              Playing <span className="text-cyan-300">{collection.title}</span> · by{" "}
              {collection.owner}
            </p>
            <button
              type="button"
              onClick={handleCopyLink}
              aria-label="Copy share link for this collection"
              className="text-xs px-2 py-1 border border-[#1C598C] rounded text-blue-200 hover:text-cyan-300 hover:border-cyan-400 transition-colors shrink-0"
            >
              {copied ? "Copied!" : "Copy link"}
            </button>
          </div>
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