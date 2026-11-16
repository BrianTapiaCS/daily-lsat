import { NextResponse } from "next/server";

const STATUS_FOR_CODE: Record<string, number> = {
  not_authenticated: 401,
  unauthenticated: 401,
  cooldown: 409,
  duplicate: 409,
  not_current: 409,
  not_served: 409,
  invalid_answer: 422,
  invalid_name: 422,
  invalid_timezone: 422,
  not_found: 404,
  inactive: 404,
  exhausted: 404,
  profile_missing: 409,
};

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status });
}

export function errorResponse(error: string, extra?: Record<string, unknown>): NextResponse {
  const status = STATUS_FOR_CODE[error] ?? 400;
  return json({ error, ...extra }, status);
}

export function fromFailure(result: {
  status: number;
  error: string;
  message?: string;
  serverNow?: unknown;
  nextAvailableAt?: unknown;
}): NextResponse {
  return json(
    {
      error: result.error,
      message: result.message,
      serverNow: result.serverNow,
      nextAvailableAt: result.nextAvailableAt,
    },
    result.status,
  );
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function databaseFailure(error: { message: string; code?: string }): NextResponse {
  if (error.code === "PGRST202" || /function .* does not exist/i.test(error.message)) {
    return json(
      {
        error: "schema_missing",
        message: "Apply supabase/migrations/001_init.sql in the Supabase SQL editor, then reload the API schema.",
      },
      503,
    );
  }
  return json({ error: "database_error", message: error.message }, 500);
}
