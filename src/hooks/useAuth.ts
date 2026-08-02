"use client";

import { useState, useEffect, useCallback } from "react";

export interface User {
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

function fetchSession(): Promise<User | null> {
  if (!sessionPromise) {
    sessionPromise = fetch("/api/auth/session")
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d: { user: User | null }) => d.user ?? null)
      .catch(() => null)
      .finally(() => {
        sessionPromise = null;
      });
  }
  return sessionPromise;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    fetchSession().then((u) => {
      if (active) {
        setUser(u);
        setHydrated(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // cookie already cleared client-side state; navigation will follow
    }
  }, []);

  return { user, isLoggedIn: !!user, hydrated, logout };
}
