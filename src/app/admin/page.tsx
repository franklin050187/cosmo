"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DashboardData } from "@/lib/analytics-db";
import TurnstileWidget from "@/components/TurnstileWidget";
import { useAuth } from "@/hooks/useAuth";

const IS_DEV = process.env.NODE_ENV === "development";

export default function AdminPage() {
  const { isLoggedIn, user } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [turnstilePassed, setTurnstilePassed] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // Default on: the logged-in admin is usually the real owner whose own activity
  // would otherwise drown out real visitor stats.
  const [excludeMine, setExcludeMine] = useState(true);
  // Bumping this nonce remounts the (hidden) Turnstile widget, which issues a
  // fresh single-use token. Cloudflare tokens are one-shot, so each dashboard
  // request needs its own token — reusing the gate token gets 403.
  const [widgetNonce, setWidgetNonce] = useState(0);

  const pendingTokenRef = useRef<((token: string) => void) | null>(null);
  const tokenRef = useRef("");

  const handleVerify = useCallback((token: string) => {
    tokenRef.current = token;
    setTurnstilePassed(true);
    pendingTokenRef.current?.(token);
    pendingTokenRef.current = null;
  }, []);

  const getFreshToken = useCallback((): Promise<string> => {
    if (IS_DEV) return Promise.resolve("dev");
    if (tokenRef.current) {
      const token = tokenRef.current;
      tokenRef.current = "";
      return Promise.resolve(token);
    }
    return new Promise<string>((resolve) => {
      pendingTokenRef.current = resolve;
      setWidgetNonce((n) => n + 1);
    });
  }, []);

  useEffect(() => {
    if (!turnstilePassed || !isLoggedIn) return;

    let cancelled = false;

    const run = async () => {
      try {
        const base = selectedDate
          ? `/api/analytics/dashboard?date=${encodeURIComponent(selectedDate)}`
          : "/api/analytics/dashboard";
        const url =
          excludeMine && user
            ? `${base}${selectedDate ? "&" : "?"}exclude=${encodeURIComponent(user.username)}&excludeUserId=${encodeURIComponent(user.id)}`
            : base;
        const token = await getFreshToken();
        if (cancelled) return;
        let res = await fetch(url, { headers: { "x-turnstile-token": token } });
        if (cancelled) return;

        if (res.status === 403) {
          const body = await res.json().catch(() => null);
          const turnstileFailed = body?.error === "Turnstile verification failed";
          if (turnstileFailed) {
            // Stale/consumed token — retry once with a freshly issued token.
            const retryToken = await getFreshToken();
            if (cancelled) return;
            res = await fetch(url, { headers: { "x-turnstile-token": retryToken } });
            if (res.status === 403) {
              setError("Verification failed. Please refresh the page and try again.");
              return;
            }
          } else {
            // Genuine auth/forbidden failure — session is not admin anymore.
            router.push("/");
            return;
          }
        }
        if (!res.ok) throw new Error("Failed to fetch");
        const json = await res.json();
        if (!cancelled) {
          setData(json.data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [turnstilePassed, selectedDate, isLoggedIn, router, getFreshToken, excludeMine, user]);

  if (!turnstilePassed) {
    return (
      <div className="flex flex-col items-center justify-center pt-20 gap-6">
        <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
        <p className="text-blue-200 text-sm">Complete the captcha to access the dashboard.</p>
        <TurnstileWidget onVerify={handleVerify} />
      </div>
    );
  }

  if (!isLoggedIn) {
    return <div className="flex justify-center pt-20 text-red-400">Not logged in</div>;
  }

  if (loading) {
    return <div className="flex justify-center pt-20 text-blue-300" role="status">Loading dashboard…</div>;
  }

  if (error) {
    return <div className="flex justify-center pt-20 text-red-400" role="alert">{error}</div>;
  }

  if (!data) return null;

  const maxView = Math.max(...data.views_per_day.map((d) => d.count), 1);
  const isFiltered = selectedDate !== null;

  return (
    <div className="pt-8 space-y-8">
      {/* Hidden widget stays mounted so each request gets a fresh one-shot token */}
      <div className="hidden" aria-hidden="true">
        <TurnstileWidget key={widgetNonce} onVerify={handleVerify} />
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-white">
          Analytics Dashboard
          {isFiltered && (
            <span className="ml-2 text-base font-normal text-blue-300">— {selectedDate}</span>
          )}
        </h1>
        <div className="flex items-center gap-2">
          {user && (
            <button
              onClick={() => { setLoading(true); setExcludeMine((v) => !v); }}
              aria-pressed={excludeMine}
              aria-label="Filter out your own analytics events from the dashboard"
              className={`border rounded px-3 py-1.5 text-sm transition-colors ${
                excludeMine
                  ? "border-amber-400/60 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20"
                  : "border-[#1C598C] bg-gradient-to-b from-[#1e3851]/25 to-[#124c80]/25 text-cyan-400 hover:bg-cyan-400/20 hover:text-white"
              }`}
            >
              {excludeMine ? "✓ Excluding my data" : "Include my data"}
            </button>
          )}
          {isFiltered && (
            <button
              onClick={() => { setLoading(true); setSelectedDate(null); }}
              className="border border-[#1C598C] bg-gradient-to-b from-[#1e3851]/25 to-[#124c80]/25 text-cyan-400 hover:bg-cyan-400/20 hover:text-white rounded px-3 py-1.5 text-sm transition-colors"
            >
              ← Back to all days
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <SummaryCard label="Total Events" value={data.totals.total_events.toLocaleString()} />
        <SummaryCard label="Unique Users" value={data.totals.unique_users.toLocaleString()} />
        {!isFiltered && (
          <SummaryCard label="Events Today" value={data.totals.events_today.toLocaleString()} />
        )}
        <SummaryCard
          label={isFiltered ? "Errors" : "Errors Today"}
          value={data.totals.errors_today.toLocaleString()}
        />
        <SummaryCard
          label={isFiltered ? "Collections Created" : "Collections"}
          value={data.totals.total_collections.toLocaleString()}
        />
      </div>

      {/* Views per day (bar chart) */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-3">
          Page Views (last 30 days)
          <span className="ml-2 text-sm font-normal text-blue-300">
            {isFiltered ? "Click another bar or " : "Click a bar to view that day, or "}
            use the button above to reset.
          </span>
        </h2>
        <div className="bg-[#021526] border border-[#1C598C]/30 rounded-lg p-4">
          <div className="flex items-end gap-[2px] h-48">
            {data.views_per_day.map((d) => {
              const active = d.date === selectedDate;
              return (
                <button
                  key={d.date}
                  type="button"
                  title={`${d.date}: ${d.count} views`}
                  aria-label={`View analytics for ${d.date} (${d.count} views)`}
                  onClick={() => { setLoading(true); setSelectedDate(active ? null : d.date); }}
                  className={`flex-1 rounded-t relative group transition-colors cursor-pointer ${
                    active
                      ? "bg-cyan-300 shadow-[0_0_10px_rgba(0,216,255,0.6)]"
                      : "bg-cyan-500/60 hover:bg-cyan-400/80"
                  }`}
                  style={{ height: `${(d.count / maxView) * 100}%` }}
                >
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-blue-300 opacity-0 group-hover:opacity-100 whitespace-nowrap">
                    {d.count}
                  </div>
                  {active && (
                    <div className="absolute bottom-1 inset-x-0 text-center text-[9px] text-[#021526] font-semibold whitespace-nowrap overflow-hidden">
                      {d.date.slice(5)}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          {data.views_per_day.length > 0 && (
            <div className="text-[10px] text-blue-400 mt-2 text-center">
              {data.views_per_day[0].date} – {data.views_per_day[data.views_per_day.length - 1].date}
            </div>
          )}
        </div>
      </section>

      {/* Event type breakdown */}
      <section className="grid md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">Event Types</h2>
          <div className="bg-[#021526] border border-[#1C598C]/30 rounded-lg divide-y divide-[#1C598C]/20">
            {data.event_types.map((e) => (
              <div key={e.event_type} className="flex justify-between px-4 py-2 text-sm">
                <span className="text-blue-200">{e.event_type}</span>
                <span className="text-white font-mono">{e.count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">Top Pages</h2>
          <div className="bg-[#021526] border border-[#1C598C]/30 rounded-lg divide-y divide-[#1C598C]/20 max-h-80 overflow-y-auto">
            {data.top_pages.map((p) => (
              <div key={p.url} className="flex justify-between px-4 py-2 text-sm">
                <span className="text-blue-200 truncate max-w-[70%]" title={p.url}>
                  {p.url}
                </span>
                <span className="text-white font-mono shrink-0">{p.count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recent errors */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-3">Recent Errors</h2>
        <div className="bg-[#021526] border border-[#1C598C]/30 rounded-lg divide-y divide-[#1C598C]/20">
          {data.recent_errors.length === 0 && (
            <div className="px-4 py-3 text-sm text-blue-300">No errors recorded.</div>
          )}
          {data.recent_errors.map((e) => (
            <div key={e.id} className="px-4 py-2.5 text-sm space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-red-400 font-medium">Error</span>
                <span className="text-blue-300">{e.username || (e.anon_id ? `anon:${e.anon_id.slice(0, 8)}` : "anonymous")}</span>
                <span className="text-blue-400/60 text-xs">{new Date(e.created_at).toLocaleString()}</span>
              </div>
              {e.url && <div className="text-blue-200/60 text-xs truncate">{e.url}</div>}
              {typeof e.metadata?.message === "string" && (
                <div className="text-red-300/80 text-xs font-mono">{e.metadata.message}</div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#021526] border border-[#1C598C]/30 rounded-lg px-4 py-3">
      <div className="text-xs text-blue-400 mb-1">{label}</div>
      <div className="text-xl font-bold text-white">{value}</div>
    </div>
  );
}
