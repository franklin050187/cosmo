import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest, isAdminUsername } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const username = getUserFromRequest(req)?.username;
  return NextResponse.json({ isAdmin: isAdminUsername(username) });
}
