import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { verifyTurnstileFromRequest } from "@/lib/turnstile";
import { getCollection, updateCollection, deleteCollection } from "@/lib/db";
import { ok, badRequest, notFound, forbidden, error } from "@/lib/api";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const collectionId = parseInt(id, 10);
    if (isNaN(collectionId)) {
      return badRequest("Invalid id");
    }

    const col = await getCollection(collectionId);
    if (!col) {
      return notFound();
    }

    return ok(col);
  } catch (err) {
    console.error("collections/[id] GET error:", err);
    return error("internal");
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
    return badRequest("Invalid id");
  }

  const cl = req.headers.get("content-length");
  if (cl && parseInt(cl, 10) > 1_048_576) {
    return badRequest("Payload too large", 413);
  }
  const body = await req.json();

  if (!(await verifyTurnstileFromRequest(req, (body["cf-turnstile-response"] as string) ?? ""))) {
    return forbidden("Turnstile verification failed");
  }

  try {
    const result = await updateCollection(collectionId, user.username, user.id, {
      title: body.title,
      description: body.description,
    });

    if ("error" in result) {
      return result.error === "not the owner"
        ? forbidden("not the owner")
        : notFound(result.error === "not found" ? "Not found" : result.error);
    }
    return ok(result);
  } catch (err) {
    console.error("collections/[id] PUT error:", err);
    return error("internal");
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
    return badRequest("Invalid id");
  }

  if (!(await verifyTurnstileFromRequest(req))) {
    return forbidden("Turnstile verification failed");
  }

  try {
    const result = await deleteCollection(collectionId, user.username, user.id);

    if ("error" in result) {
      return result.error === "not the owner"
        ? forbidden("not the owner")
        : notFound(result.error === "not found" ? "Not found" : result.error);
    }
    return ok(result);
  } catch (err) {
    console.error("collections/[id] DELETE error:", err);
    return error("internal");
  }
}
