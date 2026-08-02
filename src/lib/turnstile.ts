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
