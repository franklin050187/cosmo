import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { registerForGame, leaveGame, resolveUsernameToDiscordId } from "@/lib/db";
import { ok, badRequest, notFound, forbidden, error } from "@/lib/api";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";

type Identity = { discordId: string | null; username: string };

const MAX_USERNAME = 40;

// Guests have no session to throttle against, so cap registration volume
// per network. 10 sign-ups / 10 min is far above any real group's pace.
const guestRegisterLimiter = createRateLimiter({
  tokens: 10,
  windowMs: 10 * 60_000,
  keyPrefix: "guest-register",
});

async function resolveIdentity(req: NextRequest, body: Record<string, unknown>, user: ReturnType<typeof getUserFromRequest>): Promise<Identity> {
  if (user) return { discordId: user.id, username: user.username };

  const username = typeof body.username === "string" ? body.username.trim() : "";
  if (!username) {
    throw { kind: "badRequest", message: "Username is required (or log in to auto-register)" };
  }
  if (username.length > MAX_USERNAME) {
    throw { kind: "badRequest", message: "Username too long (40 characters max)" };
  }
  // Prefer a known Discord identity from the favorites lookup.
  const discordId = await resolveUsernameToDiscordId(username);
  return { discordId, username };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gameId = parseInt(id, 10);
  if (isNaN(gameId)) return badRequest("Invalid id");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  try {
    const user = getUserFromRequest(req);
    if (!user) {
      // Guest path: captcha + volume limit, since there is no session to trust.
      // Development skips both, mirroring the documented Turnstile dev bypass,
      // so scripted suites are not throttled by design.
      if (process.env.NODE_ENV !== "development") {
        const ip = getClientIp(req);
        const limit = await guestRegisterLimiter.limit(ip);
        if (!limit.success) {
          return error("Too many registrations from this network. Try again later.", 429);
        }
        const turnstileToken = typeof body["cf-turnstile-response"] === "string" ? body["cf-turnstile-response"] : "";
        const turnstileOk = await verifyTurnstileToken(turnstileToken, ip);
        if (!turnstileOk) {
          return forbidden("Turnstile verification failed");
        }
      }
    }
    const identity = await resolveIdentity(req, body, user);
    const inviteCode = typeof body.invite_code === "string" ? body.invite_code.trim() : "";
    const result = await registerForGame(gameId, {
      discordId: identity.discordId,
      username: identity.username,
      inviteCode,
    });
    if ("error" in result) {
      if (result.error === "not found") return notFound("Not found");
      if (result.error === "invalid invite code") return forbidden(result.error);
      return badRequest(result.error);
    }
    return ok(result);
  } catch (err) {
    if ((err as { kind?: string }).kind === "badRequest") {
      return badRequest((err as { message: string }).message);
    }
    console.error("games/[id]/register POST error:", err);
    return error("internal");
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gameId = parseInt(id, 10);
  if (isNaN(gameId)) return badRequest("Invalid id");

  try {
    const body: Record<string, unknown> = {};
    const cl = req.headers.get("content-length");
    if (cl && parseInt(cl, 10) <= 1_048_576) {
      try {
        Object.assign(body, await req.json());
      } catch {}
    }
    // Destructive identity comes from the session or from an unclaimed guest
    // name only. Never resolve a typed name against favorites here; that would
    // let anyone delete a Discord participant by knowing their username.
    const user = getUserFromRequest(req);
    const identity = user
      ? ({ kind: "session", discordId: user.id } as const)
      : (() => {
          const username = typeof body.username === "string" ? body.username.trim() : "";
          if (!username) {
            throw { kind: "badRequest", message: "Username is required (or log in to auto-register)" };
          }
          if (username.length > MAX_USERNAME) {
            throw { kind: "badRequest", message: "Username too long (40 characters max)" };
          }
          return { kind: "guest", username } as const;
        })();
    const result = await leaveGame(gameId, identity);
    if ("error" in result && result.error === "not found") return notFound("Not found");
    return ok(result);
  } catch (err) {
    if ((err as { kind?: string }).kind === "badRequest") {
      return badRequest((err as { message: string }).message);
    }
    console.error("games/[id]/register DELETE error:", err);
    return error("internal");
  }
}