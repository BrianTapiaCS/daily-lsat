"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { accountEmail, storedPassword } from "@/lib/account-credentials";
import { createClient } from "@/lib/supabase/client";

type AuthClient = NonNullable<ReturnType<typeof createClient>>;

async function signInWithAnyPassword(supabase: AuthClient, identity: string, password: string) {
  const direct = await supabase.auth.signInWithPassword({ email: identity, password });
  if (!direct.error) return { error: null };
  const secret = await storedPassword(password);
  if (secret === password) return { error: direct.error.message };
  const stored = await supabase.auth.signInWithPassword({ email: identity, password: secret });
  return { error: stored.error ? stored.error.message : null };
}

async function createAccount(supabase: AuthClient, name: string, password: string) {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, password }),
  });
  const payload = (await response.json().catch(() => null)) as { error?: string; email?: string } | null;
  if (!response.ok || !payload?.email) return { error: payload?.error ?? "Could not create the account." };
  const signedIn = await supabase.auth.signInWithPassword({
    email: payload.email,
    password: await storedPassword(password),
  });
  return { error: signedIn.error ? signedIn.error.message : null };
}

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
    const identity = accountEmail(email);
    const result =
      mode === "sign-in"
        ? await signInWithAnyPassword(supabase, identity, password)
        : await createAccount(supabase, email.trim(), password);
    setPending(false);
    if (result.error) {
      setMessage(result.error);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form className="mt-8 space-y-4" onSubmit={(event) => void onSubmit(event)}>
      <label className="grid gap-1 text-sm">
        Name
        <input className="field" type="text" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </label>
      <label className="grid gap-1 text-sm">
        Password
        <input
          className="field"
          type="password"
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
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
