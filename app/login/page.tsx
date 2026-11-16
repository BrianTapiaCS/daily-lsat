import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-md px-5 py-16">
      <h1 className="font-serif text-4xl tracking-tight">Sign in</h1>
      <p className="mt-3 text-muted">Any name and any password are fine. Dani can still use dani and dani.</p>
      <LoginForm />
    </main>
  );
}
