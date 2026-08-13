"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useShipDecode } from "@/hooks/useShipDecode";
import Button from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import Card from "@/components/ui/Card";
import PreconnectForImage from "@/components/ui/PreconnectForImage";
import TurnstileWidget from "@/components/TurnstileWidget";
import { formatDate } from "@/lib/format-date";
import { type ShipDetail } from "@/lib/types";

const ShipStats = dynamic(() => import("@/components/ship/ShipStats"), {
  ssr: false,
  loading: () => (
    <Card className="mt-6">
      <div className="flex items-center gap-3">
        <div className="h-5 w-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-blue-200">Analyzing ship…</p>
      </div>
    </Card>
  ),
});
const ShipJson = dynamic(() => import("@/components/ship/ShipJson"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center gap-3 mt-6">
      <div className="h-4 w-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
      <p className="text-blue-200 text-sm">Decoding ship blueprint…</p>
    </div>
  ),
});
const ShipPriceAnalysis = dynamic(
  () => import("@/components/ship/ShipPriceAnalysis"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center gap-3">
        <div className="h-5 w-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-blue-200">Analyzing price breakdown…</p>
      </div>
    ),
  }
);
import AddToCollectionButton from "@/components/collection/AddToCollectionButton";
import { sanitizeHtml } from "@/lib/sanitize";
import { downloadShip } from "@/lib/download-ship";

