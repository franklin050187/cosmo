export async function verifyTurnstileToken(token: string, ip?: string): Promise<boolean> {
  const turnstileSecret = process.env.TURNSTILE_SECRET;
  if (!token || !turnstileSecret) return false;
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: turnstileSecret,
        response: token,
        ...(ip ? { remoteip: ip } : {}),
      }),
    });
    if (!r.ok) return false;
    const data = await r.json();
    return data.success === true;
  } catch {
    return false;
  }
}

export function getTurnstileTokenFromReq(req: Request): string {
  return req.headers.get("x-turnstile-token") || "";
}

function clientIp(req: Request): string {
  return (
    (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "").replace(/^::ffff:/, "")
  );
}

/**
 * Verify Turnstile on a mutation request. Reads the token from the
 * `x-turnstile-token` header (falling back to the `cf-turnstile-response`
 * form field), so it works for JSON, form, and bodyless requests alike.
 * Skipped entirely in development (server never enforces the captcha there).
 */
export async function verifyTurnstileFromRequest(
  req: Request,
  bodyToken?: string
): Promise<boolean> {
  if (process.env.NODE_ENV === "development") return true;
  const token = getTurnstileTokenFromReq(req) || bodyToken || "";
  if (!token) return false;
  return verifyTurnstileToken(token, clientIp(req));
}
