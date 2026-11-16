import { json } from "@/lib/api";
import { accountEmail, storedPassword } from "@/lib/account-credentials";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Type a name." }, 400);
  }

  const record = body && typeof body === "object" ? (body as { name?: unknown; password?: unknown }) : {};
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const password = typeof record.password === "string" ? record.password : "";
  if (!name) return json({ error: "Type a name." }, 400);

  const env = getSupabasePublicEnv();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env || !serviceKey) {
    return json({ error: "Account creation is not available yet." }, 503);
  }

  const email = accountEmail(name);
  const response = await fetch(`${env.url}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password: await storedPassword(password),
      email_confirm: true,
      user_metadata: { display_name: name.slice(0, 80) },
    }),
  });

  if (response.ok) return json({ ok: true, email });

  const payload = (await response.json().catch(() => null)) as { error_code?: string; msg?: string } | null;
  if (response.status === 422 && (payload?.error_code === "email_exists" || /already/i.test(payload?.msg ?? ""))) {
    return json({ error: "That name is already taken." }, 409);
  }
  return json({ error: payload?.msg || "Could not create the account." }, response.status || 500);
}
