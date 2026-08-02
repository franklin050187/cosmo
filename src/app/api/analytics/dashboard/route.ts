import { NextRequest, NextResponse } from "next/server";
import { getDashboardData } from "@/lib/analytics-db";
import { getUserFromRequest } from "@/lib/auth";
import { verifyTurnstileToken, getTurnstileTokenFromReq } from "@/lib/turnstile";

const ADMIN_USERNAMES = (process.env.ADMIN_USERNAMES || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user || !ADMIN_USERNAMES.includes(user.username)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
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
    const data = await getDashboardData();
    return NextResponse.json(data);
  } catch (err) {
    console.error("analytics/dashboard error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
