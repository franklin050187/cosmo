import CollectionGrid from "@/components/collection/CollectionGrid";
import { type CollectionSummary } from "@/lib/types";

async function getCollections(): Promise<CollectionSummary[]> {
  try {
    const { getAllCollections } = await import("@/lib/db");
    const data = await getAllCollections(1);
    return data.data ?? [];
  } catch {
    return [];
  }
}

// Revalidate every 60 seconds
export const revalidate = 60;

export default async function CollectionsBrowsePage() {
  const collections = await getCollections();

  return (
    <>
      <h1 className="text-4xl text-white text-center uppercase mb-8">
        Collections
      </h1>

      {collections.length === 0 ? (
        <p className="text-center text-blue-200">No collections found.</p>
      ) : (
        <CollectionGrid collections={collections} />
      )}
    </>
  );
}
