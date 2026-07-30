import {
  wrapSocket,
  SessionHealthMonitor,
  DeliveryTracker,
  HumanEntropyService,
  classifyDisconnect,
} from "baileys-antiban";
import type {
  AntiBanConfig,
  WrapSocketOptions,
  SessionHealthStats,
  WarmUpState,
} from "baileys-antiban";
import type { WASocket } from "@whiskeysockets/baileys";
import { Logger } from "../utils/logger";
import { PrismaAntiBanStateAdapter } from "./PrismaAntiBanStateAdapter";

export interface SessionAntibanState {
  healthMonitor: SessionHealthMonitor;
  deliveryTracker: DeliveryTracker;
  entropyService: HumanEntropyService;
}

interface SessionEntry extends SessionAntibanState {
  adapter: PrismaAntiBanStateAdapter;
  persistTimer: NodeJS.Timeout;
  antiban: ReturnType<typeof wrapSocket>["antiban"];
}

class AntiBanManager {
  private readonly registry = new Map<string, SessionEntry>();

  async initSession(sessionId: string, rawSock: WASocket): Promise<WASocket> {
    await this.terminateSession(sessionId, false);

    const adapter = new PrismaAntiBanStateAdapter(sessionId);

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
      deafSession: {
        // [SEC] Was 300000 (5min) — baileys-antiban's DeafSessionDetector only
        // resets its silence timer from inside its own internal event-buffer
        // `.process()` listener (see node_modules/baileys-antiban/dist/cjs/
        // wrapper.js), a SEPARATE listener chain from SessionEventBinder's own
        // `.on('messages.upsert'/'messages.update', ...)` handlers — the ones
        // actually proven working in prod (inbound messages ARE processed and
        // enqueued correctly). Observed live: a session with real inbound/
        // outbound traffic flowing throughout was still killed at EXACTLY
        // 300000ms of wall-clock uptime (22:58:09.436 connect →
        // 23:03:09.445 close, delta 5:00.009), i.e. the detector's silence
        // timer was never actually being reset by that traffic. Whether that's
        // an upstream library/event-buffer interaction bug, every 5-minute
        // forced reconnect: (a) is pure unnecessary churn on a healthy
        // connection, (b) collides with any fetchMessageHistory in flight
        // (whose own wait window is up to 20s — see ChatSyncIngest.ts), and
        // (c) is the trigger for the reconnect-cycle race that can leave a
        // session unrecoverable (see the DB-row-grace-period fix in
        // WhatsAppEventWiring.ts). Until the detector's activity wiring is
        // confirmed reliable, use a much less trigger-happy default.
        timeoutMs: parseInt(
          process.env.WA_ANTIBAN_DEAF_TIMEOUT_MS ?? "1800000",
          10,
        ),
      },
      groupOpGuard: {},
      legitimacySignals: { typoProbability: 0.025 },
    };

    const wrapped = wrapSocket(rawSock, antibanConfig, warmupState ?? undefined, wrapOptions);

    const persistTimer = setInterval(() => {
      adapter.save("warmup", wrapped.antiban.exportWarmUpState()).catch(() => {});
    }, 5 * 60 * 1000);

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

    const mockWasp: WaspFacade = {
      on: (event: string, callback: (event: unknown) => void) => {},
      getProvider: () => ({ socket: rawSock }),
    };

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

  getSession(sessionId: string): SessionAntibanState | undefined {
    return this.registry.get(sessionId);
  }

  startEntropy(sessionId: string): void {
    const entry = this.registry.get(sessionId);
    if (!entry) return;
    entry.entropyService.start();
    Logger.info(`[AntiBan:${sessionId}] HumanEntropyService started`);
  }

  stopEntropy(sessionId: string): void {
    this.registry.get(sessionId)?.entropyService.stop();
  }

  notifyDisconnect(sessionId: string, reason: string | number): void {
    this.registry.get(sessionId)?.antiban.onDisconnect(reason);
  }

  notifyReconnect(sessionId: string): void {
    this.registry.get(sessionId)?.antiban.onReconnect();
  }

  getStats(sessionId: string) {
    return this.registry.get(sessionId)?.antiban.getStats() ?? null;
  }

  async terminateSession(sessionId: string, save = true): Promise<void> {
    const entry = this.registry.get(sessionId);
    if (!entry) return;

    entry.entropyService.stop();
    clearInterval(entry.persistTimer);

    if (save) {
      try {
        await entry.adapter.save("warmup", entry.antiban.exportWarmUpState());
      } catch {
        // ignore
      }
    }

    this.registry.delete(sessionId);
    Logger.info(`[AntiBan:${sessionId}] Terminated`);
  }
}

export const antiBanManager = new AntiBanManager();
export { classifyDisconnect };
