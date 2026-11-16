"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LocalReset() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function reset() {
    setPending(true);
    await fetch("/api/local/reset", { method: "POST" });
    setPending(false);
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <button type="button" className="text-sm text-muted underline" onClick={() => void reset()} disabled={pending}>
      {pending ? "Resetting…" : "Reset this computer and try again"}
    </button>
  );
}
