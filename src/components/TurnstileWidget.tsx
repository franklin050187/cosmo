"use client";

import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";

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

const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(
  function TurnstileWidget({ onVerify }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | undefined>(undefined);
    const onVerifyRef = useRef(onVerify);
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

      const script = document.querySelector<HTMLScriptElement>(
        'script[src*="challenges.cloudflare.com/turnstile/v0/api.js"]'
      );

      const render = () => {
        if (getTurnstile() && container) {
          widgetIdRef.current = getTurnstile()!.render(container, {
            sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY || "",
            callback: (token: string) => onVerifyRef.current?.(token),
          });
        }
      };

      if (getTurnstile()) {
        render();
      } else if (!script) {
        const s = document.createElement("script");
        s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
        s.async = true;
        s.onload = render;
        s.onerror = () => console.error("Failed to load Turnstile script");
        document.head.appendChild(s);
      } else {
        script.addEventListener("load", render);
        const readyState = (script as HTMLScriptElement & { readyState?: string }).readyState;
        if (readyState === "loaded" || readyState === "complete") {
          render();
        }
      }

      return () => {
        if (getTurnstile() && widgetIdRef.current) {
          try {
            getTurnstile()!.remove(widgetIdRef.current);
          } catch (e) { console.error("Failed to remove Turnstile widget:", e); }
          widgetIdRef.current = undefined;
        }
      };
    }, []);

    return <div ref={containerRef} />;
  }
);

export default TurnstileWidget;
