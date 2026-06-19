import redisClient from "@/config/redis";
import { Logger } from "./logger";

/**
 *  DISTRIBUTED LOCK SERVICE (Redlock-lite)
 * 
 * Ensures that a task is executed by only one worker at a time across the cluster.
 * Critical for preventing race conditions in WhatsApp message processing.
 */
export class LockService {
  /**
   * Acquires a lock for a specific key
   * @param key Unique identifier for the lock
   * @param ttl Time to live in milliseconds (auto-release)
   */
  static async acquire(key: string, ttl: number = 30000): Promise<string | null> {
    const lockKey = `lock:${key}`;
    const lockValue = Date.now().toString();

    try {
      if (!redisClient || !redisClient.isOpen) {
        return null;
      }

      // SET key value NX (Only if not exist) PX ttl (Expire in ms)
      // node-redis v4 syntax
      const result = await redisClient.set(lockKey, lockValue, {
        NX: true,
        PX: ttl,
      });

      if (result === 'OK') {
        Logger.debug(`[LockService] [AUTH] Acquired lock: ${key}`);
        return lockValue;
      }

      return null;
    } catch (error) {
      Logger.error(`[LockService] [ERROR] Failed to acquire lock for ${key}:`, error as Error);
      return null;
    }
  }

  /**
   * Releases a lock safely using a Lua script to ensure atomicity
   */
  static async release(key: string, value: string): Promise<void> {
    const lockKey = `lock:${key}`;

    try {
      if (!redisClient || !redisClient.isOpen) return;

      // Lua script: Only delete if the value matches (prevents releasing someone else's lock)
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;

      await redisClient.eval(script, {
        keys: [lockKey],
        arguments: [value],
      });

      Logger.debug(`[LockService]  Released lock: ${key}`);
    } catch (error) {
      Logger.error(`[LockService] [ERROR] Failed to release lock for ${key}:`, error as Error);
    }
  }

  /**
   * Executes a task within a distributed lock
   */
  static async withLock<T>(
    key: string, 
    task: () => Promise<T>, 
    ttl: number = 30000,
    retries: number = 3,
    delay: number = 500
  ): Promise<T | null> {
    let currentAttempt = 0;
    let lockValue: string | null = null;

    while (currentAttempt < retries) {
      lockValue = await this.acquire(key, ttl);
      if (lockValue) break;

      currentAttempt++;
      if (currentAttempt < retries) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    if (!lockValue) {
      // Redis unavailable or OOM — fall back to running without the distributed lock.
      // Application-level deduplication (doesMessageExist DB check + DeduplicationService
      // in-memory fallback) provides safety against duplicate processing.
      // Without this fallback, Redis OOM causes ALL inbound messages to be silently dropped.
      // ERROR-level because in a multi-instance cluster this raises duplicate-processing risk.
      Logger.error(
        `[LockService] [CRITICAL] Could not acquire lock for ${key} after ${retries} retries. ` +
        `Running WITHOUT distributed lock — duplicate processing risk is HIGH. ` +
        `Check Redis memory usage and connectivity immediately.`,
      );
      return await task();
    }

    try {
      return await task();
    } finally {
      await this.release(key, lockValue);
    }
  }
}
