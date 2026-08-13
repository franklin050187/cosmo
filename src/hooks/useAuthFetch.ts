"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "./useAuth";

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
      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try {
          const errBody = await res.json();
          if (errBody && typeof errBody.error === "string") errMsg = errBody.error;
        } catch {}
        throw new Error(errMsg);
      }
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
      .then((res) => {
        if (!res.ok) {
          let errMsg = `HTTP ${res.status}`;
          return res
            .json()
            .catch(() => ({}))
            .then((errBody) => {
              if (errBody && typeof errBody.error === "string") errMsg = errBody.error;
              throw new Error(errMsg);
            });
        }
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
