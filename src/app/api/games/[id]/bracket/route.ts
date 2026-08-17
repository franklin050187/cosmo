import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { generateBracket } from "@/lib/db";
import { ok, badRequest, notFound, forbidden, error } from "@/lib/api";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const { id } = await params;
  const gameId = parseInt(id, 10);
  if (isNaN(gameId)) return badRequest("Invalid id");

  let body: Record<string, unknown> = {};
  const cl = req.headers.get("content-length");
  if (cl && parseInt(cl, 10) <= 1_048_576) {
    try {
      body = await req.json();
    } catch {}
  }

  try {
    const bracketType = body.bracketType === "double_elim" ? "double_elim" : "single_elim";
    const result = await generateBracket(gameId, user.username, user.id, {
      shuffle: body.shuffle !== false,
      bracketType,
    });
    if ("error" in result) {
      if (result.error === "not found") return notFound("Not found");
      if (result.error === "not the owner") return forbidden("not the owner");
      return badRequest(result.error);
    }
    return ok(result);
  } catch (err) {
    console.error("games/[id]/bracket POST error:", err);
    return error("internal");
  }
}