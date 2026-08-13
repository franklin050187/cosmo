import { NextResponse } from "next/server";

export function ok<T>(data: T, status?: number) {
  return NextResponse.json({ ok: true, data } as const, status ? { status } : undefined);
}

export function error(message: string, status = 500) {
  return NextResponse.json({ ok: false, error: message } as const, { status });
}

export function unauthorized(status = 401) {
  return error("Unauthorized", status);
}

export function notFound(message = "Not found", status = 404) {
  return error(message, status);
}

export function badRequest(message = "Bad request", status = 400) {
  return error(message, status);
}

export function forbidden(message = "Forbidden", status = 403) {
  return error(message, status);
}