// Supabase still requires an email-shaped id and a password of at least 6 characters.
// These two functions let someone type any name and any password. Sign-in uses the same rules.

export function accountEmail(name: string): string {
  const trimmed = name.trim();
  if (trimmed.includes("@")) return trimmed.toLowerCase();

  let local = "";
  for (const char of trimmed.toLowerCase()) {
    local += /[a-z0-9]/.test(char) ? char : `x${char.codePointAt(0)!.toString(16)}`;
  }
  return `${(local || "x").slice(0, 64)}@daily-lsat.app`;
}

export async function storedPassword(password: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`daily-lsat:${password}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
