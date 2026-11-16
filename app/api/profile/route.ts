import { errorResponse, fromFailure, json } from "@/lib/api";
import { saveProfile } from "@/lib/services/practice-service";

export async function PATCH(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid_name");
  }
  const result = await saveProfile(body);
  if (!result.ok) return fromFailure(result);
  return json(result.data);
}
