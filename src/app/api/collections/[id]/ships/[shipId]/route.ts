import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { removeShipFromCollection } from "@/lib/db";
import { ok, badRequest, forbidden, notFound, error } from "@/lib/api";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; shipId: string }> },
) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const { id, shipId } = await params;
  const collectionId = parseInt(id, 10);
  const shipIdNum = parseInt(shipId, 10);
  if (isNaN(collectionId) || isNaN(shipIdNum)) {
    return badRequest("Invalid id");
  }

  try {
    const result = await removeShipFromCollection(
      collectionId,
      shipIdNum,
      user.username,
      user.id,
    );

    if ("error" in result) {
      return result.error === "not the owner"
        ? forbidden("not the owner")
        : notFound(result.error === "not found" ? "Not found" : result.error);
    }
    return ok(result);
  } catch (err) {
    console.error("collections/[id]/ships/[shipId] error:", err);
    return error("internal");
  }
}
