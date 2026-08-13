"use client";

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";

interface TurnstileWidgetProps {
  onVerify?: (token: string) => void;
}

export interface TurnstileWidgetHandle {
  getToken: () => string | undefined;
  reset: () => void;
}

interface TurnstileRenderOptions {
  sitekey: string;
  callback: (token: string) => void;
}

interface TurnstileApi {
  getResponse: (widgetId?: string) => string;
  reset: (widgetId?: string) => void;
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  remove: (widgetId?: string) => void;
}

type TurnstileWindow = Window & { turnstile?: TurnstileApi };

function getTurnstile(): TurnstileApi | undefined {
  return (window as TurnstileWindow).turnstile;
}

const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

let scriptPromise: Promise<void> | null = null;

function ensureTurnstileScript(): Promise<void> {
  if (getTurnstile()) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  const existing = document.querySelector<HTMLScriptElement>(
    `script[src*="challenges.cloudflare.com/turnstile/v0/api.js"]`
  );
  if (existing) {
    scriptPromise = new Promise<void>((resolve) => {
      if (existing.dataset.loaded) return resolve();
      existing.addEventListener("load", () => {
        existing.dataset.loaded = "1";
        resolve();
      });
    });
    return scriptPromise;
  }

  scriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = TURNSTILE_SRC;
    s.async = true;
    s.onload = () => {
      s.dataset.loaded = "1";
      resolve();
    };
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("Failed to load Turnstile script"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(
  function TurnstileWidget({ onVerify }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | undefined>(undefined);
    const onVerifyRef = useRef(onVerify);
    const [loadFailed, setLoadFailed] = useState(false);
    onVerifyRef.current = onVerify;

    useImperativeHandle(ref, () => ({
      getToken: () => {
        if (typeof window !== "undefined" && getTurnstile()) {
          return getTurnstile()!.getResponse(widgetIdRef.current);
        }
      },
      reset: () => {
        if (typeof window !== "undefined" && getTurnstile()) {
          getTurnstile()!.reset(widgetIdRef.current);
        }
      },
    }));

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      let cancelled = false;

      ensureTurnstileScript()
        .then(() => {
          if (cancelled || !getTurnstile()) return;
          widgetIdRef.current = getTurnstile()!.render(container, {
            sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY || "",
            callback: (token: string) => onVerifyRef.current?.(token),
          });
        })
        .catch(() => {
          if (!cancelled) setLoadFailed(true);
        });

      return () => {
        cancelled = true;
        if (getTurnstile() && widgetIdRef.current) {
          try {
            getTurnstile()!.remove(widgetIdRef.current);
          } catch (e) { console.error("Failed to remove Turnstile widget:", e); }
          widgetIdRef.current = undefined;
        }
      };
    }, []);

    if (loadFailed) {
      return (
        <p className="text-red-400 text-xs mt-1" role="alert">
          Captcha failed to load — check your connection and refresh.
        </p>
      );
    }

    return <div ref={containerRef} />;
  }
);

export default TurnstileWidget;
