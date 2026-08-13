import { ok, error } from "@/lib/api";
import { getTagsWithCounts } from "@/lib/db";

export async function GET() {
  try {
    const tags = await getTagsWithCounts();
    return ok(tags);
  } catch (err) {
    console.error("ship/tags error:", err);
    return error("internal");
  }
}
