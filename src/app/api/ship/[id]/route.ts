import { NextRequest, NextResponse } from "next/server";
import { getImageData, deleteShip } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";
import { UTApi } from "uploadthing/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const shipId = parseInt(id, 10);
    if (isNaN(shipId)) {
      return NextResponse.json({ error: "Invalid ship ID" }, { status: 400 });
    }

    const ship = await getImageData(shipId);
    if (!ship) {
      return NextResponse.json({ error: "Ship not found" }, { status: 404 });
    }

    return NextResponse.json(ship);
  } catch (err) {
    console.error("ship/[id] GET error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const shipId = parseInt(id, 10);
  if (isNaN(shipId)) {
    return NextResponse.json({ error: "Invalid ship ID" }, { status: 400 });
  }

  try {
    const cl = req.headers.get("content-length");
    if (cl && parseInt(cl, 10) > 1_048_576) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }
    const body = await req.json();
    const { getImageData: getShip } = await import("@/lib/db");
    const ship = await getShip(shipId);
    if (!ship) {
      return NextResponse.json({ error: "Ship not found" }, { status: 404 });
    }
    const { isShipOwner, updateShip } = await import("@/lib/db");
    if (!isShipOwner(ship, { id: user.id, username: user.username })) {
      return NextResponse.json({ error: "Not the owner" }, { status: 403 });
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

    return NextResponse.json({ success: "Ship updated" });
  } catch {
    return NextResponse.json({ error: "Failed to update ship" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const shipId = parseInt(id, 10);
  if (isNaN(shipId)) {
    return NextResponse.json({ error: "Invalid ship ID" }, { status: 400 });
  }

  try {
    const result = await deleteShip(shipId, { id: user.id, username: user.username });
    if ("error" in result) {
      return NextResponse.json(result, { status: 403 });
    }

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

    return NextResponse.json({ success: result.success });
  } catch (err) {
    console.error("ship/[id] DELETE error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
