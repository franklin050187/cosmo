import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { addContestant, removeContestant } from "@/lib/db";
import { ok, badRequest, notFound, forbidden, error } from "@/lib/api";

const MAX_USERNAME = 40;

function parseUsername(body: Record<string, unknown>): string | null {
  const username = typeof body.username === "string" ? body.username.trim() : "";
  if (!username) return null;
  if (username.length > MAX_USERNAME) return "";
  return username;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const { id } = await params;
  const gameId = parseInt(id, 10);
  if (isNaN(gameId)) return badRequest("Invalid id");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const username = parseUsername(body);
  if (username === null) return badRequest("discord_username is required");
  if (username === "") return badRequest("Username too long (40 characters max)");

  try {
    const result = await addContestant(gameId, user.username, user.id, {
      discordId: typeof body.discord_id === "string" && body.discord_id ? body.discord_id : null,
      username,
    });
    if ("error" in result) {
      if (result.error === "not found") return notFound("Not found");
      if (result.error === "not the owner") return forbidden("not the owner");
      return badRequest(result.error);
    }
    return ok(result);
  } catch (err) {
    console.error("games/[id]/contestants POST error:", err);
    return error("internal");
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const username = parseUsername(body);
  if (username === null) return badRequest("discord_username is required");
  if (username === "") return badRequest("Username too long (40 characters max)");

  try {
    const result = await removeContestant(gameId, user.username, user.id, {
      discordId: typeof body.discord_id === "string" && body.discord_id ? body.discord_id : null,
      username,
    });
    if ("error" in result) {
      if (result.error === "not found") return notFound("Not found");
      if (result.error === "not the owner") return forbidden("not the owner");
      return badRequest(result.error);
    }
    return ok(result);
  } catch (err) {
    console.error("games/[id]/contestants DELETE error:", err);
    return error("internal");
  }
}