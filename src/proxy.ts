import { NextRequest, NextResponse } from "next/server";
import { createRateLimiter, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";

const loginLimiter = createRateLimiter({ tokens: 5, windowMs: 60_000, keyPrefix: "login" });
const uploadLimiter = createRateLimiter({ tokens: 10, windowMs: 60_000, keyPrefix: "upload" });
const apiLimiter = createRateLimiter({ tokens: 600, windowMs: 60_000, keyPrefix: "api" });
const checkDuplicateLimiter = createRateLimiter({ tokens: 20, windowMs: 60_000, keyPrefix: "check-dup" });

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function getLimiterForPath(pathname: string) {
  if (pathname === "/callback" || pathname === "/auth/discord") return loginLimiter;
  if (pathname.startsWith("/api/uploadthing")) return uploadLimiter;
  if (pathname === "/api/ship/check-duplicate") return checkDuplicateLimiter;
  if (pathname.startsWith("/api/")) return apiLimiter;
  return null;
}

function corsHeaders(origin: string | null): Record<string, string> {
  if (origin && ALLOWED_ORIGINS.length > 0 && ALLOWED_ORIGINS.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-CSRF-Token, X-Turnstile-Token",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Max-Age": "86400",
    };
  }
  return {};
}

function applyHeaders(res: NextResponse, headers: Record<string, string>) {
  Object.entries(headers).forEach(([k, v]) => res.headers.set(k, v));
}

export async function proxy(req: NextRequest) {
  const cors = corsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: cors });
  }

  const limiter = getLimiterForPath(req.nextUrl.pathname);
  if (!limiter) return NextResponse.next();

  const ip = getClientIp(req);
  const result = await limiter.limit(ip);
  const headers = { ...rateLimitHeaders(result), ...cors };

  if (!result.success) {
    return new NextResponse(JSON.stringify({ ok: false, error: "Too many requests" }), {
      status: 429,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const response = NextResponse.next();
  applyHeaders(response, headers);
  return response;
}

// The proxy is the only place rate limiting can live, but in Next 16 it runs
// as a Node.js function billed per invocation, so it must match as little as
// possible. Rate limiting and CORS only matter for the API and the two login
// routes; page requests (including the CSP header, now in next.config.ts
// headers()) must never reach this code.
export const config = {
  matcher: ["/api/:path*", "/callback", "/auth/discord"],
};
