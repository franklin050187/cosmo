export default function ShipGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <li
          key={i}
          className="relative border border-[#1C598C]/30 rounded-xl bg-[#021526]/60 overflow-hidden"
        >
          <div className="aspect-square bg-[#0a1e33]/50 animate-pulse" />
          <div className="px-3 py-2.5 border-t border-[#1C598C]/30 space-y-2">
            <div className="h-3 w-3/4 rounded bg-[#0a1e33]/70 animate-pulse" />
            <div className="h-2.5 w-1/2 rounded bg-[#0a1e33]/50 animate-pulse" />
            <div className="flex gap-1.5">
              <div className="h-3 w-10 rounded bg-[#0a1e33]/50 animate-pulse" />
              <div className="h-3 w-12 rounded bg-[#0a1e33]/50 animate-pulse" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
