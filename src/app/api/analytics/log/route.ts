import { NextRequest, NextResponse } from "next/server";
import { logEvent } from "@/lib/analytics-db";
import { getUserFromRequest } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown>;
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const cl = req.headers.get("content-length");
      if (cl && parseInt(cl, 10) > 1_048_576) {
        return NextResponse.json({ error: "Payload too large" }, { status: 413 });
      }
      body = await req.json();
    } else {
      return NextResponse.json({ error: "unsupported content-type" }, { status: 400 });
    }

    const event_type = String(body.event_type ?? "");
    if (!event_type) {
      return NextResponse.json({ error: "event_type is required" }, { status: 400 });
    }

    const user = getUserFromRequest(req);
    const ship_id = body.ship_id != null ? Number(body.ship_id) : undefined;
    const url = body.url ? String(body.url) : undefined;
    const metadata = body.metadata as Record<string, unknown> | undefined;

    await logEvent({
      event_type,
      user_id: user?.id,
      username: user?.username,
      guild: user?.guild,
      ship_id: isNaN(ship_id as number) ? undefined : ship_id,
      url: url || req.headers.get("referer") || undefined,
      metadata,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("analytics/log error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
