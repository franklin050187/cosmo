import { NextRequest, NextResponse } from "next/server";
import { calculateShipPrice } from "@/lib/price";
import { getUserFromRequest } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
