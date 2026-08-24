"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ShipReconstruction from "@/components/ship/ShipReconstruction";
import ShipStatsPanel from "@/components/ship/ShipStatsPanel";
import { ColorValue, FloatValue, Ship, type ImageDataLike } from "@/lib/cosmoShip";
import type { DecodedShip } from "@/hooks/useShipDecode";
import { calculateShipStatsAsync } from "@/lib/physics";
import type { ShipStats } from "@/lib/physics";

interface ParsedShip {
  data: DecodedShip | null;
  originalFile: File | null;
}

const MAX_IMAGE_DIMENSION = 4096;

/**
 * JSON.parse() output loses the codec's FloatValue/ColorValue wrappers
 * (they serialize as {"value": n} and {"parts": [...]}); restore them so
 * encode() writes floats and colors back correctly instead of corrupt maps.
 */
function reviveCodecValues(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(reviveCodecValues);
  }
  if (node !== null && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (
      keys.length === 1 &&
      "value" in obj &&
      typeof obj.value === "number" &&
      !Number.isInteger(obj.value)
    ) {
      return new FloatValue(obj.value);
    }
    if (
      keys.length === 1 &&
      "parts" in obj &&
      Array.isArray(obj.parts) &&
      obj.parts.length === 4 &&
      obj.parts.every((p) => typeof p === "string")
    ) {
      return new ColorValue(obj.parts as [string, string, string, string]);
    }
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, reviveCodecValues(v)])
    );
  }
  return node;
}

function parseShipJson(text: string): DecodedShip {
  return reviveCodecValues(JSON.parse(text)) as DecodedShip;
}

function blankImageData(side: number): ImageDataLike {
  const pixels = side * side;
  const data = new Uint8ClampedArray(pixels * 4);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { data, width: side, height: side };
}

function sideForPayload(encodedLength: number): number {
  // 4-byte length prefix + payload, with headroom for gzip framing variance
  const neededBytes = 4 + Math.ceil(encodedLength * 1.25) + 1024;
  let side = 64;
  while (side < MAX_IMAGE_DIMENSION && (side * side * 3) / 8 < neededBytes) {
    side *= 2;
  }
  if ((side * side * 3) / 8 < neededBytes) {
    throw new Error("ship JSON too large to fit in a single PNG");
  }
  return side;
}

interface Part {
  ID: string;
  Location: [number, number];
  Rotation: number;
  FlipX?: number;
}

