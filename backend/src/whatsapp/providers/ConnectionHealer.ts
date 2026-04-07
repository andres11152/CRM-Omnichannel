import { WASocket } from "@whiskeysockets/baileys";
import { sessionModuleLogger as logger } from "./SessionLogger";

/**
 * [SEC] CONNECTION HEALER
 *
 * Manages reconnection logic, heartbeat timers, and retry timeouts
 * for WhatsApp sessions. Extracted from SessionManager for SRP compliance.
 *
 * Responsibilities:
 * - Heartbeat (keep-alive pings every 5 min)
 * - Reconnection retry timers with backoff
 * - Conflict-aware delay (Stream Replaced / multi-device)
 */

/** Callback signature for the actual reconnect action */
type ReconnectFn = (sessionId: string) => Promise<void>;

export interface ConnectionHealerConfig {
  /** Heartbeat interval in ms (default: 300_000 = 5 min) */
  heartbeatIntervalMs?: number;
  /** Initial reconnect delay in ms (default: 5_000) */
  baseReconnectDelayMs?: number;
  /** Max delay for backoff in ms (default: 600_000 = 10 min) */
  maxReconnectDelayMs?: number;
}

const DEFAULT_CONFIG: Required<ConnectionHealerConfig> = {
  heartbeatIntervalMs: 300_000,
  baseReconnectDelayMs: 5_000,
  maxReconnectDelayMs: 600_000, // 10 minutes max wait
};

export class ConnectionHealer {
  private heartbeatTimers: Map<string, NodeJS.Timeout> = new Map();
  private retryTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private retryCounts: Map<string, number> = new Map();
  private readonly config: Required<ConnectionHealerConfig>;

  constructor(config?: ConnectionHealerConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ────────────────────────────────────────────────
  // HEARTBEAT
  // ────────────────────────────────────────────────

  /**
   * Start periodic keep-alive pings for a session.
   * Prevents WhatsApp from closing the connection due to inactivity.
   */
  startHeartbeat(
    sessionId: string,
    sock: WASocket,
    isSessionActive: () => boolean,
  ): void {
    this.stopHeartbeat(sessionId);
    // On successful heartbeat start, we assume connectivity is better
    // but don't reset retryCount here (done in SessionManager on open)

    const timer = setInterval(async () => {
      try {
        if (!isSessionActive()) {
          this.stopHeartbeat(sessionId);
          return;
        }
        if (sock.user?.id) {
          // Presence subscribe acts as a "ping" to keep the socket warm
          await sock.presenceSubscribe(sock.user.id).catch(() => {});
        }
      } catch {
        // Heartbeat errors are non-fatal
      }
    }, this.config.heartbeatIntervalMs);

    this.heartbeatTimers.set(sessionId, timer);
  }

  /** Stop heartbeat for a specific session */
  stopHeartbeat(sessionId: string): void {
    const timer = this.heartbeatTimers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(sessionId);
    }
  }

  // ────────────────────────────────────────────────
  // RECONNECT SCHEDULING
  // ────────────────────────────────────────────────

  /**
   * Reset retry count for a session (call on successful connection open)
   */
  resetRetryCount(sessionId: string): void {
    this.retryCounts.set(sessionId, 0);
  }

  /**
   * Schedule a reconnection attempt with Exponential Backoff.
   * Prevents banning by avoiding aggressive reconnection loops.
   */
  scheduleReconnect(
    sessionId: string,
    errorMessage: string,
    reconnectFn: ReconnectFn,
  ): void {
    this.cancelReconnect(sessionId);

    const currentRetry = this.retryCounts.get(sessionId) || 0;
    const isConflict = errorMessage.toLowerCase().includes("conflict");

    // Strategy: Base * 2^retry + (Jitter)
    // Retry 0: 5s
    // Retry 1: 10s
    // Retry 2: 20s
    // ...
    // Conflict doubles the base penalty
    const penaltyFactor = isConflict ? 3 : 1; 
    let delayMs = this.config.baseReconnectDelayMs * Math.pow(2, currentRetry) * penaltyFactor;

    // Cap the delay
    if (delayMs > this.config.maxReconnectDelayMs) {
      delayMs = this.config.maxReconnectDelayMs;
    }

    // Add 10% jitter to avoid thundering herd problem
    delayMs += Math.random() * (delayMs * 0.1);

    logger.warn(
      `[ConnectionHealer] [SYNC] Scheduling reconnect #${currentRetry + 1} for ${sessionId} in ${Math.round(delayMs / 1000)}s (Conflict: ${isConflict})`,
    );

    const timeout = setTimeout(() => {
      this.retryTimeouts.delete(sessionId);
      this.retryCounts.set(sessionId, currentRetry + 1); // Increment for next time if it fails again
      
      reconnectFn(sessionId).catch((e) =>
        logger.error(
          `[ConnectionHealer] Reconnect attempt failed for ${sessionId}: ${e}`,
        ),
      );
    }, delayMs);

    this.retryTimeouts.set(sessionId, timeout);
  }

  /** Cancel a pending reconnect for a session */
  cancelReconnect(sessionId: string): void {
    const timeout = this.retryTimeouts.get(sessionId);
    if (timeout) {
      clearTimeout(timeout);
      this.retryTimeouts.delete(sessionId);
    }
  }

  /** Check if a reconnect is already pending */
  hasReconnectPending(sessionId: string): boolean {
    return this.retryTimeouts.has(sessionId);
  }

  // ────────────────────────────────────────────────
  // CLEANUP
  // ────────────────────────────────────────────────

  /**
   * Full cleanup of all timers for a specific session.
   * Called when a session is terminated.
   */
  cleanupSession(sessionId: string): void {
    this.stopHeartbeat(sessionId);
    this.cancelReconnect(sessionId);
  }

  /**
   * Destroy all timers for all sessions (shutdown).
   */
  destroy(): void {
    for (const [sessionId] of this.heartbeatTimers) {
      this.stopHeartbeat(sessionId);
    }
    for (const [sessionId] of this.retryTimeouts) {
      this.cancelReconnect(sessionId);
    }
    logger.info("[ConnectionHealer]  All timers destroyed.");
  }

  /** Get stats for monitoring */
  getStats(): { heartbeats: number; pendingReconnects: number } {
    return {
      heartbeats: this.heartbeatTimers.size,
      pendingReconnects: this.retryTimeouts.size,
    };
  }
}
