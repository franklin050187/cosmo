"use client";

import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";

interface TurnstileWidgetProps {
  onVerify?: (token: string) => void;
}

export interface TurnstileWidgetHandle {
  getToken: () => string | undefined;
  reset: () => void;
}

const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(
  function TurnstileWidget({ onVerify }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | undefined>(undefined);
    const onVerifyRef = useRef(onVerify);
    onVerifyRef.current = onVerify;

    useImperativeHandle(ref, () => ({
      getToken: () => {
        if (typeof window !== "undefined" && (window as any).turnstile) {
          return (window as any).turnstile.getResponse(widgetIdRef.current);
        }
      },
      reset: () => {
        if (typeof window !== "undefined" && (window as any).turnstile) {
          (window as any).turnstile.reset(widgetIdRef.current);
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
        if ((window as any).turnstile && container) {
          widgetIdRef.current = (window as any).turnstile.render(container, {
            sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY || "",
            callback: (token: string) => onVerifyRef.current?.(token),
          });
        }
      };

      if ((window as any).turnstile) {
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
        if (
          (script as any).readyState === "loaded" ||
          (script as any).readyState === "complete"
        ) {
          render();
        }
      }

      return () => {
        if ((window as any).turnstile && widgetIdRef.current) {
          try {
            (window as any).turnstile.remove(widgetIdRef.current);
          } catch (e) { console.error("Failed to remove Turnstile widget:", e); }
          widgetIdRef.current = undefined;
        }
      };
    }, []);

    return <div ref={containerRef} />;
  }
);

export default TurnstileWidget;
