import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getUserCollections } from "@/lib/db";
import { ok, error } from "@/lib/api";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  try {
    const { searchParams } = new URL(req.url);
    const shipId = searchParams.get("shipId");
    const data = await getUserCollections(
      user.username,
      user.id,
      shipId ? parseInt(shipId, 10) || undefined : undefined,
    );
    return ok(data);
  } catch (err) {
    console.error("collections/mine error:", err);
    return error("internal");
  }
}
