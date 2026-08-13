import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { logEvent } from "@/lib/analytics-db";
import { getUserFromRequest } from "@/lib/auth";
import { ok, badRequest, error } from "@/lib/api";

/**
 * Stable pseudo-identity for anonymous visitors: hash(IP + user-agent + salt).
 * Lets the dashboard tell distinct anonymous users apart even though they have
 * no Discord session. Not reversible and never logged in plaintext.
 */
function anonIdFor(req: NextRequest): string {
  const ip = (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    ""
  ).replace(/^::ffff:/, "");
  const ua = req.headers.get("user-agent") || "";
  const salt = process.env.ANALYTICS_ANON_SALT || "cosmo-anon-v1";
  return createHash("sha256")
    .update(`${ip}|${ua}|${salt}`)
    .digest("hex")
    .slice(0, 16);
}

const MAX_EVENT_TYPE_LEN = 64;
const MAX_URL_LEN = 1024;
const MAX_METADATA_BYTES = 4096;
const MAX_SHIP_ID = 2_147_483_647; // int4 range

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown>;
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const cl = req.headers.get("content-length");
      if (cl && parseInt(cl, 10) > 1_048_576) {
        return badRequest("Payload too large", 413);
      }
      body = await req.json();
    } else {
      return badRequest("unsupported content-type");
    }

    const event_type = String(body.event_type ?? "").trim().slice(0, MAX_EVENT_TYPE_LEN);
    if (!event_type) {
      return badRequest("event_type is required");
    }

    const rawMetadata = body.metadata;
    let metadata: Record<string, unknown> | undefined;
    if (rawMetadata != null) {
      if (typeof rawMetadata !== "object" || Array.isArray(rawMetadata)) {
        return badRequest("metadata must be an object");
      }
      if (Buffer.byteLength(JSON.stringify(rawMetadata), "utf8") > MAX_METADATA_BYTES) {
        return badRequest("metadata too large");
      }
      metadata = rawMetadata as Record<string, unknown>;
    }

    const user = getUserFromRequest(req);
    const rawShipId = body.ship_id != null ? Number(body.ship_id) : undefined;
    const ship_id =
      rawShipId !== undefined && Number.isFinite(rawShipId) && rawShipId > 0 && rawShipId <= MAX_SHIP_ID
        ? rawShipId
        : undefined;
    const url = body.url ? String(body.url).slice(0, MAX_URL_LEN) : undefined;

    await logEvent({
      event_type,
      user_id: user?.id,
      username: user?.username,
      guild: user?.guild,
      ship_id,
      url: url || req.headers.get("referer")?.slice(0, MAX_URL_LEN) || undefined,
      metadata,
      anon_id: user ? undefined : anonIdFor(req),
    });

    return ok(true);
  } catch (err) {
    console.error("analytics/log error:", err);
    return error("internal");
  }
}
