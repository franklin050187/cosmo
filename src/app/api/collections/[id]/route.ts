import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { verifyTurnstileFromRequest } from "@/lib/turnstile";
import { getCollection, updateCollection, deleteCollection } from "@/lib/db";

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

  if (!(await verifyTurnstileFromRequest(req, (body["cf-turnstile-response"] as string) ?? ""))) {
    return NextResponse.json({ error: "Turnstile verification failed" }, { status: 403 });
  }

  try {
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
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const { id } = await params;
  const collectionId = parseInt(id, 10);
  if (isNaN(collectionId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  if (!(await verifyTurnstileFromRequest(req))) {
    return NextResponse.json({ error: "Turnstile verification failed" }, { status: 403 });
  }

  try {
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
