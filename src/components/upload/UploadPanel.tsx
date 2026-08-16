"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import RichTextEditor from "@/components/ui/RichTextEditor";
import AddToCollectionButton from "@/components/collection/AddToCollectionButton";
import UserTagEditor from "@/components/tags/UserTagEditor";
import TurnstileWidget from "@/components/TurnstileWidget";
import type { TurnstileWidgetHandle } from "@/components/TurnstileWidget";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { Ship } from "@/lib/cosmoShip";
import { uploadFiles, type UploadProgress } from "@/lib/upload-png";
import type { PriceResponse } from "@/lib/types";

interface DuplicateShip {
  id: number;
  ship_name: string;
  author: string;
}

interface UploadItem {
  id: string;
  file: File;
  preview: string | null;
  priceResult: PriceResponse | null;
  duplicates: DuplicateShip[];
  decoding: boolean;
  error: string | null;
  status: "pending" | "uploaded" | "failed";
  ufsUrl: string | null;
  shipId: number | null;
}

const MAX_FILES = 10;
const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB

export default function UploadPanel() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [description, setDescription] = useState("");
  const [userTags, setUserTags] = useState<string[]>([]);
  const [brand, setBrand] = useState("gen");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [totalProgress, setTotalProgress] = useState(0);
  const [uploadResultText, setUploadResultText] = useState<string | null>(null);
  const [uploadResults, setUploadResults] = useState<
    { ufsUrl: string; shipId: number | null; name: string }[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  const hasDecoded = items.some((i) => i.priceResult || i.error);
  const hasDuplicates = items.some((i) => i.duplicates.length > 0);
  const allDecoded = items.length > 0 && items.every((i) => i.priceResult || i.error);
  const [ackDuplicate, setAckDuplicate] = useState(false);

  const resetUploadState = useCallback(() => {
    setUploadError(null);
    setUploadResults([]);
    setUploadResultText(null);
    setTotalProgress(0);
    setAckDuplicate(false);
  }, []);

  const handleFiles = useCallback(async (newFiles: File[]) => {
    resetUploadState();
    const toAdd: UploadItem[] = [];
    for (const file of newFiles) {
      const item: UploadItem = {
        id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        preview: null,
        priceResult: null,
        duplicates: [],
        decoding: false,
        error: null,
        status: "pending",
        ufsUrl: null,
        shipId: null,
      };
      toAdd.push(item);
      const reader = new FileReader();
      reader.onload = (ev) => setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, preview: ev.target?.result as string } : i)));
      reader.readAsDataURL(file);
    }
    setItems((prev) => [...prev, ...toAdd]);

    // Decode each file independently (bounded by browser concurrency already).
    await Promise.all(
      toAdd.map(async (item) => {
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, decoding: true } : i)));
        try {
          const ship = await Ship.fromSource(item.file);
          const decodedData = ship.data;
          const { calculateShipPrice } = await import("@/lib/price");
          const data = decodedData as Parameters<typeof calculateShipPrice>[0];
          const result = calculateShipPrice(data);

          const fd = new FormData();
          fd.append("file", item.file);
          let duplicates: DuplicateShip[] = [];
          try {
            const dupRes = await fetch("/api/ship/check-duplicate", { method: "POST", body: fd });
            const dupData = await dupRes.json();
            duplicates = dupData?.data?.duplicates ?? [];
          } catch (err) {
            console.error("[duplicate-check] failed:", err);
          }

          setItems((prev) =>
            prev.map((i) =>
              i.id === item.id ? { ...i, priceResult: result as PriceResponse, duplicates, decoding: false } : i
            )
          );
        } catch (err) {
          console.error("Decode error:", err);
          setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, error: "Failed to decode ship data from image. Make sure it's a valid Cosmoteer blueprint PNG.", decoding: false } : i)));
        }
      })
    );

    await new Promise((r) => setTimeout(r, 0));
    setAckDuplicate(false);
  }, [resetUploadState]);

  const validateFiles = (files: File[]): string[] => {
    const errors: string[] = [];
    if (files.length > MAX_FILES) {
      errors.push(`You can select up to ${MAX_FILES} files at a time.`);
    }
    for (const f of files) {
      if (f.type && f.type !== "image/png" && f.type !== "image/x-png") {
        errors.push(`"${f.name}" is not a PNG image (got ${f.type}). Only .png files are accepted.`);
      }
      if (f.size > MAX_FILE_SIZE) {
        errors.push(`"${f.name}" is ${(f.size / (1024 * 1024)).toFixed(1)}MB — the 8MB limit was enforced client-side.`);
      }
    }
    return errors;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;
    const files = Array.from(selected);
    const errs = validateFiles(files);
    if (errs.length) {
      setUploadError(errs.join(" "));
      return;
    }
    handleFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragover") return;
    const files = Array.from(e.dataTransfer.files);
    const pngs = files.filter((f) => f.name.endsWith(".png"));
    if (pngs.length === 0) {
      setUploadError("Only .png ship blueprints are accepted.");
      return;
    }
    const errs = validateFiles(pngs);
    if (errs.length) {
      setUploadError(errs.join(" "));
      return;
    }
    handleFiles(pngs);
    setDragOver(false);
  };

  const handleUpload = async () => {
    const validItems = items.filter((i) => i.priceResult && !i.error);
    if (validItems.length === 0) return;

    const turnstileToken = turnstileRef.current?.getToken();
    if (!turnstileToken) {
      setUploadError("Please complete the Turnstile captcha.");
      return;
    }
    setUploadError(null);
    setUploading(true);
    setTotalProgress(0);
    setUploadResults([]);
    setUploadResultText(null);

    try {
      const files = validItems.map((i) => i.file);
      const results = await uploadFiles({
        files,
        description,
        brand,
        tags: userTags.length > 0 ? userTags : undefined,
        turnstileToken,
        onUploadProgress: (p: UploadProgress) => setTotalProgress(Math.round(p.totalProgress)),
      });

      const mapped = results.map((r, idx) => ({
        ufsUrl: r.ufsUrl,
        shipId: r.shipId?.shipId ?? null,
        name: validItems[idx].file.name ?? "unknown",
      }));
      setUploadResults(mapped);
      setItems((prev) =>
        prev.map((item) => {
          const match = mapped.find((m) => m.name === item.file.name);
          return match
            ? { ...item, status: match.shipId ? "uploaded" : "failed", ufsUrl: match.ufsUrl, shipId: match.shipId }
            : item;
        })
      );
      const okCount = mapped.filter((m) => m.shipId).length;
      setUploadResultText(
        mapped.length === 1
          ? "Ship uploaded successfully!"
          : `${okCount} of ${mapped.length} ships uploaded successfully!`
      );
    } catch (err) {
      console.error("Upload error:", err);
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setTotalProgress(0);
    }
  };

  const handleReset = () => {
    setItems([]);
    setDescription("");
    setUserTags([]);
    setBrand("gen");
    setUploadError(null);
    setUploadResults([]);
    setUploadResultText(null);
    setTotalProgress(0);
    setAckDuplicate(false);
    turnstileRef.current?.reset();
  };

  return (
    <Card>
      {!uploadResultText && !uploadResults.length ? (
        <>
          <h2 className="text-white text-xl mb-4">Select a ship file</h2>
          <label
            htmlFor="ship-upload"
            aria-label="Select a ship PNG"
            className={`flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-md cursor-pointer transition-colors ${
              dragOver
                ? "border-cyan-400/60 bg-cyan-400/10"
                : "border-[#1C598C] hover:border-cyan-400/50 hover:bg-[#021526]"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            tabIndex={0}
            role="button"
          >
            <span className="text-blue-200 text-lg mb-2">
              {items.length === 0
                ? dragOver
                  ? "Drop to upload"
                  : "Click to select a ship PNG"
                : "Add more ships"}
            </span>
            <span className="text-gray-500 text-sm">
              Max 8MB each, .png only (up to {MAX_FILES})
            </span>
            <input
              id="ship-upload"
              ref={fileInputRef}
              type="file"
              accept=".png,image/png"
              multiple
              onChange={handleFileChange}
              className="sr-only"
              aria-hidden="true"
              tabIndex={-1}
              disabled={uploading}
            />
          </label>

          {uploadError && !items.length && (
            <p className="mt-4 text-red-400" role="alert">{uploadError}</p>
          )}

          {items.length > 0 && (
            <div className="space-y-4 mt-4">
              {items.map((item) => (
                <UploadItemRow
                  key={item.id}
                  item={item}
                  onAckChange={ackDuplicate}
                  onAckToggle={(v) => {
                    setAckDuplicate(v);
                    setItems((prev) => prev.map((i) => ({ ...i })));
                  }}
                />
              ))}
            </div>
          )}

          {items.length > 0 && hasDecoded && (
            <div className="pt-4 border-t border-[#1C598C]/30 mt-4 space-y-4">
              <UserTagEditor value={userTags} onChange={setUserTags} brand={brand} onBrandChange={setBrand} />

              <div>
                <label className="block text-blue-200 mb-1">Description</label>
                <RichTextEditor value={description} onChange={setDescription} placeholder="Describe your ship design..." rows={4} />
              </div>

              {uploading && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-blue-200">
                    <span>Uploading…</span>
                    <span>{totalProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-[#1C598C]/30 rounded overflow-hidden">
                    <div className="h-full bg-cyan-400 transition-all" style={{ width: `${totalProgress}%` }} />
                  </div>
                </div>
              )}

              <TurnstileWidget ref={turnstileRef} />

              {uploadError && (
                <p className="text-red-400" role="alert">{uploadError}</p>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={handleUpload}
                  disabled={uploading || !allDecoded || (hasDuplicates && !ackDuplicate)}
>
                  {uploading ? "Uploading…" : hasDuplicates ? (ackDuplicate ? "Upload Anyway" : "Upload Anyway") : items.length > 1 ? `Upload ${items.length} ships` : "Upload to Library"}
                </Button>
                <Button onClick={handleReset} disabled={uploading}>
                  Reset
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-center">
          {uploadResults.map((r, idx) => (
            <div key={idx} className="mb-3">
              {r.shipId == null ? (
                <p className="text-red-400 text-xl mb-4" role="alert">
                  Failed to save ship to the library.
                </p>
              ) : (
                <p className="text-[#0AD448] text-xl mb-4" role="status">
                  Ship uploaded successfully!
                </p>
              )}
              {r.shipId && (
                <Link
                  href={`/ship/${r.shipId}`}
                  className="px-4 py-2 border border-[#1C598C] rounded bg-gradient-to-b from-[#1e3851]/25 to-[#124c80]/25 text-cyan-400 hover:bg-cyan-400/20 hover:text-white transition-colors"
                >
                  View Ship
                </Link>
              )}
            </div>
          ))}
          {uploadResultText && uploadResults.length > 1 && (
            <p className={`text-xl mb-4 ${uploadResults.some((r) => r.shipId == null) ? "text-red-400" : "text-[#0AD448]"}`} role="status">
              {uploadResultText}
            </p>
          )}
          <div className="flex gap-2 justify-center flex-wrap">
          {uploadResults.some((r) => r.shipId) && (
            <AddToCollectionButton shipId={uploadResults.find((r) => r.shipId)?.shipId as number} />
          )}
            <Button onClick={handleReset}>
              Upload Another
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function UploadItemRow({ item, onAckChange, onAckToggle }: { item: UploadItem; onAckChange: boolean; onAckToggle: (v: boolean) => void }) {
  if (item.error) {
    return (
      <div className="flex items-center gap-3 text-left">
        <Image src={item.preview ?? ""} alt="preview" width={64} height={64} className="object-contain rounded" unoptimized />
        <p className="text-red-400" role="alert">{item.error}</p>
      </div>
    );
  }

  return (
    <div className="flex gap-4 flex-col md:flex-row md:items-start">
      {item.preview && (
        <div className="relative w-16 h-16 shrink-0">
          <Image src={item.preview} alt="preview" fill className="object-contain rounded" unoptimized />
        </div>
      )}
      <div className="flex-1 min-w-0">
        {item.decoding && (
          <div className="flex items-center gap-2 text-blue-200">
            <div className="w-3 h-3 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
            <span>Decoding {item.file.name}</span>
          </div>
        )}
        {item.priceResult && (
          <div className="space-y-1 p-3 border border-[#1C598C] rounded">
            <p className="text-white"><span className="text-blue-200">Author:</span> {item.priceResult.author}</p>
            <p className="text-[#0AD448]"><span className="text-blue-200">Price:</span> {item.priceResult.price}₡</p>
            <p className="text-white"><span className="text-blue-200">Crew:</span> {item.priceResult.crew}</p>
            <p className="text-white"><span className="text-blue-200">Tags:</span> {item.priceResult.tags.length > 0 ? item.priceResult.tags.join(", ") : "None"}</p>
          </div>
        )}
        {item.duplicates.length > 0 && (
          <div className="p-3 border border-yellow-600 bg-yellow-900/20 rounded">
            <p className="text-yellow-400 text-sm font-medium mb-1">
              This ship already exists in the library:
            </p>
            {item.duplicates.map((d) => (
              <p key={d.id} className="text-yellow-200 text-sm">
                <a href={`/ship/${d.id}`} target="_blank" rel="noopener noreferrer" className="underline hover:text-yellow-100">
                  {d.ship_name?.replace(".ship.png", "")}
                </a>
                {" "}by {d.author}
              </p>
            ))}
            <label className="flex items-center gap-2 mt-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onAckChange}
                onChange={(e) => onAckToggle(e.target.checked)}
                className="w-4 h-4 rounded border-yellow-600 bg-[#021526] text-yellow-400 focus:ring-yellow-500"
              />
              <span className="text-yellow-300 text-sm">
                I understand this is a duplicate and still want to upload
              </span>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
