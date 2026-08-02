"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";
import { type ShipRow } from "@/lib/db";
import { type CollectionDetail } from "@/lib/types";
import RichTextEditor from "@/components/ui/RichTextEditor";
import TurnstileWidget from "@/components/TurnstileWidget";
import type { TurnstileWidgetHandle } from "@/components/TurnstileWidget";
import { trackEvent } from "@/lib/analytics-client";

function EditCollectionContent() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoggedIn, hydrated } = useAuth();
  const [collection, setCollection] = useState<CollectionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  useEffect(() => {
    let active = true;

    if (!hydrated) return;

    if (!isLoggedIn) {
      router.push("/");
      return;
    }

    fetch(`/api/collections/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        const isOwner = user?.username === data.owner;

        if (!isOwner) {
          router.push(`/collections/${params.id}`);
          return;
        }

        setCollection(data);
        setTitle(data.title);
        setDescription(data.description ?? "");
      })
      .catch(() => { if (active) router.push("/"); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [params.id, router, isLoggedIn, user?.username, hydrated]);

  const handleSave = async () => {
    if (!title.trim() || !collection) return;
    if (!isLoggedIn) return;

    const turnstileToken = turnstileRef.current?.getToken();
    if (!turnstileToken) {
      setError("Please complete the Turnstile captcha.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/collections/${collection.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: title.trim(), description: description.trim(), "cf-turnstile-response": turnstileToken }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        turnstileRef.current?.reset();
      } else {
        trackEvent("collection_edit");
        router.push(`/collections/${collection.id}`);
      }
    } catch {
      setError("Failed to save");
      turnstileRef.current?.reset();
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-center text-blue-200">Loading...</p>;
  if (!collection) return null;

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-4xl text-white text-center uppercase mb-8">
        Edit Collection
      </h1>

      <Card className="space-y-4">
        <div>
          <label className="block text-blue-200 mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full p-2 bg-[#021526] border border-gray-400 rounded text-white"
          />
        </div>

        <div>
          <label className="block text-blue-200 mb-1">Description</label>
          <RichTextEditor
            value={description}
            onChange={setDescription}
            rows={4}
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <TurnstileWidget ref={turnstileRef} />

        <div className="flex gap-2">
        <Button
          onClick={handleSave}
          disabled={saving || !title.trim()}
        >
          {saving ? "Saving..." : "Save Changes"}
        </Button>
          <Link
            href={`/collections/${collection.id}`}
            className="px-4 py-2 border border-[#1C598C] rounded text-blue-200 hover:text-white transition-colors"
          >
            Cancel
          </Link>
        </div>
      </Card>

      <div className="mt-8">
        <AddShipsSection collectionId={collection.id} existingShipIds={collection.ships.map((s) => s.id)} />
      </div>
    </div>
  );
}

function AddShipsSection({ collectionId, existingShipIds }: { collectionId: number; existingShipIds: number[] }) {
  const { isLoggedIn } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ShipRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<number | null>(null);
  const [added, setAdded] = useState<Set<number>>(new Set());

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/ship/search?q=${encodeURIComponent(query.trim())}&order=new`);
      const data = await res.json();
      setResults(data.data ?? []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const addShip = async (shipId: number) => {
    if (!isLoggedIn) return;

    setAdding(shipId);
    try {
      await fetch(`/api/collections/${collectionId}/ships`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ shipId }),
      });
      trackEvent("collection_ship_add");
      setAdded(new Set([...added, shipId]));
    } catch (e) {
      console.error("Failed to add ship to collection:", e);
    } finally {
      setAdding(null);
    }
  };

  return (
    <Card>
      <h2 className="text-blue-200 text-sm mb-2">Add ships by name:</h2>
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Search ship name..."
          className="flex-1 p-2 bg-[#021526] border border-gray-400 rounded text-white text-sm"
        />
            <Button
              onClick={search}
              disabled={searching}
              size="sm"
            >
              {searching ? "..." : "Search"}
            </Button>
      </div>

      {results.length > 0 && (
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {results.map((ship) => {
            const alreadyIn = existingShipIds.includes(ship.id) || added.has(ship.id);
            const name = ship.ship_name?.replace(".ship.png", "") ?? `Ship ${ship.id}`;
            return (
              <div
                key={ship.id}
                className="group flex items-center gap-2 py-1.5 px-2 rounded hover:bg-[#1C598C]/20 min-w-0"
              >
                <div className="relative shrink-0">
                  <img
                    src={ship.data}
                    alt={name}
                    className="w-10 h-10 rounded object-contain bg-[#021526] border border-[#1C598C]/30"
                    loading="lazy"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm truncate leading-tight">
                    {name}
                  </p>
                  <p className="text-blue-200/60 text-xs truncate leading-tight">
                    by {ship.author}
                  </p>
                </div>
              <Button
                onClick={() => addShip(ship.id)}
                disabled={alreadyIn || adding === ship.id}
                size="sm"
                className="shrink-0 min-h-[32px]"
              >
                {alreadyIn ? "✓ Added" : adding === ship.id ? "..." : "+ Add"}
              </Button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export default function EditCollectionPage() {
  return (
    <RequireAuth>
      <EditCollectionContent />
    </RequireAuth>
  );
}
