import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { addShipToCollection } from "@/lib/db";
import { ok, badRequest, forbidden, notFound, error } from "@/lib/api";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const { id } = await params;
  const collectionId = parseInt(id, 10);
  if (isNaN(collectionId)) {
    return badRequest("Invalid id");
  }

  const cl = req.headers.get("content-length");
  if (cl && parseInt(cl, 10) > 1_048_576) {
    return badRequest("Payload too large", 413);
  }
  const body = await req.json();
  const shipId = body.shipId;
  if (typeof shipId !== "number") {
    return badRequest("shipId required");
  }

  try {
    const result = await addShipToCollection(collectionId, shipId, user.username, user.id);

    if ("error" in result) {
      return result.error === "not the owner"
        ? forbidden("not the owner")
        : notFound(result.error === "not found" ? "Not found" : result.error);
    }
    return ok(result);
  } catch (err) {
    console.error("collections/[id]/ships error:", err);
    return error("internal");
  }
}
