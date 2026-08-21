import { NextResponse } from "next/server";

export async function GET() {
  const response = NextResponse.redirect(new URL("/", process.env.CLIENT_URL ?? "http://localhost:3000"));
  response.cookies.delete("__session");
  return response;
}

export async function POST() {
  const response = NextResponse.json({ ok: true, data: null });
  response.cookies.delete("__session");
  return response;
}
