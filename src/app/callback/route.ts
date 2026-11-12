import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { generateUserToken, type UserPayload, type TokenPayload } from "@/lib/auth";
import { migrateUsernameOnLogin } from "@/lib/db";
import { getRequiredEnv } from "@/lib/env";

const DISCORD_API = "https://discord.com/api/v10";

function getClientUrl(): string {
  return getRequiredEnv("CLIENT_URL");
}

// Post-OAuth signals (fresh login, auth failure) ride in short-lived cookies,
// never query params. A ?just_logged_in=1 or ?auth_error= param diverges from
// Next's router state as soon as the client strips it with
// history.replaceState; the router then re-asserts its stale canonical URL,
// which clobbers the user's first sort/filter navigation right after login
// (clicks silently did nothing) and re-fires fetch effects. Session cookie:
// the client reads + deletes it on mount (useAuth / Header).
function redirectWithSignal(
  clientUrl: string,
  returnTo: string,
  signal: { name: string; value: string }
): NextResponse {
  const res = NextResponse.redirect(`${clientUrl}${returnTo}`);
  res.cookies.set(signal.name, signal.value, {
    path: "/",
    sameSite: "lax",
    secure: true,
  });
  return res;
}

export async function GET(req: NextRequest) {
  const clientUrl = getClientUrl();

  // CSRF validation
  const state = req.nextUrl.searchParams.get("state");
  const csrfCookie = req.cookies.get("oauth_csrf")?.value;
  const returnTo = decodeURIComponent(req.cookies.get("oauth_return")?.value || "/");

  if (!state || !csrfCookie || state !== csrfCookie) {
    return redirectWithSignal(
      clientUrl,
      returnTo.startsWith("/") ? returnTo : `/${returnTo}`,
      { name: "auth_error", value: "csrf_failed" }
    );
  }

  // Discord returned an error (e.g. user cancelled)
  const error = req.nextUrl.searchParams.get("error");
  if (error) {
    return redirectWithSignal(clientUrl, returnTo, {
      name: "auth_error",
      value: encodeURIComponent(error),
    });
  }

  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return redirectWithSignal(clientUrl, returnTo, { name: "auth_error", value: "no_code" });
  }

  try {
    const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: getRequiredEnv("DISCORD_CLIENT_ID"),
        client_secret: getRequiredEnv("DISCORD_CLIENT_SECRET"),
        grant_type: "authorization_code",
        code,
        redirect_uri: getRequiredEnv("DISCORD_REDIRECT_URI"),
      }),
    });

    if (!tokenRes.ok) {
      return redirectWithSignal(clientUrl, returnTo, {
        name: "auth_error",
        value: "token_exchange_failed",
      });
    }

    const { access_token } = await tokenRes.json();

    const userRes = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!userRes.ok) {
      return redirectWithSignal(clientUrl, returnTo, {
        name: "auth_error",
        value: "user_fetch_failed",
      });
    }

    const discordUser = await userRes.json();

    // Check guilds for branding
    const guildsRes = await fetch(`${DISCORD_API}/users/@me/guilds`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    let guild = "gen";
    if (guildsRes.ok) {
      const guilds = await guildsRes.json();
      const guildExcelsior = process.env.DISCORD_GUILD_EXCELSIOR_ID;
      const guildCosmoteer = process.env.DISCORD_GUILD_COSMOTEER_ID;
      for (const g of guilds) {
        if (guildExcelsior && g.id === guildExcelsior) {
          guild = "exl";
          break;
        }
        if (guildCosmoteer && g.id === guildCosmoteer) {
          guild = "gen";
        }
      }
    }

    const disc = typeof discordUser.discriminator === "string" ? discordUser.discriminator : "";
    const user: UserPayload = {
      id: discordUser.id,
      // Always keep the legacy `username#discriminator` format (e.g. `poney5850#0`),
      // matching the old app and ADMIN_USERNAMES, so admin checks and ownership work.
      username: disc ? `${discordUser.username}#${disc}` : discordUser.username,
      avatar: discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
        : null,
      guild,
    };

    const token = generateUserToken(user);

    // Discord username-rename migration: detect a previous username from the
    // old __session cookie (if present) and migrate owned ships/collections.
    const prevSession = req.cookies.get("__session")?.value;
    let prevUsername: string | null = null;
    if (prevSession) {
      try {
        const decoded = jwt.verify(prevSession, getRequiredEnv("JWT_SECRET")) as TokenPayload;
        prevUsername = decoded?.user?.username ?? null;
      } catch { /* old/expired cookie — ignore */ }
    }

    await migrateUsernameOnLogin(user.id, user.username, prevUsername ?? null, discordUser.username);

    // Clear OAuth cookies, set session cookie, and signal the fresh login via
    // a short-lived cookie (never in the URL — see redirectWithSignal).
    const res = redirectWithSignal(clientUrl, returnTo, { name: "just_logged_in", value: "1" });
    res.cookies.set("__session", token, {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 7 * 86400,
    });
    res.cookies.set("oauth_csrf", "", { path: "/", maxAge: 0 });
    res.cookies.set("oauth_return", "", { path: "/", maxAge: 0 });
    return res;
  } catch {
    return redirectWithSignal(clientUrl, returnTo, { name: "auth_error", value: "auth_failed" });
  }
}
