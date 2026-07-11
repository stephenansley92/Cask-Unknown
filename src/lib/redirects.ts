/**
 * Validates a user-supplied redirect target and returns it only when it is a
 * safe internal path ("/something"). Everything else — external URLs,
 * protocol-relative "//host" values, backslash tricks, malformed or
 * control-character-bearing input — returns the fallback instead.
 */
export function safeInternalPath(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;

  const candidate = value.trim();
  if (!candidate.startsWith("/")) return fallback;
  if (candidate.startsWith("//")) return fallback;
  if (candidate.includes("\\")) return fallback;

  let decoded: string;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    return fallback;
  }
  if (decoded.startsWith("//") || decoded.includes("\\")) return fallback;
  for (const char of decoded) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return fallback;
  }

  // Structural check: resolved against a known origin, the candidate must
  // stay on that origin.
  try {
    const resolved = new URL(candidate, "http://internal.invalid");
    if (resolved.origin !== "http://internal.invalid") return fallback;
  } catch {
    return fallback;
  }

  return candidate;
}