export default function ShipDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoggedIn } = useAuth();
  const [ship, setShip] = useState<ShipDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [showPriceAnalysis, setShowPriceAnalysis] = useState(false);
  const [collections, setCollections] = useState<{ id: number; title: string; owner: string }[]>([]);
  const [backUrl, setBackUrl] = useState("/");
  const [pendingDelete, setPendingDelete] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      setBackUrl(sessionStorage.getItem("shipBackUrl") || "/");
    }, 0);
    return () => clearTimeout(id);
  }, []);

   useEffect(() => {
     let active = true;
     const controller = new AbortController();

     const fetchShip = async () => {
       try {
          const res = await fetch(`/api/ship/${params.id}`, { signal: controller.signal });
          if (!res.ok) throw new Error("Ship not found");
          const json = await res.json();
           if (!active) return;
           const data = json.data ?? json;
           setShip(data);
           const name = data.ship_name?.replace(".ship.png", "") ?? "Ship";
           document.title = `${name} - CosmoShip`;
           const pageUrl = `${window.location.origin}${window.location.pathname}`;
           const ogImage = data.data;
           const setOg = (name: string, content: string) => {
             let el = document.querySelector(`meta[property="${name}"]`);
             if (!el) {
               el = document.createElement("meta");
               el.setAttribute("property", name);
               document.head.appendChild(el);
             }
             el.setAttribute("content", content);
           };
           setOg("og:title", `${name} - CosmoShip`);
           setOg("og:description", data.description || document.querySelector('meta[name="description"]')?.getAttribute("content") || "");
           if (ogImage) setOg("og:image", ogImage);
           setOg("og:url", pageUrl);
           setOg("twitter:title", `${name} - CosmoShip`);
           if (ogImage) setOg("twitter:image", ogImage);
           let canon = document.querySelector('link[rel="canonical"]');
           if (!canon) {
             canon = document.createElement("link");
             canon.setAttribute("rel", "canonical");
             document.head.appendChild(canon);
           }
           (canon as HTMLLinkElement).href = pageUrl;
          if (user?.username === data.submitted_by) {
            setIsOwner(true);
          }
        } catch {
          if (active) setError("Ship not found");
        } finally {
          if (active) setLoading(false);
        }
      };

      const fetchCollections = async () => {
        try {
          const res = await fetch(`/api/collections?shipId=${params.id}`, { signal: controller.signal });
          if (!res.ok) throw new Error("Failed to fetch collections");
          const json = await res.json();
          if (active) setCollections(json.data ?? []);
       } catch {
         /* silent */
       }
     };

     fetchShip();
     fetchCollections();
     return () => { active = false; controller.abort(); };
   }, [params.id, user?.username]);

    const handleFavorite = async () => {
     if (!isLoggedIn) return;
     setIsFavorited(true);
     try {
       await fetch(`/api/ship/${params.id}/favorite`, {
         method: "POST",
       });
     } catch (err) {
       console.error("Failed to add favorite:", err);
       setIsFavorited(false);
     }
   };

   const handleUnfavorite = async () => {
     if (!isLoggedIn) return;
     setIsFavorited(false);
     try {
       await fetch(`/api/ship/${params.id}/unfavorite`, {
         method: "POST",
       });
     } catch (err) {
       console.error("Failed to remove favorite:", err);
       setIsFavorited(true);
     }
   };

  const handleDownload = () => {
    if (!ship) return;
    downloadShip(Number(params.id), ship.ship_name, ship.data);
  };

  const handleDelete = () => {
    if (!isLoggedIn) return;
    if (!confirm("Are you sure you want to delete this ship?")) return;
    setPendingDelete(true);
  };

  const onDeleteVerify = async (token: string) => {
    if (!pendingDelete || !token) return;
    try {
      await fetch(`/api/ship/${params.id}`, {
        method: "DELETE",
        headers: { "x-turnstile-token": token },
      });
      router.push(backUrl);
    } catch (err) {
      console.error("Failed to delete ship:", err);
      setPendingDelete(false);
    }
  };

  if (loading) return <p className="text-center text-blue-200" role="status">Loading...</p>;
  if (error) return <p className="text-center text-red-400" role="alert">{error}</p>;
  if (!ship) return <p className="text-center text-red-400">Ship not found.</p>;
  if (!ship.data) return <p className="text-center text-red-400">Ship data is missing.</p>;

  return (
    <div>
      <PreconnectForImage src={ship.data} />

      <Link href={backUrl} className="inline-flex items-center gap-1.5 text-sm text-blue-300 hover:text-cyan-300 transition-colors mb-6">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to results
      </Link>

      <h1 className="text-4xl text-white text-center uppercase mb-8">
        {ship.ship_name.replace(".ship.png", "")}
      </h1>

      {ship && <ShipAnalysisPreloader imageUrl={ship.data} />}

      <Card>
        <div className="flex flex-col lg:flex-row gap-8">
          <div className="flex-shrink-0">
            <Image
              src={ship.data}
              alt={ship.ship_name}
              width={512}
              height={512}
              unoptimized
              fetchPriority="high"
              className="max-w-[512px] w-full h-auto"
            />
          </div>

          <div className="flex-1">
            <p className="text-white mb-2">
              <span className="text-blue-200">Author:</span>{" "}
              <Link
                href={`/?author=${encodeURIComponent(ship.author)}`}
                className="text-cyan-400 hover:underline"
              >
                {ship.author}
              </Link>
            </p>
            <p className="text-white mb-2">
              <span className="text-blue-200">Description:</span>{" "}
              <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(ship.description) }} />
            </p>
            <p className="text-[#0AD448] mb-2">
              <span className="text-blue-200">Cost:</span> {ship.price}₡
            </p>
            <p className="text-white mb-2">
              <span className="text-blue-200">Crew:</span> {ship.crew}
            </p>
            <p className="text-white mb-2">
              <span className="text-blue-200">Popularity:</span> {ship.downloads}
            </p>
            <p className="text-white mb-2">
              <span className="text-blue-200">Submitted by:</span> {ship.submitted_by}
            </p>
            <p className="text-white mb-2">
              <span className="text-blue-200">Uploaded:</span> {formatDate(ship.date)}
            </p>

            {ship.brand === "exl" && (
              <p className="text-yellow-400 mb-2">
                WARNING: This ship is from the Excelsior library, it requires piloting skills.
              </p>
            )}

            {ship.tags.length > 0 && (
              <div className="mb-3">
                <span className="text-blue-200">Tags:</span>{" "}
                <div className="flex flex-wrap gap-1 mt-1">
                  {ship.tags.map((tag) => (
                    <Link
                      key={tag}
                      href={`/?tag=${encodeURIComponent(tag)}`}
                      className="inline-block bg-[#00305e] text-white px-2 py-1 rounded hover:bg-[#00408e] transition-colors"
                    >
                      {tag}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {collections.length > 0 && (
              <p className="text-white mb-3">
                <span className="text-blue-200">Collections:</span>{" "}
                {collections.map((c, i) => (
                  <span key={c.id}>
                    {i > 0 && ", "}
                    <Link
                      href={`/collections/${c.id}`}
                      className="text-cyan-400 hover:underline"
                    >
                      {c.title}
                    </Link>
                  </span>
                ))}
              </p>
            )}

            <div className="flex gap-2 flex-wrap mb-3">
              {isLoggedIn ? (
                isFavorited ? (
                  <Button
                    onClick={handleUnfavorite}
                  >
                    ★ Unfavorite
                  </Button>
                ) : (
                  <Button
                    onClick={handleFavorite}
                  >
                    ☆ Favorite
                  </Button>
                )
              ) : (
                <Link
                  href={`/auth/discord?returnTo=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname + window.location.search : "/")}`}
                  suppressHydrationWarning
                  className="px-4 py-2 border border-[#1C598C] rounded bg-gradient-to-b from-[#5865F2]/25 to-[#4752C4]/25 text-[#5865F2] hover:bg-[#5865F2]/20 hover:text-white transition-colors"
                >
                  Login to favorite
                </Link>
              )}

              <Button
                onClick={handleDownload}
              >
                ↓ Download
              </Button>

              {isLoggedIn && <AddToCollectionButton shipId={ship.id} />}
            </div>

            {isOwner && (
              <div className="flex gap-2 flex-wrap mb-3">
                <Link
                  href={`/ship/${params.id}/edit`}
                  className="px-4 py-2 border border-[#1C598C] rounded bg-gradient-to-b from-[#1e3851]/25 to-[#124c80]/25 text-cyan-400 hover:bg-cyan-400/20 hover:text-white transition-colors"
                >
                  Edit
                </Link>
                <Button variant="danger" onClick={handleDelete}>
                  Delete
                </Button>
              </div>
            )}

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => { setShowStats(!showStats); if (!showStats) { setShowJson(false); setShowPriceAnalysis(false); } }}
                aria-pressed={showStats}
                aria-label="Toggle ship stats"
                className={`px-4 py-2 border rounded transition-colors ${showStats ? "border-cyan-400 bg-cyan-400/20 text-white" : "border-[#1C598C] bg-gradient-to-b from-[#1e3851]/25 to-[#124c80]/25 text-cyan-400 hover:bg-cyan-400/20 hover:text-white"}`}
              >
                Stats
              </button>
              <button
                onClick={() => { setShowPriceAnalysis(!showPriceAnalysis); if (!showPriceAnalysis) { setShowStats(false); setShowJson(false); } }}
                aria-pressed={showPriceAnalysis}
                aria-label="Toggle price analysis"
                className={`px-4 py-2 border rounded transition-colors ${showPriceAnalysis ? "border-cyan-400 bg-cyan-400/20 text-white" : "border-[#1C598C] bg-gradient-to-b from-[#1e3851]/25 to-[#124c80]/25 text-cyan-400 hover:bg-cyan-400/20 hover:text-white"}`}
              >
                Price Analysis
              </button>
              <button
                onClick={() => { setShowJson(!showJson); if (!showJson) { setShowStats(false); setShowPriceAnalysis(false); } }}
                aria-pressed={showJson}
                aria-label="Toggle ship JSON blueprint"
                className={`px-4 py-2 border rounded transition-colors ${showJson ? "border-cyan-400 bg-cyan-400/20 text-white" : "border-[#1C598C] bg-gradient-to-b from-[#1e3851]/25 to-[#124c80]/25 text-cyan-400 hover:bg-cyan-400/20 hover:text-white"}`}
              >
                JSON
              </button>
            </div>
          </div>
        </div>
      </Card>

      {showStats && <ShipStats imageUrl={ship.data} />}
      {showPriceAnalysis && (
        <Card className="mt-6">
          <ShipPriceAnalysisWrapper imageUrl={ship.data} />
        </Card>
      )}
      {showJson && <div className="mt-6"><ShipJson imageUrl={ship.data} /></div>}
      {isOwner && pendingDelete && <TurnstileWidget onVerify={onDeleteVerify} />}
    </div>
  );
}

function deferIdle(cb: () => void): () => void {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(cb, { timeout: 2000 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(cb, 1500);
  return () => window.clearTimeout(id);
}

function ShipAnalysisPreloader({ imageUrl }: { imageUrl: string }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    return deferIdle(() => setReady(true));
  }, []);

  if (!ready) return null;
  return <ShipAnalysisIndicator imageUrl={imageUrl} />;
}

function ShipAnalysisIndicator({ imageUrl }: { imageUrl: string }) {
  const { loading } = useShipDecode(imageUrl);

  if (!loading) return null;

  return (
    <div className="flex items-center justify-center gap-3 py-3">
      <div className="h-5 w-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
      <p className="text-blue-200 text-sm">
        Analyzing blueprint… this can take a moment for large ships
      </p>
    </div>
  );
}

function ShipPriceAnalysisWrapper({ imageUrl }: { imageUrl: string }) {
  const { decoded, loading, error } = useShipDecode(imageUrl);

  if (loading) {
    return (
      <div className="flex items-center gap-3">
        <div className="h-5 w-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-blue-200">Analyzing price breakdown...</p>
      </div>
    );
  }

  if (error) {
    return <p className="text-red-400">{error}</p>;
  }

  if (!decoded) return null;

  return <ShipPriceAnalysis decoded={decoded} />;
}