export default function DebugShipTool() {
  const [parsed, setParsed] = useState<ParsedShip>({
    data: null,
    originalFile: null,
  });
  const shipRef = useRef<Ship | null>(null);
  const [stats, setStats] = useState<ShipStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [showParts, setShowParts] = useState(false);
  const [showJsonInput, setShowJsonInput] = useState(false);
  const [jsonInputText, setJsonInputText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLTextAreaElement>(null);

  const parts = useMemo<Part[]>(() => {
    if (!parsed.data?.Parts) return [];
    return parsed.data.Parts.map((p) => ({
      ID: p.ID,
      Location: p.Location as [number, number],
      Rotation: p.Rotation,
      FlipX: p.FlipX,
    }));
  }, [parsed.data]);

  const partCount = parts.length;

  const generateEncodedBlob = useCallback(async (data: DecodedShip): Promise<Blob> => {
    let ship: Ship;

    if (shipRef.current) {
      ship = shipRef.current;
      ship.data = data;
    } else {
      const sizer = new Ship(blankImageData(1));
      const encodedLength = new Uint8Array(sizer.encode(data)).length;
      ship = new Ship(blankImageData(sideForPayload(encodedLength)));
      ship.data = data;
    }

    const encoded = await ship.write();
    const { imageDataToPngBlob } = await import("@/lib/cosmoShip");
    return imageDataToPngBlob(encoded);
  }, []);

  const calculateStats = useCallback(async (data: DecodedShip) => {
    setIsCalculating(true);
    try {
      const result = await calculateShipStatsAsync(data);
      setStats(result);
    } catch (err) {
      console.error("Stats calculation error:", err);
    } finally {
      setIsCalculating(false);
    }
  }, []);

  const loadShip = useCallback(async (file: File) => {
    setError(null);
    setJsonText("");
    setShowJsonInput(false);

    try {
      const ship = await Ship.fromSource(file);
      const data = ship.data as DecodedShip;

      shipRef.current = ship;
      setParsed({
        data,
        originalFile: file,
      });
      setJsonText(JSON.stringify(data, null, 2));
      calculateStats(data);
    } catch (err) {
      console.error("Load error:", err);
      setError("Failed to decode ship data from image");
    }
  }, [calculateStats]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadShip(file);
  }, [loadShip]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.startsWith("image/") || item.type === "image/png") {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) loadShip(file);
        break;
      }
    }
  }, [loadShip]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type === "image/png") {
      loadShip(file);
    }
  }, [loadShip]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleLoadJson = useCallback(async () => {
    setError(null);
    setShowJsonInput(false);

    try {
      const data = parseShipJson(jsonInputText);
      shipRef.current = null;
      setParsed({ data, originalFile: null });
      setJsonText(JSON.stringify(data, null, 2));
      calculateStats(data);
    } catch {
      setError("Invalid JSON. Please check the format.");
    }
  }, [jsonInputText, calculateStats]);

  const handleSave = useCallback(async () => {
    if (!parsed.data) return;
    setIsSaving(true);
    setError(null);

    try {
      const blob = await generateEncodedBlob(parsed.data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "modified-ship.ship.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Save error:", err);
      setError("Failed to save ship data");
    } finally {
      setIsSaving(false);
    }
  }, [parsed.data, generateEncodedBlob]);

  const handleJsonChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setJsonText(e.target.value);
  }, []);

  const handleApplyJson = useCallback(async () => {
    try {
      const data = parseShipJson(jsonText);
      setParsed(prev => ({ ...prev, data }));
      setError(null);
      calculateStats(data);
    } catch {
      setError("Invalid JSON");
    }
  }, [jsonText, calculateStats]);

  const handleExportPreview = useCallback(async () => {
    if (!parsed.data) return;
    try {
      const blob = await generateEncodedBlob(parsed.data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "modified-ship.ship.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export error:", err);
      setError("Failed to export ship");
    }
  }, [parsed.data, generateEncodedBlob]);

  const handleReset = useCallback(() => {
    shipRef.current = null;
    setParsed({ data: null, originalFile: null });
    setStats(null);
    setJsonText("");
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Input section */}
      <Card>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <h2 className="text-xl text-white">Load Ship</h2>
          <div className="flex gap-2">
            <Button onClick={() => setShowJsonInput(!showJsonInput)} variant="secondary" size="sm">
              {showJsonInput ? "Hide JSON Input" : "Paste JSON"}
            </Button>
          </div>
        </div>

        {/* File upload */}
        <div onPaste={handlePaste} onDrop={handleDrop} onDragOver={handleDragOver}>
          <p className="text-white mb-3">
            Drop a .ship.png file here, paste an image, or click to upload
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".png,image/png"
            onChange={handleFileChange}
            className="block w-full text-white"
            aria-label="Upload ship blueprint PNG"
          />
        </div>

        {/* JSON input */}
        {showJsonInput && (
          <div className="mt-4 pt-4 border-t border-[#1C598C]">
            <p className="text-white mb-3">Paste ship JSON data:</p>
            <textarea
              ref={jsonInputRef}
              value={jsonInputText}
              onChange={(e) => setJsonInputText(e.target.value)}
              placeholder='{"Parts": [...], "FlightDirection": 0, ...}'
              className="w-full h-64 p-3 bg-black/50 rounded text-sm text-green-400 font-mono border border-[#1C598C] resize-none focus:outline-none focus:ring-2 focus:ring-cyan-400/50 mb-3"
              spellCheck={false}
            />
            <div className="flex gap-2">
              <Button onClick={handleLoadJson} variant="primary" size="sm">
                Load JSON
              </Button>
              <Button onClick={() => setShowJsonInput(false)} variant="secondary" size="sm">
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Error */}
      {error && (
        <Card>
          <p className="text-red-400" role="alert">{error}</p>
        </Card>
      )}

      {/* Loaded ship content */}
      {parsed.data && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Left column: JSON editor */}
          <div className="space-y-4">
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl text-white">Ship Data (JSON)</h2>
                <div className="flex gap-2">
                  <Button onClick={handleApplyJson} variant="primary" size="sm">
                    Apply JSON
                  </Button>
                  <Button onClick={handleReset} variant="secondary" size="sm">
                    Reset
                  </Button>
                </div>
              </div>
              <textarea
                value={jsonText}
                onChange={handleJsonChange}
                className="w-full h-[500px] p-3 bg-black/50 rounded text-sm text-green-400 font-mono border border-[#1C598C] resize-none focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
                spellCheck={false}
                aria-label="Ship data JSON editor"
              />
            </Card>

            {/* Part list */}
            <Card>
              <button
                onClick={() => setShowParts(!showParts)}
                className="w-full flex items-center justify-between text-left"
                aria-expanded={showParts}
              >
                <h3 className="text-xl text-white">
                  Parts ({partCount})
                </h3>
                <span className="text-cyan-400 text-lg">
                  {showParts ? "▼" : "▶"}
                </span>
              </button>
              {showParts && (
                <div className="mt-4 overflow-auto max-h-96">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-blue-200 border-b border-[#1C598C]">
                        <th className="text-left py-2 pr-4">ID</th>
                        <th className="text-right py-2 pr-4">X</th>
                        <th className="text-right py-2 pr-4">Y</th>
                        <th className="text-right py-2 pr-4">Rotation</th>
                        <th className="text-right py-2">FlipX</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parts.map((part, idx) => (
                        <tr
                          key={idx}
                          className="border-b border-[#1C598C]/30 hover:bg-white/5"
                        >
                          <td className="py-2 pr-4 text-green-400 font-mono text-xs truncate max-w-[200px]">
                            {part.ID}
                          </td>
                          <td className="py-2 pr-4 text-white text-right font-mono">{part.Location[0]}</td>
                          <td className="py-2 pr-4 text-white text-right font-mono">{part.Location[1]}</td>
                          <td className="py-2 pr-4 text-white text-right font-mono">{part.Rotation}</td>
                          <td className="py-2 text-right font-mono text-white">
                            {part.FlipX != null ? part.FlipX : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

          </div>

          {/* Right column: Preview */}
          <div className="space-y-4">
            {/* Ship stats & reconstruction */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl text-white">Ship Preview</h2>
                {stats && (
                  <Button onClick={handleExportPreview} variant="amber" size="sm">
                    Save Modified Ship
                  </Button>
                )}
              </div>
              {isCalculating ? (
                <div className="flex items-center justify-center py-12" role="status" aria-label="Calculating ship stats">
                  <div className="flex items-center gap-3">
                    <div className="h-5 w-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                    <p className="text-blue-200 text-sm">Calculating ship stats…</p>
                  </div>
                </div>
              ) : stats && partCount > 0 ? (
                <ShipReconstruction stats={stats} parts={parts} />
              ) : (
                <p className="text-gray-500 text-center py-8">
                  {partCount === 0
                    ? "No parts in this ship"
                    : "Calculating stats..."}
                </p>
              )}
            </Card>
            {stats && partCount > 0 && (
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl text-white">Ship Stats</h2>
                </div>
                <ShipStatsPanel stats={stats} />
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Drop zone hint when no file loaded */}
      {!parsed.data && !showJsonInput && (
        <div className="text-center py-12">
          <p className="text-gray-500">
            Upload a .ship.png file or click &quot;Paste JSON&quot; to get started
          </p>
        </div>
      )}
    </div>
  );
}
