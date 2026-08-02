export function trackEvent(
  event_type: string,
  data?: {
    ship_id?: number;
    url?: string;
    metadata?: Record<string, unknown>;
  }
) {
  try {
    const payload = JSON.stringify({
      event_type,
      ship_id: data?.ship_id,
      url: data?.url ?? globalThis.location?.pathname,
      metadata: data?.metadata,
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/analytics/log", new Blob([payload], { type: "application/json" }));
    } else {
      fetch("/api/analytics/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch((e) => console.error("Analytics fetch failed:", e));
    }
  } catch (e) { console.error("Analytics sendBeacon failed:", e); }
}
