import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";

const ADMIN_USERNAMES = (process.env.ADMIN_USERNAMES || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export async function GET(req: NextRequest) {
  const username = getUserFromRequest(req)?.username;
  return NextResponse.json({ isAdmin: !!username && ADMIN_USERNAMES.includes(username) });
}
