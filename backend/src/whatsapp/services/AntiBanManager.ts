/**
 * ANTI-BAN MANAGER — Enterprise WhatsApp Anti-Ban per Session
 *
 * Wraps each Baileys socket with baileys-antiban and manages standalone
 * monitoring modules:
 *
 *   wrapSocket          — rate limiting, warmup, timelock guard, contact graph,
 *                         legitimacy signals, group op guard, deaf-session detection
 *   SessionHealthMonitor — Bad MAC decrypt-failure detection (session degradation)
 *   DeliveryTracker      — double-tick delivery rate monitoring (< 60% = soft-ban signal)
 *   HumanEntropyService  — background human-like idle activity (typing, read receipts)
 *   classifyDisconnect   — typed disconnect reason classification
 *   FileStateAdapter     — warmup-state persistence across server restarts
 *
 * Usage (SessionManager):
 *   const wrappedSock = await antiBanManager.initSession(sessionId, rawSock);
 *   // store wrappedSock in sessions Map — sendMessage is automatically protected
 *
 * Usage (SessionEventBinder):
 *   const ab = antiBanManager.getSession(sessionId);
 *   ab?.deliveryTracker.onMessageSent(id);
 *   ab?.healthMonitor.recordDecryptFail(true);
 */

import {
  wrapSocket,
  SessionHealthMonitor,
  DeliveryTracker,
  HumanEntropyService,
  FileStateAdapter,
  classifyDisconnect,
} from "baileys-antiban";
import type {
  AntiBanConfig,
  WrapSocketOptions,
  SessionHealthStats,
  WarmUpState,
} from "baileys-antiban";
import type { WASocket } from "@whiskeysockets/baileys";
import { Logger } from "@/utils/logger";
import * as path from "path";
import * as fs from "fs";

export interface SessionAntibanState {
  healthMonitor: SessionHealthMonitor;
  deliveryTracker: DeliveryTracker;
  entropyService: HumanEntropyService;
}

interface SessionEntry extends SessionAntibanState {
  adapter: FileStateAdapter;
  persistTimer: NodeJS.Timeout;
  /** Access to .antiban for warmup state, disconnect notifications, stats */
  antiban: ReturnType<typeof wrapSocket>["antiban"];
}

class AntiBanManager {
  private readonly registry = new Map<string, SessionEntry>();

  private getStateDir(sessionId: string): string {
    return path.join(process.cwd(), "data", "antiban", sessionId);
  }

