// src/services/whatsapp.service.ts
import makeWASocket, {
  DisconnectReason,
  WASocket,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import { PrismaClient } from "@prisma/client";
import { EventEmitter } from "events";
import path from "path";
import { mkdir, writeFile, rm } from "fs/promises";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import { Logger } from "@/utils/logger";
import { useRedisAuthState } from "./baileysRedisAuth";
import { gateway } from "@/gateways/socketGateway";
import redisClient from "@/config/redis";
import { phoneNumberSchema } from "@/utils/validators";

const prisma = new PrismaClient();

/**
 * WhatsApp Service Singleton
 * Manages all Baileys instances, lifecycle, and external communication.
 */
export class WhatsAppService extends EventEmitter {
  private sessions: Map<string, WASocket> = new Map();
  // Store retry counts to prevent infinite loops on specific errors (Self-Healing)
  private retryCounts: Map<string, number> = new Map();
  private MAX_RETRIES = 5;

  constructor() {
    super();
  }

  /**
   * Initializes all sessions that are marked as ACTIVE/CONNECTED in DB.
   * Called on server startup.
   */
  public async initialize() {
    console.log("[WhatsApp] 🔧 Initializing all sessions...");
    // Try to connect to Redis if available, but don't block if it fails
    if (redisClient && !redisClient.isOpen) {
      try {
        await redisClient.connect();
      } catch (err) {
        console.warn("[WhatsApp] Redis unavailable, using file-based auth");
      }
    }
    await this.initializeAllSessions();
    console.log("[WhatsApp] ✅ Initialization complete");
  }

  private async initializeAllSessions() {
    // Only fetch sessions that shouldn't be dead
    const sessions = await prisma.whatsAppSession.findMany({
      where: { status: { not: "DISCONNECTED" } },
    });
    console.log(`[WhatsApp] Found ${sessions.length} active session(s) in DB`);
    for (const s of sessions) {
      console.log(`[WhatsApp] Initializing session: ${s.sessionId}`);
      this.initializeSession(s.sessionId).catch((e) =>
        console.error(`[WhatsApp] Failed to resume session ${s.sessionId}:`, e)
      );
    }
  }

  // Lock mechanism to prevent race conditions during init
  private initializingSessions: Set<string> = new Set();

  /**
   * Starts a specific session.
   * Handles authentication, connection logic, and event listeners.
   */
  public async initializeSession(sessionId: string) {
    if (this.initializingSessions.has(sessionId)) {
      Logger.warn(
        `[WhatsApp] Session ${sessionId} is already initializing. Skipping race condition.`
      );
      return;
    }
    this.initializingSessions.add(sessionId);

    try {
      Logger.info(`[WhatsApp] Starting session: ${sessionId}`);

      // 🛑 CRITICAL: CLEANUP OLD SESSION TO PREVENT EVENT STORMING
      const existingSock = this.sessions.get(sessionId);
      if (existingSock) {
        Logger.warn(
          `[WhatsApp] ♻️ Cleaning up existing socket for ${sessionId} before restart`
        );
        try {
          existingSock.ev.removeAllListeners("connection.update");
          existingSock.ev.removeAllListeners("creds.update");
          existingSock.ev.removeAllListeners("messages.upsert");
          existingSock.end(undefined);
        } catch (e) {
          Logger.warn(`[WhatsApp] Error closing old socket: ${e}`);
        }
        this.sessions.delete(sessionId);
      }

      const { state, saveCreds } = await useRedisAuthState(sessionId);
      const { version } = await fetchLatestBaileysVersion();

      const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false, // We use socket.io for rendering
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        emitOwnEvents: false,
        retryRequestDelayMs: 250,
        markOnlineOnConnect: true,
        // Emulate a standard browser to avoid suspicious activity flags
        browser: ["Reply CRM", "Chrome", "10.0.0"],
      });

      this.sessions.set(sessionId, sock);

      // --- EVENTS ---

      // 1. Credentials Update (Persist to Redis)
      sock.ev.on("creds.update", saveCreds);

      // 2. Connection Update (The Core Logic)
      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;
        const io = gateway.getIO();

        // Handle QR Code Generation
        if (qr) {
          Logger.info(`[WhatsApp] QR Generated for ${sessionId}`);

          await prisma.whatsAppSession.update({
            where: { sessionId },
            data: { qrCode: qr, status: "SCANNING" },
          });

          io?.emit("qr.updated", { sessionId, qr });
          io?.emit("session.status", { sessionId, status: "SCANNING" });
        }

        // Handle Connection Success
        if (connection === "open") {
          Logger.info(`[WhatsApp] ✅ Session ${sessionId} CONNECTED`);
          this.retryCounts.delete(sessionId); // Reset retries on success

          const user = sock.user;
          const phone = user?.id?.split(":")[0];

          await prisma.whatsAppSession.update({
            where: { sessionId },
            data: {
              status: "CONNECTED",
              phone: phone || undefined,
              qrCode: null,
            },
          });

          io?.emit("session.status", {
            sessionId,
            status: "CONNECTED",
            phone,
          });
        }

        // Handle Connection Close/Failure
        if (connection === "close") {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const errorMsg = (lastDisconnect?.error as any)?.message || "";

          // CRITICAL FIX: Detect QR Timeout (408) or explicit timeout error
          const isTimeout =
            statusCode === 408 || errorMsg.includes("QR refs attempts ended");

          if (isTimeout) {
            Logger.warn(
              `[WhatsApp] 🛑 QR Code expired or process timed out for ${sessionId}. Stopping loop.`
            );
            await this.handleSessionFailure(sessionId);
            // DO NOT RECONNECT AUTOMATICALLY
            return;
          }

          // Normal Reconnection Logic
          const shouldReconnect =
            statusCode !== DisconnectReason.loggedOut &&
            statusCode !== 401 &&
            statusCode !== 403;

          Logger.warn(
            `[WhatsApp] ❌ Connection closed for ${sessionId}. Code: ${statusCode}. Reconnect: ${shouldReconnect}`
          );

          // Remove listeners immediately
          sock.ev.removeAllListeners("connection.update");
          sock.ev.removeAllListeners("messages.upsert");

          if (shouldReconnect) {
            const retries = this.retryCounts.get(sessionId) || 0;
            if (retries < this.MAX_RETRIES) {
              this.retryCounts.set(sessionId, retries + 1);
              const delay = Math.min(retries * 2000, 10000) || 1000;
              setTimeout(() => this.initializeSession(sessionId), delay);
            } else {
              Logger.error(
                `[WhatsApp] Max retries reached for ${sessionId}. Marking as DISCONNECTED.`
              );
              await this.handleSessionFailure(sessionId);
            }
          } else {
            // Fatal Error
            Logger.warn(
              `[WhatsApp] Session ${sessionId} logged out or invalid. Cleaning up.`
            );
            await this.handleSessionFailure(sessionId);
            await this.clearSessionData(sessionId);
          }
        }
      });

      // 3. Message Handling
      sock.ev.on("messages.upsert", async (m) => {
        Logger.info(
          `[WhatsApp Debug] 📨 messages.upsert received. Type: ${m.type}. Count: ${m.messages.length}`
        );

        // Log the raw structure of the first message to see what we are dealing with
        if (m.messages.length > 0) {
          console.log(
            "[WhatsApp Debug] Raw Message Structure:",
            JSON.stringify(m.messages[0], null, 2)
          );
        }

        if (m.type === "notify" || m.type === "append") {
          for (const msg of m.messages) {
            if (!msg.message) {
              Logger.warn(
                "[WhatsApp Debug] Message has no content (msg.message is undefined). Skipping."
              );
              continue;
            }
            await this.handleIncomingMessage(msg, sessionId);
          }
        }
      });
    } catch (error) {
      Logger.error(
        `[WhatsApp] Fatal error initializing session ${sessionId}`,
        error
      );
      this.handleSessionFailure(sessionId);
    } finally {
      this.initializingSessions.delete(sessionId);
    }
  }

  // --- Helpers ---

  private async handleSessionFailure(sessionId: string) {
    try {
      await prisma.whatsAppSession.update({
        where: { sessionId },
        data: { status: "DISCONNECTED", qrCode: null },
      });
    } catch (e) {
      // Ignore if record already deleted
    }
    this.sessions.delete(sessionId);
    gateway
      .getIO()
      ?.emit("session.status", { sessionId, status: "DISCONNECTED" });
  }

  private async clearSessionData(sessionId: string) {
    const REDIS_KEY = `wa:auth:${sessionId}`;
    if (redisClient?.isOpen) {
      try {
        await redisClient.del(REDIS_KEY);
      } catch (err) {
        Logger.warn("[WhatsApp] Failed to clear Redis data (non-critical)");
      }
    }
    // await prisma.whatsAppSession.delete... // Optional
  }

  /**
   * Process Incoming Message
   */
  private async handleIncomingMessage(msg: any, sessionId: string) {
    try {
      // ✅ SMART JID SELECTION: Fix for LID/Ghost numbers
      // Prioritize remoteJidAlt (real phone) -> participant -> remoteJid
      // This ensures we get the usable phone number instead of the Technical LID
      let jidToProcess =
        (msg.key as any).remoteJidAlt ||
        msg.key?.participant ||
        msg.key?.remoteJid;

      console.log("🎯 SELECTED JID TO PROCESS:", jidToProcess);

      if (!jidToProcess || jidToProcess === "status@broadcast") {
        if (jidToProcess !== "status@broadcast") {
          console.warn(
            "[WhatsApp Debug] ⚠️ Skipping processing because JID could not be resolved or is invalid:",
            msg.key
          );
        }
        return;
      }

      const remoteJid = jidToProcess;

      const isOutbound = msg.key?.fromMe === true;

      // Extract basic content
      let text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        "";
      let mediaType = "";
      let mimeType = "";

      if (msg.message?.imageMessage) {
        mediaType = "image";
        mimeType = msg.message.imageMessage.mimetype;
        text = msg.message.imageMessage.caption || text;
      } else if (msg.message?.videoMessage) {
        mediaType = "video";
        mimeType = msg.message.videoMessage.mimetype;
        text = msg.message.videoMessage.caption || text;
      } else if (msg.message?.documentMessage) {
        mediaType = "document";
        mimeType = msg.message.documentMessage.mimetype;
        text = msg.message.documentMessage.caption || text;
      } else if (msg.message?.audioMessage) {
        mediaType = "audio";
        mimeType = msg.message.audioMessage.mimetype;
      }

      if (!text && !mediaType) return; // Ignore protocol messages

      // Resolve Session Record
      const sessionRecord = await prisma.whatsAppSession.findUnique({
        where: { sessionId },
      });
      if (!sessionRecord) return;

      let mediaInfo = undefined;
      // Handle Media Download
      if (mediaType) {
        try {
          const buffer = (await downloadMediaMessage(
            msg,
            "buffer",
            {},
            { logger: console as any, reuploadRequest: sessionRecord.id as any }
          )) as Buffer;

          if (buffer) {
            const uploadDir = path.join(
              process.cwd(),
              "public",
              "uploads",
              sessionRecord.companyId
            );
            await mkdir(uploadDir, { recursive: true });

            const ext = mimeType?.split("/")[1]?.split(";")[0] || "bin";
            const filename = `${Date.now()}_${Math.random()
              .toString(36)
              .substring(7)}.${ext}`;
            const filePath = path.join(uploadDir, filename);

            await writeFile(filePath, buffer);
            const publicUrl = `/uploads/${sessionRecord.companyId}/${filename}`;

            mediaInfo = {
              url: publicUrl,
              type: mediaType,
              mimetype: mimeType,
              caption: text,
            };

            if (!text) text = `[${mediaType.toUpperCase()}]`;
          }
        } catch (e) {
          Logger.error("Failed to download media", e);
        }
      }

      // Delegate to Message Processor
      const { messageProcessor } = await import("./messageProcessor.service");
      await messageProcessor.process({
        companyId: sessionRecord.companyId,
        sessionId,
        remoteJid,
        text: text || `[${mediaType.toUpperCase()}]`,
        isOutbound,
        contactName: msg.pushName,
        hasMedia: !!mediaInfo,
        media: mediaInfo,
      });
    } catch (err) {
      Logger.error("Error handling message", err);
    }
  }

  // --- PUBLIC ADMINISTRATIVE METHODS (Restored) ---

  /**
   * List all sessions for a company with real-time status
   */
  public async listSessions(companyId: string) {
    const sessions = await prisma.whatsAppSession.findMany({
      where: { companyId },
    });

    return sessions.map((s) => ({
      ...s,
      isConnected: this.sessions.has(s.sessionId) && s.status === "CONNECTED",
    }));
  }

  /**
   * Create (or re-initialize) a session manually
   */
  public async createSession(companyId: string, sessionId?: string) {
    const id = sessionId || `session_${companyId}_${Date.now()}`;

    // Create/Upsert DB Record
    await prisma.whatsAppSession.upsert({
      where: { sessionId: id },
      update: { status: "DISCONNECTED", companyId },
      create: { sessionId: id, companyId, status: "DISCONNECTED" },
    });

    // Start
    this.initializeSession(id);
    return id;
  }

  /**
   * Delete and Disconnect a session
   */
  public async deleteSession(sessionId: string) {
    const sock = this.sessions.get(sessionId);
    if (sock) {
      try {
        sock.end(undefined);
        this.sessions.delete(sessionId);
      } catch (e) {
        Logger.error(`[WhatsApp] Error disconnecting session ${sessionId}`, e);
      }
    }

    await this.handleSessionFailure(sessionId);
    await this.clearSessionData(sessionId);

    try {
      await prisma.whatsAppSession.delete({ where: { sessionId } });
    } catch (e) {
      // Ignore if already deleted
    }

    return true;
  }

  /**
   * Get single session status
   */
  public async getSession(sessionId: string) {
    const session = await prisma.whatsAppSession.findUnique({
      where: { sessionId },
    });
    if (!session) return null;

    return {
      ...session,
      isConnected:
        this.sessions.has(sessionId) && session.status === "CONNECTED",
    };
  }

  /**
   * Send Outbound Message
   */
  public async sendMessage(
    to: string,
    text: string,
    options: { companyId: string; channelId?: string; media?: any }
  ): Promise<boolean> {
    const { companyId, channelId, media } = options;

    // 🚨 TRAP FOR GHOST NUMBER
    if (to.includes("45908") || to.includes("9089")) {
      console.error("🚨 GHOST NUMBER DETECTED! 🚨");
      console.error("Payload received:", to);
      console.trace("Stack Trace for Ghost Number:"); // This will tell us WHICH file called this function
      throw new Error(
        "CRITICAL: Attempted to send to the ghost placeholder number."
      );
    }

    // 1. Validation for Malformed Numbers (LIDs, Technical IDs, etc)
    const cleanPhone = to.replace(/[^\d]/g, "");

    // Valid MSISDN is 7-15 digits. Long numbers (like LIDs ~18-20 digits) crash Baileys encryption session silently
    if (cleanPhone.length > 15 || cleanPhone.length < 7) {
      console.error(
        `[WhatsApp] 🛑 BLOCKED INVALID PHONE: ${cleanPhone} (Length: ${cleanPhone.length})`
      );
      throw new Error(
        "CRITICAL: Cannot send to invalid number format. Phone number must be 7-15 digits."
      );
    }

    // Explicit Debug Log
    Logger.info(`[WhatsApp] Sending message to: ${cleanPhone}`);

    const validation = phoneNumberSchema.safeParse(cleanPhone);
    if (!validation.success) {
      Logger.warn(`[WhatsApp] Schema Invalid phone number: ${cleanPhone}`);
      throw new Error("Invalid phone number format");
    }

    // 2. Find Correct Session
    let sock: WASocket | undefined;
    if (channelId) {
      const session = await prisma.whatsAppSession.findFirst({
        where: {
          companyId,
          OR: [{ phone: channelId }, { sessionId: channelId }],
          status: "CONNECTED",
        },
      });
      if (session) sock = this.sessions.get(session.sessionId);
    }

    // Fallback: Use any connected session
    if (!sock) {
      const sessions = await prisma.whatsAppSession.findMany({
        where: { companyId, status: "CONNECTED" },
      });
      for (const s of sessions) {
        if (this.sessions.has(s.sessionId)) {
          sock = this.sessions.get(s.sessionId);
          break;
        }
      }
    }

    if (!sock) {
      Logger.error(`[WhatsApp] No active session for company ${companyId}`);
      return false;
    }

    const jid = `${cleanPhone}@s.whatsapp.net`;

    try {
      if (media) {
        // Full Media Sending Logic
        if (media.type === "image") {
          await sock.sendMessage(jid, {
            image: { url: media.url },
            caption: text,
          });
        } else if (media.type === "video") {
          await sock.sendMessage(jid, {
            video: { url: media.url },
            caption: text,
          });
        } else if (media.type === "document") {
          await sock.sendMessage(jid, {
            document: { url: media.url },
            mimetype: media.mimetype,
            fileName: media.name || "file",
          });
        } else if (media.type === "audio") {
          await sock.sendMessage(jid, {
            audio: { url: media.url },
            mimetype: media.mimetype,
            ptt: !!media.isPrivate,
          });
        } else {
          await sock.sendMessage(jid, { text });
        }
      } else {
        await sock.sendMessage(jid, { text });
      }
      return true;
    } catch (err) {
      Logger.error(`[WhatsApp] Send failed to ${jid}`, err);
      return false;
    }
  }
}

export const whatsappService = new WhatsAppService();
