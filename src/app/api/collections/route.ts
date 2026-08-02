import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { verifyTurnstileToken } from "@/lib/turnstile";

export async function GET(req: NextRequest) {
  const shipId = req.nextUrl.searchParams.get("shipId");

  try {
    if (shipId) {
      const shipIdNum = parseInt(shipId, 10);
      if (isNaN(shipIdNum)) {
        return NextResponse.json({ error: "invalid shipId" }, { status: 400 });
      }
      const { getCollectionsForShip } = await import("@/lib/db");
      const data = await getCollectionsForShip(shipIdNum);
      return NextResponse.json({ data });
    }

    const page = parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10) || 1;
    const { getAllCollections } = await import("@/lib/db");
    const data = await getAllCollections(page);
    return NextResponse.json(data);
  } catch (err) {
    console.error("collections GET error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cl = req.headers.get("content-length");
  if (cl && parseInt(cl, 10) > 1_048_576) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  const body = await req.json();
  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  if (process.env.NODE_ENV !== "development") {
    const turnstileToken = body["cf-turnstile-response"] || "";
    const ip = (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "").replace(/^::ffff:/, "");
    const turnstileOk = await verifyTurnstileToken(turnstileToken, ip);
    if (!turnstileOk) {
      return NextResponse.json({ error: "Turnstile verification failed" }, { status: 403 });
    }
  }

  try {
    const { createCollection } = await import("@/lib/db");
    const result = await createCollection(
      user.username,
      user.id,
      title,
      body.description?.trim() ?? "",
    );

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("collections POST error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