  /**
   * Initialise anti-ban protection for a session.
   * Returns a wrapped socket — use it everywhere instead of the raw socket.
   * sendMessage on the wrapped socket is automatically rate-limited and warmup-aware.
   */
  async initSession(sessionId: string, rawSock: WASocket): Promise<WASocket> {
    // Clean up stale entry from a previous connect (reconnect path)
    await this.terminateSession(sessionId, false);

    const stateDir = this.getStateDir(sessionId);
    fs.mkdirSync(stateDir, { recursive: true });
    const adapter = new FileStateAdapter(stateDir);

    // Restore persisted warmup so progress survives restarts
    const warmupState: WarmUpState | null = await adapter
      .load("warmup")
      .catch(() => null);

    const preset =
      (process.env.WA_ANTIBAN_PRESET as
        | "conservative"
        | "moderate"
        | "aggressive"
        | "high-volume") ?? "conservative";

    const antibanConfig: AntiBanConfig = {
      preset,
      logging: process.env.WA_ANTIBAN_LOGGING !== "false",
      onRiskChange: (status: { risk: string; reasons?: string[] }) => {
        const reasons = status.reasons?.join(", ") ?? "no details";
        if (status.risk === "critical" || status.risk === "high") {
          Logger.error(
            `[AntiBan:${sessionId}] Risk ${status.risk}: ${reasons}`,
          );
        } else if (status.risk === "medium") {
          Logger.warn(`[AntiBan:${sessionId}] Risk ${status.risk}: ${reasons}`);
        } else {
          Logger.info(
            `[AntiBan:${sessionId}] Risk back to ${status.risk}: ${reasons}`,
          );
        }
      },
    };

    const wrapOptions: WrapSocketOptions = {
      // Alert when no messages arrive for 5 min while WS keepAlive is still alive
      deafSession: {
        timeoutMs: parseInt(
          process.env.WA_ANTIBAN_DEAF_TIMEOUT_MS ?? "300000",
          10,
        ),
      },
      // Group operation rate limiting (prevents account_reachout_restricted)
      groupOpGuard: {},
      // Inject realistic human-like imperfections (typos, pauses)
      legitimacySignals: { typoProbability: 0.025 },
    };

    const wrapped = wrapSocket(rawSock, antibanConfig, warmupState ?? undefined, wrapOptions);

    // Persist warmup state every 5 minutes
    const persistTimer = setInterval(() => {
      adapter.save("warmup", wrapped.antiban.exportWarmUpState()).catch(() => {});
    }, 5 * 60 * 1000);

    // Bad MAC / session degradation monitor
    const healthMonitor = new SessionHealthMonitor({
      badMacThreshold: 3,
      badMacWindowMs: 60_000,
      onDegraded: (stats: SessionHealthStats) => {
        Logger.error(
          `[AntiBan:${sessionId}] Session DEGRADED — ${stats.badMacCount} Bad MACs in 60s. Triggering reconnect signal.`,
        );
        wrapped.antiban.onDisconnect("bad_mac");
      },
      onRecovered: (stats: SessionHealthStats) => {
        Logger.info(
          `[AntiBan:${sessionId}] Session health recovered (fails: ${stats.decryptFail})`,
        );
        wrapped.antiban.onReconnect();
      },
    });

    // Double-tick delivery rate monitor (< 60% = soft-ban signal)
    const deliveryTracker = new DeliveryTracker({
      lowRateThreshold: 0.6,
      onLowDeliveryRate: (rate: number) => {
        Logger.warn(
          `[AntiBan:${sessionId}] Low delivery rate: ${Math.round(rate * 100)}% — possible soft-ban`,
        );
      },
    });

    interface WaspFacade {
      on(event: string, callback: (event: unknown) => void): void;
      getProvider(sessionId: string): { socket: WASocket };
    }

    // Create a mock WaSP orchestrator facade so HumanEntropyService can bind to socket and events safely
    const mockWasp: WaspFacade = {
      on: (event: string, callback: (event: unknown) => void) => {
        // Safe no-op or message binder
      },
      getProvider: () => ({ socket: rawSock }),
    };

    // Background human-like idle activity
    const entropyService = new HumanEntropyService(mockWasp, sessionId, {
      enabled: process.env.WA_ANTIBAN_ENTROPY !== "false",
      minIntervalMs: 2 * 60 * 60 * 1000, // 2 hours
      maxIntervalMs: 6 * 60 * 60 * 1000, // 6 hours
    });

    this.registry.set(sessionId, {
      healthMonitor,
      deliveryTracker,
      entropyService,
      adapter,
      persistTimer,
      antiban: wrapped.antiban,
    });

    Logger.info(
      `[AntiBan:${sessionId}] Initialized (preset: ${preset}, warmup restored: ${!!warmupState})`,
    );

    return wrapped as unknown as WASocket;
  }

  /** Returns the monitoring state for use in event handlers. */
  getSession(sessionId: string): SessionAntibanState | undefined {
    return this.registry.get(sessionId);
  }

  /** Start background human entropy after session is CONNECTED. */
  startEntropy(sessionId: string): void {
    const entry = this.registry.get(sessionId);
    if (!entry) return;
    entry.entropyService.start();
    Logger.info(`[AntiBan:${sessionId}] HumanEntropyService started`);
  }

  /** Stop entropy service on disconnect / terminate. */
  stopEntropy(sessionId: string): void {
    this.registry.get(sessionId)?.entropyService.stop();
  }

  /** Notify the rate limiter about a disconnect (adjusts health risk). */
  notifyDisconnect(sessionId: string, reason: string | number): void {
    this.registry.get(sessionId)?.antiban.onDisconnect(reason);
  }

  /** Notify the rate limiter after a successful reconnect. */
  notifyReconnect(sessionId: string): void {
    this.registry.get(sessionId)?.antiban.onReconnect();
  }

  /** Get current antiban stats for monitoring / health endpoint. */
  getStats(sessionId: string) {
    return this.registry.get(sessionId)?.antiban.getStats() ?? null;
  }

  /**
   * Tear down anti-ban state for a session.
   * @param save  Persist warmup state before cleanup (false on hot-restart where state
   *              hasn't changed — saves a disk write on reconnect loops).
   */
  async terminateSession(sessionId: string, save = true): Promise<void> {
    const entry = this.registry.get(sessionId);
    if (!entry) return;

    entry.entropyService.stop();
    clearInterval(entry.persistTimer);

    if (save) {
      try {
        await entry.adapter.save("warmup", entry.antiban.exportWarmUpState());
      } catch {
        // shutdown path — best effort
      }
    }

    this.registry.delete(sessionId);
    Logger.info(`[AntiBan:${sessionId}] Terminated`);
  }
}

export const antiBanManager = new AntiBanManager();
export { classifyDisconnect };
