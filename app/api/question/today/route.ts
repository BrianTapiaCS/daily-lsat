import { fromFailure, json } from "@/lib/api";
import { loadToday } from "@/lib/services/practice-service";

export async function GET() {
  const result = await loadToday();
  if (!result.ok) return fromFailure(result);
  return json(result.data);
}
