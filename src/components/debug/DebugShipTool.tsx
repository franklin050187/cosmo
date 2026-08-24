"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ShipReconstruction from "@/components/ship/ShipReconstruction";
import ShipStatsPanel from "@/components/ship/ShipStatsPanel";
import { Ship } from "@/lib/cosmoShip";
import type { DecodedShip } from "@/hooks/useShipDecode";
import { calculateShipStatsAsync } from "@/lib/physics";
import type { ShipStats } from "@/lib/physics";
import { genPartsById } from "@/lib/shipgen/parts-db";
import { buildPartList } from "@/lib/shipgen/partlist";
import { buildShipFromPartList } from "@/lib/shipgen/shuffle";
import { autoDoors, pruneDoors, validateShip } from "@/lib/shipgen/generator";
import { checkDirectionalConstraints } from "@/lib/shipgen/constraints";
import { supplyStats } from "@/lib/shipgen/pathfinding";
import { analyzeSustain } from "@/lib/shipgen/sustain";
import { computeBalance } from "@/lib/shipgen/balance";
import { calculatePrice } from "@/lib/price";

interface Part {
  ID: string;
  Location: [number, number];
  Rotation: number;
  FlipX?: number;
}

interface GenReport {
  price: number;
  budget: number;
  partCount: number;
  doorCount: number;
  skipped: string[];
  validation: { valid: boolean; errors: string[] };
  directionalViolations: number;
  sustainLines: string[];
  supplyLine: string | null;
}

const WEAPON_IDS = Object.values(genPartsById)
  .filter((d) => d.typeCategories.includes("weapon"))
  .map((d) => d.id)
  .sort();

