/**
 *  VARIABLE RESOLVER
 * 
 * Replaces placeholders like {{contact.name}} or {{deal.value}} with real data.
 * Supports nested objects and fallbacks.
 */
export const resolveVariables = (
  text: string, 
  context: Record<string, unknown>
): string => {
  if (!text) return "";
  
  // [SEC] SECURITY: Regex handles alphanumeric and dots for nested access
  return text.replace(/\{\{([\w.]+)\}\}/g, (match, path) => {
    const value = getObjectValue(context, path);
    if (value === undefined || value === null) {
      return match; // Keep the placeholder if data is missing
    }
    return String(value);
  });
};

/**
 * Helper to traverse nested objects (e.g. "contact.name") safely
 */
function getObjectValue(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== "object") return undefined;

  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

