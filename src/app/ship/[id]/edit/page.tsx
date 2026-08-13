"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import RichTextEditor from "@/components/ui/RichTextEditor";
import AddToCollectionButton from "@/components/collection/AddToCollectionButton";
import UserTagEditor from "@/components/tags/UserTagEditor";
import TurnstileWidget from "@/components/TurnstileWidget";
import type { TurnstileWidgetHandle } from "@/components/TurnstileWidget";
import { extractUserTags } from "@/lib/user-tag-data";
import ShipReplaceModal from "@/components/ship/ShipReplaceModal";
import { uploadFiles } from "@/lib/upload-png";
import { Ship } from "@/lib/cosmoShip";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";
import { type ShipDetail, type PriceResponse } from "@/lib/types";

export default function EditShipPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoggedIn, hydrated } = useAuth();
  const [ship, setShip] = useState<ShipDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notOwner, setNotOwner] = useState(false);

  const [shipName, setShipName] = useState("");
  const [description, setDescription] = useState("");
  const [userTags, setUserTags] = useState<string[]>([]);
  const [autoTags, setAutoTags] = useState<string[]>([]);
  const [brand, setBrand] = useState("gen");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);
  const [replaceModalOpen, setReplaceModalOpen] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [replacePreview, setReplacePreview] = useState("");
  const [replaceResult, setReplaceResult] = useState<PriceResponse | null>(null);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    const controller = new AbortController();

    const fetchShip = async () => {
      if (!isLoggedIn) {
        router.push("/");
        return;
      }

      try {
        const res = await fetch(`/api/ship/${params.id}`, { signal: controller.signal });
        if (!res.ok) throw new Error("Ship not found");
        const json = await res.json();
        const data = json.data ?? json;

        if (!active) return;
        if (!user?.username || data.submitted_by !== user.username) {
          setNotOwner(true);
          return;
        }

        if (!active) return;
        setShip(data);
        setShipName(data.ship_name);
        setDescription(data.description);
        setBrand(data.brand === "exl" ? "exl" : "gen");
        const { userTags: ut, autoTags: at } = extractUserTags(data.tags ?? []);
        setUserTags(ut);
        setAutoTags(at);
      } catch (err) {
        if (active) console.error("Failed to fetch ship:", err);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchShip();
    return () => { active = false; controller.abort(); };
  }, [params.id, router, isLoggedIn, user?.username, hydrated]);

  const handleSave = async () => {
    if (!isLoggedIn) return;

    setSaving(true);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const token = turnstileRef.current?.getToken();
      if (token) headers["x-turnstile-token"] = token;

      await fetch(`/api/ship/${params.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          ship_name: shipName,
          description,
          tags: [...autoTags, ...userTags],
          brand,
        }),
      });
      router.push(`/ship/${params.id}`);
    } catch (err) {
      console.error("Failed to save:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    router.push(`/ship/${params.id}`);
  };

  const handleReplaceShip = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setReplaceFile(file);

    const reader = new FileReader();
    reader.onload = (ev) => setReplacePreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    try {
      const decoded = await Ship.fromSource(file);
      const { calculateShipPrice } = await import("@/lib/price");
      const result = calculateShipPrice(
        decoded.data as Parameters<typeof calculateShipPrice>[0]
      );
      setReplaceResult(result);
      setReplaceModalOpen(true);
    } catch (err) {
      console.error("Decode error:", err);
      setReplacePreview("");
      setReplaceFile(null);
    }

    e.target.value = "";
  };

  const handleReplaceConfirm = async () => {
    if (!ship || !replaceResult || !replaceFile) return;

    if (!isLoggedIn) return;

    setReplacing(true);
    try {
      const file = replaceFile;

      await uploadFiles({
        files: [file],
        endpoint: "shipReplacer",
        shipId: ship.id,
        description,
        brand,
        tags: userTags,
      });

      router.push(`/ship/${ship.id}`);
    } catch (err) {
      console.error("Replace failed:", err);
    } finally {
      setReplacing(false);
      setReplaceModalOpen(false);
      setReplacePreview("");
      setReplaceResult(null);
      setReplaceFile(null);
    }
  };

  useEffect(() => {
    if (notOwner) {
      router.push(`/ship/${params.id}`);
    }
  }, [notOwner, params.id, router]);

  if (loading) return <p className="text-center text-blue-200" role="status">Loading...</p>;
  if (notOwner) return null;
  if (!ship) return <p className="text-center text-red-400">Ship not found</p>;

  return (
    <div>
      <h1 className="text-4xl text-white text-center uppercase mb-8">
        Edit Ship
      </h1>

      <input
        type="file"
        accept=".png,image/png"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileSelected}
      />

      <Card>
        <div className="md:grid md:grid-cols-2 md:gap-6">
          {/* Left: preview + metadata */}
          <div className="space-y-4">
            <div>
              <Image src={ship.data} alt={ship.ship_name} width={512} height={512} unoptimized className="max-w-full h-auto max-sm:max-h-48 max-sm:object-contain" />
            </div>

            <div>
              <label className="block text-blue-200 mb-1">Author</label>
              <p className="text-white">{ship.author}</p>
            </div>

            <div>
              <label className="block text-blue-200 mb-1">Price</label>
              <p className="text-[#0AD448]">{ship.price}₡</p>
            </div>
          </div>

          {/* Right: editable fields */}
          <div className="md:sticky md:top-24 space-y-4">
            <div>
              <label className="block text-blue-200 mb-1">Ship Name</label>
              <input
                type="text"
                value={shipName}
                onChange={(e) => setShipName(e.target.value)}
                className="w-full p-2 bg-[#021526] border border-gray-400 rounded text-white"
              />
            </div>

            <div>
              <label className="block text-blue-200 mb-1">Tags</label>
              {autoTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {autoTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-block bg-[#00305e] text-white/70 text-xs px-2 py-1 rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <UserTagEditor value={userTags} onChange={setUserTags} brand={brand} onBrandChange={setBrand} />
            </div>

            <div>
              <label className="block text-blue-200 mb-1">Description</label>
              <RichTextEditor
                value={description}
                onChange={setDescription}
                rows={6}
              />
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button variant="secondary" onClick={handleCancel}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Changes"}
              </Button>
              <Button variant="amber" onClick={handleReplaceShip}>
                Replace Ship
              </Button>
              <AddToCollectionButton shipId={ship.id} />
            </div>
          </div>
        </div>
      </Card>

      {replaceModalOpen && replaceResult && (
        <ShipReplaceModal
          previewUrl={replacePreview}
          currentAuthor={ship.author}
          currentPrice={ship.price}
          currentCrew={ship.crew}
          currentAutoTags={autoTags}
          newAuthor={replaceResult.author}
          newPrice={replaceResult.price}
          newCrew={replaceResult.crew}
          newAutoTags={replaceResult.tags}
          onConfirm={handleReplaceConfirm}
          onCancel={() => {
            setReplaceModalOpen(false);
            setReplacePreview("");
            setReplaceResult(null);
            setReplaceFile(null);
          }}
          replacing={replacing}
        />
      )}

      <TurnstileWidget ref={turnstileRef} />
    </div>
  );
}
