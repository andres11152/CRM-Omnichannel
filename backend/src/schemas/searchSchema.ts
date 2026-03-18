import { z } from "zod";

/**
 * 🛡️ SEARCH VALIDATION SCHEMAS
 *
 * Validates Command Palette (Cmd+K) search queries.
 * Prevents DoS via excessively long queries and injection attacks.
 */

export const GlobalSearchSchema = z.object({
  query: z.object({
    q: z
      .string()
      .min(2, "Query must be at least 2 characters long")
      .max(200, "Query too long (max 200 characters)")
      .trim(),
  }),
});

export type GlobalSearchInput = z.infer<typeof GlobalSearchSchema>["query"];
