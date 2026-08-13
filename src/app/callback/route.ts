import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { generateUserToken, type UserPayload, type TokenPayload } from "@/lib/auth";
import { migrateUsernameOnLogin } from "@/lib/db";
import { getRequiredEnv } from "@/lib/env";

const DISCORD_API = "https://discord.com/api/v10";

function getClientUrl(): string {
  return getRequiredEnv("CLIENT_URL");
}

export async function GET(req: NextRequest) {
  const clientUrl = getClientUrl();

  // CSRF validation
  const state = req.nextUrl.searchParams.get("state");
  const csrfCookie = req.cookies.get("oauth_csrf")?.value;
  const returnTo = decodeURIComponent(req.cookies.get("oauth_return")?.value || "/");

  if (!state || !csrfCookie || state !== csrfCookie) {
    return NextResponse.redirect(`${clientUrl}/${returnTo.startsWith("/") ? "" : "/"}${returnTo.replace(/^\//, "")}?auth_error=csrf_failed`);
  }

  // Discord returned an error (e.g. user cancelled)
  const error = req.nextUrl.searchParams.get("error");
  if (error) {
    return NextResponse.redirect(`${clientUrl}${returnTo}?auth_error=${encodeURIComponent(error)}`);
  }

  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(`${clientUrl}${returnTo}?auth_error=no_code`);
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
      return NextResponse.redirect(`${clientUrl}${returnTo}?auth_error=token_exchange_failed`);
    }

    const { access_token } = await tokenRes.json();

    const userRes = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!userRes.ok) {
      return NextResponse.redirect(`${clientUrl}${returnTo}?auth_error=user_fetch_failed`);
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

    // Clear OAuth cookies and set session cookie (never in URL — prevents token leakage)
    const successReturn = `${returnTo}${returnTo.includes("?") ? "&" : "?"}just_logged_in=1`;
    const res = NextResponse.redirect(`${clientUrl}${successReturn}`);
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
    return NextResponse.redirect(`${clientUrl}${returnTo}?auth_error=auth_failed`);
  }
}
