import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { connection } from "next/server";

import {
  applySubmission,
  assertAvailableQuestionIsSafe,
  localDateInTimeZone,
  type SessionState,
} from "@/lib/daily-rules";

type BankQuestion = {
  source_id: string;
  section: string;
  question_type: string;
  difficulty: string | null;
  scenario: string | null;
  question_text: string;
  answer_choices: { label: string; text: string }[];
  correct_answer: string;
  explanation: string;
  is_active: boolean;
  bank_order: number;
};

type StoredAttempt = {
  attemptId: string;
  questionId: string;
  selectedAnswer: string;
  isCorrect: boolean;
  timeTakenSeconds: number;
  submittedAt: string;
};

type StoredSession = {
  displayName: string;
  timezone: string;
  servedQuestionId: string | null;
  servedAt: string | null;
  nextAvailableAt: string | null;
  currentStreak: number;
  longestStreak: number;
  lastCompletionLocalDate: string | null;
  attempts: StoredAttempt[];
};

const SESSION_PATH = path.join(process.cwd(), "data", "local", "session.json");
const BANK_PATH = path.join(process.cwd(), "data", "processed", "selected.json");

let bankPromise: Promise<BankQuestion[]> | null = null;
let writeChain: Promise<void> = Promise.resolve();

function emptySession(): StoredSession {
  return {
    displayName: "Local practice",
    timezone: "America/New_York",
    servedQuestionId: null,
    servedAt: null,
    nextAvailableAt: null,
    currentStreak: 0,
    longestStreak: 0,
    lastCompletionLocalDate: null,
    attempts: [],
  };
}

function loadBank(): Promise<BankQuestion[]> {
  bankPromise ??= readFile(BANK_PATH, "utf8").then((raw) => JSON.parse(raw) as BankQuestion[]);
  return bankPromise;
}

async function readSession(): Promise<StoredSession> {
  try {
    const raw = await readFile(SESSION_PATH, "utf8");
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed || !Array.isArray(parsed.attempts)) return emptySession();
    return parsed;
  } catch {
    return emptySession();
  }
}

async function writeSession(session: StoredSession): Promise<void> {
  await mkdir(path.dirname(SESSION_PATH), { recursive: true });
  await writeFile(SESSION_PATH, JSON.stringify(session, null, 2), "utf8");
}

