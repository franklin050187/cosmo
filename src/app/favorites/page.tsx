"use client";

import ShipGrid from "@/components/ship/ShipGrid";
import RequireAuth from "@/components/RequireAuth";
import { useAuthFetch } from "@/hooks/useAuthFetch";
import { type ShipRow } from "@/lib/db";

function FavoritesContent() {
  const { data, loading } = useAuthFetch<{ data: ShipRow[] }>("/api/ship/favorites");
  const ships = data?.data ?? [];

  return (
    <>
      <h1 className="text-4xl text-white text-center uppercase mb-8">
        My Favorites
      </h1>

      {loading ? (
        <p className="text-center text-blue-200" role="status">Loading...</p>
      ) : (
        <>
          <p className="text-center text-blue-200 mb-4">
            {ships.length > 0
              ? `You have ${ships.length} favorite ship${ships.length !== 1 ? "s" : ""}`
              : "Start adding ships to your collection now!"}
          </p>
          <ShipGrid ships={ships} />
        </>
      )}
    </>
  );
}

export default function FavoritesPage() {
  return (
    <RequireAuth>
      <FavoritesContent />
    </RequireAuth>
  );
}
