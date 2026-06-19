import redisClient from "@/config/redis";
import { Logger } from "@/utils/logger";

/**
 *  Enterprise-Grade Distributed Lock (Mutex)
 * Provides concurrent access control using Redis SET NX pattern.
 * Supports graceful fallback to in-memory locking for dev/offline scenarios.
 */
export class DistributedLock {
  private static localLocks = new Map<string, Promise<unknown>>();

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
    waitTimeoutMs: number = 10000,
  ): Promise<T> {
    const lockKey = `lock:${key}`;
    const start = Date.now();
    const lockValue = Math.random().toString(36).substring(2) + Date.now();

    // 1. REDIS LOCK STRATEGY
    if (redisClient && redisClient.isOpen) {
      // Spin-wait algorithm with exponential backoff could be better, but fixed delay is fine for this scale
      while (true) {
        // Attempt to acquire lock
        const result = await redisClient.set(lockKey, lockValue, {
          NX: true, // Only set if not exists
          PX: ttlMs, // Auto-expire (ms)
        });

        if (result === "OK") {
          // Lock Acquired
          try {
            return await task();
          } finally {
            // Release Lock safely (Lua script ensures we only release if we own it)
            const script = `
              if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("del", KEYS[1])
              else
                return 0
              end
            `;
            await redisClient.eval(script, {
              keys: [lockKey],
              arguments: [lockValue],
            }).catch((err) => {
              Logger.warn(
                `[DistributedLock] Failed to release lock ${lockKey}`,
                err,
              );
            });
          }
        }

        // Check timeout
        if (Date.now() - start > waitTimeoutMs) {
          throw new Error(
            `[DistributedLock] Timeout acquiring lock for ${key}`,
          );
        }

        // Wait before retry (randomized jitter to prevent thundering herd)
        const delay = 50 + Math.random() * 100;
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    // 2. IN-MEMORY FALLBACK STRATEGY
    else {
      const hasExistingLock = this.localLocks.has(key);
      const previousPromise = this.localLocks.get(key) || Promise.resolve();

      const currentPromise = (async () => {
        try {
          if (hasExistingLock) {
            let timeoutId: NodeJS.Timeout | undefined;
            await Promise.race([
              previousPromise,
              new Promise<void>((_, reject) => {
                timeoutId = setTimeout(
                  () => reject(new Error(`[DistributedLock] Timeout acquiring memory lock for ${key}`)),
                  waitTimeoutMs
                );
              })
            ]);
            if (timeoutId) clearTimeout(timeoutId);
          }
        } catch (err) {
          if (err instanceof Error && err.message.includes("Timeout")) {
            throw err;
          }
        }
        return await task();
      })();

      this.localLocks.set(key, currentPromise);

      currentPromise.finally(() => {
        if (this.localLocks.get(key) === currentPromise) {
          this.localLocks.delete(key);
        }
      });

      return currentPromise;
    }
  }
}
