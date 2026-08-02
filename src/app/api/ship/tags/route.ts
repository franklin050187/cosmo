import { NextResponse } from "next/server";
import { getTagsWithCounts } from "@/lib/db";

export async function GET() {
  try {
    const tags = await getTagsWithCounts();
    return NextResponse.json(tags);
  } catch (err) {
    console.error("ship/tags error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
