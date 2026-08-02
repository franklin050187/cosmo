import { NextRequest, NextResponse } from "next/server";
import { searchFromQueryString } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams.toString();
    const result = await searchFromQueryString(searchParams);
    return NextResponse.json(result);
  } catch (err) {
    console.error("ship/search error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