export default function DebugShipTool() {
  const [data, setData] = useState<DecodedShip | null>(null);
  const [stats, setStats] = useState<ShipStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState<string>("");
  const [showParts, setShowParts] = useState(false);

  const [budget, setBudget] = useState("100000");
  const [weapon, setWeapon] = useState("cosmoteer.laser_blaster_small");
  const [variant, setVariant] = useState(0);
  const [report, setReport] = useState<GenReport | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const parts = useMemo<Part[]>(() => {
    if (!data?.Parts) return [];
    return data.Parts.map((p) => ({
      ID: p.ID,
      Location: p.Location as [number, number],
      Rotation: p.Rotation,
      FlipX: p.FlipX,
    }));
  }, [data]);

  const partCount = parts.length;

  const calculateStats = useCallback(async (shipData: DecodedShip) => {
    try {
      const result = await calculateShipStatsAsync(shipData);
      setStats(result);
    } catch (err) {
      console.error("Stats calculation error:", err);
    }
  }, []);

  const applyData = useCallback(
    (shipData: DecodedShip) => {
      setData(shipData);
      setJsonText(JSON.stringify(shipData, null, 2));
      calculateStats(shipData);
    },
    [calculateStats],
  );

  const handleGenerate = useCallback(() => {
    setError(null);
    setReport(null);
    const budgetNum = Number(budget);
    if (!Number.isFinite(budgetNum) || budgetNum < 20000) {
      setError("Budget must be a number of at least 20000.");
      return;
    }
    try {
      const list = buildPartList({ budget: budgetNum, variant });
      const { parts: placed, skipped } = buildShipFromPartList({ list, variant });
      const doors = pruneDoors(placed, autoDoors(placed));
      const validation = validateShip(placed, doors);
      const directional = checkDirectionalConstraints(placed);
      const supply = supplyStats(placed, doors);
      const tree = {
        Name: `Gen ${weapon} ${budgetNum} v${variant}`,
        FlightDirection: 0,
        Parts: placed.map((p) => ({
          FlipX: false,
          ID: p.part.id,
          Location: p.loc,
          Rotation: p.rot,
        })),
        Doors: doors.map((d) => ({
          Cell: d.cell,
          ID: "cosmoteer.door",
          Orientation: d.orientation,
        })),
      };
      const price = calculatePrice(tree as Parameters<typeof calculatePrice>[0]);
      const balance = computeBalance(placed);
      const sustain = analyzeSustain(list.entries, (id) => genPartsById[id], {
        tripSeconds: Number.isNaN(supply.avgSeconds) ? undefined : supply.avgSeconds,
      });
      applyData(tree as unknown as DecodedShip);
      setReport({
        price: price.price,
        budget: budgetNum,
        partCount: placed.length,
        doorCount: doors.length,
        skipped,
        validation,
        directionalViolations: directional.violations.length,
        sustainLines: [
          `grid ${Math.round(sustain.gridUse)}/${sustain.gridGen} per sec`,
          `thruster drain ${sustain.fuelDrainPerSec}/sec, refill crews ${sustain.refillCrewNeeded}`,
          `crew required ${sustain.crewRequiredTotal}, provided ${sustain.crewProvided}`,
          sustain.ok ? "sustainable at full throttle" : `NOT sustainable: ${sustain.problems.join("; ")}`,
          `balance COM x ${balance.com.x.toFixed(2)}, thrust x ${balance.thrustCenter.x.toFixed(2)}, force ${balance.totalForce}`,
          balance.balanced
            ? "balanced in flight"
            : `UNBALANCED: thrust off COM by ${balance.lateralOffset.toFixed(2)} tiles`,
        ],
        supplyLine: Number.isNaN(supply.avgSeconds)
          ? null
          : `refill walk avg ${supply.avgSeconds.toFixed(1)}s, max ${supply.maxSeconds.toFixed(1)}s`,
      });
    } catch (err) {
      console.error("Generation error:", err);
      setError("Generation failed. See console for details.");
    }
  }, [budget, weapon, variant, applyData]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setError(null);
      Ship.fromSource(file)
        .then((ship) => {
          applyData(ship.data as DecodedShip);
        })
        .catch((err) => {
          console.error("Load error:", err);
          setError("Failed to decode ship data from image");
        });
    },
    [applyData],
  );

  const handleApplyJson = useCallback(() => {
    try {
      const parsedJson = JSON.parse(jsonText) as DecodedShip;
      setData(parsedJson);
      setError(null);
      calculateStats(parsedJson);
    } catch {
      setError("Invalid JSON");
    }
  }, [jsonText, calculateStats]);

  const handleExportPng = useCallback(async () => {
    if (!data) return;
    try {
      const blankCanvas = document.createElement("canvas");
      blankCanvas.width = 512;
      blankCanvas.height = 512;
      const ctx = blankCanvas.getContext("2d")!;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, 512, 512);
      const imageData = ctx.getImageData(0, 0, 512, 512);
      const ship = new Ship(imageData);
      ship.data = data;
      const encoded = await ship.write();
      const { imageDataToPngBlob } = await import("@/lib/cosmoShip");
      const blob = await imageDataToPngBlob(encoded);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "generated-ship.ship.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export error:", err);
      setError("Failed to export ship PNG");
    }
  }, [data]);

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-xl text-white mb-4">Generate Ship</h2>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <label className="text-blue-200 text-sm">
            Budget
            <input
              type="number"
              value={budget}
              min={20000}
              step={5000}
              onChange={(e) => setBudget(e.target.value)}
              className="block mt-1 px-3 py-2 bg-black/50 rounded text-white border border-[#1C598C] w-40"
            />
          </label>
          <label className="text-blue-200 text-sm">
            Weapon
            <select
              value={weapon}
              onChange={(e) => setWeapon(e.target.value)}
              className="block mt-1 px-3 py-2 bg-black/50 rounded text-white border border-[#1C598C]"
            >
              {WEAPON_IDS.map((id) => (
                <option key={id} value={id}>
                  {id.replace("cosmoteer.", "")}
                </option>
              ))}
            </select>
          </label>
          <label className="text-blue-200 text-sm">
            Variant
            <input
              type="number"
              value={variant}
              min={0}
              max={9}
              onChange={(e) => setVariant(Number(e.target.value))}
              className="block mt-1 px-3 py-2 bg-black/50 rounded text-white border border-[#1C598C] w-24"
            />
          </label>
          <Button onClick={handleGenerate}>Generate</Button>
        </div>

        {report && (
          <div className="mt-4 pt-4 border-t border-[#1C598C] text-sm space-y-1">
            <p className={report.validation.valid && report.directionalViolations === 0 ? "text-[#0AD448]" : "text-red-400"}>
              {report.validation.valid
                ? report.directionalViolations === 0
                  ? "Valid layout, all directional rules pass"
                  : `${report.directionalViolations} directional violations`
                : `Invalid: ${report.validation.errors.join("; ")}`}
            </p>
            <p className="text-white">
              Price {report.price}₡ of {report.budget}₡ budget · {report.partCount} parts ·{" "}
              {report.doorCount} doors
              {report.skipped.length > 0 ? ` · ${report.skipped.length} skipped` : ""}
            </p>
            {report.sustainLines.map((line) => (
              <p key={line} className="text-blue-200">
                {line}
              </p>
            ))}
            {report.supplyLine && <p className="text-blue-200">{report.supplyLine}</p>}
          </div>
        )}
      </Card>

      {error && (
        <Card>
          <p className="text-red-400" role="alert">
            {error}
          </p>
        </Card>
      )}

      {data && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="space-y-4">
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl text-white">Ship Data (JSON)</h2>
                <div className="flex gap-2">
                  <Button onClick={handleApplyJson} variant="primary" size="sm">
                    Apply JSON
                  </Button>
                  <Button onClick={handleExportPng} variant="amber" size="sm">
                    Download PNG
                  </Button>
                </div>
              </div>
              <textarea
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                className="w-full h-[500px] p-3 bg-black/50 rounded text-sm text-green-400 font-mono border border-[#1C598C] resize-none focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
                spellCheck={false}
                aria-label="Ship data JSON editor"
              />
            </Card>

            <Card>
              <button
                onClick={() => setShowParts(!showParts)}
                className="w-full flex items-center justify-between text-left"
                aria-expanded={showParts}
              >
                <h3 className="text-xl text-white">Parts ({partCount})</h3>
                <span className="text-cyan-400 text-lg">{showParts ? "▼" : "▶"}</span>
              </button>
              {showParts && (
                <div className="mt-4 overflow-auto max-h-96">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-blue-200 border-b border-[#1C598C]">
                        <th className="text-left py-2 pr-4">ID</th>
                        <th className="text-right py-2 pr-4">X</th>
                        <th className="text-right py-2 pr-4">Y</th>
                        <th className="text-right py-2">Rotation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parts.map((part, idx) => (
                        <tr key={idx} className="border-b border-[#1C598C]/30 hover:bg-white/5">
                          <td className="py-2 pr-4 text-green-400 font-mono text-xs truncate max-w-[220px]">
                            {part.ID}
                          </td>
                          <td className="py-2 pr-4 text-white text-right font-mono">{part.Location[0]}</td>
                          <td className="py-2 pr-4 text-white text-right font-mono">{part.Location[1]}</td>
                          <td className="py-2 text-right font-mono text-white">{part.Rotation}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <h2 className="text-xl text-white mb-4">Ship Preview</h2>
              {stats && partCount > 0 ? (
                <ShipReconstruction stats={stats} parts={parts} />
              ) : (
                <p className="text-gray-500 text-center py-8">No parts to preview</p>
              )}
            </Card>
            {stats && partCount > 0 && (
              <Card>
                <h2 className="text-xl text-white mb-4">Ship Stats</h2>
                <ShipStatsPanel stats={stats} />
              </Card>
            )}
          </div>
        </div>
      )}

      {!data && !error && (
        <div className="text-center py-12">
          <p className="text-gray-500">
            Set a budget and weapon above, then Generate. Or upload an existing .ship.png.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".png,image/png"
            onChange={handleFileChange}
            className="mt-4 block mx-auto text-white"
            aria-label="Upload ship blueprint PNG"
          />
        </div>
      )}
    </div>
  );
}
