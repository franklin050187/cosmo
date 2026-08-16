"use client";

export async function downloadShip(shipId: number, shipName: string, imageUrl?: string) {
  // Best-effort download tracking (auth-gated; anonymous users get 401 — that's fine).
  fetch(`/api/ship/${shipId}/download`, { method: "POST" }).catch(() => undefined);

  try {
    const url = imageUrl ?? await (async () => {
      const res = await fetch(`/api/ship/${shipId}`);
      if (!res.ok) throw new Error("Failed to fetch ship");
      const json = await res.json();
      return json.data?.data;
    })();

    const imgRes = await fetch(url);
    const blob = await imgRes.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = shipName || `ship-${shipId}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    const fallbackUrl = imageUrl ?? `/api/ship/${shipId}`;
    const a = document.createElement("a");
    a.href = fallbackUrl;
    a.download = shipName || `ship-${shipId}.png`;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}
