"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, hydrated } = useAuth();

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" role="status" aria-label="Loading authentication status" />
      </div>
    );
  }

  if (!isLoggedIn) {
    const returnTo = typeof window !== "undefined"
      ? window.location.pathname + window.location.search
      : "/";
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-20 h-20 mb-6 rounded-full bg-[#1C598C]/20 border border-[#1C598C]/40 flex items-center justify-center">
          <svg className="w-10 h-10 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </div>
        <h2 className="text-white text-xl font-semibold mb-2">Login Required</h2>
        <p className="text-blue-200 text-sm mb-6 max-w-sm">
          You need to be logged in to access this feature. Sign in with your Discord account to continue.
        </p>
        <div className="w-full max-w-sm text-left bg-[#021526]/60 border border-[#1C598C]/40 rounded-md p-4 mb-6">
          <p className="text-xs uppercase tracking-wide text-cyan-300 mb-3">What you&apos;ll get</p>
          <ul className="space-y-2 text-sm text-blue-100">
            <li className="flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 text-cyan-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Upload and share your own ships
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 text-cyan-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Favorite ships and build collections
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 text-cyan-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Create and join community games
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 text-cyan-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Compete in tournament brackets and ship roulette
            </li>
          </ul>
        </div>
        <div className="flex gap-3">
          <Link
            href={`/auth/discord?returnTo=${encodeURIComponent(returnTo)}`}
            className="px-6 py-2.5 bg-[#5865F2] hover:bg-[#4752C4] text-white text-sm font-medium rounded-lg transition-colors"
          >
            Login with Discord
          </Link>
          <Link
            href="/"
            className="px-6 py-2.5 border border-[#1C598C] text-gray-400 hover:text-white hover:border-cyan-400/30 text-sm font-medium rounded-lg transition-colors"
          >
            Go Back
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
