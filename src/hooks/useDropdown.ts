"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface DropdownPosition {
  top: number;
  left: number;
  width: number;
}

interface UseDropdownReturn {
  wrapRef: React.RefObject<HTMLDivElement | null>;
  showDD: boolean;
  setShowDD: (val: boolean) => void;
  ddPos: DropdownPosition;
  highlight: number;
  setHighlight: (val: number | ((prev: number) => number)) => void;
}

export function useDropdown(): UseDropdownReturn {
  const [showDD, setShowDD] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [ddPos, setDdPos] = useState<DropdownPosition>({
    top: 0,
    left: 0,
    width: 0,
  });
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (
        wrapRef.current &&
        !wrapRef.current.contains(e.target as Node)
      ) {
        setShowDD(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const updatePosition = useCallback(() => {
    if (wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect();
      setDdPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
  }, []);

  useEffect(() => {
    if (showDD) {
      updatePosition();
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);
      return () => {
        window.removeEventListener("scroll", updatePosition, true);
        window.removeEventListener("resize", updatePosition);
      };
    }
  }, [showDD, updatePosition]);

  return { wrapRef, showDD, setShowDD, ddPos, highlight, setHighlight };
}
