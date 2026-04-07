import { z } from "zod";

//  AI Context Definition
export interface AIHistoryMessage {
  role: "user" | "model";
  parts: string;
}

export interface AIContext {
  companyId: string;
  assistantId: string;
  conversationId: string;
  userMessage: string;
  history: AIHistoryMessage[];
  variables?: Record<string, string>;
}

// [SEC] Zod Schema for AI Response Validation
// In future, if AI returns JSON actions (e.g. { action: "create_ticket", data: ... })
// this schema will expand. For now, we validate strict text output.
export const AIResponseSchema = z
  .string()
  .min(1, "AI response cannot be empty");

export type AIResponse = z.infer<typeof AIResponseSchema>;
