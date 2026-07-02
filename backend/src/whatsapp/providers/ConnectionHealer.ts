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
  private loggedOutRetryCounts: Map<string, number> = new Map();
  // Tracks consecutive heartbeat probe failures per session for zombie detection
  private heartbeatFailures: Map<string, number> = new Map();
  private readonly config: Required<ConnectionHealerConfig>;

  constructor(config?: ConnectionHealerConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ────────────────────────────────────────────────
  // HEARTBEAT
  // ────────────────────────────────────────────────

  /**
   * Start a real-probe heartbeat for a session.
   *
   * Uses `sendPresenceUpdate` (sends an actual WebSocket packet) raced against
   * a 10-second timeout — unlike the old `presenceSubscribe` which returned
   * success even on zombie sockets. After MAX_HEARTBEAT_FAILURES consecutive
   * failures the socket is force-closed, triggering the existing reconnect logic
   * in SessionEventBinder via the `connection.update` close event.
   */
  startHeartbeat(
    sessionId: string,
    sock: WASocket,
    isSessionActive: () => boolean,
  ): void {
    this.stopHeartbeat(sessionId);
    this.heartbeatFailures.set(sessionId, 0);

    const MAX_FAILURES = 2;
    const PROBE_TIMEOUT_MS = 10_000;

    const timer = setInterval(async () => {
      try {
        if (!isSessionActive()) {
          this.stopHeartbeat(sessionId);
          return;
        }

        if (!sock.user?.id) return;

        // Real probe: send a presence packet and race against timeout.
        // presenceSubscribe only subscribes — sendPresenceUpdate actually
        // transmits a packet and will throw/timeout on a dead socket.
        await Promise.race([
          sock.sendPresenceUpdate("available", sock.user.id),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Heartbeat timeout after ${PROBE_TIMEOUT_MS / 1000}s`)),
              PROBE_TIMEOUT_MS,
            ),
          ),
        ]);

        // Probe succeeded — reset failure counter
        const prev = this.heartbeatFailures.get(sessionId) ?? 0;
        if (prev > 0) {
          this.heartbeatFailures.set(sessionId, 0);
          logger.info(`[ConnectionHealer] [HEARTBEAT] Session ${sessionId} recovered after ${prev} failure(s)`);
        }
      } catch (err) {
        const failures = (this.heartbeatFailures.get(sessionId) ?? 0) + 1;
        this.heartbeatFailures.set(sessionId, failures);

        logger.warn(
          `[ConnectionHealer] [HEARTBEAT] Probe failure ${failures}/${MAX_FAILURES} for session ${sessionId}: ` +
          `${err instanceof Error ? err.message : String(err)}`,
        );

        if (failures >= MAX_FAILURES) {
          logger.error(
            `[ConnectionHealer] [ZOMBIE] Session ${sessionId} is unresponsive after ${MAX_FAILURES} ` +
            `consecutive probe failures. Force-closing socket to trigger reconnect.`,
          );
          this.heartbeatFailures.delete(sessionId);
          this.stopHeartbeat(sessionId);
          // Force close → triggers connection.update 'close' → healer.scheduleReconnect
          try { sock.end(new Error("Zombie session detected by heartbeat monitor")); } catch { /* ignore */ }
        }
      }
    }, this.config.heartbeatIntervalMs);

    // Don't prevent clean process shutdown
    timer.unref();
    this.heartbeatTimers.set(sessionId, timer);
  }

  /** Stop heartbeat for a specific session */
  stopHeartbeat(sessionId: string): void {
    const timer = this.heartbeatTimers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(sessionId);
    }
    this.heartbeatFailures.delete(sessionId);
  }

  // ────────────────────────────────────────────────
  // RECONNECT SCHEDULING
  // ────────────────────────────────────────────────

  /**
   * Reset retry count for a session (call on successful connection open)
   */
  resetRetryCount(sessionId: string): void {
    this.retryCounts.set(sessionId, 0);
    this.loggedOutRetryCounts.set(sessionId, 0);
  }

  /**
   * Schedule a reconnection attempt with Exponential Backoff.
   * Prevents banning by avoiding aggressive reconnection loops.
   */
  scheduleReconnect(
    sessionId: string,
    errorMessage: string,
    reconnectFn: ReconnectFn,
    isLoggedOut: boolean = false,
    onLoggedOutExhausted?: () => Promise<void>,
    statusCode?: number,
  ): void {
    this.cancelReconnect(sessionId);

    const currentRetry = this.retryCounts.get(sessionId) || 0;
    // [SEC] 100-YEAR FIX: Baileys' own disconnect message is often a generic
    // "Connection Terminated" even when the underlying reason IS a real
    // stream conflict (statusCode 409/428 — "another device took over").
    // The string-match on `errorMessage` alone missed those, applying the
    // normal (not 3x) backoff and reconnecting as if it were a transient
    // blip — which fights WhatsApp's own conflict resolution and can
    // prolong instability. Prefer the numeric statusCode when available;
    // keep the text match as a fallback for callers that don't pass it.
    const isConflict =
      statusCode === 409 ||
      statusCode === 428 ||
      errorMessage.toLowerCase().includes("conflict");

    if (isLoggedOut) {
      const loggedOutRetries = this.loggedOutRetryCounts.get(sessionId) || 0;
      if (loggedOutRetries >= 5) {
        logger.error(
          `[ConnectionHealer] [FATAL] Session ${sessionId} failed to reconnect after ${loggedOutRetries} consecutive loggedOut (401) attempts. Stopping reconnect loop.`
        );
        this.loggedOutRetryCounts.delete(sessionId);
        if (onLoggedOutExhausted) {
          onLoggedOutExhausted().catch((e) =>
            logger.error(`[ConnectionHealer] Failed to execute onLoggedOutExhausted callback: ${e}`)
          );
        }
        return;
      }
      this.loggedOutRetryCounts.set(sessionId, loggedOutRetries + 1);
    }

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
      `[ConnectionHealer] [SYNC] Scheduling reconnect #${currentRetry + 1} for ${sessionId} in ${Math.round(delayMs / 1000)}s (Conflict: ${isConflict}, LoggedOut Retry: ${isLoggedOut})`,
    );

    const timeout = setTimeout(() => {
      this.retryTimeouts.delete(sessionId);
      this.retryCounts.set(sessionId, currentRetry + 1); // Increment for next time if it fails again
      
      reconnectFn(sessionId).catch((e) => {
        logger.error(
          `[ConnectionHealer] Reconnect attempt failed for ${sessionId}: ${e}. Rescheduling.`,
        );
        // [IMMUNITY RESILIENCE] If reconnectFn throws during execution (e.g. database error, proxy error, DNS timeout),
        // we reschedule the next reconnect using exponential backoff instead of breaking the reconnect loop!
        this.scheduleReconnect(
          sessionId,
          e instanceof Error ? e.message : String(e),
          reconnectFn,
          isLoggedOut,
          onLoggedOutExhausted
        );
      });
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
    this.loggedOutRetryCounts.delete(sessionId);
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
  getStats(): { heartbeats: number; pendingReconnects: number; sessionsWithFailures: number } {
    return {
      heartbeats: this.heartbeatTimers.size,
      pendingReconnects: this.retryTimeouts.size,
      sessionsWithFailures: [...this.heartbeatFailures.values()].filter(f => f > 0).length,
    };
  }
}
