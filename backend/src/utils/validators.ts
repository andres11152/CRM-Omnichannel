import { Logger } from "./logger";

/**
 * 🛡️ EXTERNAL PAYLOAD VALIDATOR
 *
 * Validates and sanitizes data from external sources (WhatsApp, webhooks).
 * Prevents injection attacks and malformed data from crashing the system.
 */

/**
 * Sanitize string input - removes null bytes, control characters
 */
export function sanitizeString(input: unknown): string {
  if (typeof input !== "string") {
    return String(input || "");
  }

  return input
    .replace(/\0/g, "") // Remove null bytes
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // Remove control characters
    .trim()
    .slice(0, 10000); // Max 10k chars to prevent memory issues
}

/**
 * Validate phone number format
 */
export function validatePhone(phone: unknown): string | null {
  const cleaned = sanitizeString(phone).replace(/\D/g, "");

  // Phone must be 7-15 digits
  if (cleaned.length < 7 || cleaned.length > 15) {
    return null;
  }

  return cleaned;
}

/**
 * Validate email format
 */
export function validateEmail(email: unknown): string | null {
  const cleaned = sanitizeString(email).toLowerCase();

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleaned)) {
    return null;
  }

  return cleaned;
}

/**
 * Validate URL format
 */
export function validateUrl(url: unknown): string | null {
  try {
    const cleaned = sanitizeString(url);
    const parsed = new URL(cleaned);

    // Only allow http and https
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * 🛡️ SAFE JSON PARSE
 *
 * Parses JSON without throwing. Returns null on failure.
 */
export function safeJsonParse<T = any>(input: unknown): T | null {
  if (typeof input !== "string") {
    return null;
  }

  try {
    return JSON.parse(input) as T;
  } catch (error) {
    Logger.warn("[Validator] Failed to parse JSON:", {
      snippet: String(input).slice(0, 100),
    });
    return null;
  }
}

/**
 * 🛡️ VALIDATE WHATSAPP MESSAGE PAYLOAD
 *
 * Ensures WhatsApp messages have required fields and valid format.
 */
export interface ValidatedWhatsAppMessage {
  phone: string;
  text: string;
  name?: string;
  mediaUrl?: string;
  mediaType?: string;
}

export function validateWhatsAppPayload(
  payload: any
): ValidatedWhatsAppMessage | null {
  // Required: phone and text
  const phone = validatePhone(
    payload?.phone || payload?.remoteJid || payload?.from
  );
  if (!phone) {
    Logger.warn("[Validator] Invalid WhatsApp payload - missing valid phone");
    return null;
  }

  const text = sanitizeString(
    payload?.text || payload?.message || payload?.body
  );
  if (!text && !payload?.hasMedia) {
    Logger.warn(
      "[Validator] Invalid WhatsApp payload - missing text and media"
    );
    return null;
  }

  const result: ValidatedWhatsAppMessage = {
    phone,
    text,
  };

  // Optional fields
  if (payload?.name || payload?.pushName || payload?.notifyName) {
    result.name = sanitizeString(
      payload.name || payload.pushName || payload.notifyName
    );
  }

  if (payload?.media?.url || payload?.mediaUrl) {
    const mediaUrl = validateUrl(payload.media?.url || payload.mediaUrl);
    if (mediaUrl) {
      result.mediaUrl = mediaUrl;
      result.mediaType = sanitizeString(
        payload.media?.type || payload.mediaType || "unknown"
      );
    }
  }

  return result;
}

/**
 * 🛡️ VALIDATE WEBHOOK PAYLOAD
 *
 * Ensures webhook data is safe to process.
 */
export interface ValidatedWebhookPayload {
  event: string;
  data: Record<string, any>;
  timestamp: number;
}

export function validateWebhookPayload(
  payload: any
): ValidatedWebhookPayload | null {
  if (!payload || typeof payload !== "object") {
    Logger.warn("[Validator] Invalid webhook payload - not an object");
    return null;
  }

  const event = sanitizeString(payload.event);
  if (!event || event.length > 100) {
    Logger.warn(
      "[Validator] Invalid webhook payload - missing or invalid event"
    );
    return null;
  }

  // Ensure data is an object
  const data =
    payload.data && typeof payload.data === "object" ? payload.data : {};

  const timestamp =
    typeof payload.timestamp === "number" && payload.timestamp > 0
      ? payload.timestamp
      : Date.now();

  return {
    event,
    data,
    timestamp,
  };
}

/**
 * 🛡️ RATE LIMIT KEY GENERATOR
 *
 * Creates safe rate limit keys from user input.
 */
export function createRateLimitKey(
  namespace: string,
  identifier: unknown
): string {
  const cleaned = sanitizeString(identifier)
    .replace(/[^a-zA-Z0-9-_]/g, "") // Only alphanumeric, dash, underscore
    .slice(0, 64); // Max 64 chars

  return `ratelimit:${namespace}:${cleaned}`;
}
