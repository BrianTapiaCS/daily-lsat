"use client";

export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-16">
      <h1 className="font-serif text-4xl tracking-tight">Something went wrong.</h1>
      <p className="mt-3 text-muted">{error.message}</p>
      <button type="button" className="button-primary mt-6" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
