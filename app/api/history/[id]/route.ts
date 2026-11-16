import { errorResponse, fromFailure, json } from "@/lib/api";
import { loadHistoryItem } from "@/lib/services/practice-service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!UUID.test(id)) return errorResponse("not_found");
  const result = await loadHistoryItem(id);
  if (!result.ok) return fromFailure(result);
  return json(result.data);
}
