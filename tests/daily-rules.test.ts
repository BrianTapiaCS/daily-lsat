import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  accuracyPercent,
  applyStreak,
  applySubmission,
  assertAvailableQuestionIsSafe,
  COOLDOWN_MS,
  findLeakKeys,
  isQuestionLocked,
  localDateInTimeZone,
  nextUnlockAt,
  remainingMs,
  type SessionState,
} from "../lib/daily-rules.ts";

const fresh = (): SessionState => ({
  nextAvailableAt: null,
  servedQuestionId: "q1",
  servedAt: 1_000,
  answered: [],
  streak: { currentStreak: 0, longestStreak: 0, lastCompletionLocalDate: null },
  totalCompleted: 0,
  totalCorrect: 0,
});

test("the first question is available when no unlock time is stored", () => {
  assert.equal(isQuestionLocked(null, new Date("2026-11-13T15:42:00Z")), false);
});

test("cooldown is exactly 24 hours after submission", () => {
  const submitted = new Date("2026-11-09T19:42:00.000Z");
  const unlocks = nextUnlockAt(submitted);
  assert.equal(unlocks.toISOString(), "2026-11-10T19:42:00.000Z");
  assert.equal(unlocks.getTime() - submitted.getTime(), COOLDOWN_MS);
  assert.equal(isQuestionLocked(unlocks.toISOString(), new Date(unlocks.getTime() - 1)), true);
  assert.equal(isQuestionLocked(unlocks.toISOString(), unlocks), false);
});

test("countdown uses the server clock rather than a changed device clock", () => {
  const serverNow = "2026-11-13T15:00:00.000Z";
  const unlocksAt = "2026-11-14T15:00:00.000Z";
  assert.equal(remainingMs({ unlocksAt, serverNow, elapsedSinceFetchMs: 0 }), COOLDOWN_MS);
  assert.equal(remainingMs({ unlocksAt, serverNow, elapsedSinceFetchMs: 5_000 }), COOLDOWN_MS - 5_000);
});

test("a correct answer and an incorrect answer are recorded differently", () => {
  const correct = applySubmission(fresh(), {
    questionId: "q1",
    selectedAnswer: "C",
    correctAnswer: "C",
    now: 11_000,
    localDate: "2026-11-13",
  });
  assert.equal(correct.ok, true);
  if (!correct.ok) return;
  assert.equal(correct.isCorrect, true);
  assert.equal(correct.timeTakenSeconds, 10);
  assert.equal(correct.state.totalCorrect, 1);
  assert.equal(correct.state.totalCompleted, 1);

  const incorrect = applySubmission(fresh(), {
    questionId: "q1",
    selectedAnswer: "A",
    correctAnswer: "C",
    now: 11_000,
    localDate: "2026-11-13",
  });
  assert.equal(incorrect.ok, true);
  if (!incorrect.ok) return;
  assert.equal(incorrect.isCorrect, false);
  assert.equal(incorrect.state.totalCorrect, 0);
});

