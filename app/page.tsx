import Link from "next/link";

import { getSupabasePublicEnv } from "@/lib/supabase/env";

export default function HomePage() {
  const local = getSupabasePublicEnv() === null;
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-5 py-16 sm:py-24">
      <p className="text-sm uppercase tracking-[0.18em] text-muted">For Dani</p>
      <h1 className="max-w-xl font-serif text-5xl leading-tight tracking-tight sm:text-6xl">
        This is for my Dani {"<3"}
      </h1>
      <p className="max-w-xl text-lg leading-8 text-muted">
        An interactive study guide. One Logical Reasoning question a day, then the explanation, then 24 hours until the
        next one. Good luck, my love.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href={local ? "/question" : "/login"} className="button-primary">
          {local ? "Start today’s question" : "Sign in, Dani"}
        </Link>
        <Link href="/credits" className="rounded-full border border-line px-5 py-3 text-sm">
          Source and license
        </Link>
      </div>
    </main>
  );
}
