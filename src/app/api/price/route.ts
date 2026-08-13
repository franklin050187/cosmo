import { NextRequest } from "next/server";
import { calculateShipPrice } from "@/lib/price";
import { requireAuth } from "@/lib/auth";
import { ok, badRequest } from "@/lib/api";

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const cl = req.headers.get("content-length");
    if (cl && parseInt(cl, 10) > 1_048_576) {
      return badRequest("Payload too large", 413);
    }
    const body = await req.json();
    const result = calculateShipPrice(body);
    return ok(result);
  } catch (err) {
    console.error("price calculation error:", err);
    return badRequest("Invalid ship data");
  }
}
