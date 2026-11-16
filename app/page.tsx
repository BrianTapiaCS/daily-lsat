import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-5 py-16 sm:py-24">
      <p className="text-sm uppercase tracking-[0.18em] text-muted">Logical Reasoning</p>
      <h1 className="max-w-xl font-serif text-5xl leading-tight tracking-tight sm:text-6xl">
        One question. Then a day to sit with it.
      </h1>
      <p className="max-w-xl text-lg leading-8 text-muted">
        A private trainer for LSAT-style Logical Reasoning. You answer one question, see the explanation, and the next
        one unlocks 24 hours after you submit.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/login" className="button-primary">
          Sign in
        </Link>
        <Link href="/credits" className="rounded-full border border-line px-5 py-3 text-sm">
          Source and license
        </Link>
      </div>
    </main>
  );
}
