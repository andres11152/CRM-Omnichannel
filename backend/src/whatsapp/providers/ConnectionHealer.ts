import { WASocket } from "@whiskeysockets/baileys";
import { sessionModuleLogger as logger } from "./SessionLogger";

/**
 * 🛡️ CONNECTION HEALER
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
  /** Default reconnect delay in ms */
  defaultReconnectDelayMs?: number;
  /** Conflict reconnect delay in ms */
  conflictReconnectDelayMs?: number;
}

const DEFAULT_CONFIG: Required<ConnectionHealerConfig> = {
  heartbeatIntervalMs: 300_000,
  defaultReconnectDelayMs: 5_000,
  conflictReconnectDelayMs: 30_000,
};

export class ConnectionHealer {
  private heartbeatTimers: Map<string, NodeJS.Timeout> = new Map();
  private retryTimeouts: Map<string, NodeJS.Timeout> = new Map();
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

    const timer = setInterval(async () => {
      try {
        if (!isSessionActive()) {
          this.stopHeartbeat(sessionId);
          return;
        }
        if (sock.user?.id) {
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
   * Schedule a reconnection attempt with smart delay.
   * Conflict errors get a longer delay to let the other connection stabilize.
   */
  scheduleReconnect(
    sessionId: string,
    errorMessage: string,
    reconnectFn: ReconnectFn,
  ): void {
    // Cancel any existing retry for this session
    this.cancelReconnect(sessionId);

    const isConflict = errorMessage.toLowerCase().includes("conflict");
    const delayMs = isConflict
      ? this.config.conflictReconnectDelayMs
      : this.config.defaultReconnectDelayMs;

    if (isConflict) {
      logger.warn(
        `[ConnectionHealer] ⚠️ Conflict detected. Waiting ${delayMs}ms before reconnect for ${sessionId}`,
      );
    }

    const timeout = setTimeout(() => {
      this.retryTimeouts.delete(sessionId);
      reconnectFn(sessionId).catch((e) =>
        logger.error(
          `[ConnectionHealer] Reconnect failed for ${sessionId}: ${e}`,
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
    logger.info("[ConnectionHealer] 🛑 All timers destroyed.");
  }

  /** Get stats for monitoring */
  getStats(): { heartbeats: number; pendingReconnects: number } {
    return {
      heartbeats: this.heartbeatTimers.size,
      pendingReconnects: this.retryTimeouts.size,
    };
  }
}
