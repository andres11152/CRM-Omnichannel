import makeWASocket, {
  WASocket,
  AuthenticationState,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  proto,
} from "@whiskeysockets/baileys";
import { SimpleInMemoryStore } from "./SimpleStore";
import { createSessionLogger, sessionModuleLogger as logger } from "./SessionLogger";
import NodeCache from "node-cache";
import { getProxyAgent } from "../utils/proxy";

export interface CreateSocketOptions {
  sessionId: string;
  companyId: string;
  state: AuthenticationState;
  sessionStore: SimpleInMemoryStore;
  proxyUrl?: string | null;
  onLoggerError: (sid: string) => void;
}

export class WhatsAppSocketFactory {
  static async createSocket(options: CreateSocketOptions): Promise<WASocket> {
    const { sessionId, companyId, state, sessionStore, proxyUrl, onLoggerError } = options;

    const FALLBACK_WA_VERSION: [number, number, number] = [2, 3000, 1023480872];
    let version: [number, number, number] = FALLBACK_WA_VERSION;
    let isLatest = false;
    try {
      const versionResult = await Promise.race([
        fetchLatestBaileysVersion(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Timeout")),
            5000,
          ),
        ),
      ]);
      version = versionResult.version as [number, number, number];
      isLatest = versionResult.isLatest;
    } catch (vErr) {
      logger.warn(
        `[WhatsAppSocketFactory] Could not fetch latest WA version (${(vErr as Error).message}). Using fallback: ${FALLBACK_WA_VERSION.join(".")}`,
      );
    }
    logger.info(
      `[WhatsAppSocketFactory] Using WA v${version.join(".")}, isLatest: ${isLatest}`,
    );

    const syncFullHistory = process.env.WA_SYNC_FULL_HISTORY === "true";
    const resolvedProxyUrl = proxyUrl || process.env.GLOBAL_PROXY_URL;

    let proxyAgent: import("https").Agent | undefined;
    if (resolvedProxyUrl) {
      const agent = getProxyAgent(resolvedProxyUrl, sessionId);
      if (!agent) {
        throw new Error(`[Proxy] CRITICAL: Proxy Agent could not be created.`);
      }
      proxyAgent = agent as unknown as import("https").Agent;
    }

    const sock = makeWASocket({
      version,
      auth: state,
      agent: proxyAgent,
      fetchAgent: proxyAgent,
      logger: createSessionLogger(sessionId, (sid) => {
        onLoggerError(sid);
      }) as ReturnType<
        typeof import("pino")
      >,
      browser: ["Windows", "Chrome", "122.0.0.0"],
      options: {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
          "Cache-Control": "no-cache",
          "Pragma": "no-cache",
        },
      },
      generateHighQualityLinkPreview: true,
      syncFullHistory,
      msgRetryCounterCache: new NodeCache(),
      shouldIgnoreJid: (jid) => isJidBroadcast(jid),
      fireInitQueries: false,
      shouldSyncHistoryMessage: () => true,
      getMessage: async (key) => {
        if (!key.id || !key.remoteJid) return undefined;
        try {
          const candidates = [
            sessionStore.messages[key.remoteJid],
            ...Object.values(sessionStore.messages),
          ];
          for (const arr of candidates) {
            if (!arr) continue;
            const found = arr.find(
              (m) => (m as proto.IWebMessageInfo)?.key?.id === key.id,
            );
            if (found?.message) return (found as proto.IWebMessageInfo).message as proto.IMessage;
          }
          return undefined;
        } catch (err) {
          logger.error(
            `[WhatsAppSocketFactory] getMessage error for ${key.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
          return undefined;
        }
      },
    });

    sock.serverProps.profilePicPrivacyToken = false;

    return sock;
  }
}
