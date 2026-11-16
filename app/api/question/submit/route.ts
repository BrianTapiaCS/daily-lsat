import { errorResponse, fromFailure, json } from "@/lib/api";
import { submitAnswer } from "@/lib/services/practice-service";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid_answer");
  }
  const result = await submitAnswer(body);
  if (!result.ok) return fromFailure(result);
  return json(result.data);
}
