"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function ProfileSettings({ displayName, timezone }: { displayName: string; timezone: string }) {
  const router = useRouter();
  const [name, setName] = useState(displayName);
  const [zone, setZone] = useState(timezone);
  const [message, setMessage] = useState<string | null>(null);
  const zones =
    typeof Intl !== "undefined" && "supportedValuesOf" in Intl
      ? Intl.supportedValuesOf("timeZone")
      : ["America/New_York", "UTC"];

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: name, timezone: zone }),
    });
    const body: unknown = await response.json();
    if (!response.ok) {
      const error = body && typeof body === "object" && "message" in body ? String(body.message) : "Could not save.";
      setMessage(error);
      return;
    }
    setMessage("Saved.");
    router.refresh();
  }

  return (
    <details className="rounded-3xl border border-line bg-card px-5 py-4">
      <summary className="cursor-pointer text-sm text-muted">
        Time zone · {timezone}. Streaks use this calendar.
      </summary>
      <form className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={onSubmit}>
        <label className="grid gap-1 text-sm">
          Name
          <input className="field" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} />
        </label>
        <label className="grid gap-1 text-sm">
          Time zone
          <select className="field" value={zone} onChange={(event) => setZone(event.target.value)}>
            {zones.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <button className="button-primary self-end" type="submit">
          Save
        </button>
        {message ? <p className="text-sm text-muted sm:col-span-3">{message}</p> : null}
      </form>
    </details>
  );
}
