"use client";

import ShipGrid from "@/components/ship/ShipGrid";
import RequireAuth from "@/components/RequireAuth";
import { useAuthFetch } from "@/hooks/useAuthFetch";
import { type ShipRow } from "@/lib/db";

function MyShipsContent() {
  const { data, loading, error, refetch } = useAuthFetch<{ data: ShipRow[] }>("/api/ship/my-ships");
  const ships = data?.data ?? [];

  return (
    <>
      <h1 className="text-4xl text-white text-center uppercase mb-8">
        My Ships
      </h1>

      {loading ? (
        <p className="text-center text-blue-200" role="status">Loading...</p>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-12 text-center" role="alert">
          <p className="text-blue-200 text-lg mb-2">Couldn&apos;t load your ships</p>
          <p className="text-gray-500 text-sm mb-4">{error}</p>
          <button
            onClick={refetch}
            aria-label="Retry loading your ships"
            className="px-4 py-2 text-sm text-cyan-400 border border-[#1C598C] rounded-lg hover:bg-cyan-400/10 transition-colors"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          <p className="text-center text-blue-200 mb-4">
            {ships.length > 0
              ? `You have uploaded ${ships.length} ship${ships.length !== 1 ? "s" : ""}`
              : "Start sharing your designs now!"}
          </p>
          <ShipGrid ships={ships} />
        </>
      )}
    </>
  );
}

export default function MyShipsPage() {
  return (
    <RequireAuth>
      <MyShipsContent />
    </RequireAuth>
  );
}