test("the same state cannot be submitted twice and a locked state stays locked", () => {
  const first = applySubmission(fresh(), {
    questionId: "q1",
    selectedAnswer: "A",
    correctAnswer: "A",
    now: 50_000,
    localDate: "2026-11-13",
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;

  const second = applySubmission(first.state, {
    questionId: "q1",
    selectedAnswer: "B",
    correctAnswer: "B",
    now: first.nextAvailableAt - 1,
    localDate: "2026-11-14",
  });
  assert.deepEqual(second, { ok: false, error: "cooldown" });
  assert.equal(first.state.answered.length, 1);
});

test("a repeated call against the pre-submit state is the race the row lock closes", () => {
  const state = fresh();
  const now = 50_000;
  const input = {
    questionId: "q1",
    selectedAnswer: "A",
    correctAnswer: "B",
    now,
    localDate: "2026-11-13",
  };
  const left = applySubmission(state, input);
  const right = applySubmission(state, input);
  assert.equal(left.ok, true);
  assert.equal(right.ok, true);
  const afterLock = applySubmission(left.ok ? left.state : state, {
    ...input,
    now: now + 10,
  });
  assert.equal(afterLock.ok, false);
  if (afterLock.ok) return;
  assert.equal(afterLock.error, "cooldown");
});

test("a user cannot submit a different question or skip the serve step", () => {
  const wrongQuestion = applySubmission(fresh(), {
    questionId: "q2",
    selectedAnswer: "A",
    correctAnswer: "A",
    now: 5_000,
    localDate: "2026-11-13",
  });
  assert.deepEqual(wrongQuestion, { ok: false, error: "not_current" });

  const unserved = applySubmission(
    { ...fresh(), servedQuestionId: null, servedAt: null },
    {
      questionId: "q1",
      selectedAnswer: "A",
      correctAnswer: "A",
      now: 5_000,
      localDate: "2026-11-13",
    },
  );
  assert.deepEqual(unserved, { ok: false, error: "not_served" });
  assert.deepEqual(
    applySubmission(fresh(), {
      questionId: "q1",
      selectedAnswer: "Q",
      correctAnswer: "A",
      now: 5_000,
      localDate: "2026-11-13",
    }),
    { ok: false, error: "invalid_answer" },
  );
});

test("refreshing does not move the stored unlock time", () => {
  const submitted = new Date("2026-11-13T15:42:00.000Z");
  const unlocksAt = nextUnlockAt(submitted).toISOString();
  assert.equal(isQuestionLocked(unlocksAt, new Date("2026-11-13T16:00:00.000Z")), true);
  assert.equal(isQuestionLocked(unlocksAt, new Date("2026-11-14T15:41:59.000Z")), true);
  assert.equal(unlocksAt, "2026-11-14T15:42:00.000Z");
});

test("streaks follow consecutive local dates and timezones", () => {
  const monday = applyStreak(
    { currentStreak: 0, longestStreak: 0, lastCompletionLocalDate: null },
    "2026-11-09",
  );
  const tuesday = applyStreak(monday, "2026-11-10");
  const tuesdayAgain = applyStreak(tuesday, "2026-11-10");
  const thursday = applyStreak(tuesday, "2026-11-12");
  assert.equal(monday.currentStreak, 1);
  assert.equal(tuesday.currentStreak, 2);
  assert.equal(tuesday.longestStreak, 2);
  assert.equal(tuesdayAgain.currentStreak, 2);
  assert.equal(thursday.currentStreak, 1);
  assert.equal(thursday.longestStreak, 2);

  const evening = new Date("2026-11-14T03:30:00.000Z");
  assert.equal(localDateInTimeZone(evening, "America/New_York"), "2026-11-13");
  assert.equal(localDateInTimeZone(evening, "UTC"), "2026-11-14");
  assert.equal(localDateInTimeZone(evening, "Not/AZone"), "2026-11-14");
});

test("accuracy is empty until a question is answered", () => {
  assert.equal(accuracyPercent(0, 0), null);
  assert.equal(accuracyPercent(1, 2), 50);
  assert.equal(accuracyPercent(1, 3), 33.3);
});

test("an available question must not carry the answer key", () => {
  const safe = {
    status: "available",
    question: {
      id: "1",
      choices: [{ label: "A", text: "Because the premise is too narrow." }],
    },
  };
  assert.deepEqual(findLeakKeys(safe), []);
  assert.doesNotThrow(() => assertAvailableQuestionIsSafe(safe));

  const leaked = {
    status: "available",
    question: { explanation: "hidden", correct_answer: "A" },
  };
  assert.deepEqual(findLeakKeys(leaked), ["question.explanation", "question.correct_answer"]);
  assert.throws(() => assertAvailableQuestionIsSafe(leaked), /Answer key leaked/);

  assert.doesNotThrow(() =>
    assertAvailableQuestionIsSafe({
      status: "locked",
      lastAttempt: { correctAnswer: "A", explanation: "Shown only after submission." },
    }),
  );
});

test("the migration enforces the cooldown, the unique attempt, and hides the key", () => {
  const sql = readFileSync(new URL("../supabase/migrations/001_init.sql", import.meta.url), "utf8");
  const availableStart = sql.indexOf("-- available payload");
  const availableEnd = sql.indexOf("-- end available payload");
  const available = sql.slice(availableStart, availableEnd);
  assert.equal(available.includes("explanation"), false);
  assert.equal(available.includes("correct_answer"), false);
  assert.match(sql, /for update/);
  assert.match(sql, /interval '24 hours'/);
  assert.match(sql, /unique \(user_id, question_id\)/);
  assert.match(sql, /revoke all on public\.questions/);
  assert.match(sql, /when unique_violation then/);
  assert.doesNotMatch(sql, /grant select on public\.questions to authenticated/);
});
