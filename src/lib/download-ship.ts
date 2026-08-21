"use client";

export function sanitizeFilename(name: string, shipId: number): string {
  let base = (name || `ship-${shipId}`).replace(/\.ship\.png$/i, "");
  base = base.replace(/[^\w\- .()]/g, "_").replace(/\s+/g, " ").trim();
  if (!base) base = `ship-${shipId}`;
  return `${base}.png`;
}

export async function downloadShip(shipId: number, shipName: string, imageUrl?: string) {
  // Best-effort download tracking (auth-gated; anonymous users get 401 — that's fine).
  fetch(`/api/ship/${shipId}/download`, { method: "POST" }).catch(() => undefined);

  const filename = sanitizeFilename(shipName, shipId);

  try {
    const url = imageUrl ?? await (async () => {
      const res = await fetch(`/api/ship/${shipId}`);
      if (!res.ok) throw new Error("Failed to fetch ship");
      const json = await res.json();
      return json.data?.data;
    })();

    const imgRes = await fetch(url);
    if (!imgRes.ok) throw new Error("Failed to fetch image");
    const blob = await imgRes.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    const fallbackUrl = imageUrl ?? `/api/ship/${shipId}`;
    const a = document.createElement("a");
    a.href = fallbackUrl;
    a.download = filename;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}