/**
 * [DEV] Common Types & API Responses
 */

export enum Channel {
  EMAIL = "EMAIL",
  WHATSAPP = "WHATSAPP",
  SMS = "SMS",
  WEB_CHAT = "WEB_CHAT",
  TELEGRAM = "TELEGRAM",
  FACEBOOK_MESSENGER = "FACEBOOK_MESSENGER",
  INSTAGRAM_DM = "INSTAGRAM_DM",
  INSTAGRAM = "INSTAGRAM", // Added for compatibility
}

export enum SenderType {
  USER = "USER",
  AGENT = "AGENT",
  BOT = "BOT",
  SYSTEM = "SYSTEM",
}

// Generic API Response Wrapper
export interface ApiResponse<T = unknown> {
  status: "success" | "fail" | "error";
  data: T;
  token?: string; // Auth token at root
  message?: string;
  results?: number; // Count for list endpoints
  meta?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// Common Database Fields
export interface BaseEntity {
  id: string;
  createdAt: string; // ISO Date String
  updatedAt: string; // ISO Date String
}

// Utility Types
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
