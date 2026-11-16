import { accuracyPercent } from "@/lib/daily-rules";

export function ProgressCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <section className="rounded-3xl border border-line bg-card px-5 py-4">
      <p className="text-sm uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className="mt-2 font-serif text-4xl tracking-tight">{value}</p>
      {detail ? <p className="mt-1 text-sm text-muted">{detail}</p> : null}
    </section>
  );
}

export function AccuracyValue({ correct, total }: { correct: number; total: number }) {
  const accuracy = accuracyPercent(correct, total);
  return <>{accuracy === null ? "—" : `${accuracy}%`}</>;
}
