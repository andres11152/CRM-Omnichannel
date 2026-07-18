import { WASocket } from "@whiskeysockets/baileys";
import { sessionModuleLogger as logger } from "./SessionLogger";

type ReconnectFn = (sessionId: string) => Promise<void>;

export interface ConnectionHealerConfig {
  heartbeatIntervalMs?: number;
  baseReconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
}

const DEFAULT_CONFIG: Required<ConnectionHealerConfig> = {
  heartbeatIntervalMs: 300_000,
  baseReconnectDelayMs: 5_000,
  maxReconnectDelayMs: 600_000,
};

export class ConnectionHealer {
  private heartbeatTimers: Map<string, NodeJS.Timeout> = new Map();
  private retryTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private retryCounts: Map<string, number> = new Map();
  private loggedOutRetryCounts: Map<string, number> = new Map();
  private heartbeatFailures: Map<string, number> = new Map();
  private readonly config: Required<ConnectionHealerConfig>;

  constructor(config?: ConnectionHealerConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

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

        await Promise.race([
          sock.sendPresenceUpdate("available", sock.user.id),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Heartbeat timeout after ${PROBE_TIMEOUT_MS / 1000}s`)),
              PROBE_TIMEOUT_MS,
            ),
          ),
        ]);

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
          try { sock.end(new Error("Zombie session detected by heartbeat monitor")); } catch { /* ignore */ }
        }
      }
    }, this.config.heartbeatIntervalMs);

    timer.unref();
    this.heartbeatTimers.set(sessionId, timer);
  }

  stopHeartbeat(sessionId: string): void {
    const timer = this.heartbeatTimers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(sessionId);
    }
    this.heartbeatFailures.delete(sessionId);
  }

  resetRetryCount(sessionId: string): void {
    this.retryCounts.set(sessionId, 0);
    this.loggedOutRetryCounts.set(sessionId, 0);
  }

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

    const penaltyFactor = isConflict ? 3 : 1; 
    let delayMs = this.config.baseReconnectDelayMs * Math.pow(2, currentRetry) * penaltyFactor;

    if (delayMs > this.config.maxReconnectDelayMs) {
      delayMs = this.config.maxReconnectDelayMs;
    }

    delayMs += Math.random() * (delayMs * 0.1);

    logger.warn(
      `[ConnectionHealer] [SYNC] Scheduling reconnect #${currentRetry + 1} for ${sessionId} in ${Math.round(delayMs / 1000)}s (Conflict: ${isConflict}, LoggedOut Retry: ${isLoggedOut})`,
    );

    const timeout = setTimeout(() => {
      this.retryTimeouts.delete(sessionId);
      this.retryCounts.set(sessionId, currentRetry + 1);
      
      reconnectFn(sessionId).catch((e) => {
        logger.error(
          `[ConnectionHealer] Reconnect attempt failed for ${sessionId}: ${e}. Rescheduling.`,
        );
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

  cancelReconnect(sessionId: string): void {
    const timeout = this.retryTimeouts.get(sessionId);
    if (timeout) {
      clearTimeout(timeout);
      this.retryTimeouts.delete(sessionId);
    }
  }

  hasReconnectPending(sessionId: string): boolean {
    return this.retryTimeouts.has(sessionId);
  }

  cleanupSession(sessionId: string): void {
    this.stopHeartbeat(sessionId);
    this.cancelReconnect(sessionId);
    this.loggedOutRetryCounts.delete(sessionId);
  }

  destroy(): void {
    for (const [sessionId] of this.heartbeatTimers) {
      this.stopHeartbeat(sessionId);
    }
    for (const [sessionId] of this.retryTimeouts) {
      this.cancelReconnect(sessionId);
    }
    logger.info("[ConnectionHealer] All timers destroyed.");
  }

  getStats(): { heartbeats: number; pendingReconnects: number; sessionsWithFailures: number } {
    return {
      heartbeats: this.heartbeatTimers.size,
      pendingReconnects: this.retryTimeouts.size,
      sessionsWithFailures: [...this.heartbeatFailures.values()].filter(f => f > 0).length,
    };
  }
}
