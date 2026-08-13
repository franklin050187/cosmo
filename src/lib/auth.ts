import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";
import { unauthorized, forbidden } from "@/lib/api";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET env var is required");
  return secret;
}

const TOKEN_EXPIRY = "7d";

export interface UserPayload {
  id: string;
  username: string;
  avatar: string | null;
  guild?: string;
}

export interface TokenPayload {
  app?: string;
  user?: UserPayload;
}

export function generateUserToken(user: UserPayload): string {
  return jwt.sign({ user }, getJwtSecret(), { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, getJwtSecret(), { algorithms: ["HS256"] }) as TokenPayload;
}

export function getSessionTokenFromRequest(req: Request): string | null {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === "__session") {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

export function getUserFromRequest(req: Request): UserPayload | null {
  const token = getSessionTokenFromRequest(req);
  if (!token) return null;
  try {
    const payload = verifyToken(token);
    return payload.user ?? null;
  } catch {
    return null;
  }
}

export type AuthGuard =
  | { ok: true; user: UserPayload }
  | { ok: false; response: NextResponse };

function getAdminUsernames(): string[] {
  return (process.env.ADMIN_USERNAMES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isAdminUsername(username: string | null | undefined): boolean {
  if (!username) return false;
  return getAdminUsernames().includes(username);
}

export function requireAuth(req: NextRequest): AuthGuard {
  const user = getUserFromRequest(req);
  if (!user) {
    return {
      ok: false,
      response: unauthorized(),
    };
  }
  return { ok: true, user };
}

export function requireAdmin(req: NextRequest): AuthGuard {
  const auth = requireAuth(req);
  if (!auth.ok) return auth;
  if (!isAdminUsername(auth.user.username)) {
    return {
      ok: false,
      response: forbidden(),
    };
  }
  return auth;
}
