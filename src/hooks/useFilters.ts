"use client";

import { useCallback, useMemo, useRef, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

export interface Filters {
  q: string;
  author: string;
  tags: string[];
  notags: string[];
  minprice: string;
  maxprice: string;
  maxCrew: string;
  order: string;
  brand: string;
  page: number;
}

export function useFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters: Filters = useMemo(() => ({
    q: searchParams.get("q") ?? "",
    author: searchParams.get("author") ?? "",
    tags: searchParams.getAll("tag"),
    notags: searchParams.getAll("notag"),
    minprice: searchParams.get("minprice") ?? "",
    maxprice: searchParams.get("maxprice") ?? "",
    maxCrew: searchParams.get("max-crew") ?? "",
    order: searchParams.get("order") ?? "new",
    brand: searchParams.get("brand") ?? "",
    page: parseInt(searchParams.get("page") ?? "1", 10) || 1,
  }), [searchParams]);

  const pushRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const setFilter = useCallback((key: string, value: string | string[]) => {
    const next = new URLSearchParams(searchParams);

    if (Array.isArray(value)) {
      next.delete(key);
      value.forEach((v) => next.append(key, v));
    } else if (value === "" || value == null) {
      next.delete(key);
    } else {
      next.set(key, value);
    }

    if (key !== "page") next.delete("page");

    clearTimeout(pushRef.current);
    pushRef.current = setTimeout(() => {
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    }, 150);
  }, [searchParams, router, pathname]);

  useEffect(() => {
    return () => clearTimeout(pushRef.current);
  }, []);

  const setFilters = useCallback((entries: [string, string | string[]][]) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of entries) {
      if (Array.isArray(value)) {
        next.delete(key);
        value.forEach((v) => next.append(key, v));
      } else if (value === "" || value == null) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }
    next.delete("page");
    clearTimeout(pushRef.current);
    pushRef.current = setTimeout(() => {
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    }, 150);
  }, [searchParams, router, pathname]);

  const clearFilters = useCallback(() => {
    const order = searchParams.get("order");
    const next = new URLSearchParams();
    if (order) next.set("order", order);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  }, [searchParams, router, pathname]);

  const activeCount = useMemo(() => {
    let count = 0;
    if (filters.q) count++;
    if (filters.author) count++;
    if (filters.tags.length) count += filters.tags.length;
    if (filters.notags.length) count += filters.notags.length;
    if (filters.minprice) count++;
    if (filters.maxprice) count++;
    if (filters.maxCrew) count++;
    if (filters.brand) count++;
    return count;
  }, [filters]);

  const toQueryString = useCallback(() => {
    return searchParams.toString();
  }, [searchParams]);

  return { filters, setFilter, setFilters, clearFilters, activeCount, toQueryString };
}
