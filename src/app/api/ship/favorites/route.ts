import { NextRequest } from "next/server";
import { getMyFavorites } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { ok, error } from "@/lib/api";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  try {
    const result = await getMyFavorites(user.username, user.id);
    return ok(result);
  } catch (err) {
    console.error("ship/favorites error:", err);
    return error("internal");
  }
}
