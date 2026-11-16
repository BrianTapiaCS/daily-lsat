/** Rules mirrored by supabase/migrations/001_init.sql. The database is authoritative. */

export const COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function nextUnlockAt(submittedAt: Date): Date {
  return new Date(submittedAt.getTime() + COOLDOWN_MS);
}

export function isQuestionLocked(nextAvailableAt: string | null, now: Date): boolean {
  if (!nextAvailableAt) return false;
  const unlocksAt = new Date(nextAvailableAt).getTime();
  if (Number.isNaN(unlocksAt)) return true;
  return unlocksAt > now.getTime();
}

/**
 * Countdown from server timestamps. Elapsed time uses a monotonic clock so
 * changing the device's wall clock does not move the unlock moment.
 */
export function remainingMs(options: {
  unlocksAt: string;
  serverNow: string;
  elapsedSinceFetchMs: number;
}): number {
  const unlocksAt = new Date(options.unlocksAt).getTime();
  const serverNow = new Date(options.serverNow).getTime();
  return unlocksAt - (serverNow + options.elapsedSinceFetchMs);
}

export type StreakState = {
  currentStreak: number;
  longestStreak: number;
  lastCompletionLocalDate: string | null;
};

export function localDateInTimeZone(instant: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(instant);
  } catch {
    if (timeZone === "UTC") {
      return instant.toISOString().slice(0, 10);
    }
    return localDateInTimeZone(instant, "UTC");
  }
}

function previousIsoDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() - 1);
  return utc.toISOString().slice(0, 10);
}

/**
 * A streak is consecutive local calendar dates on which a question was
 * completed. A second completion on the same local date does not increment it.
 * Missing a local date resets it to 1. The 24-hour cooldown is separate and
 * is what stops two completions a few minutes apart.
 */
export function applyStreak(state: StreakState, completionLocalDate: string): StreakState {
  let currentStreak = 1;
  if (state.lastCompletionLocalDate === completionLocalDate) {
    currentStreak = state.currentStreak;
  } else if (state.lastCompletionLocalDate === previousIsoDate(completionLocalDate)) {
    currentStreak = state.currentStreak + 1;
  }

  return {
    currentStreak,
    longestStreak: Math.max(state.longestStreak, currentStreak),
    lastCompletionLocalDate: completionLocalDate,
  };
}

export function accuracyPercent(correct: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((correct / total) * 1000) / 10;
}

export type SessionState = {
  nextAvailableAt: number | null;
  servedQuestionId: string | null;
  servedAt: number | null;
  answered: string[];
  streak: StreakState;
  totalCompleted: number;
  totalCorrect: number;
};

export type SubmitOutcome =
  | {
      ok: false;
      error: "cooldown" | "not_current" | "duplicate" | "invalid_answer" | "not_served";
    }
  | {
      ok: true;
      isCorrect: boolean;
      timeTakenSeconds: number;
      nextAvailableAt: number;
      state: SessionState;
    };

export function applySubmission(
  state: SessionState,
  input: {
    questionId: string;
    selectedAnswer: string;
    correctAnswer: string;
    now: number;
    localDate: string;
  },
): SubmitOutcome {
  if (state.nextAvailableAt !== null && state.nextAvailableAt > input.now) {
    return { ok: false, error: "cooldown" };
  }
  if (!/^[A-E]$/.test(input.selectedAnswer)) {
    return { ok: false, error: "invalid_answer" };
  }
  if (state.servedQuestionId === null || state.servedAt === null) {
    return { ok: false, error: "not_served" };
  }
  if (input.questionId !== state.servedQuestionId) {
    return { ok: false, error: "not_current" };
  }
  if (state.answered.includes(input.questionId)) {
    return { ok: false, error: "duplicate" };
  }

  const isCorrect = input.selectedAnswer === input.correctAnswer;
  const timeTakenSeconds = Math.max(0, Math.floor((input.now - state.servedAt) / 1000));
  const nextAvailableAt = input.now + COOLDOWN_MS;
  const streak = applyStreak(state.streak, input.localDate);

  return {
    ok: true,
    isCorrect,
    timeTakenSeconds,
    nextAvailableAt,
    state: {
      nextAvailableAt,
      servedQuestionId: null,
      servedAt: null,
      answered: [...state.answered, input.questionId],
      streak,
      totalCompleted: state.totalCompleted + 1,
      totalCorrect: state.totalCorrect + (isCorrect ? 1 : 0),
    },
  };
}

const LEAK_KEYS = new Set([
  "correctAnswer",
  "correct_answer",
  "explanation",
  "isCorrect",
  "is_correct",
]);

export function findLeakKeys(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findLeakKeys(item, `${path}[${index}]`));
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => {
      const next = path ? `${path}.${key}` : key;
      if (LEAK_KEYS.has(key)) return [next];
      return findLeakKeys(child, next);
    });
  }
  return [];
}

export function assertAvailableQuestionIsSafe(payload: unknown): void {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Today's question response was not an object.");
  }
  const status = (payload as { status?: unknown }).status;
  if (status !== "available") return;
  const leaks = findLeakKeys(payload);
  if (leaks.length > 0) {
    throw new Error(`Answer key leaked before submission: ${leaks.join(", ")}`);
  }
}
