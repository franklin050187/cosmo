/**
 * Recursively normalizes decoded ship data for consistent hashing.
 *
 * The browser-side cosmoShip.js wraps floats as FloatValue{value} and
 * colors as ColorValue{parts}, while the server decoder returns raw
 * numbers and arrays. This function strips those wrappers so
 * JSON.stringify produces identical output on both sides.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isFloatValue(obj: any): boolean {
  return obj && typeof obj === "object" && "value" in obj && Object.keys(obj).length === 1;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isColorValue(obj: any): boolean {
  return obj && typeof obj === "object" && "parts" in obj && Array.isArray(obj.parts) && Object.keys(obj).length === 1;
}

export function normalizeForSignature(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;

  if (isFloatValue(obj)) {
    return (obj as { value: number }).value;
  }

  if (isColorValue(obj)) {
    return (obj as { parts: string[] }).parts;
  }

  if (Array.isArray(obj)) {
    return obj.map(normalizeForSignature);
  }

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = normalizeForSignature(value);
    }
    return result;
  }

  return obj;
}
