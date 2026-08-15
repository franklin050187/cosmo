import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { setMatchWinner, resetMatchWinner } from "@/lib/db";
import { ok, badRequest, notFound, forbidden, error } from "@/lib/api";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; matchId: string }> }) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const { id, matchId } = await params;
  const gameId = parseInt(id, 10);
  const match = parseInt(matchId, 10);
  if (isNaN(gameId) || isNaN(match)) return badRequest("Invalid id");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  try {
    // Reset a previously recorded winner so the owner can re-pick.
    if (body.reset === true || body.clear === true) {
      const result = await resetMatchWinner(gameId, user.username, user.id, match);
      if ("error" in result) {
        if (result.error === "not found") return notFound("Not found");
        if (result.error === "not the owner") return forbidden("not the owner");
        return badRequest(result.error);
      }
      return ok(result);
    }

    const winnerId = parseInt(String(body.winner ?? ""), 10);
    if (isNaN(winnerId)) return badRequest("winner is required");

    const result = await setMatchWinner(gameId, user.username, user.id, match, winnerId);
    if ("error" in result) {
      if (result.error === "not found") return notFound("Not found");
      if (result.error === "not the owner") return forbidden("not the owner");
      return badRequest(result.error);
    }
    return ok(result);
  } catch (err) {
    console.error("games/[id]/matches/[matchId] POST error:", err);
    return error("internal");
  }
}