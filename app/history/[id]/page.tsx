import Link from "next/link";
import { Suspense } from "react";

import { Notice } from "@/components/Notice";
import { ResultReview } from "@/components/ResultReview";
import { loadHistoryItem } from "@/lib/services/practice-service";
import type { RevealedAttempt } from "@/types/practice";

export const metadata = { title: "Review" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function HistoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Suspense fallback={<p className="text-muted">Loading the question…</p>}>
        <HistoryDetail params={params} />
      </Suspense>
    </main>
  );
}

function isAttempt(value: unknown): value is RevealedAttempt {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.attemptId === "string" && typeof record.explanation === "string";
}

async function HistoryDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return <Notice title="Question not found" body="That history entry does not exist." />;
  const result = await loadHistoryItem(id);
  if (!result.ok || !isAttempt(result.data.attempt)) {
    return <Notice title="Question not found" body={result.ok ? "That attempt has no review." : (result.message ?? "It may belong to another account.")} />;
  }
  return (
    <div className="space-y-6">
      <Link href="/history" className="text-sm text-muted">
        Back to history
      </Link>
      <ResultReview attempt={result.data.attempt} />
    </div>
  );
}
