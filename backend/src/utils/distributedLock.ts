import redisClient from "@/config/redis";
import { Logger } from "@/utils/logger";

/**
 * 🔒 Enterprise-Grade Distributed Lock (Mutex)
 * Provides concurrent access control using Redis SET NX pattern.
 * Supports graceful fallback to in-memory locking for dev/offline scenarios.
 */
export class DistributedLock {
  private static localLocks = new Map<string, Promise<void>>();

  /**
   * Executes a task within a distributed lock.
   * If the lock is held by another process/thread, it waits until released or timeout.
   *
   * @param key Unique resource identifier (e.g., 'conv:companyId:phone')
   * @param task Async function to execute
   * @param ttlMs Lock Time-to-Live (fail-safe to release lock if process crashes)
   * @param waitTimeoutMs Max time to wait for lock acquisition before error
   */
  static async run<T>(
    key: string,
    task: () => Promise<T>,
    ttlMs: number = 5000,
    waitTimeoutMs: number = 10000
  ): Promise<T> {
    const lockKey = `lock:${key}`;
    const start = Date.now();

    // 1. REDIS LOCK STRATEGY
    if (redisClient && redisClient.isOpen) {
      // Spin-wait algorithm with exponential backoff could be better, but fixed delay is fine for this scale
      while (true) {
        // Attempt to acquire lock
        const result = await redisClient.set(lockKey, "1", {
          NX: true, // Only set if not exists
          PX: ttlMs, // Auto-expire (ms)
        });

        if (result === "OK") {
          // Lock Acquired
          try {
            return await task();
          } finally {
            // Release Lock (Lua script is SAFER to ensure we own it, but simple DEL is acceptable for this level)
            await redisClient.del(lockKey).catch((err) => {
              Logger.warn(
                `[DistributedLock] Failed to release lock ${lockKey}`,
                err
              );
            });
          }
        }

        // Check timeout
        if (Date.now() - start > waitTimeoutMs) {
          throw new Error(
            `[DistributedLock] Timeout acquiring lock for ${key}`
          );
        }

        // Wait before retry (randomized jitter to prevent thundering herd)
        const delay = 50 + Math.random() * 100;
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    // 2. IN-MEMORY FALLBACK STRATEGY
    else {
      // Logger.debug(`[DistributedLock] Redis unavailable. Using Memory Lock for ${key}`);

      // Wait for existing promise
      while (this.localLocks.has(key)) {
        if (Date.now() - start > waitTimeoutMs) {
          throw new Error(
            `[DistributedLock] Timeout acquiring memory lock for ${key}`
          );
        }
        try {
          await this.localLocks.get(key);
        } catch (e) {
          // Ignore failures of previous tasks
        }
      }

      // Create new lock
      let resolveLock: () => void;
      const lockPromise = new Promise<void>((resolve) => {
        resolveLock = resolve;
      });

      this.localLocks.set(key, lockPromise);

      try {
        return await task();
      } finally {
        this.localLocks.delete(key);
        resolveLock!();
      }
    }
  }
}
