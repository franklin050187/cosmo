"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

interface CollectionOption {
  id: number;
  title: string;
  ship_count: number | null;
}

export default function CollectionSelect({
  value,
  onChange,
  id,
  name,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  name?: string;
}) {
  const { isLoggedIn } = useAuth();
  const [collections, setCollections] = useState<CollectionOption[]>([]);

  useEffect(() => {
    if (!isLoggedIn) return;
    const controller = new AbortController();
    fetch("/api/collections/mine", { signal: controller.signal })
      .then((res) => res.json())
      .then((json) => setCollections(Array.isArray(json.data) ? json.data : []))
      .catch(() => setCollections([]));
    return () => controller.abort();
  }, [isLoggedIn]);

  return (
    <select
      id={id}
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full p-2 bg-[#021526] border border-gray-400 rounded text-white"
    >
      <option value="">None (no ships linked)</option>
      {collections.map((c) => (
        <option key={c.id} value={String(c.id)}>
          {c.title} ({c.ship_count ?? 0} ships)
        </option>
      ))}
    </select>
  );
}