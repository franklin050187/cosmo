import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { updateDownloads } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!getUserFromRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const shipId = parseInt(id, 10);
  if (isNaN(shipId)) {
    return NextResponse.json({ error: "Invalid ship ID" }, { status: 400 });
  }

  try {
    await updateDownloads(shipId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("ship/[id]/download error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
