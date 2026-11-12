"use client";

import { useCallback, useMemo, useRef, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

// Params the app controls but that must never persist into filter URLs. The
// OAuth callback used to append `just_logged_in=1` (and failure redirects
// `auth_error=...`) to the return URL; the URL-based markers are now cookies,
// so these strips only matter for old bookmarks and cached pages.
const TRANSIENT_KEYS = ["just_logged_in", "auth_error"];

export interface Filters {
  q: string;
  author: string;
  tags: string[];
  notags: string[];
  minprice: string;
  maxprice: string;
  maxCrew: string;
  order: string;
  dir: string;
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
    dir: searchParams.get("dir") ?? "",
    brand: searchParams.get("brand") ?? "",
    page: parseInt(searchParams.get("page") ?? "1", 10) || 1,
  }), [searchParams]);

  const pushRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const nextWithoutTransient = useCallback((base: URLSearchParams | string) => {
    const next = new URLSearchParams(base);
    for (const key of TRANSIENT_KEYS) next.delete(key);
    return next;
  }, []);

  const setFilter = useCallback((key: string, value: string | string[]) => {
    const next = nextWithoutTransient(searchParams);

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
  }, [searchParams, router, pathname, nextWithoutTransient]);

  useEffect(() => {
    return () => clearTimeout(pushRef.current);
  }, []);

  const setFilters = useCallback((entries: [string, string | string[]][]) => {
    const next = nextWithoutTransient(searchParams);
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
  }, [searchParams, router, pathname, nextWithoutTransient]);

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
