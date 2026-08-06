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

  if (process.env.NODE_ENV !== "development") {
    const turnstileToken = getTurnstileTokenFromReq(req);
    const ip = (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "").replace(/^::ffff:/, "");
    const turnstileOk = await verifyTurnstileToken(turnstileToken, ip);
    if (!turnstileOk) {
      return NextResponse.json({ error: "Turnstile verification failed" }, { status: 403 });
    }
  }

  try {
    const data = await getDashboardData(date);
    return NextResponse.json(data);
  } catch (err) {
    console.error("analytics/dashboard error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
