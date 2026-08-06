import { NextRequest, NextResponse } from "next/server";
import { getMyShips } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  try {
    const result = await getMyShips(user.username, user.id);
    return NextResponse.json(result);
  } catch (err) {
    console.error("ship/my-ships error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
