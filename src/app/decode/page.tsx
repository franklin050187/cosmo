"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { Ship } from "@/lib/cosmoShip";

export default function DecodePage() {
  const router = useRouter();
  const [decodedData, setDecodedData] = useState<object | null>(null);
  const [priceResult, setPriceResult] = useState<{ price: number; crew: number; author: string; tags: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      router.replace("/");
    }
  }, [router]);

  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setPriceResult(null);

    try {
      const ship = await Ship.fromSource(file);
      setDecodedData(ship.data as object);
    } catch (err) {
      console.error("Decode error:", err);
      setError("Failed to decode ship data from image");
    }
  };

  const handleCalculate = async () => {
    if (!decodedData) return;

    setError(null);
    try {
      const { calculateShipPrice } = await import("@/lib/price");
      const result = calculateShipPrice(
        decodedData as Parameters<typeof calculateShipPrice>[0]
      );
      setPriceResult(result);
    } catch {
      setError("Failed to calculate price");
    }
  };

  return (
    <div>
      <h1 className="text-4xl text-white text-center uppercase mb-8">
        Decode Ship Blueprint
      </h1>

      <Card>
        <input
          type="file"
          accept=".png"
          onChange={handleFileChange}
          className="block w-full text-white mb-4"
        />

        {decodedData && (
          <div className="mb-4">
            <details open>
              <summary className="text-blue-200 cursor-pointer">Decoded data</summary>
              <pre className="mt-2 p-2 bg-black/50 rounded text-xs text-green-400 overflow-auto max-h-96">
                {JSON.stringify(decodedData, null, 2)}
              </pre>
            </details>
          </div>
        )}

        {priceResult && (
          <div className="mb-4 p-3 border border-[#1C598C] rounded">
            <p className="text-[#0AD448]">Price: {priceResult.price}₡</p>
            <p className="text-white">Crew: {priceResult.crew}</p>
            <p className="text-white">Author: {priceResult.author}</p>
            <p className="text-white">Tags: {priceResult.tags.join(", ")}</p>
          </div>
        )}

        {error && <p className="text-red-400 mb-4" role="alert">{error}</p>}

        {decodedData && (
          <Button onClick={handleCalculate}>
            Calculate Price
          </Button>
        )}
      </Card>
    </div>
  );
}
