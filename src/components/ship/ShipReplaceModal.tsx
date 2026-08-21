"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

interface Props {
  previewUrl: string;
  currentAuthor: string;
  currentPrice: number;
  currentCrew: number;
  currentAutoTags: string[];
  newAuthor: string;
  newPrice: number;
  newCrew: number;
  newAutoTags: string[];
  onConfirm: () => void;
  onCancel: () => void;
  replacing: boolean;
}

function formatPrice(n: number): string {
  return n.toLocaleString("en-US");
}

function TagDiff({
  current,
  next,
}: {
  current: string[];
  next: string[];
}) {
  const added = next.filter((t) => !current.includes(t));
  const removed = current.filter((t) => !next.includes(t));
  const same = current.filter((t) => next.includes(t));

  return (
    <div className="flex flex-wrap gap-1">
      {same.map((t) => (
        <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
          {t}
        </span>
      ))}
      {added.map((t) => (
        <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-green-900/50 text-green-300">
          +{t}
        </span>
      ))}
      {removed.map((t) => (
        <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-300">
          -{t}
        </span>
      ))}
    </div>
  );
}

export default function ShipReplaceModal({
  previewUrl,
  currentAuthor,
  currentPrice,
  currentCrew,
  currentAutoTags,
  newAuthor,
  newPrice,
  newCrew,
  newAutoTags,
  onConfirm,
  onCancel,
  replacing,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusables = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null);

    const first = focusables()[0] ?? dialog;
    first.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !replacing) {
        e.preventDefault();
        onCancel();
        return;
      }

      if (e.key === "Tab") {
        const items = focusables();
        if (items.length === 0) return;
        const firstEl = items[0];
        const lastEl = items[items.length - 1];

        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      restoreFocusRef.current?.focus?.();
    };
  }, [replacing, onCancel]);

  const authorChanged = currentAuthor !== newAuthor;
  const priceChanged = currentPrice !== newPrice;
  const crewChanged = currentCrew !== newCrew;
  const tagsChanged =
    currentAutoTags.length !== newAutoTags.length ||
    currentAutoTags.some((t) => !newAutoTags.includes(t)) ||
    newAutoTags.some((t) => !currentAutoTags.includes(t));

  const hasChanges = authorChanged || priceChanged || crewChanged || tagsChanged;

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/70"
      onClick={(e) => {
        if (e.target === e.currentTarget && !replacing) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className="bg-[#021526] border border-[#1C598C] rounded-lg shadow-2xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="replace-ship-title"
      >
        <div className="p-5">
          <h2 id="replace-ship-title" className="text-xl text-white font-semibold mb-4">Replace Ship</h2>

          <div className="relative w-full h-48 mb-4">
            <Image src={previewUrl} alt="New ship preview" fill unoptimized className="object-contain rounded border border-[#1C598C]" />
          </div>

          <table className="w-full text-sm">
            <caption className="sr-only">
              Comparison of the current ship and the replacement ship
            </caption>
            <thead>
              <tr className="text-left text-blue-200 border-b border-[#1C598C]/30">
                <th scope="col" className="pb-2 pr-4">Field</th>
                <th scope="col" className="pb-2 pr-4">Current</th>
                <th scope="col" className="pb-2">New</th>
              </tr>
            </thead>
            <tbody>
              <tr className={authorChanged ? "text-amber-300" : "text-gray-400"}>
                <th scope="row" className="font-normal text-left py-1.5 pr-4">Author</th>
                <td className="py-1.5 pr-4">{currentAuthor}</td>
                <td className="py-1.5">{newAuthor}{authorChanged && <span className="ml-1.5 text-xs">⚠️</span>}</td>
              </tr>
              <tr className={priceChanged ? "text-amber-300" : "text-gray-400"}>
                <th scope="row" className="font-normal text-left py-1.5 pr-4">Price</th>
                <td className="py-1.5 pr-4">{formatPrice(currentPrice)}₡</td>
                <td className="py-1.5">{formatPrice(newPrice)}₡{priceChanged && <span className="ml-1.5 text-xs">⚠️</span>}</td>
              </tr>
              <tr className={crewChanged ? "text-amber-300" : "text-gray-400"}>
                <th scope="row" className="font-normal text-left py-1.5 pr-4">Crew</th>
                <td className="py-1.5 pr-4">{currentCrew}</td>
                <td className="py-1.5">{newCrew}{crewChanged && <span className="ml-1.5 text-xs">⚠️</span>}</td>
              </tr>
            </tbody>
          </table>

          <div className="mt-4">
            <p className="text-blue-200 text-sm mb-2">Auto-tags:</p>
            <TagDiff current={currentAutoTags} next={newAutoTags} />
          </div>

          {!hasChanges && (
            <p className="mt-3 text-gray-400 text-xs">No differences detected — the new ship appears identical.</p>
          )}

          <div className="mt-6 flex gap-3 justify-end">
            <button
              onClick={onCancel}
              disabled={replacing}
              className="px-4 py-2 border border-gray-600 rounded text-gray-300 hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={replacing}
              className="px-4 py-2 border border-amber-500 rounded text-amber-300 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
            >
              {replacing ? "Replacing..." : "Confirm Replace"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}