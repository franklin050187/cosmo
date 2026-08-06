import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ok, badRequest, error } from "@/lib/api";
import { findDuplicateBySignature } from "@/lib/db";
import { decodePngPixels, decodeShipFromPixels } from "@/lib/server-decode";
import { computeShipSignature } from "@/lib/ship-signature";

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const cl = req.headers.get("content-length");
      if (cl && parseInt(cl, 10) > 5_242_880) {
        return error("Payload too large", 413);
      }

      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return badRequest("file required");
      }

      const arrayBuf = await file.arrayBuffer();
      const imageData = decodePngPixels(arrayBuf);
      const shipData = decodeShipFromPixels(imageData);
      const signature = computeShipSignature(shipData);
      const duplicates = await findDuplicateBySignature(signature);
      return ok({ duplicates, signature });
    }

    const body = await req.json();
    const { signature } = body;
    if (!signature || typeof signature !== "string") {
      return badRequest("signature required");
    }
    const cl = req.headers.get("content-length");
    if (cl && parseInt(cl, 10) > 1_048_576) {
      return error("Payload too large", 413);
    }
    const duplicates = await findDuplicateBySignature(signature);
    return ok({ duplicates });
  } catch (err) {
    console.error("check-duplicate error:", err);
    return error("duplicate check failed");
  }
}
