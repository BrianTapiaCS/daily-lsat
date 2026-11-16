"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign-in" | "create">("sign-in");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = createClient();
    if (!supabase) {
      setMessage("Add the Supabase URL and anon key to .env, then restart the dev server.");
      return;
    }
    setPending(true);
    setMessage(null);
    const result =
      mode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setPending(false);
    if (result.error) {
      setMessage(result.error.message);
      return;
    }
    if (mode === "create" && !result.data.session) {
      setMessage("Account created. Confirm the email if confirmation is turned on, then sign in.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form className="mt-8 space-y-4" onSubmit={(event) => void onSubmit(event)}>
      <label className="grid gap-1 text-sm">
        Email
        <input className="field" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </label>
      <label className="grid gap-1 text-sm">
        Password
        <input
          className="field"
          type="password"
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      {message ? <p className="text-sm text-wrong">{message}</p> : null}
      <button className="button-primary w-full" type="submit" disabled={pending}>
        {pending ? "Working…" : mode === "sign-in" ? "Sign in" : "Create account"}
      </button>
      <button
        type="button"
        className="text-sm text-muted"
        onClick={() => setMode(mode === "sign-in" ? "create" : "sign-in")}
      >
        {mode === "sign-in" ? "Need an account? Create one." : "Already have an account? Sign in."}
      </button>
    </form>
  );
}
