import Link from "next/link";

import { SignOutButton } from "@/components/SignOutButton";
import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export async function SiteHeader() {
  const local = getSupabasePublicEnv() === null;
  const supabase = local ? null : await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;

  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4">
        <Link href={local || user ? "/dashboard" : "/"} className="font-serif text-xl tracking-tight">
          Daily LR
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {local || user ? (
            <>
              <Link href="/question">Today</Link>
              <Link href="/history">History</Link>
              <Link href="/credits">Credits</Link>
              {user ? <SignOutButton /> : <span className="text-muted">This computer</span>}
            </>
          ) : (
            <>
              <Link href="/credits">Credits</Link>
              <Link href="/login">Sign in</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function HeaderFallback() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
        <span className="font-serif text-xl">Daily LR</span>
      </div>
    </header>
  );
}
