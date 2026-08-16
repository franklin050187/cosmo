import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getImageData, deleteShip, isShipOwner, updateShip } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { verifyTurnstileFromRequest } from "@/lib/turnstile";
import { UTApi } from "uploadthing/server";
import { ok, badRequest, notFound, forbidden, error } from "@/lib/api";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const shipId = parseInt(id, 10);
    if (isNaN(shipId)) {
      return badRequest("Invalid ship ID");
    }

    const ship = await getImageData(shipId);
    if (!ship) {
      return notFound("Ship not found");
    }

    return ok(ship);
  } catch (err) {
    console.error("ship/[id] GET error:", err);
    return error("internal");
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const { id } = await params;
  const shipId = parseInt(id, 10);
  if (isNaN(shipId)) {
    return badRequest("Invalid ship ID");
  }

  let body: {
    name?: string;
    data?: string;
    description?: string;
    ship_name?: string;
    author?: string;
    price?: number;
    brand?: string;
    crew?: number;
    tags?: string[];
    "cf-turnstile-response"?: string;
  } = {};
  try {
    const cl = req.headers.get("content-length");
    if (cl && parseInt(cl, 10) > 1_048_576) {
      return badRequest("Payload too large", 413);
    }
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  if (!(await verifyTurnstileFromRequest(req, body["cf-turnstile-response"] ?? ""))) {
    return forbidden("Turnstile verification failed");
  }

  try {
    const ship = await getImageData(shipId);
    if (!ship) {
      return notFound("Ship not found");
    }
    if (!isShipOwner(ship, { id: user.id, username: user.username })) {
      return forbidden("Not the owner");
    }

    await updateShip({
      id: shipId,
      name: body.name ?? ship.name,
      data: body.data ?? ship.data,
      submittedBy: user.username,
      submittedById: user.id,
      description: body.description ?? ship.description,
      shipName: body.ship_name ?? ship.ship_name,
      author: body.author ?? ship.author,
      price: body.price ?? ship.price,
      brand: body.brand ?? ship.brand,
      crew: body.crew ?? ship.crew,
      tags: body.tags ?? ship.tags,
    });

    revalidatePath(`/ship/${shipId}`);

    return ok({ success: "Ship updated" });
  } catch {
    return error("Failed to update ship");
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const { id } = await params;
  const shipId = parseInt(id, 10);
  if (isNaN(shipId)) {
    return badRequest("Invalid ship ID");
  }

  if (!(await verifyTurnstileFromRequest(req))) {
    return forbidden("Turnstile verification failed");
  }

  try {
    const result = await deleteShip(shipId, { id: user.id, username: user.username });
    if ("error" in result) {
      return forbidden(result.error);
    }

    revalidatePath(`/ship/${shipId}`);

    if (result.data) {
      try {
        const url = new URL(result.data);
        const fileKey = url.pathname.split("/").pop();
        if (fileKey) {
          const utapi = new UTApi();
          await utapi.deleteFiles(fileKey);
        }
      } catch (e) {
        console.error("Failed to delete old file from UploadThing:", e);
        // best-effort — file may already be gone
      }
    }

    return ok({ success: result.success });
  } catch (err) {
    console.error("ship/[id] DELETE error:", err);
    return error("internal");
  }
}
