import { EventBus } from "../core/events/EventBus";
import { WhatsAppEventType } from "../core/events/WhatsAppEvents";
import { whatsappSessionRepository } from "@/repositories/WhatsAppSessionRepository";
import redisClient from "@/config/redis";
import { Logger } from "@/utils/logger";

interface RateLimitConfig {
  maxMessages: number;
  windowSeconds: number;
}

export class RateLimitService {
  private eventBus: EventBus;
  private config: RateLimitConfig;

  constructor(config?: Partial<RateLimitConfig>) {
    this.eventBus = EventBus.getInstance();
    this.config = {
      maxMessages:
        config?.maxMessages ||
        parseInt(process.env.WA_RATE_LIMIT_MAX_MESSAGES || "100", 10),
      windowSeconds:
        config?.windowSeconds ||
        parseInt(process.env.WA_RATE_LIMIT_WINDOW_SECONDS || "3600", 10),
    };

    this.subscribeToEvents();
  }

  private subscribeToEvents(): void {
    // Note: Increment happens AFTER message is sent in background
    this.eventBus.subscribe(WhatsAppEventType.MESSAGE_SENT, (event) => {
      this.incrementCount(event.sessionId).catch((err) =>
        Logger.error(
          `[RateLimitService] Failed to increment count for ${event.sessionId}:`,
          err,
        ),
      );
    });
  }

  private getRedisKey(sessionId: string): string {
    return `wa:ratelimit:${sessionId}`;
  }

  async checkLimit(sessionId: string): Promise<boolean> {
    if (!redisClient?.isOpen) {
      Logger.warn("[RateLimitService] Redis not connected. Bypassing check.");
      return true; // Fail open for resilience
    }

    const key = this.getRedisKey(sessionId);
    try {
      const countStr = await redisClient.get(key);
      const count = countStr ? parseInt(countStr, 10) : 0;

      if (count >= this.config.maxMessages) {
        // Find session in the background
        whatsappSessionRepository
          .findSystemSession(sessionId)
          .then((session) => {
            if (session) {
              this.eventBus.publish({
                type: WhatsAppEventType.RATE_LIMIT_EXCEEDED,
                sessionId,
                companyId: session.companyId,
                timestamp: new Date(),
                data: {
                  limit: this.config.maxMessages,
                  current: count,
                },
              });
            }
          })
          .catch(() => null);

        return false;
      }

      return true;
    } catch (e) {
      Logger.error(`[RateLimitService] Check limit error for ${sessionId}:`, e);
      return true; // Fail open
    }
  }

  private async incrementCount(sessionId: string): Promise<void> {
    if (!redisClient?.isOpen) return;

    const key = this.getRedisKey(sessionId);
    const multi = redisClient.multi();

    // INCR creates the key if it doesn't exist
    multi.incr(key);

    // Execute and then set TTL if it's currently -1 (no expiration)
    const results = await multi.exec();

    if (results && results[0]) {
      const pttl = await redisClient.pTTL(key);
      if (pttl === -1) {
        await redisClient.expire(key, this.config.windowSeconds);
      }
    }
  }

  async enforceLimit(sessionId: string): Promise<void> {
    const allowed = await this.checkLimit(sessionId);
    if (!allowed) {
      if (redisClient?.isOpen) {
        const key = this.getRedisKey(sessionId);
        const ttlSeconds = await redisClient.ttl(key);
        throw new Error(
          `Rate limit exceeded for session ${sessionId}. Try again in ${ttlSeconds > 0 ? ttlSeconds : "a few"} seconds.`,
        );
      } else {
        throw new Error(`Rate limit exceeded for session ${sessionId}.`);
      }
    }
  }

  async resetLimit(sessionId: string): Promise<void> {
    if (redisClient?.isOpen) {
      await redisClient.del(this.getRedisKey(sessionId));
    }
  }

  async getStats(sessionId: string): Promise<{
    count: number;
    limit: number;
    resetAt: Date | null;
  }> {
    if (!redisClient?.isOpen) {
      return { count: 0, limit: this.config.maxMessages, resetAt: null };
    }

    const key = this.getRedisKey(sessionId);
    const countStr = await redisClient.get(key);
    const ttlSeconds = await redisClient.ttl(key);

    return {
      count: countStr ? parseInt(countStr, 10) : 0,
      limit: this.config.maxMessages,
      resetAt: ttlSeconds > 0 ? new Date(Date.now() + ttlSeconds * 1000) : null,
    };
  }
}
