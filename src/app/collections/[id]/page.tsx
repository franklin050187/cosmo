"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ShipGrid from "@/components/ship/ShipGrid";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import TurnstileWidget from "@/components/TurnstileWidget";
import { useAuth } from "@/hooks/useAuth";
import { type CollectionDetail } from "@/lib/types";
import { trackEvent } from "@/lib/analytics-client";
import { sanitizeHtml } from "@/lib/sanitize";
import { formatDate } from "@/lib/format-date";

export default function CollectionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoggedIn } = useAuth();
  const [collection, setCollection] = useState<CollectionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const fetchCollection = async () => {
      try {
        const res = await fetch(`/api/collections/${params.id}`, { signal: controller.signal });
        if (!res.ok) throw new Error("Not found");
        const json = await res.json();
        if (!active) return;
        const data = json.data ?? json;
        setCollection(data);
        document.title = `${data.title} - CosmoShip`;
        trackEvent("collection_view");

        if (user?.username === data.owner) {
          setIsOwner(true);
        }
      } catch {
        if (active) setCollection(null);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchCollection();
    return () => { active = false; controller.abort(); };
  }, [params.id, user?.username]);

  const handleRemove = async (shipId: number) => {
    if (!isLoggedIn || !collection) return;

    setRemoving(shipId);
    try {
      await fetch(`/api/collections/${collection.id}/ships/${shipId}`, {
        method: "DELETE",
      });
      setCollection({
        ...collection,
        ships: collection.ships.filter((s) => s.id !== shipId),
      });
      trackEvent("collection_ship_remove");
    } catch (e) {
      console.error("Failed to remove ship from collection:", e);
    } finally {
      setRemoving(null);
    }
  };

  const handleDelete = () => {
    if (!confirm("Delete this collection?")) return;
    if (!isLoggedIn || !collection) return;
    setPendingDelete(true);
  };

  const onDeleteVerify = async (token: string) => {
    if (!pendingDelete || !collection || !token) return;
    try {
      await fetch(`/api/collections/${collection.id}`, {
        method: "DELETE",
        headers: { "x-turnstile-token": token },
      });
      trackEvent("collection_delete");
      router.push("/my-collections");
    } catch (e) {
      console.error("Failed to delete collection:", e);
      setPendingDelete(false);
    }
  };

  const handleDownloadAll = async () => {
    if (!collection || collection.ships.length === 0) return;
    setDownloadingAll(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const folder = zip.folder(collection.title.replace(/[^a-zA-Z0-9_-]/g, "_"));
      if (!folder) return;

      await Promise.allSettled(
        collection.ships.map(async (ship) => {
          try {
            const res = await fetch(ship.data);
            if (!res.ok) return;
            const blob = await res.blob();
            const name = ship.ship_name?.replace(".ship.png", "") || `ship-${ship.id}`;
            folder.file(`${name}.png`, blob);
          } catch (e) { console.error("Failed to download ship image:", e); }
        })
      );

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${collection.title.replace(/[^a-zA-Z0-9_-]/g, "_")}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to create zip:", err);
    } finally {
      setDownloadingAll(false);
    }
  };

  if (loading) return <p className="text-center text-blue-200" role="status">Loading...</p>;
  if (!collection) return <p className="text-center text-red-400">Collection not found</p>;

  return (
    <div>
      <Link
        href="/collections"
        className="inline-flex items-center gap-1.5 text-sm text-blue-300 hover:text-cyan-300 transition-colors mb-6"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        All Collections
      </Link>

      <div className="mb-6 space-y-3">
        <div>
          <h1 className="text-2xl sm:text-4xl text-white uppercase">{collection.title}</h1>
          <p className="text-blue-200 text-sm mt-1">
            by {collection.owner} · {collection.ships.length} ship{collection.ships.length !== 1 ? "s" : ""}
          </p>
          <p className="text-gray-400 text-xs">Created {formatDate(collection.created_at)}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {collection.ships.length > 0 && (
            <Button
              onClick={handleDownloadAll}
              disabled={downloadingAll}
            >
              {downloadingAll ? "Zipping..." : "Download All"}
            </Button>
          )}
          {isOwner && (
            <>
              <Link
                href={`/collections/${collection.id}/edit`}
                className="px-4 py-2 border border-[#1C598C] rounded bg-gradient-to-b from-[#1e3851]/25 to-[#124c80]/25 text-cyan-400 hover:bg-cyan-400/20 hover:text-white transition-colors"
              >
                Edit
              </Link>
              <Button variant="danger" onClick={handleDelete}>
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {collection.description && (
        <div className="text-white mb-6" dangerouslySetInnerHTML={{ __html: sanitizeHtml(collection.description) }} />
      )}

      {collection.ships.length > 0 ? (
        <div className="space-y-4">
          <ShipGrid ships={collection.ships} />

          {isOwner && (
            <Card>
              <p className="text-blue-200 text-sm mb-2">Remove ships:</p>
              <div className="flex flex-wrap gap-2">
                {collection.ships.map((ship) => (
                  <Button
                    key={ship.id}
                    variant="danger"
                    size="sm"
                    onClick={() => handleRemove(ship.id)}
                    disabled={removing === ship.id}
                  >
                    × {ship.ship_name?.replace(".ship.png", "") ?? `Ship ${ship.id}`}
                  </Button>
                ))}
              </div>
            </Card>
          )}
        </div>
      ) : (
        <p className="text-center text-blue-200 py-8">
          This collection is empty.{" "}
          {isOwner && (
            <Link href="/" className="text-cyan-400 hover:underline">
              Browse ships to add
            </Link>
          )}
        </p>
      )}
      {isOwner && pendingDelete && <TurnstileWidget onVerify={onDeleteVerify} />}
    </div>
  );
}
