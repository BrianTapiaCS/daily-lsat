"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

import { AnswerOptions } from "@/components/AnswerOptions";
import { CountdownTimer } from "@/components/CountdownTimer";
import { ResultReview } from "@/components/ResultReview";
import { difficultyLabel } from "@/lib/format";
import type { PublicQuestion, RevealedAttempt } from "@/types/practice";

type TodayState =
  | { status: "loading" }
  | { status: "available"; question: PublicQuestion; servedAt: string }
  | {
      status: "locked";
      nextAvailableAt: string;
      serverNow: string;
      lastAttempt: RevealedAttempt | null;
    }
  | { status: "exhausted" }
  | { status: "error"; message: string };

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("The server returned an unexpected response.");
  }
  return body as Record<string, unknown>;
}

export function QuestionSession() {
  const [state, setState] = useState<TodayState>({ status: "loading" });
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    attempt: RevealedAttempt;
    nextAvailableAt: string;
    serverNow: string;
  } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFormError(null);
    setResult(null);
    setSelected(null);
    const response = await fetch("/api/question/today", { cache: "no-store" });
    const body = await readJson(response);
    if (!response.ok) {
      setState({
        status: "error",
        message: typeof body.message === "string" ? body.message : "Today's question could not be loaded.",
      });
      return;
    }
    if (body.status === "available" && body.question && typeof body.question === "object") {
      setState({
        status: "available",
        question: body.question as PublicQuestion,
        servedAt: String(body.servedAt ?? ""),
      });
      return;
    }
    if (body.status === "locked") {
      setState({
        status: "locked",
        nextAvailableAt: String(body.nextAvailableAt),
        serverNow: String(body.serverNow),
        lastAttempt: (body.lastAttempt as RevealedAttempt | null) ?? null,
      });
      return;
    }
    if (body.status === "exhausted") {
      setState({ status: "exhausted" });
      return;
    }
    setState({ status: "error", message: "Today's question could not be loaded." });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.status !== "available" || !selected) {
      setFormError("Select an answer before submitting.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    const response = await fetch("/api/question/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionId: state.question.id,
        selectedAnswer: selected,
      }),
    });
    const body = await readJson(response);
    setSubmitting(false);
    if (!response.ok || body.ok === false) {
      setFormError(typeof body.message === "string" ? body.message : "The answer was not accepted.");
      if (body.error === "cooldown" || body.error === "duplicate") {
        await load();
      }
      return;
    }
    const attempt = body.attempt;
    if (!attempt || typeof attempt !== "object") {
      setFormError("The result was missing from the response.");
      return;
    }
    setResult({
      attempt: attempt as RevealedAttempt,
      nextAvailableAt: String(body.nextAvailableAt),
      serverNow: String(body.serverNow),
    });
  }

  if (state.status === "loading") {
    return <p className="text-muted">Loading today’s question…</p>;
  }
  if (state.status === "error") {
    return <p className="text-wrong">{state.message}</p>;
  }
  if (state.status === "exhausted") {
    return (
      <div className="space-y-3">
        <h1 className="font-serif text-4xl tracking-tight">The current bank is finished.</h1>
        <p className="text-muted">Import more active Logical Reasoning questions to continue.</p>
      </div>
    );
  }
  if (result) {
    return (
      <ResultReview
        attempt={result.attempt}
        nextAvailableAt={result.nextAvailableAt}
        serverNow={result.serverNow}
        onElapsed={() => void load()}
      />
    );
  }
  if (state.status === "locked") {
    return (
      <div className="space-y-10">
        <CountdownTimer
          unlocksAt={state.nextAvailableAt}
          serverNow={state.serverNow}
          onElapsed={() => void load()}
        />
        {state.lastAttempt ? <ResultReview attempt={state.lastAttempt} /> : null}
      </div>
    );
  }

  const question = state.question;
  return (
    <form className="space-y-8" onSubmit={onSubmit}>
      <header className="space-y-3">
        <p className="text-sm uppercase tracking-[0.16em] text-muted">
          {question.section} · {question.questionType} · {difficultyLabel(question.difficulty)}
        </p>
        <h1 className="font-serif text-4xl tracking-tight">Question {question.bankOrder}</h1>
        <p className="text-sm text-muted">{question.sourceId}</p>
      </header>
      {question.scenario ? (
        <div className="rounded-3xl bg-white/70 p-6 font-serif text-lg leading-8">{question.scenario}</div>
      ) : null}
      <p className="font-serif text-2xl leading-snug">{question.questionText}</p>
      <AnswerOptions choices={question.choices} selected={selected} onSelect={setSelected} />
      {formError ? <p className="text-wrong">{formError}</p> : null}
      <button className="button-primary" type="submit" disabled={!selected || submitting}>
        {submitting ? "Checking…" : "Submit answer"}
      </button>
    </form>
  );
}
