import { NextRequest } from "next/server";
import { getGameByInviteCode } from "@/lib/db";
import { ok, badRequest, notFound, error } from "@/lib/api";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const inviteCode = code.trim();
    if (!inviteCode) return badRequest("Invalid invite code");

    const game = await getGameByInviteCode(inviteCode);
    if (!game) return notFound("Invite code not found");
    return ok(game);
  } catch (err) {
    console.error("games/by-invite GET error:", err);
    return error("internal");
  }
}