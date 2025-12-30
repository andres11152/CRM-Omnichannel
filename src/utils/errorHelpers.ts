/**
 * 🛡️ UTILITY: normalizeError
 *
 * Ensures that any thrown value is converted into a proper Error object.
 * This prevents crashes when "throws" are strings, nulls, or generic objects.
 * Essential for robust catch blocks avoiding 'any'.
 */
export function normalizeError(candidate: unknown): Error {
  if (candidate instanceof Error) return candidate;

  if (typeof candidate === "string") {
    return new Error(candidate);
  }

  if (candidate && typeof candidate === "object" && "message" in candidate) {
    return new Error(String((candidate as any).message));
  }

  return new Error(String(candidate));
}

/**
 * 🛡️ UTILITY: getErrorMessage
 *
 * Safely extracts a message string from any unknown thrown entity.
 */
export function getErrorMessage(candidate: unknown): string {
  return normalizeError(candidate).message;
}
