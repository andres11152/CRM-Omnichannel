import redisClient from "@/config/redis";
import { Logger } from "@/utils/logger";

/**
 * [SECURITY] INBOUND CIRCUIT BREAKER
 * Protects the Inbound Orchestrator and the single event loop from being
 * saturated by a single tenant (company).
 * If a company receives a massive spike in messages (e.g., bot attack or viral group),
 * this circuit breaker will introduce an exponential delay for their messages
 * before enqueuing them, ensuring fair-share processing for other companies.
 */
export class InboundCircuitBreaker {
  // Max messages allowed per window before applying delay
  private static MAX_MESSAGES_PER_WINDOW = 30;
  // Window size in seconds
  private static WINDOW_SECONDS = 5;
  // Delay penalty to apply if limit is breached
  private static PENALTY_DELAY_MS = 10000; // 10 seconds

  /**
   * Evaluates the traffic for a company and returns a delay in milliseconds.
   * If traffic is normal, returns 0.
   * If traffic is too high, returns a delay to push the message down the queue.
   */
  static async getDelayFor(companyId: string): Promise<number> {
    if (!redisClient?.isOpen) {
      return 0; // Fail open if Redis is down
    }

    const key = `breaker:inbound:${companyId}`;
    try {
      const multi = redisClient.multi();
      multi.incr(key);

      const results = await multi.exec();
      const count = results && results[0] ? (results[0][1] as number) : 1;

      if (count === 1) {
        await redisClient.expire(key, this.WINDOW_SECONDS);
      }

      if (count > this.MAX_MESSAGES_PER_WINDOW) {
        Logger.warn(
          `[CircuitBreaker] [WARNING] Tenant ${companyId} is saturating inbound queue. Tripping breaker (${count} msgs in ${this.WINDOW_SECONDS}s). Delaying message by ${this.PENALTY_DELAY_MS}ms.`,
        );
        // Exponential backoff logic if needed
        const excess = count - this.MAX_MESSAGES_PER_WINDOW;
        // The more excess, the longer the delay (up to a max cap)
        const scalingDelay = Math.min(this.PENALTY_DELAY_MS * Math.ceil(excess / 10), 60000); // Max 60 seconds delay
        return scalingDelay;
      }

      return 0;
    } catch (e) {
      Logger.error(`[CircuitBreaker] Failed to evaluate delay limit for ${companyId}:`, e);
      return 0;
    }
  }
}
