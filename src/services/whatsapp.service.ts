// src/services/whatsapp.service.ts
import { prisma } from "@/config/prisma";
import fs from "fs";
import path from "path";
import makeWASocket, {
  DisconnectReason,
  WASocket,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
  jidNormalizedUser,
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
  private stores: Map<string, any> = new Map(); // Store history per session
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

      // 🔄 RETRY LOGIC: Infrastructure Resilience
      // Attempt to load auth state 3 times (Redis blips)
      let authState;
      let loadRetries = 0;
      while (!authState && loadRetries < 3) {
        try {
          authState = await useRedisAuthState(sessionId);
        } catch (err: any) {
          loadRetries++;
          Logger.warn(
            `[WhatsApp] 🛑 Auth Load Failed (Attempt ${loadRetries}/3): ${err.message}`
          );
          if (loadRetries >= 3) throw err; // Propagate after max retries
          await new Promise((r) => setTimeout(r, 2000));
        }
      }

      const { state, saveCreds } = authState!;
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

      // 🧠 Custom Lightweight Store (Fallback for dependency issues)
      // 🧠 Persistent Simple Store (JSON based)
      // Fixes "Empty Store on Restart" issue
      const storePath = path.join(
        process.cwd(),
        "wadata",
        `store_${sessionId}.json`
      );
      // Ensure dir exists
      if (!fs.existsSync(path.join(process.cwd(), "wadata"))) {
        fs.mkdirSync(path.join(process.cwd(), "wadata"), { recursive: true });
      }

      const store = {
        chats: {
          data: {} as Record<string, any>,
          all: function () {
            return Object.values(this.data);
          },
        },
        messages: {} as Record<string, { array: any[] }>,

        // Load from disk
        load: () => {
          if (fs.existsSync(storePath)) {
            try {
              const data = JSON.parse(fs.readFileSync(storePath, "utf-8"));
              store.chats.data = data.chats || {};
              store.messages = data.messages || {};
              Logger.info(
                `[Store] 📂 Loaded ${
                  Object.keys(store.messages).length
                } chats from disk.`
              );
            } catch (e) {
              Logger.error(`[Store] Failed to load store from disk`, e);
            }
          }
        },

        // Save to disk (Throttled could be better, but direct for now to ensure consistency)
        save: () => {
          try {
            const data = { chats: store.chats.data, messages: store.messages };
            // Write sync to prevent race conditions in this MVP
            fs.writeFileSync(storePath, JSON.stringify(data, null, 2));
          } catch (e) {
            // Ignore intermittent save errors
          }
        },

        bind: (ev: any) => {
          // 1. Capture Upserts
          ev.on("messages.upsert", (upsert: any) => {
            if (upsert.messages.length > 0)
              Logger.info(`[Store] 📥 Upsert: ${upsert.messages.length} msgs`);

            let changed = false;
            for (const msg of upsert.messages) {
              const jid = msg.key.remoteJid;
              if (!jid) continue;

              if (!store.messages[jid]) store.messages[jid] = { array: [] };
              if (!store.chats.data[jid]) store.chats.data[jid] = { id: jid };

              const arr = store.messages[jid].array;
              // Dedupe
              if (!arr.some((m: any) => m.key.id === msg.key.id)) {
                arr.push(msg);
                changed = true;
                // Limit to last 1000 per chat to save disk space
                if (arr.length > 1000)
                  store.messages[jid].array = arr.slice(-1000);
              }
            }
            if (changed) store.save();
          });

          // 2. Capture History
          ev.on("messaging-history.set", (data: any) => {
            Logger.info(`[Store] 📚 History Set Received`);
            let changed = false;
            if (data.chats) {
              data.chats.forEach((c: any) => (store.chats.data[c.id] = c));
              changed = true;
            }
            if (data.messages) {
              for (const item of data.messages) {
                const msg = item;
                const jid = msg.key?.remoteJid;
                if (jid) {
                  if (!store.messages[jid]) store.messages[jid] = { array: [] };
                  store.messages[jid].array.push(msg);
                  changed = true;
                }
              }
            }
            if (changed) store.save();
          });
        },
      };

      // Load initial data
      store.load();

      store.bind(sock.ev);
      this.stores.set(sessionId, store);

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
    } catch (error: any) {
      Logger.error(
        `[WhatsApp] Fatal error initializing session ${sessionId}`,
        error
      );

      // 🧠 INTELLIGENT FAILURE HANDLING
      // If error is related to connection/infrastructure, reschedule instead of killing
      const isInfraError =
        error.message?.includes("Redis") ||
        error.message?.includes("Socket closed") ||
        error.message?.includes("ECONNRESET");

      if (isInfraError) {
        Logger.warn(
          `[WhatsApp] ⏳ Infrastructure error detected for ${sessionId}. Scheduling retry in 10s...`
        );
        setTimeout(() => this.initializeSession(sessionId), 10000);
      } else {
        // Only kill session for actual logic/auth failures
        this.handleSessionFailure(sessionId);
      }
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

      // 🚫 SKIP OUTBOUND MESSAGES (Already saved in sendMessage())
      // When we send a message, WhatsApp confirms it with fromMe=true
      // We don't want to process it again and duplicate it in the UI
      if (isOutbound) {
        // ✅ ALLOW SYNC: Messages sent from phone should arrive here.
        // MessageProcessor handle deduplication for messages sent via CRM.
        console.log(
          `[WhatsApp] 📤 Outbound message detected (Phone Sync). Processing...`
        );
      }

      // ✅ SMART JID SELECTION (CRITICAL FIX FOR SYNC)
      let jidToProcess = null;

      if (isOutbound) {
        // 📤 OUTBOUND (Phone Sync): The contact is the RECIPIENT (`remoteJid`)
        // We must ignore `participant` because that is US (the agent).
        jidToProcess = msg.key?.remoteJid;
      } else {
        // 📥 INBOUND (Customer): The contact is the SENDER.
        // In groups/LID mode, sender is in `participant` or `remoteJidAlt`.
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
      metadata?: any; // ✅ NEW: Support for AI metadata
    }
  ): Promise<any> {
    const { companyId, channelId, conversationId, senderId, media, metadata } =
      options;

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
    let currentSessionId: string | undefined;

    if (channelId) {
      const session = await prisma.whatsAppSession.findFirst({
        where: {
          companyId,
          OR: [{ phone: channelId }, { sessionId: channelId }],
          status: "CONNECTED",
        },
      });
      if (session) {
        sock = this.sessions.get(session.sessionId);
        currentSessionId = session.sessionId;
      }
    }

    if (!sock) {
      // 2.1 Try to find any active session in memory for this company
      const sessions = await prisma.whatsAppSession.findMany({
        where: { companyId, status: "CONNECTED" },
      });

      for (const s of sessions) {
        if (this.sessions.has(s.sessionId)) {
          sock = this.sessions.get(s.sessionId);
          currentSessionId = s.sessionId;
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
          currentSessionId = victim.sessionId;
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
          metadata: media ? { ...metadata, media } : metadata,
        },
        include: { sender: true },
      });

      // 5. NO EMIT SOCKET FOR AGENT MESSAGES
      // Frontend already receives the message in HTTP response
      // Emitting here would cause duplication in the UI
      // Socket events are ONLY for INBOUND messages from customers

      // COMENTADO PARA EVITAR DUPLICACIÓN:
      // const io = gateway.getIO();
      // if (io) {
      //   const socketPayload = {
      //     ...message,
      //     senderType: "AGENT",
      //     ticketId: conversationId,
      //   };
      //   io.to(conversationId).emit("conversation.new_message", socketPayload);
      //   io.to(conversationId).emit("message", socketPayload);
      //   io.to(`company:${companyId}`).emit("conversation.updated", {
      //     id: conversationId,
      //     lastMessage: text,
      //     lastMessageAt: new Date(),
      //     unreadCount: 0,
      //   });
      // }

      // 5. EMIT Real-Time Event (Restored)
      const io = gateway.getIO();
      if (io) {
        const socketPayload = {
          ...message,
          senderType: "AGENT",
          ticketId: conversationId,
        };
        io.to(conversationId).emit("conversation.new_message", socketPayload);
        io.to(conversationId).emit("message", socketPayload);
        io.to(`company:${companyId}`).emit("conversation.updated", {
          id: conversationId,
          lastMessage: text,
          lastMessageAt: new Date(),
          unreadCount: 0,
        });
      }

      Logger.info(`[WhatsApp] ✅ Message saved, emitted and returned`);

      return message; // ✅ Return DB Object
    } catch (err: any) {
      Logger.error(`[WhatsApp] Send or Persistence failed to ${jid}`, err);

      // 🚑 SELF-HEALING: If session is broken, attempt to fix it for next time
      const isSessionError =
        err.message?.includes("SessionError") ||
        err.message?.includes("Socket closed") ||
        err.message?.includes("No sessions") ||
        err.message?.includes("Connection Closed");

      // @ts-ignore
      if (isSessionError && currentSessionId) {
        Logger.warn(
          // @ts-ignore
          `[WhatsApp] 🚑 Detecting broken session ${currentSessionId}. Triggering re-initialization.`
        );
        // Don't await, let it happen in background
        // @ts-ignore
        this.sessions.delete(currentSessionId); // Clear bad reference immediately
        // @ts-ignore
        this.initializeSession(currentSessionId).catch((e) => console.error(e));
      }

      throw err; // ✅ Force Error Propagation
    }
  }

  /**
   * PUBLIC: Get session for a company
   * Used by queue worker to check session readiness
   */
  public getSessionSocket(companyId: string): any {
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
  /**
   * 🔄 SYNC OLD MESSAGES (From Memory Store)
   * Fetches up to 50 messages per chat from the Baileys RAM Cache.
   * Note: This only works for messages received since the bot was started/synced.
   */
  public async syncMessages(companyId: string, fromDate: Date) {
    Logger.info(
      `[Sync] Starting sync for ${companyId} since ${fromDate.toISOString()}`
    );

    const sessions = await prisma.whatsAppSession.findMany({
      where: { companyId },
    });

    // Prioritize CONNECTED, then SCANNING, then others
    let session = sessions.find((s) => s.status === "CONNECTED") || sessions[0];

    if (!session) {
      throw new Error("No WhatsApp session found. Please link a device first.");
    }

    // 🚑 SELF-HEALING: Auto-Reconnect if Disconnected
    if (session.status !== "CONNECTED") {
      Logger.warn(
        `[Sync] Session ${session.sessionId} is ${session.status}. Attempting AUTO-RECONNECT...`
      );

      try {
        await this.initializeSession(session.sessionId);

        // Wait up to 45s for connection (Baileys history sync timeout is 20s, so we need more)
        let attempts = 0;
        while (attempts < 45) {
          await new Promise((r) => setTimeout(r, 1000));
          const freshSession = await prisma.whatsAppSession.findUnique({
            where: { sessionId: session.sessionId },
          });
          if (freshSession?.status === "CONNECTED") {
            Logger.info(
              `[Sync] ✅ Auto-reconnect successful for ${session.sessionId}`
            );
            session = freshSession; // Update reference

            // 🕒 Wait extra 10s for History Sync (Store population)
            // Baileys buffers messages during 'AwaitingInitialSync'. When it goes 'Online', it flushes them.
            Logger.info(`[Sync] Waiting 10s for WhatsApp History Flush...`);
            await new Promise((r) => setTimeout(r, 10000));
            break;
          }
          attempts++;
        }

        if (session.status !== "CONNECTED") {
          throw new Error(
            "Auto-reconnect failed. Please reconnect manually via Dashboard."
          );
        }
      } catch (e: any) {
        Logger.error(`[Sync] Auto-healing failed:`, e);
        throw new Error(
          `Session is disconnected and auto-reconnect failed: ${e.message}`
        );
      }
    }

    const store = this.stores.get(session.sessionId);
    if (!store) {
      Logger.warn(
        `[Sync] Store not found for ${session.sessionId}. Force-initializing store...`
      );
      // Fallback: If store handling failed during init
      return {
        chats: 0,
        messages: 0,
        warning:
          "Message cache unavailable even after connect. Try again in 1 minute.",
      };
    }

    const { messageProcessor } = await import("./messageProcessor.service");
    let importedCount = 0;
    let chatsCount = 0;

    // Get all chats from store
    // Check if store.chats is accessible (it should be KeyedDB)
    const chats = store.chats.all ? store.chats.all() : [];
    chatsCount = chats.length;
    Logger.info(`[Sync] Found ${chatsCount} chats in RAM store.`);

    for (const chat of chats) {
      const jid = chat.id;
      // Access messages from store (KeyedDB)
      // @ts-ignore
      const messagesKeyedDB = store.messages[jid];
      const messages = messagesKeyedDB ? messagesKeyedDB.array : [];

      // Filter by Date
      const eligible = messages.filter((m: any) => {
        if (!m.messageTimestamp) return false;
        const rawTs =
          typeof m.messageTimestamp === "number"
            ? m.messageTimestamp
            : m.messageTimestamp.low;
        const ts = rawTs * 1000;
        return ts >= fromDate.getTime();
      });

      if (messages.length > 0) {
        Logger.info(
          `[Sync] Chat ${jid.slice(0, 15)}...: ${
            messages.length
          } msgs total. Eligible: ${
            eligible.length
          } (Filter: ${fromDate.toISOString()})`
        );
      }

      // Get last 50, chronological
      // Baileys array is usually chronological? Or we should sort?
      // Assuming safely sorted, take last 50.
      const toImport = eligible.slice(-50);

      for (const msg of toImport) {
        try {
          const isOutbound = msg.key.fromMe || false;

          // Basic text extraction (Reuse simplified logic)
          let text =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            "";

          let mediaType = "";
          if (msg.message?.imageMessage) {
            mediaType = "image";
            text = msg.message.imageMessage.caption || text || "[IMAGE]";
          } else if (msg.message?.audioMessage) {
            mediaType = "audio";
            text = "[AUDIO]";
          } else if (msg.message?.videoMessage) {
            mediaType = "video";
            text = msg.message.videoMessage.caption || text || "[VIDEO]";
          } else if (msg.message?.documentMessage) {
            mediaType = "document";
            text = msg.message.documentMessage.caption || text || "[DOCUMENT]";
          }

          if (!text && !mediaType) continue;

          // We pass it to processor.
          // Note: We cannot easily download media here retrospectively without a lot of overhead.
          // syncing text history is the primary goal. Media might show as placeholder.

          await messageProcessor.process({
            companyId,
            sessionId: session.sessionId,
            remoteJid: jid,
            text: text,
            isOutbound,
            contactName: msg.pushName,
            // Skip heavy media download for sync
          });
          importedCount++;
        } catch (e) {
          console.warn(`[Sync] Failed to process message ${msg.key.id}:`, e);
        }
      }
    }

    Logger.info(`[Sync] Completed. Imported ${importedCount} messages.`);
    return { chats: chatsCount, messages: importedCount };
  }
}

export const whatsappService = new WhatsAppService();
