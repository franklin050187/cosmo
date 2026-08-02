import Card from "@/components/ui/Card";
import Link from "next/link";
import { sanitizeHtml } from "@/lib/sanitize";

interface CollectionSummary {
  id: number;
  owner: string;
  title: string;
  description: string;
  ship_count: number | null;
  created_at: string;
}

interface Props {
  collection: CollectionSummary;
  onDelete?: (id: number) => void;
}

export default function CollectionCard({ collection, onDelete }: Props) {
  return (
    <Card className="relative hover:border-cyan-400/40 transition-colors group">
      <Link
        href={`/collections/${collection.id}`}
        className="block"
      >
        <h3 className="text-white font-semibold text-lg truncate">
          {collection.title}
        </h3>
        {collection.description && (
          <p className="text-blue-200 text-sm mt-1 line-clamp-2" dangerouslySetInnerHTML={{ __html: sanitizeHtml(collection.description) }} />
        )}
        <div className="flex items-center justify-between mt-3 text-xs text-blue-300">
          <span>by {collection.owner}</span>
          <span>
            {collection.ship_count ?? 0} ship{(collection.ship_count ?? 0) !== 1 ? "s" : ""}
          </span>
        </div>
      </Link>
      {onDelete && (
        <button
          onClick={(e) => { e.preventDefault(); onDelete(collection.id); }}
          className="absolute top-2 right-2 p-1.5 rounded text-gray-500 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-all"
          title="Delete collection"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      )}
    </Card>
  );
}
