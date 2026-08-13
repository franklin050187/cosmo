"use client";

import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import { useAuthFetch } from "@/hooks/useAuthFetch";
import CollectionGrid from "@/components/collection/CollectionGrid";
import { type CollectionSummary } from "@/lib/types";

function MyCollectionsContent() {
  const { data, loading, refetch } = useAuthFetch<CollectionSummary[]>("/api/collections/mine");
  const collections = data ?? [];

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this collection?")) return;
    await fetch(`/api/collections/${id}`, { method: "DELETE" });
    refetch();
  };

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-4xl text-white uppercase">My Collections</h1>
        <Link
          href="/collections/new"
          className="px-4 py-2 border border-[#1C598C] rounded bg-gradient-to-b from-[#1e3851]/25 to-[#124c80]/25 text-cyan-400 hover:bg-cyan-400/20 hover:text-white transition-colors"
        >
          + New Collection
        </Link>
      </div>

      {loading ? (
        <p className="text-center text-blue-200" role="status">Loading...</p>
      ) : (
        <>
          <p className="text-center text-blue-200 mb-4">
            {collections.length > 0
              ? `You have ${collections.length} collection${collections.length !== 1 ? "s" : ""}`
              : "Create your first collection to organize ships!"}
          </p>
          <CollectionGrid collections={collections} onDelete={handleDelete} />
        </>
      )}
    </>
  );
}

export default function MyCollectionsPage() {
  return (
    <RequireAuth>
      <MyCollectionsContent />
    </RequireAuth>
  );
}
