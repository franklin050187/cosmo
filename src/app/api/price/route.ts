import { NextRequest, NextResponse } from "next/server";
import { calculateShipPrice } from "@/lib/price";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const cl = req.headers.get("content-length");
    if (cl && parseInt(cl, 10) > 1_048_576) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }
    const body = await req.json();
    const result = calculateShipPrice(body);
    return NextResponse.json(result);
  } catch (err) {
    console.error("price calculation error:", err);
    return NextResponse.json({ error: "Invalid ship data" }, { status: 400 });
  }
}
