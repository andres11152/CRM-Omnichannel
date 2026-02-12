import { AIHistoryMessage } from "./ai.types";

// Type definitions for queue data structures

export interface AITaskData {
  messageId: string;
  text: string;
  history: AIHistoryMessage[];
  companyId: string;
}

export interface MessageJobData {
  to: string;
  text: string;
  type: string;
  companyId: string;
}

export interface WebhookJobData {
  companyId: string;
  event: string;
  payload: Record<string, unknown>;
  webhookId: string;
  url: string;
  secret?: string;
}

export interface SessionInitJobData {
  sessionId: string;
  companyId: string;
  authDir: string;
}