function withSession<T>(work: (session: StoredSession, bank: BankQuestion[]) => Promise<{ session: StoredSession; value: T }>): Promise<T> {
  const run = writeChain.then(async () => {
    await connection();
    const [session, bank] = await Promise.all([readSession(), loadBank()]);
    const result = await work(session, bank);
    await writeSession(result.session);
    return result.value;
  });
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function publicQuestion(question: BankQuestion) {
  return {
    id: question.source_id,
    sourceId: question.source_id,
    section: question.section,
    questionType: question.question_type,
    difficulty: question.difficulty,
    scenario: question.scenario,
    questionText: question.question_text,
    choices: question.answer_choices,
    bankOrder: question.bank_order,
  };
}

function review(attempt: StoredAttempt, question: BankQuestion) {
  return {
    attemptId: attempt.attemptId,
    selectedAnswer: attempt.selectedAnswer,
    correctAnswer: question.correct_answer,
    isCorrect: attempt.isCorrect,
    explanation: question.explanation,
    timeTakenSeconds: attempt.timeTakenSeconds,
    submittedAt: attempt.submittedAt,
    question: publicQuestion(question),
  };
}

function findQuestion(bank: BankQuestion[], id: string): BankQuestion | undefined {
  return bank.find((question) => question.source_id === id && question.is_active);
}

export async function localToday(): Promise<Record<string, unknown>> {
  return withSession(async (session, bank) => {
    const now = new Date();
    const serverNow = now.toISOString();
    if (session.nextAvailableAt && new Date(session.nextAvailableAt).getTime() > now.getTime()) {
      const last = session.attempts[session.attempts.length - 1];
      const question = last ? findQuestion(bank, last.questionId) : undefined;
      return {
        session,
        value: {
          status: "locked",
          serverNow,
          nextAvailableAt: session.nextAvailableAt,
          lastAttempt: last && question ? review(last, question) : null,
          mode: "local",
        },
      };
    }

    const answered = new Set(session.attempts.map((attempt) => attempt.questionId));
    let served = session.servedQuestionId ? findQuestion(bank, session.servedQuestionId) : undefined;
    if (!served || answered.has(served.source_id)) {
      served = bank
        .filter((question) => question.is_active && !answered.has(question.source_id))
        .sort((a, b) => a.bank_order - b.bank_order)[0];
      session.servedQuestionId = served?.source_id ?? null;
      session.servedAt = served ? serverNow : null;
    }

    if (!served || !session.servedAt) {
      return { session, value: { status: "exhausted", serverNow, mode: "local" } };
    }

    const payload = {
      status: "available",
      serverNow,
      servedAt: session.servedAt,
      mode: "local",
      question: publicQuestion(served),
    };
    assertAvailableQuestionIsSafe(payload);
    return { session, value: payload };
  });
}

export async function localSubmit(questionId: string, selectedAnswer: string): Promise<Record<string, unknown>> {
  return withSession(async (session, bank) => {
    const now = new Date();
    const question = findQuestion(bank, questionId);
    const state: SessionState = {
      nextAvailableAt: session.nextAvailableAt ? new Date(session.nextAvailableAt).getTime() : null,
      servedQuestionId: session.servedQuestionId,
      servedAt: session.servedAt ? new Date(session.servedAt).getTime() : null,
      answered: session.attempts.map((attempt) => attempt.questionId),
      streak: {
        currentStreak: session.currentStreak,
        longestStreak: session.longestStreak,
        lastCompletionLocalDate: session.lastCompletionLocalDate,
      },
      totalCompleted: session.attempts.length,
      totalCorrect: session.attempts.filter((attempt) => attempt.isCorrect).length,
    };
    const outcome = applySubmission(state, {
      questionId,
      selectedAnswer: selectedAnswer.toUpperCase(),
      correctAnswer: question?.correct_answer ?? "",
      now: now.getTime(),
      localDate: localDateInTimeZone(now, session.timezone),
    });
    if (!outcome.ok) {
      return {
        session,
        value: {
          ok: false,
          error: question ? outcome.error : "not_found",
          serverNow: now.toISOString(),
          nextAvailableAt: session.nextAvailableAt,
        },
      };
    }
    if (!question) {
      return { session, value: { ok: false, error: "not_found" } };
    }

    const attempt: StoredAttempt = {
      attemptId: randomUUID(),
      questionId,
      selectedAnswer: selectedAnswer.toUpperCase(),
      isCorrect: outcome.isCorrect,
      timeTakenSeconds: outcome.timeTakenSeconds,
      submittedAt: now.toISOString(),
    };
    session.attempts.push(attempt);
    session.nextAvailableAt = new Date(outcome.nextAvailableAt).toISOString();
    session.servedQuestionId = null;
    session.servedAt = null;
    session.currentStreak = outcome.state.streak.currentStreak;
    session.longestStreak = outcome.state.streak.longestStreak;
    session.lastCompletionLocalDate = outcome.state.streak.lastCompletionLocalDate;

    return {
      session,
      value: {
        ok: true,
        serverNow: now.toISOString(),
        nextAvailableAt: session.nextAvailableAt,
        attempt: review(attempt, question),
        mode: "local",
      },
    };
  });
}

export async function localProgress(): Promise<Record<string, unknown>> {
  return withSession(async (session, bank) => {
    const now = new Date();
    const byType = new Map<string, { total: number; correct: number }>();
    for (const attempt of session.attempts) {
      const question = findQuestion(bank, attempt.questionId);
      const key = question?.question_type ?? "Unknown";
      const current = byType.get(key) ?? { total: 0, correct: 0 };
      current.total += 1;
      if (attempt.isCorrect) current.correct += 1;
      byType.set(key, current);
    }
    const recent = [...session.attempts].reverse().slice(0, 8).map((attempt) => {
      const question = findQuestion(bank, attempt.questionId);
      return {
        attemptId: attempt.attemptId,
        sourceId: attempt.questionId,
        questionType: question?.question_type ?? "Unknown",
        difficulty: question?.difficulty ?? null,
        isCorrect: attempt.isCorrect,
        submittedAt: attempt.submittedAt,
        timeTakenSeconds: attempt.timeTakenSeconds,
      };
    });
    const totalCorrect = session.attempts.filter((attempt) => attempt.isCorrect).length;
    return {
      session,
      value: {
        ok: true,
        mode: "local",
        serverNow: now.toISOString(),
        displayName: session.displayName,
        timezone: session.timezone,
        totalCompleted: session.attempts.length,
        totalCorrect,
        currentStreak: session.currentStreak,
        longestStreak: session.longestStreak,
        lastCompletionLocalDate: session.lastCompletionLocalDate,
        nextAvailableAt: session.nextAvailableAt,
        questionAvailable: !session.nextAvailableAt || new Date(session.nextAvailableAt).getTime() <= now.getTime(),
        byCategory: [...byType.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([questionType, stats]) => ({ questionType, ...stats })),
        recent,
      },
    };
  });
}

export async function localHistory(limit: number, offset: number): Promise<Record<string, unknown>> {
  return withSession(async (session, bank) => {
    const ordered = [...session.attempts].reverse();
    const page = ordered.slice(offset, offset + limit).map((attempt) => {
      const question = findQuestion(bank, attempt.questionId);
      return {
        attemptId: attempt.attemptId,
        sourceId: attempt.questionId,
        questionType: question?.question_type ?? "Unknown",
        difficulty: question?.difficulty ?? null,
        section: question?.section ?? "Logical Reasoning",
        isCorrect: attempt.isCorrect,
        submittedAt: attempt.submittedAt,
        timeTakenSeconds: attempt.timeTakenSeconds,
        bankOrder: question?.bank_order ?? 0,
      };
    });
    return {
      session,
      value: {
        ok: true,
        mode: "local",
        total: session.attempts.length,
        limit,
        offset,
        items: page,
      },
    };
  });
}

export async function localHistoryItem(attemptId: string): Promise<Record<string, unknown>> {
  return withSession(async (session, bank) => {
    const attempt = session.attempts.find((item) => item.attemptId === attemptId);
    const question = attempt ? findQuestion(bank, attempt.questionId) : undefined;
    if (!attempt || !question) {
      return { session, value: { ok: false, error: "not_found" } };
    }
    return { session, value: { ok: true, mode: "local", attempt: review(attempt, question) } };
  });
}

export async function localSaveProfile(displayName: string, timezone: string): Promise<Record<string, unknown>> {
  const name = displayName.trim();
  const zone = timezone.trim();
  if (name.length < 1 || name.length > 80) return { ok: false, error: "invalid_name" };
  try {
    Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date());
  } catch {
    return { ok: false, error: "invalid_timezone" };
  }
  return withSession(async (session) => {
    session.displayName = name;
    session.timezone = zone;
    return { session, value: { ok: true, displayName: name, timezone: zone, mode: "local" } };
  });
}

export async function localReset(): Promise<void> {
  await withSession(async () => ({ session: emptySession(), value: undefined }));
}
