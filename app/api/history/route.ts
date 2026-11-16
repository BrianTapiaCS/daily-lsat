import { fromFailure, json } from "@/lib/api";
import { loadHistory } from "@/lib/services/practice-service";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const limit = 20;
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const result = await loadHistory(limit, (safePage - 1) * limit);
  if (!result.ok) return fromFailure(result);
  return json(result.data);
}
