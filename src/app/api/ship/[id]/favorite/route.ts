import { NextRequest, NextResponse } from "next/server";
import { addToFavorites } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const { id } = await params;
  const shipId = parseInt(id, 10);
  if (isNaN(shipId)) {
    return NextResponse.json({ error: "Invalid ship ID" }, { status: 400 });
  }

  try {
    await addToFavorites(user.username, user.id, shipId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("ship/[id]/favorite error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
