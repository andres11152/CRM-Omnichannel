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
import { getProxyAgent } from "@/utils/proxy";
import { getEnv } from "@/config/env";

export interface CreateSocketOptions {
  sessionId: string;
  companyId: string;
  state: AuthenticationState;
  sessionStore: SimpleInMemoryStore;
  proxyUrl?: string | null;
  onLoggerError: (sid: string) => void;
}

export class WhatsAppSocketFactory {
  /**
   * Creates and configures a new Baileys WASocket instance with isolation and proxy support.
   */
  static async createSocket(options: CreateSocketOptions): Promise<WASocket> {
    const { sessionId, companyId, state, sessionStore, proxyUrl, onLoggerError } = options;

    // [SEC] RESILIENCE FIX: fetchLatestBaileysVersion makes an external HTTP call.
    // If the network is slow or restricted, it hangs indefinitely causing a 30s server timeout.
    // We race against a 5s timeout and fall back to a known-stable WA version.
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

    // [HISTORY] OPT-IN ONLY. Enabling this makes the phone push the ENTIRE chat history
    // via repeated messaging-history.set bursts. Default is OFF.
    const syncFullHistory = process.env.WA_SYNC_FULL_HISTORY === "true";

    // [SEC] PROXY LIFE-CYCLE: Generate Sticky Session Proxy and apply strict Kill Switch
    const env = getEnv();
    const resolvedProxyUrl = proxyUrl || env.GLOBAL_PROXY_URL;

    let proxyAgent: import("https").Agent | undefined;
    if (resolvedProxyUrl) {
      const agent = getProxyAgent(resolvedProxyUrl, sessionId);
      if (!agent) {
        throw new Error(`[Proxy] CRITICAL: Proxy URL was configured (${resolvedProxyUrl}) but agent could not be created. Aborting socket connection to prevent real IP exposure.`);
      }
      proxyAgent = agent as unknown as import("https").Agent;
    }

    const sock = makeWASocket({
      version,
      auth: state,
      agent: proxyAgent,
      fetchAgent: proxyAgent,
      // Intercept Baileys internal logs to detect corruption
      logger: createSessionLogger(sessionId, (sid) => {
        onLoggerError(sid);
      }) as ReturnType<
        typeof import("pino")
      >,
      // [SEC] FINGERPRINTING: Emulate a clean Windows/Chrome environment instead of leaking custom agent names
      browser: ["Windows", "Chrome", "122.0.0.0"],
      // [SEC] NETWORK FOOTPRINT: Inject browser headers for handshake and media transfers
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
      // Disabling init queries keeps live messaging reliable
      fireInitQueries: false,
      shouldSyncHistoryMessage: () => true,
      getMessage: async (key) => {
        if (!key.id || !key.remoteJid) return undefined;
        try {
          const candidates = [
            sessionStore.messages[key.remoteJid],
            // LID/PN duality: the same chat may be keyed by the alternate JID in the store.
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

    // [PROFILE-PIC FIX] Baileys v7 gates every profilePictureUrl() IQ behind a
    // per-contact "tcToken" (privacy token) built via buildTcTokenFromJid →
    // getLIDForPN. That path is a known upstream bug (WhiskeySockets/Baileys
    // #2498): the tcToken query silently hangs / returns not-authorized, so
    // EVERY contact profile-picture fetch times out and comes back undefined —
    // the whole inbox shows blank avatars. Worse for us: we run with
    // `fireInitQueries: false`, so Baileys never fetches the server AB props
    // that could flip `profilePicPrivacyToken`, leaving it stuck at its
    // hardcoded `true` default forever. Setting it to false here makes
    // profilePictureUrl issue the simple (pre-v7) `<picture query='url'>` IQ
    // with no tcToken — the reliable path that actually returns public photos.
    // WhatsApp still enforces the contact's own privacy server-side, so a
    // "My Contacts only" photo correctly returns undefined (not a leak); we
    // just stop breaking the "Everyone" (public) photos, which is the whole
    // point. See ProfilePictureService / persistContactProfilePic consumers.
    sock.serverProps.profilePicPrivacyToken = false;

    return sock;
  }
}
