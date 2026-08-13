import { ok, error } from "@/lib/api";
import { getAuthorsWithCounts } from "@/lib/db";

export async function GET() {
  try {
    const authors = await getAuthorsWithCounts();
    return ok(authors);
  } catch (err) {
    console.error("ship/authors error:", err);
    return error("internal");
  }
}
