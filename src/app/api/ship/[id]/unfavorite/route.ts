import { NextRequest } from "next/server";
import { deleteFromFavorites } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { ok, badRequest, error } from "@/lib/api";

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
    return badRequest("Invalid ship ID");
  }

  try {
    await deleteFromFavorites(user.username, user.id, shipId);
    return ok({ success: true });
  } catch (err) {
    console.error("ship/[id]/unfavorite error:", err);
    return error("internal");
  }
}
