import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { markGameFinished } from "@/lib/db";
import { ok, badRequest, notFound, forbidden, error } from "@/lib/api";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const { id } = await params;
  const gameId = parseInt(id, 10);
  if (isNaN(gameId)) return badRequest("Invalid id");

  try {
    const result = await markGameFinished(gameId, user.username, user.id, { requireChampion: true });
    if ("error" in result) {
      if (result.error === "not found") return notFound("Not found");
      if (result.error === "not the owner") return forbidden("not the owner");
      return badRequest(result.error);
    }
    return ok(result);
  } catch (err) {
    console.error("games/[id]/finish POST error:", err);
    return error("internal");
  }
}