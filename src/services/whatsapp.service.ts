// src/services/whatsapp.service.ts
import makeWASocket, {
  DisconnectReason,
  WASocket,
} from "@whiskeysockets/baileys";
import { PrismaClient, WhatsAppCredential } from "@prisma/client";
import { EventEmitter } from "events";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { downloadMediaMessage } from "@whiskeysockets/baileys";

const prisma = new PrismaClient();

/**
 * Helper to resolve a phone number from a possible LID.
 * For inbound messages we try to extract the real JID from the message metadata.
 * For outbound messages we try to fetch a stored mapping from WhatsAppCredential.
 */
async function resolvePhoneFromLid(
  lid: string,
  context: { remoteJid?: string; msg?: any; usedSessionId?: string }
): Promise<string | null> {
  // 1️⃣ Try to resolve from inbound message metadata (msg)
  if (context.msg) {
    const { msg } = context;
    // participant field may already contain the real JID
    if (
      msg.key?.participant &&
      msg.key.participant.includes("@s.whatsapp.net")
    ) {
      return msg.key.participant;
    }
    // Some messages include a notify field with the phone number
    if (msg.notify) {
      const match = String(msg.notify).match(/\d{10,15}/);
      if (match) {
        return `${match[0]}@s.whatsapp.net`;
      }
    }
    // Fallback: search the whole message for a Colombian number pattern (example)
    const phoneMatch = JSON.stringify(msg).match(/573\d{9}/);
    if (phoneMatch) {
      return `${phoneMatch[0]}@s.whatsapp.net`;
    }
  }

  // 2️⃣ Try to resolve from stored credential mapping (outbound)
  if (context.usedSessionId) {
    try {
      const credential = await prisma.whatsAppCredential.findUnique({
        where: {
          sessionId_key: {
            sessionId: context.usedSessionId,
            key: `lid-mapping-${lid}`,
          },
        },
      });
      if (credential && credential.value) {
        const data = JSON.parse(credential.value as string);
        if (data.pn) {
          return `${data.pn}@s.whatsapp.net`;
        }
      }
    } catch (e) {
      console.error(
        "[WhatsApp] Error fetching LID mapping from credentials",
        e
      );
    }
  }

  // If everything fails, return null – caller will fallback to original value
  return null;
}

export class WhatsAppService extends EventEmitter {
  private sessions: Map<string, WASocket> = new Map();
  private processedMessageIds: Set<string> = new Set();
  private recentOutboundIds: Set<string> = new Set();
  private qrCodes: Map<string, string> = new Map();

  constructor() {
    super();
    // Don't auto-initialize in constructor - wait for explicit initialize() call
  }

  /** Public method to initialize all sessions - called from server.ts */
  public async initialize() {
    console.log("[WhatsApp] Initializing all sessions...");
    await this.initializeAllSessions();
  }

  /** Create a new WhatsApp session */
  public async createSession(companyId: string) {
    const sessionId = `session_${Date.now()}_${Math.random()
      .toString(36)
      .substring(7)}`;

    const session = await prisma.whatsAppSession.create({
      data: {
        sessionId,
        companyId,
        status: "SCANNING",
      },
    });

    await this.initializeSession(sessionId);

    return session;
  }

  /** Initialise all stored sessions on service start */
  private async initializeAllSessions() {
    const sessions = await prisma.whatsAppSession.findMany({
      where: { status: "CONNECTED" },
    });
    for (const s of sessions) {
      await this.initializeSession(s.sessionId);
    }
  }

