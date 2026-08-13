import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { getCollectionsForShip, getAllCollections, createCollection } from "@/lib/db";
import { ok, badRequest, forbidden, error } from "@/lib/api";

export async function GET(req: NextRequest) {
  const shipId = req.nextUrl.searchParams.get("shipId");

  try {
    if (shipId) {
      const shipIdNum = parseInt(shipId, 10);
      if (isNaN(shipIdNum)) {
        return badRequest("invalid shipId");
      }
      const data = await getCollectionsForShip(shipIdNum);
      return ok(data);
    }

    const page = parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10) || 1;
    const data = await getAllCollections(page);
    return ok(data);
  } catch (err) {
    console.error("collections GET error:", err);
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
  const body = await req.json();
  const title = body.title?.trim();
  if (!title) {
    return badRequest("Title is required");
  }

  if (process.env.NODE_ENV !== "development") {
    const turnstileToken = body["cf-turnstile-response"] || "";
    const ip = (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "").replace(/^::ffff:/, "");
    const turnstileOk = await verifyTurnstileToken(turnstileToken, ip);
    if (!turnstileOk) {
      return forbidden("Turnstile verification failed");
    }
  }

  try {
    const result = await createCollection(
      user.username,
      user.id,
      title,
      body.description?.trim() ?? "",
    );

    return ok(result, 201);
  } catch (err) {
    console.error("collections POST error:", err);
    return error("internal");
  }
}
