import { NextRequest, NextResponse } from "next/server";
import { getMyShips } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await getMyShips(user.username, user.id);
    return NextResponse.json(result);
  } catch (err) {
    console.error("ship/my-ships error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
