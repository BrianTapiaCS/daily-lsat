import { assertAvailableQuestionIsSafe } from "@/lib/daily-rules";
import { asRecord } from "@/lib/api";
import {
  localHistory,
  localHistoryItem,
  localProgress,
  localSaveProfile,
  localSubmit,
  localToday,
} from "@/lib/local-practice";
import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export type ServiceFailure = {
  ok: false;
  status: number;
  error: string;
  message?: string;
  serverNow?: unknown;
  nextAvailableAt?: unknown;
};

export type ServiceSuccess<T> = { ok: true; data: T };

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

function failure(error: string, extra?: Pick<ServiceFailure, "serverNow" | "nextAvailableAt">): ServiceFailure {
  return { ok: false, status: STATUS_FOR_CODE[error] ?? 400, error, ...extra };
}

function databaseFailure(error: { message: string; code?: string }): ServiceFailure {
  if (error.code === "PGRST202" || /function .* does not exist/i.test(error.message)) {
    return {
      ok: false,
      status: 503,
      error: "schema_missing",
      message: "Apply supabase/migrations/001_init.sql in the Supabase SQL editor, then reload the API schema.",
    };
  }
  if (/permission denied/i.test(error.message)) {
    return { ok: false, status: 403, error: "forbidden", message: error.message };
  }
  return { ok: false, status: 500, error: "database_error", message: error.message };
}

function useLocalPractice(): boolean {
  return getSupabasePublicEnv() === null;
}

function fromLocal(data: Record<string, unknown>): ServiceSuccess<Record<string, unknown>> | ServiceFailure {
  if (data.ok === false && typeof data.error === "string") {
    return failure(data.error, {
      serverNow: data.serverNow,
      nextAvailableAt: data.nextAvailableAt,
    });
  }
  if (data.status === "available") {
    try {
      assertAvailableQuestionIsSafe(data);
    } catch {
      return { ok: false, status: 500, error: "answer_leak_blocked" };
    }
  }
  return { ok: true, data };
}

async function callRpc(
  name: string,
  args?: Record<string, unknown>,
): Promise<ServiceSuccess<Record<string, unknown>> | ServiceFailure> {
  const supabase = await createClient();
  if (!supabase) {
    return {
      ok: false,
      status: 503,
      error: "not_configured",
      message: "Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.",
    };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return failure("not_authenticated");

  const { data, error } = await supabase.rpc(name, args);
  if (error) return databaseFailure(error);
  const record = asRecord(data);
  if (!record) return { ok: false, status: 502, error: "empty_response" };
  return { ok: true, data: record };
}

export async function loadToday(): Promise<ServiceSuccess<Record<string, unknown>> | ServiceFailure> {
  if (useLocalPractice()) return fromLocal(await localToday());
  const result = await callRpc("get_daily_question");
  if (!result.ok) return result;
  if (result.data.status === "unauthenticated") return failure("not_authenticated");
  if (result.data.status === "profile_missing") return failure("profile_missing");
  try {
    assertAvailableQuestionIsSafe(result.data);
  } catch {
    return { ok: false, status: 500, error: "answer_leak_blocked" };
  }
  return result;
}

export async function submitAnswer(
  body: unknown,
): Promise<ServiceSuccess<Record<string, unknown>> | ServiceFailure> {
  const record = asRecord(body);
  const questionId = record?.questionId;
  const selectedAnswer = record?.selectedAnswer;
  if (typeof questionId !== "string" || typeof selectedAnswer !== "string") {
    return failure("invalid_answer");
  }
  if (useLocalPractice()) return fromLocal(await localSubmit(questionId, selectedAnswer));

  // timeTakenSeconds may be present. The database computes duration from served_at.
  const result = await callRpc("submit_daily_attempt", {
    p_question_id: questionId,
    p_selected_answer: selectedAnswer,
  });
  if (!result.ok) return result;
  if (result.data.ok === false && typeof result.data.error === "string") {
    return failure(result.data.error, {
      serverNow: result.data.serverNow,
      nextAvailableAt: result.data.nextAvailableAt,
    });
  }
  return result;
}

export async function loadProgress(): Promise<ServiceSuccess<Record<string, unknown>> | ServiceFailure> {
  if (useLocalPractice()) return fromLocal(await localProgress());
  const result = await callRpc("get_progress");
  if (!result.ok) return result;
  if (result.data.ok === false && typeof result.data.error === "string") return failure(result.data.error);
  return result;
}

export async function loadHistory(
  limit: number,
  offset: number,
): Promise<ServiceSuccess<Record<string, unknown>> | ServiceFailure> {
  if (useLocalPractice()) return fromLocal(await localHistory(limit, offset));
  const result = await callRpc("get_history", { p_limit: limit, p_offset: offset });
  if (!result.ok) return result;
  if (result.data.ok === false && typeof result.data.error === "string") return failure(result.data.error);
  return result;
}

export async function loadHistoryItem(
  attemptId: string,
): Promise<ServiceSuccess<Record<string, unknown>> | ServiceFailure> {
  if (useLocalPractice()) return fromLocal(await localHistoryItem(attemptId));
  const result = await callRpc("review_for_attempt", { p_attempt_id: attemptId });
  if (!result.ok) return result;
  if (result.data.ok === false && typeof result.data.error === "string") return failure(result.data.error);
  return result;
}

export async function saveProfile(
  body: unknown,
): Promise<ServiceSuccess<Record<string, unknown>> | ServiceFailure> {
  const record = asRecord(body);
  if (typeof record?.displayName !== "string" || typeof record.timezone !== "string") {
    return failure("invalid_name");
  }
  if (useLocalPractice()) return fromLocal(await localSaveProfile(record.displayName, record.timezone));
  const result = await callRpc("update_profile", {
    p_display_name: record.displayName,
    p_timezone: record.timezone,
  });
  if (!result.ok) return result;
  if (result.data.ok === false && typeof result.data.error === "string") return failure(result.data.error);
  return result;
}
