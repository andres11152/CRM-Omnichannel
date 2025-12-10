import makeWASocket, { DisconnectReason } from "@whiskeysockets/baileys";
import { usePrismaAuthState } from "./baileysAuth";
import { Boom } from "@hapi/boom";
import QRCode from "qrcode";
import { prisma } from "@/config/prisma";
import { writeFile, mkdir } from "fs/promises";
import * as path from "path";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
  console.log(`[WhatsApp] ffmpeg path set to: ${ffmpegPath}`);
} else {
  console.warn("[WhatsApp] ffmpeg-static executable not found!");
}

class WhatsAppService {
  // Map sessionId -> socket
  private sessions: Map<string, any> = new Map();
  // Map sessionId -> QR Code (base64)
  private qrCodes: Map<string, string> = new Map();
  // Map sessionId -> attempts count
  private reconnectAttempts: Map<string, number> = new Map();
  // Cache for deduplicating outbound messages (CRM sent vs Phone sent)
  private recentOutboundIds: Set<string> = new Set();

  constructor() {
    // Session loader moved to initialize()
  }

  // Load all active sessions from DB on startup
  async initialize() {
    console.log("[WhatsApp] Initializing all sessions...");
    const sessions = await prisma.whatsAppSession.findMany();
    for (const session of sessions) {
      await this.initializeSession(session.sessionId);
    }
  }

  async createSession(companyId: string) {
    console.log(`[WhatsApp] Creating new session for company ${companyId}`);
    try {
      const session = await prisma.whatsAppSession.create({
        data: {
          companyId,
          sessionId: `session_${companyId}_${Date.now()}`,
          status: "SCANNING",
        },
      });
      console.log(`[WhatsApp] DB record created: ${session.sessionId}`);
      this.initializeSession(session.sessionId);
      return session;
    } catch (error) {
      console.error(`[WhatsApp] Error creating session:`, error);
      throw error;
    }
  }

  async initializeSession(sessionId: string) {
    if (this.sessions.has(sessionId)) {
      console.log(`[WhatsApp] Session ${sessionId} already active.`);
      return;
    }

    console.log(`[WhatsApp] Initializing session: ${sessionId}`);

    // DB Auth - No file paths needed
    try {
      const { state, saveCreds } = await usePrismaAuthState(sessionId);

      const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: ["Reply CRM", "Chrome", "1.0.0"],
      });

      this.sessions.set(sessionId, sock);

