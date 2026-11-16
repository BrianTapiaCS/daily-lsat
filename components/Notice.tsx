export function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-3xl border border-line bg-card p-6">
      <h1 className="font-serif text-3xl tracking-tight">{title}</h1>
      <p className="mt-3 leading-7 text-muted">{body}</p>
    </div>
  );
}
