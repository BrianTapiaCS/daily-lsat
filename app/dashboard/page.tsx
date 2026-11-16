import Link from "next/link";
import { Suspense } from "react";

import { CountdownTimer } from "@/components/CountdownTimer";
import { LocalReset } from "@/components/LocalReset";
import { LocalTime } from "@/components/LocalTime";
import { Notice } from "@/components/Notice";
import { ProfileSettings } from "@/components/ProfileSettings";
import { AccuracyValue, ProgressCard } from "@/components/ProgressCard";
import { StreakCard } from "@/components/StreakCard";
import { accuracyPercent } from "@/lib/daily-rules";
import { loadProgress } from "@/lib/services/practice-service";
import type { CategoryStat, ProgressSnapshot, RecentAttempt } from "@/types/practice";

export const metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Suspense fallback={<p className="text-muted">Loading your progress…</p>}>
        <DashboardContent />
      </Suspense>
    </main>
  );
}

function isProgress(value: Record<string, unknown>): value is ProgressSnapshot {
  return (
    typeof value.displayName === "string" &&
    typeof value.timezone === "string" &&
    typeof value.totalCompleted === "number" &&
    typeof value.totalCorrect === "number" &&
    typeof value.currentStreak === "number" &&
    typeof value.longestStreak === "number" &&
    typeof value.questionAvailable === "boolean" &&
    typeof value.serverNow === "string" &&
    Array.isArray(value.byCategory) &&
    Array.isArray(value.recent)
  );
}

async function DashboardContent() {
  const result = await loadProgress();
  if (!result.ok) {
    return <Notice title="Progress is unavailable" body={result.message ?? "Sign in and apply the database migration."} />;
  }
  const localMode = result.data.mode === "local";
  if (!isProgress(result.data)) {
    return <Notice title="Progress is unavailable" body="The progress response did not have the expected fields." />;
  }
  const progress = result.data;
  const incorrect = progress.totalCompleted - progress.totalCorrect;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-[0.16em] text-muted">Welcome back</p>
        <h1 className="font-serif text-5xl tracking-tight">{progress.displayName}</h1>
        {localMode ? (
          <p className="text-muted">
            No account is required. Progress stays in a file on this computer.{" "}
            <LocalReset />
          </p>
        ) : null}
      </header>

      <section className="rounded-[2rem] border border-line bg-white/70 p-6 sm:p-8">
        {progress.questionAvailable ? (
          <div className="space-y-4">
            <h2 className="font-serif text-4xl tracking-tight">Today’s question is ready.</h2>
            <p className="max-w-lg text-muted">One Logical Reasoning question. The explanation appears as soon as you submit.</p>
            <Link href="/question" className="button-primary inline-block">
              Start today’s question
            </Link>
          </div>
        ) : progress.nextAvailableAt ? (
          <div className="space-y-5">
            <h2 className="font-serif text-4xl tracking-tight">You’re between questions.</h2>
            <CountdownTimer unlocksAt={progress.nextAvailableAt} serverNow={progress.serverNow} />
            <Link href="/question" className="inline-block text-sm underline">
              Review the last explanation
            </Link>
          </div>
        ) : (
          <p>No question is scheduled.</p>
        )}
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <StreakCard current={progress.currentStreak} longest={progress.longestStreak} />
        <ProgressCard
          label="Completed"
          value={String(progress.totalCompleted)}
          detail={`${progress.totalCorrect} correct · ${incorrect} incorrect`}
        />
        <ProgressCard
          label="Accuracy"
          value={accuracyPercent(progress.totalCorrect, progress.totalCompleted) === null ? "—" : `${accuracyPercent(progress.totalCorrect, progress.totalCompleted)}%`}
        />
      </div>

      <RecentPerformance recent={progress.recent} />
      <CategoryAccuracy categories={progress.byCategory} />
      <ProfileSettings displayName={progress.displayName} timezone={progress.timezone} />
    </div>
  );
}

function RecentPerformance({ recent }: { recent: RecentAttempt[] }) {
  if (recent.length === 0) {
    return <p className="text-muted">No questions yet. Your recent results will show up here.</p>;
  }
  return (
    <section className="space-y-3">
      <h2 className="text-sm uppercase tracking-[0.16em] text-muted">Recent</h2>
      <ul className="divide-y divide-line rounded-3xl border border-line bg-card">
        {recent.map((item) => (
          <li key={item.attemptId} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <Link href={`/history/${item.attemptId}`} className="underline">
              {item.sourceId}
            </Link>
            <span className="text-muted">{item.questionType}</span>
            <span className={item.isCorrect ? "text-right" : "text-wrong"}>{item.isCorrect ? "Correct" : "Incorrect"}</span>
            <LocalTime value={item.submittedAt} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function CategoryAccuracy({ categories }: { categories: CategoryStat[] }) {
  if (categories.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-sm uppercase tracking-[0.16em] text-muted">By category</h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {categories.map((category) => (
          <li key={category.questionType} className="rounded-2xl border border-line px-4 py-3 text-sm">
            <span className="block">{category.questionType}</span>
            <span className="text-muted">
              <AccuracyValue correct={category.correct} total={category.total} /> · {category.correct}/{category.total}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
