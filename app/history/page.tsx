import Link from "next/link";
import { Suspense } from "react";

import { LocalTime } from "@/components/LocalTime";
import { Notice } from "@/components/Notice";
import { difficultyLabel } from "@/lib/format";
import { loadHistory } from "@/lib/services/practice-service";
import type { HistoryItem } from "@/types/practice";

export const metadata = { title: "History" };

export default function HistoryPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Suspense fallback={<p className="text-muted">Loading history…</p>}>
        <HistoryContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function HistoryContent({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const result = await loadHistory(20, (page - 1) * 20);
  if (!result.ok) {
    return <Notice title="History is unavailable" body={result.message ?? "Sign in to see completed questions."} />;
  }
  const items = Array.isArray(result.data.items) ? (result.data.items as HistoryItem[]) : [];
  const total = typeof result.data.total === "number" ? result.data.total : 0;
  const pages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-5xl tracking-tight">History</h1>
        <p className="mt-2 text-muted">Reviewing a past question does not start a new daily attempt.</p>
      </header>
      {items.length === 0 ? (
        <p className="text-muted">No completed questions yet.</p>
      ) : (
        <ul className="divide-y divide-line rounded-3xl border border-line bg-card">
          {items.map((item) => (
            <li key={item.attemptId}>
              <Link href={`/history/${item.attemptId}`} className="grid gap-1 px-4 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                <span>
                  <span className="block font-medium">{item.sourceId}</span>
                  <span className="text-sm text-muted">
                    {item.questionType} · {difficultyLabel(item.difficulty)}
                  </span>
                </span>
                <span className={item.isCorrect ? "text-right" : "text-wrong"}>
                  {item.isCorrect ? "Correct" : "Incorrect"}
                </span>
                <LocalTime value={item.submittedAt} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 ? (
        <div className="flex gap-4 text-sm">
          {page > 1 ? <Link href={`/history?page=${page - 1}`}>Previous</Link> : null}
          {page < pages ? <Link href={`/history?page=${page + 1}`}>Next</Link> : null}
        </div>
      ) : null}
    </div>
  );
}
