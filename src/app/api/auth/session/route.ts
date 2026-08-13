import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { ok } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  return ok({ user });
}
