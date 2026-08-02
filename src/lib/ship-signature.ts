import { createHash } from "node:crypto";
import { normalizeForSignature } from "./normalize-ship";

export function computeShipSignature(decodedShip: unknown): string {
  const normalized = normalizeForSignature(decodedShip);
  const json = JSON.stringify(normalized);
  return createHash("sha256").update(json).digest("hex");
}
