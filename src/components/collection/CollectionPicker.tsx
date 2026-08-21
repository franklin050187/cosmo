"use client";

import { useState, useEffect, useRef, cloneElement, isValidElement } from "react";
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
  children: React.ReactElement<{ className?: string }>;
  className?: string;
}

const PANEL_WIDTH = 256;

export default function CollectionPicker({ shipId, children, className }: Props) {
  const { isLoggedIn } = useAuth();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const msgTimer = useRef<number | undefined>(undefined);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || !isLoggedIn) return;
    const ac = new AbortController();
    void fetch(`/api/collections/mine?shipId=${shipId}`, { signal: ac.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        setCollections(Array.isArray(json.data) ? json.data : []);
      })
      .catch((err: unknown) => {
        if ((err as Error)?.name === "AbortError") return;
        setCollections([]);
      })
      .finally(() => {
        setLoading(false);
      });
    return () => ac.abort();
  }, [open, shipId, isLoggedIn]);

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    let left = rect.left;
    const viewportRight = window.innerWidth;
    if (left + PANEL_WIDTH > viewportRight) {
      left = Math.max(viewportRight - PANEL_WIDTH - 8, 0);
    }
    setPos({ top: Math.min(rect.bottom + 4, window.innerHeight - 40), left });

    function handleClick(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (msgTimer.current !== undefined) {
        clearTimeout(msgTimer.current);
        msgTimer.current = undefined;
      }
    };
  }, []);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => firstItemRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [open]);

  const handleToggle = () => {
    if (open) {
      setOpen(false);
    } else {
      setOpen(true);
      setLoading(true);
      setMsg(null);
    }
  };

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
        const json = await res.json();
        const data = json.data ?? {};
        if (data.success || data.warning) {
          setCollections((prev) =>
            prev.map((c) => (c.id === col.id ? { ...c, has_ship: false } : c)),
          );
          showMsg(`Removed from "${col.title}"`);
        } else {
          showMsg(json.error ?? data.error ?? "Failed to remove");
        }
      } else {
        const res = await fetch(`/api/collections/${col.id}/ships`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ shipId }),
        });
        const json = await res.json();
        const data = json.data ?? {};
        if (data.success || data.warning) {
          setCollections((prev) =>
            prev.map((c) => (c.id === col.id ? { ...c, has_ship: true } : c)),
          );
          showMsg(data.warning ?? `Added to "${col.title}"`);
        } else {
          showMsg(json.error ?? data.error ?? "Failed to add");
        }
      }
    } catch {
      showMsg(col.has_ship ? "Failed to remove" : "Failed to add");
    } finally {
      setToggling(null);
    }
  };

  const moveFocus = (panel: HTMLElement, delta: number) => {
    const items = Array.from(panel.querySelectorAll<HTMLButtonElement>("button"));
    const cur = document.activeElement as HTMLButtonElement | null;
    let idx = items.indexOf(cur as HTMLButtonElement);
    if (idx < 0) idx = 0;
    const next = items[((idx + delta) % items.length + items.length) % items.length];
    next?.focus();
  };

  const trigger = isValidElement(children)
    ? cloneElement(
        children as React.ReactElement<Record<string, unknown>>,
        {
          onClick: (e: React.MouseEvent) => {
            (children.props as { onClick?: (ev: React.MouseEvent) => void } | null)?.onClick?.(e);
            handleToggle();
          },
          "aria-expanded": open,
          "aria-haspopup": "listbox",
          "aria-controls": "collection-picker-panel",
        },
      )
    : children;

  return (
    <>
      <span ref={triggerRef} className={className}>
        {trigger}
      </span>

      {mounted && createPortal(
        <>
          {msg && (
            <div
              role="status"
              className="fixed px-3 py-1 bg-[#021526] border border-[#1C598C] rounded text-sm text-white z-[9999] whitespace-nowrap"
              style={{ top: pos.top, left: pos.left }}
            >
              {msg}
            </div>
          )}

          {open && (
            <div
              id="collection-picker-panel"
              ref={panelRef}
              role="listbox"
              aria-label="Your collections"
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  moveFocus(e.currentTarget, 1);
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  moveFocus(e.currentTarget, -1);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setOpen(false);
                }
              }}
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
                collections.map((col, i) => (
                  <button
                    key={col.id}
                    ref={i === 0 ? firstItemRef : null}
                    onClick={() => toggleShip(col)}
                    disabled={toggling === col.id}
                    aria-label={col.has_ship ? `Remove from ${col.title}` : `Add to ${col.title}`}
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
