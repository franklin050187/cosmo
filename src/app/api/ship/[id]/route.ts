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

  let body: Record<string, unknown>;
  try {
    const cl = req.headers.get("content-length");
    if (cl && parseInt(cl, 10) > 1_048_576) {
      return badRequest("Payload too large", 413);
    }
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  let turnstileToken = "";
  if (body["cf-turnstile-response"] !== undefined) {
    if (typeof body["cf-turnstile-response"] !== "string") {
      return badRequest("cf-turnstile-response must be a string");
    }
    turnstileToken = body["cf-turnstile-response"];
  }
  if (!(await verifyTurnstileFromRequest(req, turnstileToken))) {
    return forbidden("Turnstile verification failed");
  }

  const fields: {
    name?: string;
    data?: string;
    description?: string;
    ship_name?: string;
    author?: string;
    price?: number;
    brand?: string;
    crew?: number;
    tags?: string[];
  } = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string") return badRequest("name must be a string");
    const name = body.name.trim();
    if (!name) return badRequest("name cannot be empty");
    fields.name = name;
  }
  if (body.description !== undefined) {
    if (typeof body.description !== "string") return badRequest("description must be a string");
    fields.description = body.description.trim();
  }
  if (body.ship_name !== undefined) {
    if (typeof body.ship_name !== "string") return badRequest("ship_name must be a string");
    fields.ship_name = body.ship_name.trim();
  }
  if (body.author !== undefined) {
    if (typeof body.author !== "string") return badRequest("author must be a string");
    fields.author = body.author.trim();
  }
  if (body.brand !== undefined) {
    if (typeof body.brand !== "string") return badRequest("brand must be a string");
    fields.brand = body.brand.trim();
  }
  if (body.data !== undefined) {
    if (typeof body.data !== "string" || !body.data.trim()) {
      return badRequest("data must be a non-empty string");
    }
    fields.data = body.data;
  }
  if (body.price !== undefined) {
    if (typeof body.price !== "number" || !Number.isFinite(body.price)) {
      return badRequest("price must be a number");
    }
    if (body.price < 0) return badRequest("price must be >= 0");
    fields.price = body.price;
  }
  if (body.crew !== undefined) {
    if (typeof body.crew !== "number" || !Number.isInteger(body.crew)) {
      return badRequest("crew must be an integer");
    }
    if (body.crew < 0) return badRequest("crew must be >= 0");
    fields.crew = body.crew;
  }
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags) || body.tags.some((t) => typeof t !== "string")) {
      return badRequest("tags must be an array of strings");
    }
    fields.tags = body.tags;
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
      name: fields.name ?? ship.name,
      data: fields.data ?? ship.data,
      submittedBy: user.username,
      submittedById: user.id,
      description: fields.description ?? ship.description,
      shipName: fields.ship_name ?? ship.ship_name,
      author: fields.author ?? ship.author,
      price: fields.price ?? ship.price,
      brand: fields.brand ?? ship.brand,
      crew: fields.crew ?? ship.crew,
      tags: fields.tags ?? ship.tags,
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
