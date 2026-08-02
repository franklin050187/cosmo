import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; shipId: string }> },
) {
  const user = getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, shipId } = await params;
  const collectionId = parseInt(id, 10);
  const shipIdNum = parseInt(shipId, 10);
  if (isNaN(collectionId) || isNaN(shipIdNum)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const { removeShipFromCollection } = await import("@/lib/db");
    const result = await removeShipFromCollection(
      collectionId,
      shipIdNum,
      user.username,
      user.id,
    );

    if ("error" in result) {
      return NextResponse.json(result, {
        status: result.error === "not the owner" ? 403 : 404,
      });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("collections/[id]/ships/[shipId] error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
