import { NextRequest } from "next/server";
import { requireAuth, getUserFromRequest } from "@/lib/auth";
import { verifyTurnstileFromRequest } from "@/lib/turnstile";
import { getGame, getCollection, updateGame, deleteGame, isGameOwner, stripGameForViewer } from "@/lib/db";
import { ok, badRequest, notFound, forbidden, error } from "@/lib/api";

const VALID_MODES = new Set(["pvp", "tournament", "campaign"]);
const VALID_VISIBILITY = new Set(["public", "private"]);
const VALID_STATUS = new Set(["open", "closed", "finished"]);

/** Parse an optional date field; null/empty clears it. Throws on garbage. */
function parseOptionalDate(value: unknown, label: string): string | null {
  if (value == null || value === "") return null;
  const d = new Date(String(value));
  if (isNaN(d.getTime())) throw new Error(`invalid ${label}`);
  return d.toISOString();
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const gameId = parseInt(id, 10);
    if (isNaN(gameId)) return badRequest("Invalid id");

    const game = await getGame(gameId);
    if (!game) return notFound();
    // Private games are only readable by the owner and registered participants
    // (the join flow goes through /api/games/by-invite, which is code-gated).
    // 404 — not 403 — so id enumeration can't even confirm the game exists.
    if (game.visibility === "private") {
      const user = getUserFromRequest(req);
      const isParticipant =
        !!user &&
        game.participants.some(
          (p) =>
            (p.discord_id != null && p.discord_id === user.id) ||
            p.discord_username.toLowerCase() === user.username.toLowerCase(),
        );
      if (!user || (!isGameOwner(game, user) && !isParticipant)) return notFound();
    }
    return ok(stripGameForViewer(game, getUserFromRequest(req)));
  } catch (err) {
    console.error("games/[id] GET error:", err);
    return error("internal");
  }
}

async function update(req: NextRequest, gameId: number) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const cl = req.headers.get("content-length");
  if (cl && parseInt(cl, 10) > 1_048_576) {
    return badRequest("Payload too large", 413);
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const fields: {
    title?: string;
    description?: string;
    game_mode?: "pvp" | "tournament" | "campaign";
    visibility?: "public" | "private";
    status?: "open" | "closed" | "finished";
    collection_id?: number | null;
    game_date?: string;
    register_open_at?: string | null;
    register_close_at?: string | null;
    roulette_enabled?: boolean;
    bracket_type?: "single_elim" | "double_elim";
  } = {};

  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) return badRequest("Title cannot be empty");
    fields.title = title;
  }
  if (body.description !== undefined) fields.description = String(body.description).trim();
  if (body.game_mode !== undefined) {
    if (!VALID_MODES.has(String(body.game_mode))) return badRequest("Invalid game mode");
    fields.game_mode = body.game_mode as "pvp" | "tournament" | "campaign";
  }
  if (body.visibility !== undefined) {
    if (!VALID_VISIBILITY.has(String(body.visibility))) return badRequest("Invalid visibility");
    fields.visibility = body.visibility as "public" | "private";
  }
  if (body.status !== undefined) {
    if (!VALID_STATUS.has(String(body.status))) return badRequest("Invalid status");
    fields.status = body.status as "open" | "closed" | "finished";
  }
  if (body.collection_id !== undefined) {
    const cid = body.collection_id != null ? parseInt(String(body.collection_id), 10) || null : null;
    if (cid != null) {
      const col = await getCollection(cid);
      if (!col) return badRequest("Collection not found");
      if (!(col.discord_id === user.id || col.owner === user.username)) {
        return forbidden("Not your collection");
      }
    }
    fields.collection_id = cid;
  }
  if (body.game_date !== undefined || body.register_open_at !== undefined || body.register_close_at !== undefined) {
    try {
      if (body.game_date !== undefined) {
        const gd = parseOptionalDate(body.game_date, "game_date");
        if (!gd) return badRequest("game_date cannot be empty");
        fields.game_date = gd;
      }
      if (body.register_open_at !== undefined) {
        fields.register_open_at = parseOptionalDate(body.register_open_at, "register_open_at");
      }
      if (body.register_close_at !== undefined) {
        fields.register_close_at = parseOptionalDate(body.register_close_at, "register_close_at");
      }
    } catch (err) {
      return badRequest((err as Error).message);
    }
  }
  if (body.roulette_enabled !== undefined) {
    if (typeof body.roulette_enabled !== "boolean") return badRequest("roulette_enabled must be a boolean");
    fields.roulette_enabled = body.roulette_enabled;
  }
  if (body.bracket_type !== undefined) {
    if (body.bracket_type !== "single_elim" && body.bracket_type !== "double_elim") {
      return badRequest("Invalid bracket_type");
    }
    fields.bracket_type = body.bracket_type;
  }

  if (!(await verifyTurnstileFromRequest(req, (body["cf-turnstile-response"] as string) ?? ""))) {
    return forbidden("Turnstile verification failed");
  }

  try {
    const result = await updateGame(gameId, user.username, user.id, fields);
    if ("error" in result) {
      return result.error === "not the owner"
        ? forbidden("not the owner")
        : notFound(result.error === "not found" ? "Not found" : result.error);
    }
    return ok(result);
  } catch (err) {
    console.error("games/[id] PUT error:", err);
    return error("internal");
  }
}

async function remove(req: NextRequest, gameId: number) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  if (!(await verifyTurnstileFromRequest(req))) {
    return forbidden("Turnstile verification failed");
  }

  try {
    const result = await deleteGame(gameId, user.username, user.id);
    if ("error" in result) {
      return result.error === "not the owner"
        ? forbidden("not the owner")
        : notFound(result.error === "not found" ? "Not found" : result.error);
    }
    return ok(result);
  } catch (err) {
    console.error("games/[id] DELETE error:", err);
    return error("internal");
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gameId = parseInt(id, 10);
  if (isNaN(gameId)) return badRequest("Invalid id");
  return update(req, gameId);
}

// POST aliases PUT for the owner-edit case.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gameId = parseInt(id, 10);
  if (isNaN(gameId)) return badRequest("Invalid id");
  return update(req, gameId);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gameId = parseInt(id, 10);
  if (isNaN(gameId)) return badRequest("Invalid id");
  return remove(req, gameId);
}