      sock.ev.on("connection.update", async (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        // --- REAL TIMELINE QR ---
        if (qr) {
          try {
            const qrImage = await QRCode.toDataURL(qr);
            this.qrCodes.set(sessionId, qrImage);
            await prisma.whatsAppSession.update({
              where: { sessionId },
              data: { qrCode: qrImage, status: "SCANNING" },
            });
            console.log(`[WhatsApp] QR Code received for ${sessionId}`);

            // Emit Socket Event
            try {
              const { gateway } = await import("@/gateways/socketGateway");
              gateway.getIO()?.emit("qr.updated", { sessionId, qr: qrImage });
            } catch (ignore) {}
          } catch (err) {
            console.error(`[WhatsApp] QR Gen Error: ${err}`);
          }
        }

        // --- CONNECTION STATUS ---
        if (connection === "close") {
          const shouldReconnect =
            (lastDisconnect?.error as any)?.output?.statusCode !==
            DisconnectReason.loggedOut;

          console.log(
            `[WhatsApp] Session ${sessionId} closed. Reconnect: ${shouldReconnect}`
          );

          // Always remove the closed socket from the map
          this.sessions.delete(sessionId);

          if (shouldReconnect) {
            // --- EXPONENTIAL BACKOFF ---
            const attempts = this.reconnectAttempts.get(sessionId) || 0;
            const delay = Math.min(1000 * Math.pow(2, attempts), 60000); // Max 60s
            this.reconnectAttempts.set(sessionId, attempts + 1);

            console.log(
              `[WhatsApp] Reconnecting session ${sessionId} in ${delay}ms (Attempt ${
                attempts + 1
              })...`
            );

            // Notify Frontend
            try {
              const { gateway } = await import("@/gateways/socketGateway");
              gateway.getIO()?.emit("session.status", {
                sessionId,
                status: "RECONNECTING",
                attempt: attempts + 1,
                nextAttemptIn: delay,
              });
            } catch (ignore) {}

            // Dispatch Webhook
            try {
              const session = await prisma.whatsAppSession.findUnique({
                where: { sessionId },
              });
              if (session) {
                const { webhookDispatcher } = await import(
                  "@/services/webhookDispatcher"
                );
                await webhookDispatcher.trigger(
                  session.companyId,
                  "system.reconnecting",
                  {
                    sessionId,
                    attempt: attempts + 1,
                    nextAttemptIn: delay,
                    timestamp: new Date(),
                  }
                );
              }
            } catch (webhookErr) {
              console.warn("[WhatsApp] Webhook dispatch failed:", webhookErr);
            }

            setTimeout(() => this.initializeSession(sessionId), delay);
          } else {
            // Logged out
            console.log(
              `[WhatsApp] Session ${sessionId} logged out. Cleaning up...`
            );
            this.qrCodes.delete(sessionId);
            this.reconnectAttempts.delete(sessionId);

            try {
              // Try to update status to DISCONNECTED
              await prisma.whatsAppSession.update({
                where: { sessionId },
                data: { status: "DISCONNECTED", qrCode: null },
              });

              // Notify Frontend
              try {
                const { gateway } = await import("@/gateways/socketGateway");
                gateway.getIO()?.emit("session.status", {
                  sessionId,
                  status: "DISCONNECTED",
                  reason: "LOGGED_OUT",
                });
                gateway.getIO()?.emit("system.event", {
                  type: "DEVICE_DISCONNECTED",
                  sessionId,
                });
              } catch (ignore) {}

              // Dispatch Webhook for external integrations
              try {
                const session = await prisma.whatsAppSession.findUnique({
                  where: { sessionId },
                });
                if (session) {
                  const { webhookDispatcher } = await import(
                    "@/services/webhookDispatcher"
                  );
                  await webhookDispatcher.trigger(
                    session.companyId,
                    "system.device_disconnected",
                    {
                      sessionId,
                      phone: session.phone,
                      reason: "LOGGED_OUT",
                      timestamp: new Date(),
                    }
                  );
                }
              } catch (webhookErr) {
                console.warn("[WhatsApp] Webhook dispatch failed:", webhookErr);
              }
            } catch (e) {
              console.warn(
                `[WhatsApp] Could not update session status (might be deleted): ${e}`
              );
            }
            // Clean up credentials from DB on logout
            try {
              await prisma.whatsAppCredential.deleteMany({
                where: { sessionId },
              });
              await prisma.whatsAppSession.delete({ where: { sessionId } });
            } catch (err) {
              console.error(
                `[WhatsApp] Error cleaning up session ${sessionId}:`,
                err
              );
            }
          }
        } else if (connection === "open") {
          console.log(`[WhatsApp] Session ${sessionId} OPEN! 🚀`);
          this.qrCodes.delete(sessionId);
          this.reconnectAttempts.delete(sessionId);

          const user = sock.user;
          const phone = user?.id?.split(":")[0];

          await prisma.whatsAppSession.update({
            where: { sessionId },
            data: {
              status: "CONNECTED",
              qrCode: null,
              phone: phone,
            },
          });

          // Notify Frontend
          try {
            const { gateway } = await import("@/gateways/socketGateway");
            gateway.getIO()?.emit("session.status", {
              sessionId,
              status: "CONNECTED",
              phone,
            });
            gateway.getIO()?.emit("system.event", {
              type: "CONNECTION_RESTORED",
              sessionId,
            });
          } catch (ignore) {}
        }
      });

      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("messages.upsert", async (m: any) => {
        for (const msg of m.messages) {
          // console.log(`[WhatsApp] Messages upsert: ${m.messages.length} messages, type: ${m.type}`);
          await this.handleIncomingMessage(sessionId, {
            messages: [msg],
            type: m.type,
          });
        }
      });
    } catch (error) {
      console.error(`[WhatsApp] Init failed for ${sessionId}:`, error);
    }
  }

  private async handleIncomingMessage(sessionId: string, m: any) {
    try {
      const msg = m.messages[0];
      if (!msg.message) {
        // console.log("[WhatsApp] Skipped message with no content (protocol message?)");
        return;
      }

      const remoteJid = msg.key.remoteJid;
      let isOutbound = msg.key.fromMe;

      // SAFETY CHECK: If remoteJid includes the customer phone, it CANNOT be outbound (unless self-message)
      // But we can't easily check "customer phone" here universally.
      // However, we can check if it's a status update or similar.

      // Better yet: If we resolved a LID to a phone number (later in code), checks might be better there.
      // For now, let's rely on logs.

      // DEBUG LOGGING
      console.log(
        `[WhatsApp] Incoming Upsert: ID=${msg.key.id}, Outbound=${isOutbound}, JID=${remoteJid}`
      );
      console.log(
        `[WhatsApp] Raw Message Keys: ${Object.keys(msg.message).join(", ")}`
      );

      // Handle Outbound Messages Deduplication (Fix for Mobile Sync)
      if (isOutbound) {
        if (msg.key.id && this.recentOutboundIds.has(msg.key.id)) {
          console.log(`[WhatsApp] Ignoring CRM echo message: ${msg.key.id}`);
          this.recentOutboundIds.delete(msg.key.id);
          return;
        }
        console.log(
          `[WhatsApp] Syncing outbound message from phone: ${msg.key.id}`
        );
        // Allow it to proceed -> will be saved as "Sent from Mobile Agent"
      }

      // CRITICAL: Ignore status updates (broadcasts)
      if (remoteJid === "status@broadcast") {
        console.log(
          `[WhatsApp] Ignoring status broadcast from ${msg.key.participant}`
        );
        return;
      }

      // Determine content type and extract text/caption
      let text = "";
      let mediaType = "";
      let mediaBuffer: Buffer | null = null;
      let mimeType = "";

      if (msg.message.conversation) {
        text = msg.message.conversation;
      } else if (msg.message.extendedTextMessage?.text) {
        text = msg.message.extendedTextMessage.text;
      } else if (msg.message.imageMessage) {
        text = msg.message.imageMessage.caption || "";
        mediaType = "image";
        mimeType = msg.message.imageMessage.mimetype || "image/jpeg";
      } else if (msg.message.videoMessage) {
        text = msg.message.videoMessage.caption || "";
        mediaType = "video";
        mimeType = msg.message.videoMessage.mimetype || "video/mp4";
      } else if (msg.message.documentMessage) {
        text =
          msg.message.documentMessage.caption ||
          msg.message.documentMessage.fileName ||
          "";
        mediaType = "document";
        mimeType = msg.message.documentMessage.mimetype || "application/pdf";
      } else if (msg.message.audioMessage) {
        mediaType = "audio";
        mimeType = msg.message.audioMessage.mimetype || "audio/mp4";
      }

      // If no text and no media, ignore (e.g. protocol messages)
      if (!text && !mediaType) return;
      if (!remoteJid) return;

      // Find the session record to get companyId
      const sessionRecord = await prisma.whatsAppSession.findUnique({
        where: { sessionId },
      });

      if (!sessionRecord) {
        console.warn(`[WhatsApp] Session record not found for ${sessionId}`);
        return;
      }

      let mediaInfo = undefined;

      // Handle Media Download
      if (mediaType) {
        try {
          // Download buffer
          mediaBuffer = (await downloadMediaMessage(
            msg,
            "buffer",
            {} as any,
            { logger: console as any, reuploadRequest: sessionRecord.id as any } // Mock logger
          )) as Buffer;

          if (mediaBuffer) {
            // Ensure uploads directory exists
            const uploadDir = path.join(
              process.cwd(),
              "public",
              "uploads",
              sessionRecord.companyId
            );
            await mkdir(uploadDir, { recursive: true });

            // Generate filename
            const ext = mimeType.split("/")[1]?.split(";")[0] || "bin";
            const filename = `${Date.now()}_${Math.random()
              .toString(36)
              .substring(7)}.${ext}`;
            const filePath = path.join(uploadDir, filename);

            // Write file
            await writeFile(filePath, mediaBuffer);

            // Public URL (Assuming server serves /uploads static route)
            const publicUrl = `/uploads/${sessionRecord.companyId}/${filename}`;

            mediaInfo = {
              url: publicUrl,
              type: mediaType,
              mimetype: mimeType,
              caption: text,
            };

            console.log(`[WhatsApp] Media saved: ${publicUrl}`);

            // If text is empty (image without caption), use a placeholder to ensure message is created
            if (!text) text = `[${mediaType.toUpperCase()}]`;
          }
        } catch (err) {
          console.error(`[WhatsApp] Error downloading media:`, err);
        }
      }

      // RESOLVE LID TO REAL PHONE NUMBER
      let actualPhone = remoteJid;

      // If remoteJid contains @lid, we need to resolve it to the actual phone number
      if (remoteJid.includes("@lid")) {
        const lidNumber = remoteJid.split("@")[0];
        console.log(
          `[WhatsApp] Detected LID: ${lidNumber}, resolving to real phone...`
        );

        try {
          // Query credentials table directly for lid-mapping
          const credential = await prisma.whatsAppCredential.findUnique({
            where: {
              sessionId_key: {
                sessionId,
                key: `lid-mapping-${lidNumber}`,
              },
            },
          });

          if (credential && credential.value) {
            const mappingData = JSON.parse(credential.value);
            // mappingData structure: { pn: "573242450628" }
            if (mappingData.pn) {
              actualPhone = `${mappingData.pn}@s.whatsapp.net`;
              console.log(
                `[WhatsApp] Resolved LID ${lidNumber} to phone: ${mappingData.pn}`
              );
            }
          } else {
            console.warn(
              `[WhatsApp] No LID mapping found for ${lidNumber}, using LID as fallback`
            );
          }
        } catch (err) {
          console.error(`[WhatsApp] Error resolving LID:`, err);
          // Fallback: use the LID number as-is
        }
      }

      // IMPORT DYNAMICALLY TO AVOID CIRCULAR DEPENDENCY ISSUES
      const { messageProcessor } = await import("./messageProcessor.service");

      await messageProcessor.process({
        companyId: sessionRecord.companyId,
        sessionId,
        remoteJid: actualPhone, // Use resolved phone instead of raw remoteJid
        text,
        isOutbound: !!isOutbound,
        contactName: msg.pushName || undefined,
        senderName: isOutbound ? "Me" : undefined,
        hasMedia: !!mediaInfo,
        media: mediaInfo,
      });

      return;
    } catch (error) {
      console.error(`[WhatsApp] Error processing message: ${error}`);
    }
  }

  async sendMessage(
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
  ) {
    console.log("============================================");
    console.log("[WhatsApp] sendMessage CALLED");
    console.log("[WhatsApp] To:", to);
    console.log("[WhatsApp] Text:", text);
    console.log("[WhatsApp] ChannelId:", channelId);
    console.log("[WhatsApp] Has Media:", !!media);
    console.log("[WhatsApp] Active Sessions Count:", this.sessions.size);
    console.log("============================================");

    let sock;
    let usedSessionId;

    if (channelId) {
      try {
        const session = await prisma.whatsAppSession.findFirst({
          where: {
            OR: [{ phone: channelId }, { sessionId: channelId }],
            status: "CONNECTED",
          },
        });
        if (
          session &&
          session.sessionId &&
          this.sessions.has(session.sessionId)
        ) {
          sock = this.sessions.get(session.sessionId);
          usedSessionId = session.sessionId;
        }
      } catch (error) {
        console.warn(
          `[WhatsApp] Error finding session for channel ${channelId}:`,
          error
        );
      }
    }

    if (!sock) {
      for (const [id, s] of this.sessions.entries()) {
        sock = s;
        usedSessionId = id;
        break;
      }
    }

    if (!sock) {
      console.error("[WhatsApp] No active sessions available!");
      return false;
    }

    try {
      console.log(`[WhatsApp] Sending via session ${usedSessionId} to ${to}`);
      const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`;

      if (media) {
        console.log(`[WhatsApp] Sending media type: '${media.type}'`);
        console.log(
          `[WhatsApp] Full media object:`,
          JSON.stringify(media, null, 2)
        );

        if (media.type === "image") {
          const response = await sock.sendMessage(jid, {
            image: { url: media.url },
            caption: text || media.caption,
          });
          if (response?.key?.id) {
            this.recentOutboundIds.add(response.key.id);
            setTimeout(
              () => this.recentOutboundIds.delete(response.key.id!),
              30000
            );
          }
        } else if (media.type === "video") {
          const response = await sock.sendMessage(jid, {
            video: { url: media.url },
            caption: text || media.caption,
          });
          if (response?.key?.id) {
            this.recentOutboundIds.add(response.key.id);
            setTimeout(
              () => this.recentOutboundIds.delete(response.key.id!),
              30000
            );
          }
        } else if (media.type === "audio") {
          // Convert audio to WhatsApp-compatible format if needed
          let audioPath = media.url;
          let shouldCleanup = false;

          try {
            console.log(
              "[WhatsApp] Processing audio message. URL starts with data:",
              media.url.startsWith("data:")
            );

            // If it's a base64 data URL, convert it
            if (media.url.startsWith("data:")) {
              console.log(
                "[WhatsApp] Converting audio from WebM to OGG/Opus..."
              );
              const { convertAudioToMP4, cleanupTempFile } = await import(
                "@/utils/audioConverter"
              );
              audioPath = await convertAudioToMP4(media.url);
              shouldCleanup = true;
              console.log(
                "[WhatsApp] Audio conversion successful. Path:",
                audioPath
              );
            } else {
              console.log("[WhatsApp] Using existing audio URL:", audioPath);
            }

            console.log("[WhatsApp] Reading audio file into buffer...");
            const response = await sock.sendMessage(jid, {
              audio: await import("fs").then((fs) =>
                fs.promises.readFile(audioPath)
              ),
              ptt: media.isVoiceNote,
              mimetype: "audio/ogg; codecs=opus",
            });

            if (response?.key?.id) {
              this.recentOutboundIds.add(response.key.id);
              setTimeout(
                () => this.recentOutboundIds.delete(response.key.id!),
                30000
              );
            }
            console.log("[WhatsApp] Socket send executed.");

            // Cleanup temp file if we created one
            if (shouldCleanup) {
              const { cleanupTempFile } = await import(
                "@/utils/audioConverter"
              );
              await cleanupTempFile(audioPath);
              console.log("[WhatsApp] Temp file cleanup done.");
            }

            console.log(
              "[WhatsApp] Audio message (OGG/Opus) process finished successfully"
            );
          } catch (conversionError) {
            console.error(
              "[WhatsApp] Audio conversion/send CRITICAL FAILURE:",
              conversionError
            );

            // Cleanup on error
            if (shouldCleanup && audioPath !== media.url) {
              const { cleanupTempFile } = await import(
                "@/utils/audioConverter"
              );
              await cleanupTempFile(audioPath).catch(() => {});
            }

            throw conversionError;
          }
        } else {
          const response = await sock.sendMessage(jid, {
            document: { url: media.url },
            caption: text || media.caption,
            mimetype: media.mimetype,
          });
          if (response?.key?.id) {
            this.recentOutboundIds.add(response.key.id);
            setTimeout(
              () => this.recentOutboundIds.delete(response.key.id!),
              30000
            );
          }
        }
      } else {
        const response = await sock.sendMessage(jid, { text });
        if (response?.key?.id) {
          this.recentOutboundIds.add(response.key.id);
          setTimeout(
            () => this.recentOutboundIds.delete(response.key.id!),
            30000
          );
        }
      }
      return true;
    } catch (error) {
      console.error(`[WhatsApp] Send failed: ${error}`);
      return false;
    }
  }

  async deleteSession(sessionId: string) {
    console.log(`[WhatsApp] Deleting session ${sessionId}...`);
    try {
      const sock = this.sessions.get(sessionId);
      if (sock) {
        console.log(`[WhatsApp] Logging out socket for ${sessionId}...`);
        try {
          await sock.logout();
        } catch (e) {
          console.warn(`[WhatsApp] Logout failed (ignoring): ${e}`);
        }
        this.sessions.delete(sessionId);
      }
      this.qrCodes.delete(sessionId);

      console.log(`[WhatsApp] Deleting session credentials from DB...`);
      // Credentials are cascade deleted? No, we need to delete them manually or rely on cascading if sessionId was a foreign key.
      // In our schema, WhatsAppCredential relates to a string sessionId, not a foreign key constraint to WhatsAppSession necessarily.
      // So we should delete them.
      await prisma.whatsAppCredential.deleteMany({
        where: { sessionId },
      });

      console.log(`[WhatsApp] Deleting DB record for ${sessionId}...`);
      await prisma.whatsAppSession.delete({ where: { sessionId } });
      console.log(`[WhatsApp] Session ${sessionId} deleted successfully.`);
    } catch (error) {
      console.error(`[WhatsApp] Error deleting session ${sessionId}:`, error);
      throw error;
    }
  }

  // Helper for frontend to get QR
  async getSessionStatus(sessionId: string) {
    const session = await prisma.whatsAppSession.findUnique({
      where: { sessionId },
    });
    return session;
  }

  async listSessions(companyId: string) {
    console.log(`[WhatsApp] Listing sessions for company ${companyId}`);
    try {
      const sessions = await prisma.whatsAppSession.findMany({
        where: { companyId },
      });
      console.log(`[WhatsApp] Found ${sessions.length} sessions.`);
      return sessions;
    } catch (error) {
      console.error(`[WhatsApp] Error listing sessions:`, error);
      throw error;
    }
  }

  async syncMessages(companyId: string, fromDate: Date) {
    console.log(
      `[WhatsApp] Syncing messages for company ${companyId} from ${fromDate}`
    );
    try {
      const conversations = await prisma.conversation.findMany({
        where: {
          companyId,
          channelId: { not: null },
        },
      });

      const session = await prisma.whatsAppSession.findFirst({
        where: { companyId, status: "CONNECTED" },
      });

      if (!session || !this.sessions.has(session.sessionId)) {
        throw new Error(
          "No connected WhatsApp session found for this company."
        );
      }

      const sock = this.sessions.get(session.sessionId);
      let totalSynced = 0;

      for (const conv of conversations) {
        if (!conv.channelId) continue;
        try {
          const jid = conv.channelId.includes("@")
            ? conv.channelId
            : `${conv.channelId}@s.whatsapp.net`;

          // Check if method exists (it likely doesn't in standard Baileys without a store/plugin)
          if (typeof (sock as any).fetchMessagesFromWA !== "function") {
            console.warn(
              `[WhatsApp] fetchMessagesFromWA not available on socket. Skipping sync for ${jid}`
            );
            continue;
          }

          // Using any cast to bypass TS error as discussed
          const messages = await (sock as any).fetchMessagesFromWA(jid, 50);
          if (!messages) continue;

          for (const msg of messages) {
            const msgTime = (msg.messageTimestamp as number) * 1000;
            if (new Date(msgTime) < fromDate) continue;

            const content =
              msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text;
            if (!content) continue;

            const exists = await prisma.message.findFirst({
              where: {
                conversationId: conv.id,
                content: content,
                createdAt: {
                  gte: new Date(msgTime - 2000),
                  lte: new Date(msgTime + 2000),
                },
              },
            });

            if (exists) continue;

            await this.handleIncomingMessage(session.sessionId, {
              messages: [msg],
              type: "notify",
            });
            totalSynced++;
          }
        } catch (err) {
          console.error(
            `[WhatsApp] Error syncing chat ${conv.channelId}:`,
            err
          );
        }
      }
      return { synced: totalSynced };
    } catch (error) {
      console.error(`[WhatsApp] Error syncing messages:`, error);
      throw error;
    }
  }
}

export const whatsappService = new WhatsAppService();
