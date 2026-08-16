"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { type ShipRow } from "@/lib/db";
import CollectionPicker from "@/components/collection/CollectionPicker";
import { downloadShip } from "@/lib/download-ship";
import { useAuth } from "@/hooks/useAuth";

const DISPLAY_TAGS = [
  "cannon", "deck_cannon", "emp_missiles", "flak_battery",
  "he_missiles", "large_cannon", "mines", "nukes", "railgun", "factories",
  "disruptors", "heavy_laser", "ion_beam", "ion_prism", "laser", "mining_laser",
  "point_defense", "kiter", "avoider", "rammer", "orbiter", "campaign_ship",
  "elimination_ship", "domination_ship", "diagonal", "splitter", "chaingun",
  "scout/racer", "broadsider", "waste_ship", "debugging_tool", "sundiver",
  "cargo_ship", "spinner",
];

function formatPrice(price: number): string {
  if (price >= 1_000_000) return `${(price / 1_000_000).toFixed(1)}M`;
  if (price >= 1_000) return `${(price / 1_000).toFixed(1)}K`;
  return price.toString();
}

export default function ShipCard({ ship, priority = false }: { ship: ShipRow; priority?: boolean }) {
  const tags = (ship.tags ?? []).filter((t) => DISPLAY_TAGS.includes(t)).slice(0, 4);
  const [downloading, setDownloading] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [favLoading, setFavLoading] = useState(false);
  const [shared, setShared] = useState(false);
  const router = useRouter();
  const { isLoggedIn } = useAuth();

  const saveBackUrl = () => {
    sessionStorage.setItem("shipBackUrl", window.location.pathname + window.location.search);
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadShip(ship.id, ship.ship_name, ship.data);
    } finally {
      setDownloading(false);
    }
  };

  const handleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoggedIn || favLoading) return;
    setFavLoading(true);
    setIsFavorited((cur) => !cur);
    try {
      const res = await fetch(`/api/ship/${ship.id}/${isFavorited ? "unfavorite" : "favorite"}`, { method: "POST" });
      if (!res.ok) throw new Error();
    } catch {
      setIsFavorited((cur) => !cur);
    } finally {
      setFavLoading(false);
    }
  };

  const handleShare = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const url = `${window.location.origin}/ship/${ship.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: ship.ship_name, url });
      } else {
        await navigator.clipboard.writeText(url);
      }
      setShared(true);
      setTimeout(() => setShared(false), 1500);
    } catch {
      /* user cancelled or denied clipboard */
    }
  }, [ship.id, ship.ship_name]);

  return (
    <li className="group relative border border-[#1C598C]/50 rounded-xl bg-[#021526]/80 backdrop-blur shadow-[0_0_12px_rgba(0,126,255,0.15)] hover:shadow-[0_0_20px_rgba(0,126,255,0.25)] hover:border-cyan-400/30 transition-all duration-200">
      {/* Image — a standalone, non-anchor <img> so native drags yield the image
          (PNG) itself rather than the ship-page link. Clicking the image still
          navigates to the ship page. The download/collection buttons are
          positioned outside this element so they don't intercept drags. */}
      <div className="relative overflow-hidden rounded-t-xl">
        <Image
          src={ship.data}
          alt={ship.ship_name}
          width={400}
          height={400}
          unoptimized
          draggable
          fetchPriority={priority ? "high" : undefined}
          loading={priority ? "eager" : "lazy"}
          className="block w-full aspect-square object-contain bg-[#0a1e33]/50 group-hover:scale-[1.02] transition-transform duration-300 cursor-pointer"
          onClick={() => {
            saveBackUrl();
            router.push(`/ship/${ship.id}`);
          }}
        />

        {/* Stats overlay — top */}
        <div className="pointer-events-none absolute top-0 inset-x-0 flex items-center justify-between px-2.5 py-2 bg-gradient-to-b from-black/60 to-transparent">
          <span className="flex items-center gap-1 text-white text-xs font-medium">
            <svg className="w-3 h-3 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            {ship.fav}
          </span>
          <span className="flex items-center gap-1 text-white/70 text-xs">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            {ship.downloads}
          </span>
        </div>

        {/* Price badge — bottom left */}
        <div className="pointer-events-none absolute bottom-2 left-2 bg-[#021526]/80 backdrop-blur-sm border border-[#1C598C]/50 rounded-lg px-2 py-1">
          <span className="text-[#0AD448] text-xs font-semibold">
            {formatPrice(ship.price)}&#x20a2;
          </span>
        </div>
      </div>

      {/* Action buttons — outside the Link so clicks don't navigate */}
      <div className="absolute top-0 right-0 mt-9 mr-1 flex flex-col gap-0.5">
        <button
          onClick={handleDownload}
          disabled={downloading}
          aria-label={`Download ${ship.ship_name}`}
          className="p-1 rounded bg-[#021526]/80 border border-[#1C598C]/30 text-white/60 hover:text-cyan-300 hover:border-cyan-400/40 transition-colors disabled:opacity-40"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>
        {isLoggedIn && (
          <CollectionPicker shipId={ship.id}>
            <button
              aria-label={`Add ${ship.ship_name} to collection`}
              className="p-1 rounded bg-[#021526]/80 border border-[#1C598C]/30 text-white/60 hover:text-cyan-300 hover:border-cyan-400/40 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </CollectionPicker>
        )}
        {isLoggedIn && (
          <button
            onClick={handleFavorite}
            disabled={favLoading}
            aria-label={isFavorited ? `Unfavorite ${ship.ship_name}` : `Favorite ${ship.ship_name}`}
            aria-pressed={isFavorited}
            className="p-1 rounded bg-[#021526]/80 border border-[#1C598C]/30 text-white/60 hover:text-yellow-300 hover:border-yellow-400/40 transition-colors disabled:opacity-40"
          >
            <svg className="w-3.5 h-3.5" fill={isFavorited ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </button>
        )}
        <button
          onClick={handleShare}
          aria-label={shared ? "Link copied!" : `Copy link to ${ship.ship_name}`}
          className="p-1 rounded bg-[#021526]/80 border border-[#1C598C]/30 text-white/60 hover:text-cyan-300 hover:border-cyan-400/40 transition-colors"
        >
          {shared ? (
            <svg className="w-3.5 h-3.5 text-cyan-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 015.656 0l1.415 1.415a4 4 0 01-5.656 5.656l-1.415-1.415M10.172 13.828a4 4 0 01-5.656 0l-1.415-1.415a4 4 0 015.656-5.656l1.415 1.415m-.708 9.192l4.242-4.242m-4.242 0l4.242 4.242" />
            </svg>
          )}
        </button>
      </div>

      {/* Info */}
      <div className="px-3 py-2.5 border-t border-[#1C598C]/30">
        <Link href={`/ship/${ship.id}`} className="block" aria-label={`${ship.ship_name} — view details`} onClick={saveBackUrl}>
          <h3 className="text-white text-sm font-medium truncate hover:text-cyan-300 transition-colors" title={ship.ship_name}>
            {ship.ship_name}
          </h3>
        </Link>

        <p className="text-gray-500 text-xs mt-0.5 truncate">
          by{" "}
          {ship.author ? (
            <Link href={`/?author=${encodeURIComponent(ship.author)}`} className="text-blue-300 hover:text-cyan-300 transition-colors" aria-label={`Ships by ${ship.author}`}>{ship.author}</Link>
          ) : (
            <span className="text-gray-400">Unknown</span>
          )}
          {" "}&middot; {ship.crew} crew
        </p>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {tags.map((tag) => (
              <Link
                key={tag}
                href={`/?tag=${encodeURIComponent(tag)}`}
                className="inline-block bg-[#0a1e33] text-blue-300/80 text-[10px] px-1.5 py-0.5 rounded border border-[#1C598C]/30 hover:bg-cyan-400/10 hover:text-cyan-300 hover:border-cyan-400/30 transition-colors"
              >
                {tag}
              </Link>
            ))}
            {(ship.tags?.length ?? 0) > 4 && (
              <span className="text-[10px] text-gray-500 py-0.5">+{(ship.tags?.length ?? 0) - 4}</span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
