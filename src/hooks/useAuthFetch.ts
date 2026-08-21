"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "./useAuth";

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.error === "string") return body.error;
  } catch {}
  return `HTTP ${res.status}`;
}

export function useAuthFetch<T>(url: string) {
  const { isLoggedIn } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      const json = await res.json();
      setData(json.data ?? ({} as T));
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    if (!isLoggedIn) return;
    let active = true;
    const controller = new AbortController();
    controllerRef.current = controller;
    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(await readErrorMessage(res));
        return res.json();
      })
      .then((json: { data: T }) => {
        if (active) setData(json.data ?? ({} as T));
      })
      .catch((err: unknown) => {
        if ((err as Error).name === "AbortError") return;
        if (active) setError((err as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [url, isLoggedIn]);

  return { data, loading, error, refetch: fetchData };
}
