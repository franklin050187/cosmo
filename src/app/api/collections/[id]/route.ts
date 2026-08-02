import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { verifyTurnstileToken } from "@/lib/turnstile";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const collectionId = parseInt(id, 10);
    if (isNaN(collectionId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const { getCollection } = await import("@/lib/db");
    const col = await getCollection(collectionId);
    if (!col) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(col);
  } catch (err) {
    console.error("collections/[id] GET error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  if (process.env.NODE_ENV !== "development") {
    const turnstileToken = body["cf-turnstile-response"] || "";
    const ip = (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "").replace(/^::ffff:/, "");
    const turnstileOk = await verifyTurnstileToken(turnstileToken, ip);
    if (!turnstileOk) {
      return NextResponse.json({ error: "Turnstile verification failed" }, { status: 403 });
    }
  }

  try {
    const { updateCollection } = await import("@/lib/db");
    const result = await updateCollection(collectionId, user.username, user.id, {
      title: body.title,
      description: body.description,
    });

    if ("error" in result) {
      return NextResponse.json(result, { status: result.error === "not the owner" ? 403 : 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("collections/[id] PUT error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const collectionId = parseInt(id, 10);
  if (isNaN(collectionId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const { deleteCollection } = await import("@/lib/db");
    const result = await deleteCollection(collectionId, user.username, user.id);

    if ("error" in result) {
      return NextResponse.json(result, { status: result.error === "not the owner" ? 403 : 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("collections/[id] DELETE error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
