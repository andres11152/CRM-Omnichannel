import { createClient, RedisClientType } from "redis";
import { Logger } from "@/utils/logger";

/**
 * REDIS CACHE SERVICE
 * Provides a simple cache layer to reduce database queries
 */
class CacheService {
  private client: RedisClientType | null = null;
  private isConnected = false;

  async connect() {
    if (this.isConnected) return;

    if (!process.env.REDIS_URL) {
      Logger.warn("[Cache] REDIS_URL not found. Cache disabled.");
      return;
    }

    try {
      this.client = createClient({
        url: process.env.REDIS_URL,
        socket: {
          family: 4,
          tls: process.env.REDIS_URL?.startsWith("rediss://"),
          rejectUnauthorized: false,
        },
      });

      this.client.on("error", (err) => {
        const msg = err.message || "";
        if (
          msg.includes("ECONNRESET") ||
          msg.includes("Connection timeout") ||
          msg.includes("ENOTFOUND")
        )
          return;
        Logger.error("[Cache] Redis Client Error:", err);
      });

      await this.client.connect();
      this.isConnected = true;
      Logger.info("[Cache] ✅ Redis cache connected");
    } catch (error) {
      Logger.error("[Cache] Failed to connect to Redis:", error);
      this.client = null;
    }
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.client || !this.isConnected) return null;

    try {
      const value = await this.client.get(key);
      if (!value) return null;

      return JSON.parse(value) as T;
    } catch (error) {
      Logger.error(`[Cache] Error getting key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set value in cache with TTL (seconds)
   */
  async set(key: string, value: any, ttl: number = 300): Promise<void> {
    if (!this.client || !this.isConnected) return;

    try {
      await this.client.setEx(key, ttl, JSON.stringify(value));
    } catch (error) {
      Logger.error(`[Cache] Error setting key ${key}:`, error);
    }
  }

  /**
   * Delete key from cache
   */
  async delete(key: string): Promise<void> {
    if (!this.client || !this.isConnected) return;

    try {
      await this.client.del(key);
    } catch (error) {
      Logger.error(`[Cache] Error deleting key ${key}:`, error);
    }
  }

  /**
   * Delete multiple keys efficiently
   */
  async deleteMany(keys: string[]): Promise<void> {
    if (!this.client || !this.isConnected || keys.length === 0) return;

    try {
      await this.client.del(keys); // Redis DEL supports variadic arguments
      Logger.info(`[Cache] Deleted ${keys.length} keys`);
    } catch (error) {
      Logger.error(`[Cache] Error deleting ${keys.length} keys:`, error);
    }
  }

  /**
   * Delete all keys matching pattern
   */
  async deletePattern(pattern: string): Promise<void> {
    if (!this.client || !this.isConnected) return;

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
    } catch (error) {
      Logger.error(`[Cache] Error deleting pattern ${pattern}:`, error);
    }
  }

  /**
   * Wrapper for cache-aside pattern
   * 1. Try to get from cache
   * 2. If miss, fetch from DB
   * 3. Store in cache
   * 4. Return result
   */
  async wrap<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl: number = 300
  ): Promise<T> {
    // Try cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Cache miss - fetch from source
    const result = await fetchFn();

    // Store in cache for next time
    await this.set(key, result, ttl);

    return result;
  }

  /**
   * Invalidate cache for a specific company
   */
  async invalidateCompany(companyId: string): Promise<void> {
    await this.deletePattern(`company:${companyId}:*`);
  }

  /**
   * Invalidate cache for a specific user
   */
  async invalidateUser(userId: string): Promise<void> {
    await this.deletePattern(`user:${userId}:*`);
  }
}

// Singleton instance
export const cacheService = new CacheService();

// Auto-connect on import
cacheService.connect().catch((err) => {
  Logger.error("[Cache] Failed to auto-connect:", err);
});
