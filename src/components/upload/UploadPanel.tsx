"use client";

import { useState, useRef } from "react";
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
import { type PriceResponse } from "@/lib/types";

interface DuplicateShip {
  id: number;
  ship_name: string;
  author: string;
}

export default function UploadPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [priceResult, setPriceResult] = useState<PriceResponse | null>(null);
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const [uploadedShipId, setUploadedShipId] = useState<number | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decoding, setDecoding] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateShip[]>([]);
  const [ackDuplicate, setAckDuplicate] = useState(false);
  const [userTags, setUserTags] = useState<string[]>([]);
  const [brand, setBrand] = useState("gen");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    setError(null);
    setPriceResult(null);
    setUploadResult(null);
    setUploadedShipId(null);
    setSaveFailed(false);
    setDuplicates([]);
    setAckDuplicate(false);
    setUserTags([]);
    setBrand("gen");
    setDecoding(true);

    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(selected);

    try {
      const ship = await Ship.fromSource(selected);
      const decodedData = ship.data;

      const { calculateShipPrice } = await import("@/lib/price");
      const data = decodedData as Parameters<typeof calculateShipPrice>[0];
      const result = calculateShipPrice(data);
      setPriceResult(result);

      try {
        const fd = new FormData();
        fd.append("file", selected);
        const dupRes = await fetch("/api/ship/check-duplicate", {
          method: "POST",
          body: fd,
        });
        const dupData = await dupRes.json();
        setDuplicates(dupData?.data?.duplicates ?? []);
      } catch (err) {
        console.error("[duplicate-check] failed:", err);
        setDuplicates([]);
      }
    } catch (err) {
      console.error("Decode error:", err);
      setError(
        "Failed to decode ship data from image. Make sure it's a valid Cosmoteer blueprint PNG."
      );
    } finally {
      setDecoding(false);
    }
  };

  const handleUpload = async () => {
    if (!file || !priceResult) return;

    const turnstileToken = turnstileRef.current?.getToken();
    if (!turnstileToken) {
      setError("Please complete the Turnstile captcha.");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const { uploadFiles } = await import("@/lib/upload-png");
      const [url] = await uploadFiles({
        files: [file],
        description,
        brand,
        tags: userTags.length > 0 ? userTags : undefined,
        turnstileToken,
      });
      setUploadResult(url.ufsUrl);
      const shipId = url.shipId?.shipId ?? null;
      setUploadedShipId(shipId);
      setSaveFailed(shipId === null);
    } catch (err) {
      console.error("Upload error:", err);
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleReset = () => {
    turnstileRef.current?.reset();
    setFile(null);
    setPreview(null);
    setPriceResult(null);
    setDescription("");
    setUploadResult(null);
    setUploadedShipId(null);
    setSaveFailed(false);
    setDuplicates([]);
    setAckDuplicate(false);
    setUserTags([]);
    setBrand("gen");
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <Card>
      {!uploadResult && (
        <>
          <h2 className="text-white text-xl mb-4">Select a ship file</h2>

          <div className={file ? "md:grid md:grid-cols-2 md:gap-6" : ""}>
            {/* Left column: file picker, preview, price, duplicates */}
            <div>
              <div className="mb-4">
                <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-[#1C598C] rounded-md bg-[#021526]/80 cursor-pointer hover:border-cyan-400/50 hover:bg-[#021526] transition-colors">
                  <span className="text-blue-200 text-lg mb-2">
                    {file ? file.name : "Click to select a ship PNG"}
                  </span>
                  <span className="text-gray-500 text-sm">
                    Max 8MB, .png only
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".png"
                    onChange={handleFileChange}
                    className="hidden"
                    disabled={uploading}
                  />
                </label>
              </div>

              {preview && (
                <div className="mb-4 relative w-full h-48">
                  <Image
                    src={preview}
                    alt="Preview"
                    fill
                    unoptimized
                    className="object-contain"
                  />
                </div>
              )}

              {decoding && (
                <p className="text-blue-200 mb-4" role="status">Decoding ship data...</p>
              )}

              {priceResult && (
                <div className="mb-4 space-y-2 p-3 border border-[#1C598C] rounded">
                  <p className="text-white">
                    <span className="text-blue-200">Author:</span>{" "}
                    {priceResult.author}
                  </p>
                  <p className="text-[#0AD448]">
                    <span className="text-blue-200">Price:</span>{" "}
                    {priceResult.price}₡
                  </p>
                  <p className="text-white">
                    <span className="text-blue-200">Crew:</span>{" "}
                    {priceResult.crew}
                  </p>
                  <p className="text-white">
                    <span className="text-blue-200">Tags:</span>{" "}
                    {priceResult.tags.length > 0
                      ? priceResult.tags.join(", ")
                      : "None"}
                  </p>
                </div>
              )}

              {duplicates.length > 0 && (
                <div className="mb-4 p-3 border border-yellow-600 bg-yellow-900/20 rounded">
                  <p className="text-yellow-400 text-sm font-medium mb-1">
                    This ship already exists in the library:
                  </p>
                  {duplicates.map((d) => (
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
                      checked={ackDuplicate}
                      onChange={(e) => setAckDuplicate(e.target.checked)}
                      className="w-4 h-4 rounded border-yellow-600 bg-[#021526] text-yellow-400 focus:ring-yellow-500"
                    />
                    <span className="text-yellow-300 text-sm">
                      I understand this is a duplicate and still want to upload
                    </span>
                  </label>
                </div>
              )}
            </div>

            {/* Right column: tags, description, buttons */}
            {file && (
              <div className="md:sticky md:top-24 space-y-4">
                {priceResult && (
                  <div>
                    <UserTagEditor value={userTags} onChange={setUserTags} brand={brand} onBrandChange={setBrand} />
                  </div>
                )}

                {priceResult && (
                  <div>
                    <label className="block text-blue-200 mb-1">Description</label>
                    <RichTextEditor
                      value={description}
                      onChange={setDescription}
                      placeholder="Describe your ship design..."
                      rows={4}
                    />
                  </div>
                )}

                {error && <p className="text-red-400" role="alert">{error}</p>}

                {priceResult && (
                  <TurnstileWidget ref={turnstileRef} />
                )}

                {priceResult && (
                  <div className="flex gap-2">
                    <Button
                      onClick={handleUpload}
                      disabled={uploading || (duplicates.length > 0 && !ackDuplicate)}
                    >
                      {uploading ? "Uploading..." : duplicates.length > 0 ? "Upload Anyway" : "Upload to Library"}
                    </Button>
                    <Button
                      onClick={handleReset}
                      disabled={uploading}
                    >
                      Reset
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {uploadResult && (
        <div className="text-center">
          {saveFailed ? (
            <p className="text-red-400 text-xl mb-4" role="alert">
              Ship image uploaded, but failed to save to the library.
            </p>
          ) : (
            <p className="text-[#0AD448] text-xl mb-4" role="status">
              Ship uploaded successfully!
            </p>
          )}
          <div className="flex gap-2 justify-center flex-wrap">
            {uploadedShipId && (
              <Link
                href={`/ship/${uploadedShipId}`}
                className="px-4 py-2 border border-[#1C598C] rounded bg-gradient-to-b from-[#1e3851]/25 to-[#124c80]/25 text-cyan-400 hover:bg-cyan-400/20 hover:text-white transition-colors"
              >
                View Ship
              </Link>
            )}
            <Button onClick={handleReset}>
              Upload Another
            </Button>
            {uploadedShipId && (
              <AddToCollectionButton shipId={uploadedShipId} />
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
