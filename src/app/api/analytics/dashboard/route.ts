import { NextRequest, NextResponse } from "next/server";
import { getDashboardData } from "@/lib/analytics-db";
import { requireAdmin } from "@/lib/auth";
import { verifyTurnstileToken, getTurnstileTokenFromReq } from "@/lib/turnstile";

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;

  const date = req.nextUrl.searchParams.get("date") ?? undefined;
  if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date format, expected YYYY-MM-DD" }, { status: 400 });
  }

  // Comma-separated usernames to filter out (e.g. the owner's own test data).
  const excludeParam = req.nextUrl.searchParams.get("exclude");
  const excludeEnv = process.env.ANALYTICS_EXCLUDE_USERNAMES ?? "";
  const excludeList = (excludeParam ?? excludeEnv)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Anonymous visitor ids to drop too (e.g. the pinned QA-run identity). The
  // env-configured ids only apply alongside a username exclusion so the admin
  // "exclude my data" toggle covers both the owner and QA-run noise.
  const anonFromParam = (req.nextUrl.searchParams.get("excludeAnonIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const anonFromEnv = (process.env.ANALYTICS_EXCLUDE_ANON_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Discord user ids to drop (catches legacy rows whose username used a
  // different format, e.g. "poney5850" vs "poney5850#0").
  const excludeUserIdList = (req.nextUrl.searchParams.get("excludeUserId") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const excludeAnonList =
    excludeList.length > 0 || excludeUserIdList.length > 0 || anonFromParam.length > 0
      ? [...anonFromParam, ...anonFromEnv]
      : [];

  if (process.env.NODE_ENV !== "development") {
    const turnstileToken = getTurnstileTokenFromReq(req);
    const ip = (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "").replace(/^::ffff:/, "");
    const turnstileOk = await verifyTurnstileToken(turnstileToken, ip);
    if (!turnstileOk) {
      return NextResponse.json({ error: "Turnstile verification failed" }, { status: 403 });
    }
  }

  try {
    const data = await getDashboardData(date, excludeList, excludeAnonList, excludeUserIdList);
    return NextResponse.json(data);
  } catch (err) {
    console.error("analytics/dashboard error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
