import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getUserCollections } from "@/lib/db";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  try {
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
