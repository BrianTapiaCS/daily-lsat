import { json } from "@/lib/api";
import { localReset } from "@/lib/local-practice";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export async function POST() {
  if (getSupabasePublicEnv()) {
    return json({ error: "not_found" }, 404);
  }
  await localReset();
  return json({ ok: true });
}
