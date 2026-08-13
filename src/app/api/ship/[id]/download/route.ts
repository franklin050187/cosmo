import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { updateDownloads } from "@/lib/db";
import { ok, badRequest, error } from "@/lib/api";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const shipId = parseInt(id, 10);
  if (isNaN(shipId)) {
    return badRequest("Invalid ship ID");
  }

  try {
    await updateDownloads(shipId);
    return ok({ success: true });
  } catch (err) {
    console.error("ship/[id]/download error:", err);
    return error("internal");
  }
}
