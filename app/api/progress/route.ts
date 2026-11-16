import { fromFailure, json } from "@/lib/api";
import { loadProgress } from "@/lib/services/practice-service";

export async function GET() {
  const result = await loadProgress();
  if (!result.ok) return fromFailure(result);
  return json(result.data);
}
