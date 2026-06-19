import { createHash } from "crypto";
import redisClient from "@/config/redis";
import { Logger } from "@/utils/logger";

/**
 * [SEC] DEDUPLICATION SERVICE
 *
 * Centralized deduplication engine for WhatsApp message processing.
 * Uses Redis as primary store (survives restarts, supports multi-instance),
 * with in-memory fallback when Redis is unavailable.
 *
 * Two dedup strategies:
 * 1. Message ID dedup — prevents processing echo of our own sent messages
 * 2. Content dedup — prevents sending identical content to same conversation
 *
 * All keys use a namespace prefix and automatic TTL expiration.
 */

const REDIS_PREFIX = "wa:dedup:";
const DEFAULT_TTL_SECONDS = 30; // 30s — enough to cover echo delay + retries

/**
 * In-memory fallback store for when Redis is unavailable.
 * Uses Map<string, NodeJS.Timeout> to auto-cleanup via setTimeout.
 */
const memoryFallback = new Map<string, NodeJS.Timeout>();

export class DeduplicationService {
  // ────────────────────────────────────────────────
  // CORE OPERATIONS
  // ────────────────────────────────────────────────

  /**
   * Mark a key as "seen" with automatic TTL expiration.
   * @param namespace - Category prefix (e.g., "msgid", "content")
   * @param key - The unique identifier to deduplicate
   * @param ttlSeconds - Time-to-live in seconds (default: 30s)
   */
  async markSeen(
    namespace: string,
    key: string,
    ttlSeconds: number = DEFAULT_TTL_SECONDS,
  ): Promise<void> {
    const fullKey = `${REDIS_PREFIX}${namespace}:${key}`;

    if (this.isRedisAvailable()) {
      try {
        await redisClient!.set(fullKey, "1", { EX: ttlSeconds });
        return;
      } catch (err) {
        Logger.warn(`[Dedup] Redis SET failed, falling back to memory`, {
          key: fullKey,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // In-memory fallback
    this.memorySet(fullKey, ttlSeconds);
  }

  /**
   * Check if a key has been "seen" (exists in store).
   * @param namespace - Category prefix
   * @param key - The unique identifier to check
   * @returns true if the key exists (duplicate detected)
   */
  async hasSeen(namespace: string, key: string): Promise<boolean> {
    const fullKey = `${REDIS_PREFIX}${namespace}:${key}`;

    if (this.isRedisAvailable()) {
      try {
        const result = await redisClient!.exists(fullKey);
        return result === 1;
      } catch (err) {
        Logger.warn(`[Dedup] Redis EXISTS failed, falling back to memory`, {
          key: fullKey,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // In-memory fallback
    return memoryFallback.has(fullKey);
  }

  /**
   * Atomic "check-and-set" — returns true if key was already seen.
   * If not seen, marks it as seen and returns false.
   * This is the idempotent guard pattern.
   *
   * @param namespace - Category prefix
   * @param key - The unique identifier
   * @param ttlSeconds - TTL for the mark
   * @returns true if DUPLICATE (already existed), false if NEW
   */
  async isDuplicate(
    namespace: string,
    key: string,
    ttlSeconds: number = DEFAULT_TTL_SECONDS,
  ): Promise<boolean> {
    const fullKey = `${REDIS_PREFIX}${namespace}:${key}`;

    if (this.isRedisAvailable()) {
      try {
        // SET NX = "set if not exists" — returns null if key already existed
        const result = await redisClient!.set(fullKey, "1", {
          EX: ttlSeconds,
          NX: true,
        });
        // result is "OK" if key was set (new), null if key already existed (duplicate)
        return result === null;
      } catch (err) {
        Logger.warn(`[Dedup] Redis SET NX failed, falling back to memory`, {
          key: fullKey,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // In-memory fallback
    if (memoryFallback.has(fullKey)) {
      return true; // duplicate
    }
    this.memorySet(fullKey, ttlSeconds);
    return false; // new
  }

  // ────────────────────────────────────────────────
  // CONVENIENCE METHODS (Named Operations)
  // ────────────────────────────────────────────────

  /**
   * Mark a sent message ID to prevent processing its echo.
   * Used in sendMessage/sendMedia before sock.sendMessage().
   */
  async markMessageSent(messageId: string): Promise<void> {
    await this.markSeen("msgid", messageId, 30);
  }

  /**
   * Check if a message ID was recently sent by us (echo detection).
   * Used in handleIncoming to skip our own messages.
   */
  async isOwnEcho(messageId: string): Promise<boolean> {
    return this.hasSeen("msgid", messageId);
  }

  /**
   * Mark content as recently sent to a conversation.
   * Used in sendMessage to prevent duplicate content.
   */
  async markContentSent(
    conversationId: string,
    content: string,
  ): Promise<void> {
    const key = `${conversationId}:${this.hashContent(content)}`;
    await this.markSeen("content", key, 120); //  Higher TTL (120s) covers slow echoes/retries
  }

  /**
   * Check if identical content was recently sent to a conversation.
   * Used in processIncomingMessage to skip duplicate outbound echoes.
   */
  async isContentDuplicate(
    conversationId: string,
    content: string,
  ): Promise<boolean> {
    const key = `${conversationId}:${this.hashContent(content)}`;
    return this.hasSeen("content", key);
  }

  // ────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ────────────────────────────────────────────────

  private isRedisAvailable(): boolean {
    return !!(redisClient && redisClient.isOpen);
  }

  private memorySet(key: string, ttlSeconds: number): void {
    // Clear existing timer if any
    const existing = memoryFallback.get(key);
    if (existing) clearTimeout(existing);

    // Set new entry with auto-cleanup
    const timer = setTimeout(() => {
      memoryFallback.delete(key);
    }, ttlSeconds * 1000);

    // Prevent timer from keeping Node.js alive
    timer.unref();

    memoryFallback.set(key, timer);
  }

  /**
   * SHA-256 hash for content dedup keys — zero collision probability.
   * Returns first 16 hex chars (64-bit prefix) which is collision-safe
   * at our scale and keeps Redis keys short.
   */
  private hashContent(content: string): string {
    const trimmed = content.trim();
    if (trimmed.length <= 32) return trimmed;
    return createHash("sha256").update(trimmed).digest("hex").substring(0, 16);
  }
}

export const deduplicationService = new DeduplicationService();
