import { NextRequest } from "next/server";
import { getUserFromRequest, isAdminUsername } from "@/lib/auth";
import { ok } from "@/lib/api";

export async function GET(req: NextRequest) {
  const username = getUserFromRequest(req)?.username;
  return ok({ isAdmin: isAdminUsername(username) });
}
