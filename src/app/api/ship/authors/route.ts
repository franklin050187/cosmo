import { NextResponse } from "next/server";
import { getAuthorsWithCounts } from "@/lib/db";

export async function GET() {
  try {
    const authors = await getAuthorsWithCounts();
    return NextResponse.json(authors);
  } catch (err) {
    console.error("ship/authors error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
