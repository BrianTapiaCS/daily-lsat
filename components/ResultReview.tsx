"use client";

import { AnswerOptions } from "@/components/AnswerOptions";
import { CountdownTimer } from "@/components/CountdownTimer";
import { difficultyLabel, formatTimeTaken } from "@/lib/format";
import type { RevealedAttempt } from "@/types/practice";

export function ResultReview({
  attempt,
  nextAvailableAt,
  serverNow,
  onElapsed,
}: {
  attempt: RevealedAttempt;
  nextAvailableAt?: string | null;
  serverNow?: string | null;
  onElapsed?: () => void;
}) {
  const question = attempt.question;
  return (
    <article className="space-y-8">
      <header className="space-y-3">
        <p className={attempt.isCorrect ? "text-right" : "text-wrong"}>
          {attempt.isCorrect ? "Correct" : "Incorrect"}
        </p>
        <h1 className="font-serif text-4xl tracking-tight">
          {attempt.isCorrect ? "That holds." : "Not this one."}
        </h1>
        <p className="text-muted">
          {question.questionType} · {difficultyLabel(question.difficulty)} · {question.sourceId}
          {typeof attempt.timeTakenSeconds === "number" ? ` · ${formatTimeTaken(attempt.timeTakenSeconds)}` : ""}
        </p>
      </header>
      {question.scenario ? (
        <div className="rounded-3xl bg-white/70 p-6 font-serif text-lg leading-8">{question.scenario}</div>
      ) : null}
      <p className="font-serif text-2xl leading-snug">{question.questionText}</p>
      <AnswerOptions
        choices={question.choices}
        disabled
        correctAnswer={attempt.correctAnswer}
        selectedAnswer={attempt.selectedAnswer}
      />
      <section className="space-y-3 border-t border-line pt-6">
        <h2 className="text-sm uppercase tracking-[0.16em] text-muted">Explanation</h2>
        <p className="font-serif text-lg leading-8 whitespace-pre-wrap">{attempt.explanation}</p>
      </section>
      {nextAvailableAt && serverNow ? (
        <CountdownTimer unlocksAt={nextAvailableAt} serverNow={serverNow} onElapsed={onElapsed} />
      ) : null}
    </article>
  );
}
