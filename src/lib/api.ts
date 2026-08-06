import { NextResponse } from "next/server";

export function ok<T>(data: T) {
  return NextResponse.json({ ok: true, data } as const);
}

export function error(message: string, status = 500) {
  return NextResponse.json({ ok: false, error: message } as const, { status });
}

export function unauthorized() {
  return error("Unauthorized", 401);
}

export function notFound(message = "Not found") {
  return error(message, 404);
}

export function badRequest(message = "Bad request") {
  return error(message, 400);
}

export function forbidden(message = "Forbidden") {
  return error(message, 403);
}