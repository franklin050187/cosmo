import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { addShipToCollection } from "@/lib/db";

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
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const cl = req.headers.get("content-length");
  if (cl && parseInt(cl, 10) > 1_048_576) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  const body = await req.json();
  const shipId = body.shipId;
  if (typeof shipId !== "number") {
    return NextResponse.json({ error: "shipId required" }, { status: 400 });
  }

  try {
    const result = await addShipToCollection(collectionId, shipId, user.username, user.id);

    if ("error" in result) {
      return NextResponse.json(result, {
        status: result.error === "not the owner" ? 403 : 404,
      });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("collections/[id]/ships error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
