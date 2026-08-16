import CollectionCard from "./CollectionCard";

interface CollectionSummary {
  id: number;
  owner: string;
  title: string;
  description: string;
  ship_count: number | null;
  thumb_url: string | null;
  created_at: string;
}

interface Props {
  collections: CollectionSummary[];
  onDelete?: (id: number) => void;
}

export default function CollectionGrid({ collections, onDelete }: Props) {
  if (collections.length === 0) {
    return (
      <p className="text-center text-blue-200 py-8">No collections yet.</p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {collections.map((col) => (
        <CollectionCard key={col.id} collection={col} onDelete={onDelete} />
      ))}
    </div>
  );
}
