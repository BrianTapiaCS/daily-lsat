import Link from "next/link";
import { Suspense } from "react";

import { Notice } from "@/components/Notice";
import { ResultReview } from "@/components/ResultReview";
import { loadHistory, loadHistoryItem, loadProgress } from "@/lib/services/practice-service";
import type { RevealedAttempt } from "@/types/practice";

export const metadata = { title: "Result" };

export default function ResultsPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Suspense fallback={<p className="text-muted">Loading the latest result…</p>}>
        <LatestResult />
      </Suspense>
    </main>
  );
}

function isAttempt(value: unknown): value is RevealedAttempt {
  if (!value || typeof value !== "object") return false;
  return typeof (value as { attemptId?: unknown }).attemptId === "string";
}

async function LatestResult() {
  const history = await loadHistory(1, 0);
  if (!history.ok) {
    return <Notice title="No result yet" body={history.message ?? "Submit today’s question to see a result."} />;
  }
  const items = Array.isArray(history.data.items) ? history.data.items : [];
  const first = items[0];
  const attemptId = first && typeof first === "object" && "attemptId" in first ? String(first.attemptId) : null;
  if (!attemptId) {
    return (
      <Notice title="No result yet" body="Submit today’s question and the explanation will appear here." />
    );
  }
  const [review, progress] = await Promise.all([loadHistoryItem(attemptId), loadProgress()]);
  if (!review.ok || !isAttempt(review.data.attempt)) {
    return <Notice title="Result unavailable" body={review.ok ? "The review was empty." : (review.message ?? "Try again from history.")} />;
  }
  const nextAvailableAt =
    progress.ok && typeof progress.data.nextAvailableAt === "string" ? progress.data.nextAvailableAt : null;
  const serverNow = progress.ok && typeof progress.data.serverNow === "string" ? progress.data.serverNow : null;
  return (
    <div className="space-y-6">
      <Link href="/dashboard" className="text-sm text-muted">
        Back to the dashboard
      </Link>
      <ResultReview attempt={review.data.attempt} nextAvailableAt={nextAvailableAt} serverNow={serverNow} />
    </div>
  );
}
