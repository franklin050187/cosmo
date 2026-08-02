"use client";

import ShipGrid from "@/components/ship/ShipGrid";
import RequireAuth from "@/components/RequireAuth";
import { useAuthFetch } from "@/hooks/useAuthFetch";
import { type ShipRow } from "@/lib/db";

function MyShipsContent() {
  const { data, loading } = useAuthFetch<{ data: ShipRow[] }>("/api/ship/my-ships");
  const ships = data?.data ?? [];

  return (
    <>
      <h1 className="text-4xl text-white text-center uppercase mb-8">
        My Ships
      </h1>

      {loading ? (
        <p className="text-center text-blue-200">Loading...</p>
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
