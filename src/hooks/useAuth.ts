"use client";

import { useState, useEffect, useCallback } from "react";

export interface User {
  id: string;
  username: string;
  avatar: string | null;
  guild?: string;
}

export interface UseAuthReturn {
  user: User | null;
  isLoggedIn: boolean;
  hydrated: boolean;
  logout: () => void;
}

let sessionPromise: Promise<User | null> | null = null;
let cachedUser: User | null | undefined = undefined;
let cachedAt = 0;
const CACHE_TTL = 60_000;

function fetchSession(force = false): Promise<User | null> {
  if (sessionPromise) return sessionPromise;
  if (!force && cachedUser !== undefined && Date.now() - cachedAt < CACHE_TTL) {
    return Promise.resolve(cachedUser);
  }
  sessionPromise = fetch("/api/auth/session")
    .then((r) => (r.ok ? r.json() : { data: null }))
    .then((d: { data: { user: User } | null }) => {
      cachedUser = d.data?.user ?? null;
      cachedAt = Date.now();
      return cachedUser;
    })
    .catch(() => {
      cachedUser = null;
      return null;
    })
    .finally(() => {
      sessionPromise = null;
    });
  return sessionPromise;
}

export function useAuth(): UseAuthReturn {
  // Hydrate synchronously from the in-memory cache (set by a prior mount in
  // this SPA session). RequireAuth pages then render immediately instead of
  // flashing their spinner on every client-side navigation. A hard reload
  // still has an empty cache (module state resets), so the initial session
  // fetch and spinner only happen once per page load.
  const [user, setUser] = useState<User | null>(cachedUser !== undefined ? cachedUser : null);
  const [hydrated, setHydrated] = useState(cachedUser !== undefined);

  useEffect(() => {
    let active = true;

    function apply(u: User | null) {
      if (active) {
        setUser(u);
        setHydrated(true);
      }
    }

    // Mount: reuse the in-flight promise / short cache so hundreds of card
    // mounts resolve against a single request instead of firing one each.
    fetchSession().then((u) => apply(u));

    const onRefetch = () => fetchSession(true).then((u) => apply(u));

    // Signal a fresh login to other tabs; this tab already fetched above.
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("just_logged_in") === "1") {
      try {
        localStorage.setItem("cosmoshipro:auth:login", Date.now().toString());
      } catch { /* storage disabled */ }
      const url = new URL(window.location.href);
      url.searchParams.delete("just_logged_in");
      window.history.replaceState({}, "", url.toString());
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key !== "cosmoshipro:auth:login" && e.key !== "cosmoshipro:auth:logout") return;
      onRefetch();
    };
    window.addEventListener("storage", onStorage);

    return () => {
      active = false;
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    cachedUser = null;
    cachedAt = 0;
    try {
      localStorage.setItem("cosmoshipro:auth:logout", Date.now().toString());
    } catch { /* storage disabled */ }
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // cookie already cleared client-side state; navigation will follow
    }
  }, []);

  return { user, isLoggedIn: !!user, hydrated, logout };
}
