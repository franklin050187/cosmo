import { NextRequest } from "next/server";
import { searchFromQueryString } from "@/lib/db";
import { ok, error } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams.toString();
    const result = await searchFromQueryString(searchParams);
    return ok(result);
  } catch (err) {
    console.error("ship/search error:", err);
    return error("internal");
  }
}
