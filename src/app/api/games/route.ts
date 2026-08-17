import { NextRequest } from "next/server";
import { requireAuth, getUserFromRequest } from "@/lib/auth";
import { verifyTurnstileFromRequest } from "@/lib/turnstile";
import { getCollection, listGames, listPastGames, listMyGames, createGame } from "@/lib/db";
import { ok, badRequest, forbidden, error } from "@/lib/api";

const VALID_MODES = new Set(["pvp", "tournament", "campaign"]);
const VALID_VISIBILITY = new Set(["public", "private"]);

/** Parse an optional date field; null/empty clears it. Throws on garbage. */
function parseOptionalDate(value: unknown, label: string): string | null {
  if (value == null || value === "") return null;
  const d = new Date(String(value));
  if (isNaN(d.getTime())) throw new Error(`invalid ${label}`);
  return d.toISOString();
}

export async function GET(req: NextRequest) {
  try {
    const user = getUserFromRequest(req);
    const publicGames = await listGames();
    const past = await listPastGames();
    const mine = user ? await listMyGames(user.id, user.username) : [];
    return ok({ public: publicGames, mine, past });
  } catch (err) {
    console.error("games GET error:", err);
    return error("internal");
  }
}

export async function POST(req: NextRequest) {
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

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return badRequest("Title is required");

  const gameMode = typeof body.game_mode === "string" ? body.game_mode : "pvp";
  if (!VALID_MODES.has(gameMode)) return badRequest("Invalid game mode");

  const bracketType = body.bracket_type === "double_elim" ? "double_elim" : "single_elim";

  const visibility = typeof body.visibility === "string" ? body.visibility : "public";
  if (!VALID_VISIBILITY.has(visibility)) return badRequest("Invalid visibility");

  const collectionId =
    body.collection_id != null ? parseInt(String(body.collection_id), 10) || null : null;
  if (collectionId != null) {
    const col = await getCollection(collectionId);
    if (!col) return badRequest("Collection not found");
    if (!(col.discord_id === user.id || col.owner === user.username)) {
      return forbidden("Not your collection");
    }
  }

  let gameDate: string;
  let registerOpenAt: string | null = null;
  let registerCloseAt: string | null = null;
  try {
    const gd = parseOptionalDate(body.game_date, "game_date");
    if (!gd) return badRequest("game_date is required");
    gameDate = gd;
    registerOpenAt = parseOptionalDate(body.register_open_at, "register_open_at");
    registerCloseAt = parseOptionalDate(body.register_close_at, "register_close_at");
  } catch (err) {
    return badRequest((err as Error).message);
  }
  if (registerOpenAt && registerCloseAt && new Date(registerOpenAt) > new Date(registerCloseAt)) {
    return badRequest("registration window opens after it closes");
  }

  if (!(await verifyTurnstileFromRequest(req, (body["cf-turnstile-response"] as string) ?? ""))) {
    return forbidden("Turnstile verification failed");
  }

  try {
    const result = await createGame({
      ownerName: user.username,
      ownerId: user.id,
      title,
      description: typeof body.description === "string" ? body.description.trim() : "",
      gameMode: gameMode as "pvp" | "tournament" | "campaign",
      visibility: visibility as "public" | "private",
      collectionId,
      gameDate,
      registerOpenAt,
      registerCloseAt,
      rouletteEnabled: body.roulette_enabled === true,
      bracketType,
    });
    return ok(result, 201);
  } catch (err) {
    console.error("games POST error:", err);
    return error("internal");
  }
}