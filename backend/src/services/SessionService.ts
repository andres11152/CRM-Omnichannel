import redisClient from "@/config/redis";
import { Logger } from "@/utils/logger";
import crypto from "crypto";

/**
 * [AUTH] ENTERPRISE SESSION MANAGEMENT SERVICE
 *
 * Redis-backed session store with:
 * - Active session tracking per user
 * - JWT blacklisting for instant revocation
 * - Refresh token management
 * - Device/session metadata
 *
 * Architecture: Repository pattern — this is the ONLY module that touches Redis for sessions.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface SessionMetadata {
  userId: string;
  companyId: string;
  ip: string;
  userAgent: string;
  createdAt: string;
  lastActivity: string;
}

interface CreateSessionInput {
  userId: string;
  companyId: string;
  ip: string;
  userAgent: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const REDIS_PREFIX = {
  SESSION: "session:", // session:{sessionId} -> SessionMetadata
  USER_SESSIONS: "user:sessions:", // user:sessions:{userId} -> Set<sessionId>
  BLACKLIST: "token:blacklist:", // token:blacklist:{jti} -> "1"
  REFRESH: "refresh:", // refresh:{refreshToken} -> { userId, sessionId }
} as const;

const TTL = {
  ACCESS_TOKEN: 15 * 60, // 15 minutes
  REFRESH_TOKEN: 7 * 24 * 3600, // 7 days
  BLACKLIST: 15 * 60, // Match access token TTL (no need to keep longer)
  SESSION: 7 * 24 * 3600, // 7 days (matches refresh token)
} as const;

// ============================================================================
// SESSION SERVICE
// ============================================================================

class SessionService {
  private isAvailable(): boolean {
    return !!redisClient?.isOpen;
  }

  /**
   * [RESILIENCE] Race a Redis operation against a short timeout.
   *
   * A degraded/reconnecting Redis can leave `await redisClient.get()` hanging
   * for the full request timeout (~15s) WITHOUT throwing — so a plain try/catch
   * never fires. That single hang blocks `protect`, taking the entire API down.
   *
   * This wrapper guarantees auth never waits more than `ms` on Redis: on timeout
   * it returns `fallback` (fail-open), so a slow Redis degrades to a cache miss
   * instead of an outage.
   */
  private async withTimeout<T>(
    op: Promise<T>,
    ms: number,
    fallback: T,
  ): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    });
    try {
      return await Promise.race([op, timeout]);
    } finally {
      clearTimeout(timer!);
    }
  }

  // --------------------------------------------------------------------------
  // SESSION LIFECYCLE
  // --------------------------------------------------------------------------

  /**
   * Create a new session when user logs in.
   * Returns sessionId and refreshToken.
   */
  async createSession(input: CreateSessionInput): Promise<{
    sessionId: string;
    refreshToken: string;
  }> {
    const sessionId = crypto.randomUUID();
    const refreshToken = crypto.randomBytes(64).toString("hex");

    if (!this.isAvailable()) {
      Logger.warn(
        "[SessionService] Redis unavailable — session tracking disabled",
      );
      return { sessionId, refreshToken };
    }

    const metadata: SessionMetadata = {
      userId: input.userId,
      companyId: input.companyId,
      ip: input.ip,
      userAgent: input.userAgent,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
    };

    try {
      const pipeline = redisClient!.multi();

      // 1. Store session metadata
      pipeline.hSet(
        `${REDIS_PREFIX.SESSION}${sessionId}`,
        Object.entries(metadata).flat(),
      );
      pipeline.expire(`${REDIS_PREFIX.SESSION}${sessionId}`, TTL.SESSION);

      // 2. Add to user's active sessions set
      pipeline.sAdd(`${REDIS_PREFIX.USER_SESSIONS}${input.userId}`, sessionId);
      pipeline.expire(
        `${REDIS_PREFIX.USER_SESSIONS}${input.userId}`,
        TTL.SESSION,
      );

      // 3. Store refresh token mapping
      pipeline.hSet(`${REDIS_PREFIX.REFRESH}${refreshToken}`, {
        userId: input.userId,
        sessionId,
        companyId: input.companyId,
      });
      pipeline.expire(
        `${REDIS_PREFIX.REFRESH}${refreshToken}`,
        TTL.REFRESH_TOKEN,
      );

      await pipeline.exec();

      Logger.info("[SessionService] [OK] Session created", {
        sessionId: sessionId.substring(0, 8),
        userId: input.userId,
      });
    } catch (error) {
      Logger.error(
        "[SessionService] Failed to create session in Redis",
        error as Error,
      );
      // Non-critical: login still works, just without session tracking
    }

    return { sessionId, refreshToken };
  }

  /**
   * Destroy a specific session (logout).
   * Also blacklists the current access token JTI.
   */
  async destroySession(sessionId: string, jti?: string): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      // Get session metadata to find userId
      const metadata = await redisClient!.hGetAll(
        `${REDIS_PREFIX.SESSION}${sessionId}`,
      );

      if (metadata?.userId) {
        // Remove from user's active sessions
        await redisClient!.sRem(
          `${REDIS_PREFIX.USER_SESSIONS}${metadata.userId}`,
          sessionId,
        );
      }

      // Delete session
      await redisClient!.del(`${REDIS_PREFIX.SESSION}${sessionId}`);

      // Blacklist the access token JTI if provided
      if (jti) {
        await this.blacklistToken(jti);
      }

      Logger.info("[SessionService]  Session destroyed", {
        sessionId: sessionId.substring(0, 8),
      });
    } catch (error) {
      Logger.error(
        "[SessionService] Failed to destroy session",
        error as Error,
      );
    }
  }

  /**
   * Destroy ALL sessions for a user (force logout everywhere).
   * Used for password changes, account compromises, etc.
   */
  async destroyAllSessions(userId: string): Promise<number> {
    if (!this.isAvailable()) return 0;

    try {
      const sessions = await redisClient!.sMembers(
        `${REDIS_PREFIX.USER_SESSIONS}${userId}`,
      );

      if (sessions.length === 0) return 0;

      const pipeline = redisClient!.multi();

      // Delete each session
      for (const sessionId of sessions) {
        pipeline.del(`${REDIS_PREFIX.SESSION}${sessionId}`);
      }

      // Delete the user's session set
      pipeline.del(`${REDIS_PREFIX.USER_SESSIONS}${userId}`);

      await pipeline.exec();

      Logger.info("[SessionService]  All sessions destroyed", {
        userId,
        count: sessions.length,
      });

      return sessions.length;
    } catch (error) {
      Logger.error(
        "[SessionService] Failed to destroy all sessions",
        error as Error,
      );
      return 0;
    }
  }

  // --------------------------------------------------------------------------
  // TOKEN BLACKLIST (Instant Revocation)
  // --------------------------------------------------------------------------

  /**
   * Blacklist a JWT by its JTI (unique identifier).
   * The token will be rejected by the auth middleware.
   */
  async blacklistToken(jti: string): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      await redisClient!.set(`${REDIS_PREFIX.BLACKLIST}${jti}`, "1", {
        EX: TTL.BLACKLIST,
      });
    } catch (error) {
      Logger.error(
        "[SessionService] Failed to blacklist token",
        error as Error,
      );
    }
  }

  /**
   * Check if a token JTI is blacklisted.
   */
  async isTokenBlacklisted(jti: string): Promise<boolean> {
    if (!this.isAvailable()) return false;

    try {
      // [RESILIENCE] Cap the Redis wait at 800ms. A degraded Redis would
      // otherwise hang this await for the full request timeout (~15s) and take
      // down every authenticated endpoint via `protect`. On timeout we fail-open
      // (treat as not blacklisted) — availability over instant revocation.
      const result = await this.withTimeout(
        redisClient!.get(`${REDIS_PREFIX.BLACKLIST}${jti}`),
        800,
        null,
      );
      return result === "1";
    } catch {
      // If Redis errors, allow the request (fail-open for availability)
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // REFRESH TOKEN
  // --------------------------------------------------------------------------

  /**
   * Validate and consume a refresh token.
   * Returns userId and sessionId if valid.
   * Deletes the old refresh token (one-time use).
   */
  async validateRefreshToken(
    refreshToken: string,
  ): Promise<{ userId: string; sessionId: string; companyId: string } | null> {
    if (!this.isAvailable()) return null;

    try {
      const key = `${REDIS_PREFIX.REFRESH}${refreshToken}`;
      const data = await redisClient!.hGetAll(key);

      if (!data?.userId || !data?.sessionId) {
        return null;
      }

      // Delete the consumed refresh token (prevent replay)
      await redisClient!.del(key);

      return {
        userId: data.userId,
        sessionId: data.sessionId,
        companyId: data.companyId,
      };
    } catch (error) {
      Logger.error(
        "[SessionService] Failed to validate refresh token",
        error as Error,
      );
      return null;
    }
  }

  /**
   * Issue a new refresh token for an existing session.
   * Called after consuming the old one during token rotation.
   */
  async rotateRefreshToken(
    sessionId: string,
    userId: string,
    companyId: string,
  ): Promise<string> {
    const newRefreshToken = crypto.randomBytes(64).toString("hex");

    if (!this.isAvailable()) return newRefreshToken;

    try {
      await redisClient!.hSet(`${REDIS_PREFIX.REFRESH}${newRefreshToken}`, {
        userId,
        sessionId,
        companyId,
      });
      await redisClient!.expire(
        `${REDIS_PREFIX.REFRESH}${newRefreshToken}`,
        TTL.REFRESH_TOKEN,
      );

      // Update session last activity
      await redisClient!.hSet(`${REDIS_PREFIX.SESSION}${sessionId}`, {
        lastActivity: new Date().toISOString(),
      });
    } catch (error) {
      Logger.error(
        "[SessionService] Failed to rotate refresh token",
        error as Error,
      );
    }

    return newRefreshToken;
  }

  // --------------------------------------------------------------------------
  // SESSION QUERIES
  // --------------------------------------------------------------------------

  /**
   * Get all active sessions for a user (for "Active Sessions" UI).
   */
  async getUserSessions(
    userId: string,
  ): Promise<(SessionMetadata & { id: string })[]> {
    if (!this.isAvailable()) return [];

    try {
      const sessionIds = await redisClient!.sMembers(
        `${REDIS_PREFIX.USER_SESSIONS}${userId}`,
      );

      const sessions: (SessionMetadata & { id: string })[] = [];

      for (const sessionId of sessionIds) {
        const data = await redisClient!.hGetAll(
          `${REDIS_PREFIX.SESSION}${sessionId}`,
        );
        if (data?.userId) {
          sessions.push({
            id: sessionId,
            userId: data.userId,
            companyId: data.companyId,
            ip: data.ip,
            userAgent: data.userAgent,
            createdAt: data.createdAt,
            lastActivity: data.lastActivity,
          });
        }
      }

      return sessions;
    } catch (error) {
      Logger.error(
        "[SessionService] Failed to get user sessions",
        error as Error,
      );
      return [];
    }
  }
}

// Singleton export
export const sessionService = new SessionService();

// Export TTLs for use in auth controller
export const SESSION_TTL = TTL;

