"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
interface Collection {
  id: number;
  title: string;
  ship_count: number | null;
  has_ship?: boolean;
}

interface Props {
  shipId: number;
  children: React.ReactNode;
  className?: string;
}

export default function CollectionPicker({ shipId, children, className }: Props) {
  const { isLoggedIn } = useAuth();
  const [open, setOpen] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const msgTimer = useRef<number | undefined>(undefined);

  const fetchCollections = useCallback(async (signal?: AbortSignal) => {
    if (!isLoggedIn) return;

    setLoading(true);

    try {
      const res = await fetch(`/api/collections/mine?shipId=${shipId}`, {
        signal,
      });
      if (!res.ok) {
        setCollections([]);
        return;
      }
      const data = await res.json();
      setCollections(Array.isArray(data) ? data : []);
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      setCollections([]);
    } finally {
      setLoading(false);
    }
  }, [shipId, isLoggedIn]);

  useEffect(() => {
    if (!open) return;
    const ac = new AbortController();
    fetchCollections(ac.signal);
    return () => ac.abort();
  }, [open, fetchCollections]);

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left });

    function handleClick(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const showMsg = (text: string) => {
    if (msgTimer.current !== undefined) clearTimeout(msgTimer.current);
    setMsg(text);
    msgTimer.current = window.setTimeout(() => setMsg(null), 2000);
  };

  const toggleShip = async (col: Collection) => {
    if (!isLoggedIn) return;

    setToggling(col.id);
    try {
      if (col.has_ship) {
        const res = await fetch(`/api/collections/${col.id}/ships/${shipId}`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (data.success) {
          setCollections((prev) =>
            prev.map((c) => (c.id === col.id ? { ...c, has_ship: false } : c)),
          );
          showMsg(`Removed from "${col.title}"`);
        } else {
          showMsg(data.error ?? data.warning ?? "Failed to remove");
        }
      } else {
        const res = await fetch(`/api/collections/${col.id}/ships`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ shipId }),
        });
        const data = await res.json();
        if (data.success || data.warning) {
          setCollections((prev) =>
            prev.map((c) => (c.id === col.id ? { ...c, has_ship: true } : c)),
          );
          showMsg(data.warning ?? `Added to "${col.title}"`);
        } else {
          showMsg(data.error ?? "Failed to add");
        }
      }
    } catch {
      showMsg(col.has_ship ? "Failed to remove" : "Failed to add");
    } finally {
      setToggling(null);
    }
  };

  return (
    <>
      <div ref={triggerRef} className={["relative inline-block", className].filter(Boolean).join(" ")}>
        <span onClick={() => setOpen(!open)} className="cursor-pointer">
          {children}
        </span>
      </div>

      {typeof document !== "undefined" && createPortal(
        <>
          {msg && (
            <div
              className="fixed px-3 py-1 bg-[#021526] border border-[#1C598C] rounded text-sm text-white z-[9999] whitespace-nowrap"
              style={{ top: pos.top, left: pos.left }}
            >
              {msg}
            </div>
          )}

          {open && (
            <div
              ref={panelRef}
              className="fixed w-64 bg-[#021526] border border-[#1C598C] rounded-md shadow-lg z-[9999] max-h-60 overflow-y-auto"
              style={{ top: pos.top, left: pos.left }}
            >
              {loading ? (
                <p className="p-3 text-blue-200 text-sm">Loading...</p>
              ) : collections.length === 0 ? (
                <p className="p-3 text-blue-200 text-sm">
                  No collections yet.{" "}
                  <Link href="/collections/new" className="text-cyan-400 hover:underline">
                    Create one
                  </Link>
                </p>
              ) : (
                collections.map((col) => (
                  <button
                    key={col.id}
                    onClick={() => toggleShip(col)}
                    disabled={toggling === col.id}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-[#1C598C]/30 transition-colors disabled:opacity-40 disabled:cursor-default border-b border-[#1C598C]/20 last:border-0 flex items-center gap-2"
                  >
                    <span className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center text-xs ${
                      col.has_ship
                        ? "bg-cyan-500 border-cyan-500 text-white"
                        : "border-gray-500"
                    }`}>
                      {col.has_ship ? "✓" : ""}
                    </span>
                    <span className="text-white truncate">{col.title}</span>
                    {toggling === col.id && (
                      <span className="ml-auto text-cyan-400 text-xs shrink-0">...</span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </>,
        document.body
      )}
    </>
  );
}
