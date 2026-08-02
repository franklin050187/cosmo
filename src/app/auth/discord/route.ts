import { NextRequest } from "next/server";
import crypto from "crypto";

function isSafeReturnPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path.includes("://") || path.includes("\\")) return false;
  if (path.includes("..")) return false;
  return true;
}

export async function GET(req: NextRequest) {
  let returnTo = req.nextUrl.searchParams.get("returnTo") || "/";
  if (!isSafeReturnPath(returnTo)) returnTo = "/";

  const nonce = crypto.randomBytes(32).toString("hex");

  const discordClientId = process.env.DISCORD_CLIENT_ID;
  const discordRedirectUri = process.env.DISCORD_REDIRECT_URI;
  if (!discordClientId) throw new Error("DISCORD_CLIENT_ID is required");
  if (!discordRedirectUri) throw new Error("DISCORD_REDIRECT_URI is required");

  const params = new URLSearchParams({
    client_id: discordClientId,
    redirect_uri: discordRedirectUri,
    response_type: "code",
    scope: "identify guilds",
    state: nonce,
  });

  const res = Response.redirect(`https://discord.com/oauth2/authorize?${params}`);
  // Set cookies on the redirect response
  const headers = new Headers(res.headers);
  headers.append("Set-Cookie", `oauth_csrf=${nonce}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`);
  headers.append("Set-Cookie", `oauth_return=${encodeURIComponent(returnTo)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`);
  return new Response(null, { status: res.status, headers });
}
