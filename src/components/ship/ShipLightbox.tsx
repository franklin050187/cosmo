"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Image from "next/image";

interface ShipLightboxProps {
  src: string;
  alt: string;
}

export default function ShipLightbox({ src, alt }: ShipLightboxProps) {
  const [open, setOpen] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const openLightbox = useCallback(() => {
    setOpen(true);
  }, []);

  const closeLightbox = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
    };
    document.addEventListener("keydown", onKey);
    closeBtnRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closeLightbox]);

  return (
    <>
      <button
        type="button"
        onClick={openLightbox}
        aria-label={`View ${alt} full size`}
        className="block relative group"
      >
        <Image
          src={src}
          alt={alt}
          width={512}
          height={512}
          unoptimized
          fetchPriority="high"
          className="max-w-[512px] w-full h-auto cursor-zoom-in"
        />
        <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <span className="bg-[#021526]/80 backdrop-blur border border-[#1C598C]/60 rounded-lg px-3 py-1.5 text-cyan-300 text-sm flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
            </svg>
            Zoom
          </span>
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${alt} — full size`}
          className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={closeLightbox}
        >
          <div className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <Image
              src={src}
              alt={alt}
              width={1024}
              height={1024}
              unoptimized
              className="max-w-[90vw] max-h-[90vh] w-auto h-auto object-contain"
            />
            <button
              ref={closeBtnRef}
              type="button"
              onClick={closeLightbox}
              aria-label="Close image viewer"
              className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-[#021526] border border-[#1C598C] text-white flex items-center justify-center hover:border-cyan-400 hover:text-cyan-300 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}