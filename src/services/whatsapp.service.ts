// src/services/whatsapp.service.ts
import { prisma } from "@/config/prisma";
import makeWASocket, {
  DisconnectReason,
  WASocket,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import { EventEmitter } from "events";
import path from "path";
import { mkdir, writeFile, rm } from "fs/promises";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import { Logger } from "@/utils/logger";
import { useRedisAuthState } from "./baileysRedisAuth";
import { gateway } from "@/gateways/socketGateway";
import redisClient from "@/config/redis";
import { phoneNumberSchema } from "@/utils/validators";

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

          try {
            const existingSession = await prisma.whatsAppSession.findUnique({
              where: { sessionId },
            });

            if (existingSession) {
              await prisma.whatsAppSession.update({
                where: { sessionId },
                data: { qrCode: qr, status: "SCANNING" },
              });
            } else {
              Logger.warn(
                `[WhatsApp] Session ${sessionId} deleted. Skipping QR update.`
              );
            }
          } catch (err) {
            Logger.warn(
              `[WhatsApp] Failed to update QR for ${sessionId}:`,
              err
            );
          }

          io?.emit("qr.updated", { sessionId, qr });
          io?.emit("session.status", { sessionId, status: "SCANNING" });
        }

        // Handle Connection Success
        if (connection === "open") {
          Logger.info(`[WhatsApp] ✅ Session ${sessionId} CONNECTED`);
          this.retryCounts.delete(sessionId); // Reset retries on success

          const user = sock.user;
          const phone = user?.id?.split(":")[0];

          try {
            const session = await prisma.whatsAppSession.findUnique({
              where: { sessionId },
            });

            if (session) {
              await prisma.whatsAppSession.update({
                where: { sessionId },
                data: {
                  status: "CONNECTED",
                  phone: phone || undefined,
                  qrCode: null,
                },
              });
            } else {
              Logger.warn(
                `[WhatsApp] Session ${sessionId} no longer exists in DB. Skipping update.`
              );
            }
          } catch (err) {
            Logger.error(
              `[WhatsApp] Failed to update session ${sessionId} on connect:`,
              err
            );
          }

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
      // 🛑 IGNORAR ESTADOS DE WHATSAPP (Broadcasts)
      if (msg.key.remoteJid === "status@broadcast") {
        return;
      }

      const isOutbound = msg.key?.fromMe === true;

      // ✅ SMART JID SELECTION (Mirror Mode Support)
      let jidToProcess = null;

      if (isOutbound) {
        // If sending FROM phone (Mirror), the remoteJid is the Recipient (The Customer)
        jidToProcess = msg.key?.remoteJid;
        console.log(`[WhatsApp] 🪞 Mirror Mode: Outbound to ${jidToProcess}`);
      } else {
        // If receiving (Inbound), we want the Sender (The Customer)
        // Prioritize remoteJidAlt (real phone) -> participant -> remoteJid
        jidToProcess =
          (msg.key as any).remoteJidAlt ||
          msg.key?.participant ||
          msg.key?.remoteJid;
      }

      console.log("🎯 SELECTED JID TO PROCESS:", jidToProcess);

      if (!jidToProcess) {
        console.warn(
          "[WhatsApp Debug] ⚠️ Skipping processing because JID is invalid:",
          msg.key
        );
        return;
      }

      const remoteJid = jidToProcess;

      // 🖼️ FETCH PROFILE INFO (Only for Inbound/Customer)
      let profilePicUrl: string | undefined;
      let about: string | undefined;

      if (!isOutbound) {
        try {
          const sock = this.sessions.get(sessionId);
          if (sock) {
            profilePicUrl = await sock
              .profilePictureUrl(remoteJid, "image")
              .catch(() => undefined);
            const statusData = await sock
              .fetchStatus(remoteJid)
              .catch(() => undefined);
            about = statusData?.status;
          }
        } catch (e) {
          // Ignore profile fetch errors
        }
      }

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
        profilePicUrl,
        about,
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
  /**
   * Send Outbound Message (SaaS Quality)
   * 1. Validates
   * 2. Sends via Baileys
   * 3. Persists to DB
   * 4. Emits Real-time Event
   */
  public async sendMessage(
    to: string,
    text: string,
    options: {
      companyId: string;
      conversationId: string; // REQUIRED for persistence
      senderId: string; // REQUIRED for persistence
      channelId?: string;
      media?: any;
    }
  ): Promise<any> {
    const { companyId, channelId, conversationId, senderId, media } = options;

    // 🔍 CRITICAL DEBUG
    console.log("🎯 [WhatsApp.sendMessage] Received params:", {
      to,
      hasMedia: !!media,
      mediaType: media?.type,
      mediaUrlLength: media?.url?.length,
    });

    // 1. Validation
    const cleanPhone = to.replace(/[^\d]/g, "");

    // Valid MSISDN is 7-15 digits. Long numbers (like LIDs ~18-20 digits) crash Baileys encryption session silently
    if (cleanPhone.length > 15 || cleanPhone.length < 7) {
      Logger.error(
        `[WhatsApp] 🛑 BLOCKED INVALID PHONE: ${cleanPhone} (Length: ${cleanPhone.length})`
      );
      throw new Error("Invalid phone number format");
    }

    const validation = phoneNumberSchema.safeParse(cleanPhone);
    if (!validation.success) throw new Error("Invalid phone number format");

    // ✅ QUEUE SYSTEM: Route media to queue, text goes direct
    // TODO: Re-enable after debugging worker initialization issue
    // if (media && media.url) {
    //   Logger.info(`[WhatsApp] 📥 Enqueuing media message to queue`);
    //   const { messageQueueService } = await import(
    //     "./queue/messageQueue.service"
    //   );
    //
    //   const jobId = await messageQueueService.enqueue({
    //     companyId,
    //     conversationId,
    //     senderId,
    //     to: cleanPhone,
    //     text,
    //     media,
    //   });
    //
    //   Logger.info(`[WhatsApp] ✅ Message enqueued with job ID: ${jobId}`);
    //
    //   // Return placeholder while queue processes
    //   return {
    //     id: `queued_${jobId}`,
    //     status: "QUEUED",
    //     jobId,
    //   };
    // }

    // ALL messages (text + media) sent immediately
    Logger.info(`[WhatsApp] 📤 Sending message immediately`);

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

    if (!sock) {
      // 2.1 Try to find any active session in memory for this company
      const sessions = await prisma.whatsAppSession.findMany({
        where: { companyId, status: "CONNECTED" },
      });

      for (const s of sessions) {
        if (this.sessions.has(s.sessionId)) {
          sock = this.sessions.get(s.sessionId);
          break;
        }
      }

      // 2.2 SELF-HEALING: If no memory session but DB says connected, revive it!
      if (!sock && sessions.length > 0) {
        const victim = sessions[0]; // Take the first one
        Logger.warn(
          `[WhatsApp] 🚑 Session ${victim.sessionId} indicates CONNECTED in DB but missing in memory. Attempting lazy revival...`
        );

        if (!this.initializingSessions.has(victim.sessionId)) {
          this.initializeSession(victim.sessionId).catch((e) =>
            console.error(e)
          );
        }

        // Wait up to 3 seconds for binding
        let attempts = 0;
        while (!this.sessions.has(victim.sessionId) && attempts < 15) {
          await new Promise((r) => setTimeout(r, 200));
          attempts++;
        }

        if (this.sessions.has(victim.sessionId)) {
          sock = this.sessions.get(victim.sessionId);
          Logger.info(
            `[WhatsApp] 🚑 Revival successful for ${victim.sessionId}`
          );
        }
      }
    }

    if (!sock) {
      Logger.error(`[WhatsApp] No active session for company ${companyId}`);
      throw new Error("No active WhatsApp session found");
    }

    // Baileys handles connection state internally, no need to wait

    const jid = `${cleanPhone}@s.whatsapp.net`;

    // 3. SEND via Baileys
    try {
      if (media) {
        Logger.info(
          `[WhatsApp] 🎬 Processing media: type=${media.type}, mimetype=${media.mimetype}`
        );

        // ✅ ARCHITECTURE: S3 for storage, Buffer for WhatsApp
        let mediaBuffer: Buffer | { url: string };
        let s3Url = media.url;

        // 1. If base64, convert and upload to S3
        if (media.url.startsWith("data:")) {
          Logger.info(`[WhatsApp] 🔄 Converting base64 to Buffer...`);
          const base64Data = media.url.split(",")[1];
          mediaBuffer = Buffer.from(base64Data, "base64");

          try {
            const { storageService } = await import("./storageService");
            const result = await storageService.uploadFile(
              mediaBuffer,
              media.name || `${media.type}-${Date.now()}.webm`,
              media.mimetype || "application/octet-stream",
              false
            );
            s3Url = result.url; // Signed URL
            media.url = s3Url; // Update for DB persistence
            Logger.info(
              `[WhatsApp] 📤 ${media.type.toUpperCase()} uploaded to S3: ${
                result.key
              }`
            );
          } catch (err) {
            Logger.error("[WhatsApp] Failed to upload media to S3:", err);
            throw new Error("Failed to upload media");
          }
        } else if (media.url.startsWith("http")) {
          // If URL, let Baileys download it
          mediaBuffer = { url: media.url };
        } else {
          throw new Error("Invalid media URL format");
        }

        // 2. Send to WhatsApp using appropriate method
        if (media.type === "image") {
          await sock.sendMessage(jid, {
            image: mediaBuffer,
            caption: text,
          });
        } else if (media.type === "video") {
          await sock.sendMessage(jid, {
            video: mediaBuffer,
            caption: text,
          });
        } else if (media.type === "document") {
          await sock.sendMessage(jid, {
            document: mediaBuffer,
            mimetype: media.mimetype,
            fileName: media.name || "file",
          });
        } else if (media.type === "audio") {
          await sock.sendMessage(jid, {
            audio: mediaBuffer,
            mimetype: media.mimetype || "audio/ogg; codecs=opus",
            ptt: !!media.isVoiceNote,
          });
        }
      } else {
        await sock.sendMessage(jid, { text });
      }

      Logger.info(`[WhatsApp] ✅ Sent to ${cleanPhone}`);

      // 4. PERSIST to DB (Crucial Step: STATUS SENT)
      const message = await prisma.message.create({
        data: {
          content: text || (media ? `[${media.type.toUpperCase()}]` : ""),
          channel: "WHATSAPP",
          direction: "OUTBOUND",
          status: "SENT", // ✅ Explicit Status
          conversationId,
          senderId,
          metadata: media ? { media } : undefined,
        },
        include: { sender: true },
      });

      // 5. EMIT Real-Time Event
      const io = gateway.getIO();
      if (io) {
        // ... (Emission logic remains same)
        const socketPayload = {
          ...message,
          senderType: "AGENT",
          ticketId: conversationId,
        };

        io.to(conversationId).emit("conversation.new_message", socketPayload);
        io.to(conversationId).emit("message", socketPayload);

        // Update Dashboard List
        io.to(`company:${companyId}`).emit("conversation.updated", {
          id: conversationId,
          lastMessage: text,
          lastMessageAt: new Date(),
          unreadCount: 0,
        });
      }

      return message; // ✅ Return DB Object
    } catch (err) {
      Logger.error(`[WhatsApp] Send or Persistence failed to ${jid}`, err);
      throw err; // ✅ Force Error Propagation
    }
  }

  /**
   * PUBLIC: Get session for a company
   * Used by queue worker to check session readiness
   */
  public getSession(companyId: string): any {
    for (const [sessionId, sock] of this.sessions.entries()) {
      if (sessionId.includes(companyId)) {
        return sock;
      }
    }
    return null;
  }

  /**
   * PUBLIC: Send message directly (bypassing queue)
   * Used by queue worker after media is uploaded
   */
  public async sendMessageDirect(
    to: string,
    text: string,
    options: {
      companyId: string;
      conversationId: string;
      senderId: string;
      channelId?: string;
      media?: any;
    }
  ): Promise<any> {
    // This calls the current sendMessage implementation
    return this.sendMessage(to, text, options);
  }
}

export const whatsappService = new WhatsAppService();
