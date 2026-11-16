export function StreakCard({ current, longest }: { current: number; longest: number }) {
  return (
    <section className="rounded-3xl border border-line bg-card px-5 py-4">
      <p className="text-sm uppercase tracking-[0.16em] text-muted">Streak</p>
      <p className="mt-2 font-serif text-4xl tracking-tight">{current}</p>
      <p className="mt-1 text-sm text-muted">Longest {longest}</p>
    </section>
  );
}