  /** Initialise a single session (creates socket, auth state, listeners) - Public for reconnection */
  public async initializeSession(sessionId: string) {
    const { usePrismaAuthState } = await import("./baileysAuth");
    const { state, saveCreds } = await usePrismaAuthState(sessionId);

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,
    });
    this.sessions.set(sessionId, sock);

    sock.ev.on("creds.update", saveCreds);
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;
      const { gateway } = await import("@/gateways/socketGateway");

      if (qr) {
        // Persist QR in DB so polling can pick it up if socket fails
        await prisma.whatsAppSession.update({
          where: { sessionId },
          data: { qrCode: qr, status: "SCANNING" },
        });

        gateway.getIO()?.emit("qr.updated", { sessionId, qr });
      }

      if (connection === "open") {
        console.log(`[WhatsApp] Session ${sessionId} CONNECTED`);

        // Update DB
        const user = sock.user;
        const phone = user?.id?.split(":")[0];

        await prisma.whatsAppSession.update({
          where: { sessionId },
          data: {
            status: "CONNECTED",
            phone: phone || undefined,
            qrCode: null,
          }, // Clear QR
        });

        gateway.getIO()?.emit("session.status", {
          sessionId,
          status: "CONNECTED",
          phone,
        });
      }

      if (connection === "close") {
        const shouldReconnect =
          (lastDisconnect?.error as any)?.output?.statusCode !==
          DisconnectReason.loggedOut;

        if (shouldReconnect) {
          await this.initializeSession(sessionId);
        } else {
          this.sessions.delete(sessionId);

          await prisma.whatsAppSession.update({
            where: { sessionId },
            data: { status: "DISCONNECTED" },
          });

          gateway
            .getIO()
            ?.emit("session.status", { sessionId, status: "DISCONNECTED" });
        }
      }
    });

    // 🔍 DEBUG: Monitor ALL Baileys events
    console.log(
      "🎯 [DEBUG] Registering event listeners for session:",
      sessionId
    );
    const monitorEvents = [
      "messages.upsert",
      "messages.update",
      "message-receipt.update",
    ];
    monitorEvents.forEach((eventName) => {
      sock.ev.on(eventName as any, (data: any) => {
        console.log(`🔥 [DEBUG] Event "${eventName}" received`);
      });
    });

    sock.ev.on("messages.upsert", async (msgEvent) => {
      console.log("🔔 [DEBUG] messages.upsert EVENT FIRED", {
        type: msgEvent.type,
        count: msgEvent.messages?.length,
      });
      if (msgEvent.type !== "notify" || !msgEvent.messages) {
        console.log("⚠️ [DEBUG] Skipping - type:", msgEvent.type);
        return;
      }
      for (const msg of msgEvent.messages) {
        console.log("📨 [DEBUG] Processing message:", {
          id: msg.key?.id,
          from: msg.key?.remoteJid,
        });
        await this.handleIncomingMessage(msg, sessionId);
      }
    });
  }

  /** Process an incoming WhatsApp message */
  private async handleIncomingMessage(msg: any, sessionId: string) {
    try {
      console.log("✅ [DEBUG] handleIncomingMessage STARTED");
      const messageId = msg.key?.id;
      if (!messageId) {
        console.log("❌ [DEBUG] No messageId, returning");
        return;
      }
      // Deduplicate quickly
      if (this.processedMessageIds.has(messageId)) {
        console.log("⚠️ [DEBUG] Duplicate message skipped:", messageId);
        return;
      }
      this.processedMessageIds.add(messageId);
      setTimeout(
        () => this.processedMessageIds.delete(messageId),
        5 * 60 * 1000
      );

      const remoteJid = msg.key?.remoteJid;
      if (!remoteJid) {
        console.log("❌ [DEBUG] No remoteJid, returning");
        return;
      }
      if (remoteJid === "status@broadcast") {
        console.log("⚠️ [DEBUG] Status broadcast ignored");
        return;
      }

      console.log("📥 [DEBUG] Processing message from:", remoteJid);

      // Extract basic content
      let text = "";
      let mediaType = "";
      let mimeType = "";
      let mediaBuffer: Buffer | null = null;

      if (msg.message?.conversation) {
        text = msg.message.conversation;
      } else if (msg.message?.extendedTextMessage?.text) {
        text = msg.message.extendedTextMessage.text;
      } else if (msg.message?.imageMessage) {
        text = msg.message.imageMessage.caption || "";
        mediaType = "image";
        mimeType = msg.message.imageMessage.mimetype || "image/jpeg";
      } else if (msg.message?.videoMessage) {
        text = msg.message.videoMessage.caption || "";
        mediaType = "video";
        mimeType = msg.message.videoMessage.mimetype || "video/mp4";
      } else if (msg.message?.documentMessage) {
        mediaType = "document";
        mimeType = msg.message.documentMessage.mimetype || "application/pdf";
      } else if (msg.message?.audioMessage) {
        mediaType = "audio";
        mimeType = msg.message.audioMessage.mimetype || "audio/mp4";
      }

      if (!text && !mediaType) {
        console.log("❌ [DEBUG] No text and no media, returning");
        return;
      }

      console.log("📝 [DEBUG] Message content:", {
        text: text.substring(0, 50),
        mediaType,
      });

      // Load session record for company context
      const sessionRecord = await prisma.whatsAppSession.findUnique({
        where: { sessionId },
      });
      if (!sessionRecord) {
        console.error("❌ [DEBUG] Session record not found for", sessionId);
        return;
      }

      console.log(
        "✅ [DEBUG] Session found, companyId:",
        sessionRecord.companyId
      );

      // Media handling (download and store locally)
      let mediaInfo: any = undefined;
      if (mediaType) {
        try {
          mediaBuffer = (await downloadMediaMessage(msg, "buffer", {} as any, {
            logger: console as any,
            reuploadRequest: sessionRecord.id as any,
          })) as Buffer;
          if (mediaBuffer) {
            const uploadDir = path.join(
              process.cwd(),
              "public",
              "uploads",
              sessionRecord.companyId
            );
            await mkdir(uploadDir, { recursive: true });
            const ext = mimeType.split("/")[1]?.split(";")[0] || "bin";
            const filename = `${Date.now()}_${Math.random()
              .toString(36)
              .substring(7)}.${ext}`;
            const filePath = path.join(uploadDir, filename);
            await writeFile(filePath, mediaBuffer);
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
          console.error(`[WhatsApp] Error downloading media:`, e);
        }
      }

      // Resolve possible LID to real phone number
      let actualPhone = remoteJid;
      if (remoteJid.includes("@lid")) {
        const resolved = await resolvePhoneFromLid(remoteJid.split("@")[0], {
          msg,
        });
        if (resolved) actualPhone = resolved;
      }

      // Pass to message processor (CRM side)
      console.log("🚀 [DEBUG] Calling messageProcessor.process...");
      const { messageProcessor } = await import("./messageProcessor.service");
      await messageProcessor.process({
        companyId: sessionRecord.companyId,
        sessionId,
        remoteJid: actualPhone,
        text,
        isOutbound: false,
        contactName: msg.pushName || undefined,
        senderName: undefined,
        hasMedia: !!mediaInfo,
        media: mediaInfo,
      });
      console.log("✅ [DEBUG] messageProcessor.process COMPLETED");
    } catch (err) {
      console.error(`[WhatsApp] Error processing incoming message:`, err);
    }
  }

  /** Send a message (outbound) */
  public async sendMessage(
    to: string,
    text: string,
    channelId?: string,
    media?: {
      url: string;
      type: "image" | "video" | "document" | "audio";
      caption?: string;
      mimetype?: string;
      isVoiceNote?: boolean;
    }
  ): Promise<boolean> {
    // Find appropriate socket
    let sock: WASocket | undefined;
    let usedSessionId: string | undefined;
    if (channelId) {
      const session = await prisma.whatsAppSession.findFirst({
        where: {
          OR: [{ phone: channelId }, { sessionId: channelId }],
          status: "CONNECTED",
        },
      });
      if (session && this.sessions.has(session.sessionId)) {
        sock = this.sessions.get(session.sessionId);
        usedSessionId = session.sessionId;
      }
    }
    if (!sock) {
      for (const [id, s] of this.sessions.entries()) {
        sock = s;
        usedSessionId = id;
        break;
      }
    }
    if (!sock || !usedSessionId) {
      console.error("[WhatsApp] No active sessions available!");
      return false;
    }

    // Resolve LID if needed
    let resolvedPhone = to;
    const cleanTo = to.replace(/[^\d]/g, "");
    if (cleanTo.length > 0) {
      const resolved = await resolvePhoneFromLid(cleanTo, {
        usedSessionId,
      });
      if (resolved) resolvedPhone = resolved.replace("@s.whatsapp.net", ""); // keep plain number
    }

    const jid = resolvedPhone.includes("@")
      ? resolvedPhone
      : `${resolvedPhone}@s.whatsapp.net`;

    try {
      if (media) {
        // 🛠️ SENIOR FIX: Handle Base64 Data URIs properly
        // Baileys is flaky with data URIs. We MUST save it to disk first.
        if (media.url.startsWith("data:")) {
          try {
            // Robust parsing using split instead of regex (regex fails on complex mimes like 'audio/webm;codecs=opus')
            const commaIndex = media.url.indexOf(",");
            if (commaIndex !== -1) {
              const metadata = media.url.substring(5, commaIndex); // e.g. "audio/webm;codecs=opus;base64"
              const base64Data = media.url.substring(commaIndex + 1);

              // Extract clean mime type (remove ;base64)
              const base64TagIndex = metadata.indexOf(";base64");
              const fileType =
                base64TagIndex !== -1
                  ? metadata.substring(0, base64TagIndex)
                  : metadata;

              const buffer = Buffer.from(base64Data, "base64");

              // Create uploads dir if not exists
              const uploadDir = path.join(
                process.cwd(),
                "public",
                "uploads",
                "outbound"
              );
              await mkdir(uploadDir, { recursive: true });

              // Generate filename based on type
              // fileType might be 'audio/webm;codecs=opus', we need just extension
              const cleanMime = fileType.split(";")[0]; // audio/webm
              let ext = cleanMime.split("/")[1] || "bin";
              if (ext === "plain") ext = "txt";

              const filename = `sent_${Date.now()}_${Math.random()
                .toString(36)
                .substring(7)}.${ext}`;
              const filePath = path.join(uploadDir, filename);

              await writeFile(filePath, buffer);

              // Update URL to point to the local file
              media.url = filePath;
              // Also update mimetype if we detected it from the data URI
              if (!media.mimetype) media.mimetype = fileType;
            }
          } catch (err) {
            console.error("[WhatsApp] Failed to process Base64 media:", err);
            // Fallback to original URL (might fail but worth a try)
          }
        }

        if (media.type === "image") {
          const resp = await sock.sendMessage(jid, {
            image: { url: media.url },
            caption: text || media.caption,
          });
          if (resp?.key?.id) this.recentOutboundIds.add(resp.key.id);
        } else if (media.type === "video") {
          const resp = await sock.sendMessage(jid, {
            video: { url: media.url },
            caption: text || media.caption,
          });
          if (resp?.key?.id) this.recentOutboundIds.add(resp.key.id);
        } else if (media.type === "audio") {
          // Smart mimetype & path detection for WhatsApp compatibility
          const isWebm =
            media.url.endsWith(".webm") ||
            (media.mimetype && media.mimetype.includes("webm"));

          // 1. Resolve Path: Smart handling for Local vs Remote
          let audioSource: { url: string } = { url: media.url };
          const LOCAL_BASE_URL = process.env.APP_URL || "http://localhost:4000";

          if (media.url.startsWith(LOCAL_BASE_URL)) {
            // Optimize: Read directly from disk if it's our own file
            // path.join(cwd, 'public', '/uploads/...') handles the slashes
            const relativePath = media.url.replace(LOCAL_BASE_URL, "");
            audioSource = {
              url: path.join(process.cwd(), "public", relativePath),
            };
          } else if (
            !media.url.startsWith("http") &&
            !path.isAbsolute(media.url)
          ) {
            // Fallback for old relative paths
            audioSource = {
              url: path.join(process.cwd(), "public", media.url),
            };
          }

          // 2. Playback Safety: WebM cannot be sent as PTT reliably
          const sendAsPtt = !isWebm && (media.isVoiceNote ?? false);

          const mime =
            media.mimetype && !media.mimetype.includes("webm")
              ? media.mimetype
              : isWebm
              ? media.mimetype || "audio/webm"
              : "audio/ogg; codecs=opus";

          const resp = await sock.sendMessage(jid, {
            audio: audioSource,
            ptt: sendAsPtt,
            mimetype: mime,
          });
          if (resp?.key?.id) this.recentOutboundIds.add(resp.key.id);
        } else {
          const resp = await sock.sendMessage(jid, {
            document: { url: media.url },
            caption: text || media.caption,
            mimetype: media.mimetype || undefined,
          });
          if (resp?.key?.id) this.recentOutboundIds.add(resp.key.id);
        }
        // Cleanup recent IDs after 30s
        this.recentOutboundIds.forEach((id) => {
          setTimeout(() => this.recentOutboundIds.delete(id), 30000);
        });
      } else {
        const resp = await sock.sendMessage(jid, { text });
        if (resp?.key?.id) this.recentOutboundIds.add(resp.key.id);
        setTimeout(() => this.recentOutboundIds.delete(resp.key.id!), 30000);
      }
      return true;
    } catch (e) {
      console.error(`[WhatsApp] Send failed:`, e);
      return false;
    }
  }

  // ----- Session management helpers (delete, status, list) -----
  public async deleteSession(sessionId: string) {
    const sock = this.sessions.get(sessionId);
    if (sock) {
      try {
        await sock.logout();
      } catch (e) {
        console.warn(`[WhatsApp] Logout error (ignored)`, e);
      }
      this.sessions.delete(sessionId);
    }
    this.qrCodes?.delete?.(sessionId);
    await prisma.whatsAppCredential.deleteMany({ where: { sessionId } });
    await prisma.whatsAppSession.delete({ where: { sessionId } });
  }

  public async getSessionStatus(sessionId: string) {
    return await prisma.whatsAppSession.findUnique({ where: { sessionId } });
  }

  public async listSessions(companyId: string) {
    return await prisma.whatsAppSession.findMany({ where: { companyId } });
  }

  // Sync old messages (simplified placeholder)
  public async syncMessages(companyId: string, fromDate: Date) {
    // Implementation would iterate over stored conversations and pull missing messages.
  }
}

export const whatsappService = new WhatsAppService();
