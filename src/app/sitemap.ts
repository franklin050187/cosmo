import { MetadataRoute } from "next";
import { fetchAll } from "@/lib/db";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.CLIENT_URL ?? "http://localhost:3000";

  const shipRows = await fetchAll("SELECT id, date FROM shipdb ORDER BY date DESC LIMIT 50000");
  const collectionRows = await fetchAll("SELECT id, created_at FROM collections ORDER BY created_at DESC LIMIT 50000");

  const ships = shipRows.map((row: { id: number; date: string }) => ({
    url: `${baseUrl}/ship/${row.id}`,
    lastModified: new Date(row.date),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  const collections = collectionRows.map((row: { id: number; created_at: string }) => ({
    url: `${baseUrl}/collections/${row.id}`,
    lastModified: new Date(row.created_at),
    changeFrequency: "monthly" as const,
    priority: 0.5,
  }));

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${baseUrl}/upload`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/about-game`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/collections`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.7,
    },
    ...ships,
    ...collections,
  ];
}
