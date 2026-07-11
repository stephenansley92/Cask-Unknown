/**
 * Minimal structured logger. Emits one JSON line per event so hosting-side
 * log tooling can filter on `event` and correlate user-facing failures via
 * the correlation id echoed in error messages.
 *
 * Never pass secrets (host keys, tokens, passwords), score notes, CSV
 * contents, or raw emails in `details`.
 */

type LogLevel = "info" | "warn" | "error";

export function errorMessage(error: unknown, fallback = "Unknown error.") {
  if (error instanceof Error && error.message) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message
  ) {
    return error.message;
  }
  return fallback;
}

export function newCorrelationId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function logEvent(
  level: LogLevel,
  event: string,
  details: Record<string, unknown> = {}
) {
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    event,
    ...details,
  });

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/**
 * Stable user-facing failure message carrying a correlation id that can be
 * matched against server logs.
 */
export function userFacingError(base: string, correlationId: string) {
  return `${base} (ref: ${correlationId})`;
}
