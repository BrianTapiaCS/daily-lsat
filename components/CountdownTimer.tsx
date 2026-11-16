"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { remainingMs } from "@/lib/daily-rules";
import { formatDuration } from "@/lib/format";

export function CountdownTimer({
  unlocksAt,
  serverNow,
  onElapsed,
}: {
  unlocksAt: string;
  serverNow: string;
  onElapsed?: () => void;
}) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);
  const [fetchedAt] = useState(() => performance.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setElapsed(performance.now() - fetchedAt);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [fetchedAt]);

  const remaining = remainingMs({
    unlocksAt,
    serverNow,
    elapsedSinceFetchMs: elapsed,
  });

  if (remaining <= 0) {
    return (
      <div className="space-y-3">
        <p className="font-serif text-3xl tracking-tight">The next question should be open.</p>
        <button
          type="button"
          className="button-primary"
          onClick={() => (onElapsed ? onElapsed() : router.refresh())}
        >
          Check availability
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm uppercase tracking-[0.16em] text-muted">Next question</p>
      <p className="mt-2 font-serif text-4xl tracking-tight tabular-nums sm:text-5xl">{formatDuration(remaining)}</p>
    </div>
  );
}
