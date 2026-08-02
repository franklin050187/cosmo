import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { getUserCollections } = await import("@/lib/db");
    const { searchParams } = new URL(req.url);
    const shipId = searchParams.get("shipId");
    const data = await getUserCollections(
      user.username,
      user.id,
      shipId ? parseInt(shipId, 10) || undefined : undefined,
    );
    return NextResponse.json(data);
  } catch (err) {
    console.error("collections/mine error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
